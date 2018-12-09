/*
Copyright 2018 apHarmony

This file is part of jsHarmony.

jsHarmony is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

jsHarmony is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with this package.  If not, see <http://www.gnu.org/licenses/>.
*/

var $ = require('./jquery-1.11.2');
var _ = require('lodash');

exports = module.exports = function(jsh){
  var XDebugConsole = function(){
  };
  XDebugConsole.SETTINGS_ID = 'debugconsole';
  XDebugConsole.socket = {};
  XDebugConsole.settings = {};
  XDebugConsole.client_sources = {
    "client_requests": true
  };
  XDebugConsole.server_sources = {
    "webserver":true,
    "system": true,
    "database": true,
    "authentication": true
  };
  XDebugConsole.default_settings = {
    "enabled":1, // todo set to 0 not enabled by default
    "minimized":0,
    "sources": _.extend({},XDebugConsole.client_sources,XDebugConsole.server_sources)
  };
  function isEnabled(){
    return (jsh.dev && XDebugConsole.settings.enabled);
  }
  function isMinimized(){
    return (XDebugConsole.settings.minimized);
  }

  XDebugConsole.setXMLHttpRequestListener = function(){
    XMLHttpRequest.prototype.baseSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(value) {
      this.addEventListener("load", function(){
        if (XDebugConsole.settings.sources["client_requests"]){
          var t = new Date();
          XDebugConsole.showDebugMessage(t.toLocaleString() + ' - Client Request: '+this.responseURL+'<br>Client Response: '+JSON.stringify(JSON.parse(this.responseText), null, 2).replace(/\\r\\n/g, '<br>'));
        }
      }, false);
      this.baseSend(value);
    };
  }

  function getSourcesForWebSocket(){
    var sources = _.extend({},XDebugConsole.settings.sources);
    _.forOwn(XDebugConsole.client_sources,function (v,k) {
      delete sources[k]
    });
    _.forOwn(sources,function (v,k){
      if (!v) delete sources[k]
    });
    return sources;
  }

  XDebugConsole.setWebSocketListener = function(){
    var settings = {sources: getSourcesForWebSocket()};
    if (!_.isEmpty(settings.sources)) {
      if (typeof XDebugConsole.socket.readyState === 'undefined'){
        XDebugConsole.socket = new WebSocket("ws://" + window.location.hostname + ":" + window.location.port + jsh._BASEURL + "_log");
        XDebugConsole.socket.onopen = function (e) {
          XDebugConsole.socket.send(JSON.stringify({setSettings: settings}));
          XDebugConsole.socket.send(JSON.stringify({getHistory: true}));
        }
        XDebugConsole.socket.onmessage = function (e) {
          var m = JSON.parse(e.data);
          var t = new Date( m.timestamp);
          XDebugConsole.showDebugMessage(
            '<span style="color: ' + m.color + '">'+ t.toLocaleString() + ' - ' + _.startCase(m.source) + ': ' +  m.txt + '</span>'
          );
        }
      }else{
        XDebugConsole.socket.send(JSON.stringify({setSettings: settings}));
      }
    }else {
      if (typeof XDebugConsole.socket.readyState !== 'undefined') {
        XDebugConsole.socket.close();
        XDebugConsole.socket={};
      }
    }
  }
  XDebugConsole.InitDebugPanel = function(){
    XDebugConsole.setXMLHttpRequestListener();
    XDebugConsole.setWebSocketListener();
    var default_sources = XDebugConsole.default_settings.sources;
    var settingsHtml = '';
    _.forOwn(default_sources, function(v, k) {
      settingsHtml += '<label for="' + k + '">' +
        '<input type="checkbox" name="sources" class="src" id="' + k + '" value="' + k + '"> ' + _.upperFirst(k.replace(/_/g,' ')) + '</label><br>';
    } );

    XDebugConsole.DebugDialog = jsh.$root('.xdebugconsole');
    XDebugConsole.DebugPanel  =  XDebugConsole.DebugDialog.find('#debug-panel');
    XDebugConsole.DebugPanel.find('.debug-settings').append($(settingsHtml));
    XDebugConsole.DebugPanelMin  = XDebugConsole.DebugDialog.find('#debug-panel-minimized');
    var checkboxes = XDebugConsole.DebugPanel.find('.src');
    for (var i=0; i<checkboxes.length; i++){
      if (XDebugConsole.settings.sources[checkboxes[i].value]){
        $(checkboxes[i]).click();
      }
    }
    if (isEnabled()){
      XDebugConsole.DebugDialog.show().addClass('visible');
      if (isMinimized()){
        XDebugConsole.DebugDialog.removeClass('visible');
        XDebugConsole.DebugPanelMin.show();
        XDebugConsole.DebugPanel.hide();
      }else {
        XDebugConsole.DebugDialog.addClass('visible');
        XDebugConsole.DebugPanel.show();
        XDebugConsole.DebugPanelMin.hide();
      }
    }else{
      XDebugConsole.DebugDialog.hide().removeClass('visible');
    }
    XDebugConsole.DebugPanel.on('click','.src', onSourcesChange);
    XDebugConsole.DebugDialog.find('.controls').on('click','i',onControlHit);
  }

  function onControlHit(e){
    var action = $(e.currentTarget).data("action");
    if (action ==='settings') return XDebugConsole.DebugPanel.find('.debug-settings').toggle();
    if (action ==='minimize') {
      XDebugConsole.DebugPanel.hide();
      XDebugConsole.DebugPanelMin.show();
      XDebugConsole.DebugDialog.removeClass('visible');
      XDebugConsole.settings.minimized=1;
      jsh.XExt.SetSettingsCookie(XDebugConsole.SETTINGS_ID,XDebugConsole.settings);
    }
    if (action ==='expand') {
      XDebugConsole.DebugPanel.show();
      XDebugConsole.DebugPanelMin.hide();
      XDebugConsole.DebugDialog.addClass('visible');
      XDebugConsole.settings.minimized=0;
      jsh.XExt.SetSettingsCookie(XDebugConsole.SETTINGS_ID,XDebugConsole.settings);
    }
    if (action ==='close') {
      XDebugConsole.DebugDialog.hide();
      XDebugConsole.settings.enabled=0;
      XDebugConsole.showDebugMessage('closed',1);
      jsh.XExt.SetSettingsCookie(XDebugConsole.SETTINGS_ID,XDebugConsole.settings);
    }
  }

  XDebugConsole.Init = function(){

    this.settings = jsh.XExt.GetSettingsCookie(XDebugConsole.SETTINGS_ID);
    if (!this.settings.hasOwnProperty('enabled')
      && !this.settings.hasOwnProperty('sources')
      && !this.settings.hasOwnProperty('minimized')
      && !(typeof this.settings.sources === 'object')
    ){
      this.settings = {};
    }
    this.settings = _.extend(this.default_settings, this.settings);
    jsh.XExt.SetSettingsCookie(XDebugConsole.SETTINGS_ID,XDebugConsole.settings);
    this.InitDebugPanel();
  };

  function onSourcesChange(e){
    var jobj = $(this);
    var added = jobj.prop("checked");
    XDebugConsole.settings.sources[jobj.val()] = added;
    var message = 'Added: ';
    if (!added) message = "Removed: ";
    message = message + jobj.val().replace(/_/g,' ');
    XDebugConsole.showDebugMessage(message);
    jsh.XExt.SetSettingsCookie(XDebugConsole.SETTINGS_ID,XDebugConsole.settings);
    XDebugConsole.setWebSocketListener();
  }

  XDebugConsole.showDebugMessage = function (txt, clear) {
    var body = XDebugConsole.DebugPanel.find('.xdebuginfo-body');
    if(clear) body.empty();
    body.prepend('<div class="info-message"><pre>'+txt+'</pre></div>');
  };

  return XDebugConsole;
};