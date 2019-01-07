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
  XDebugConsole.socket_url = "ws://" + window.location.hostname + ":" + window.location.port + jsh._BASEURL + "_log";
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
    "enabled":0,
    "minimized":0,
    "sources": _.extend({},XDebugConsole.client_sources,XDebugConsole.server_sources)
  };
  function isEnabled(){
    return (jsh.dev && XDebugConsole.settings.enabled);
  }
  function isMinimized(){
    return (XDebugConsole.settings.minimized);
  }

  XDebugConsole.reInit = function(){
    var action='';
    if (XDebugConsole.settings.enabled){
      XDebugConsole.settings.enabled = 0;
      action='close';
    }else{
      XDebugConsole.settings.enabled = 1;
      action='expand';
    }
    XDebugConsole.setWebSocketListener();
    XDebugConsole.setXMLHttpRequestListener();
    return onControlAction(action);
  };

  XDebugConsole.setXMLHttpRequestListener = function(){
    XMLHttpRequest.prototype.baseSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(value) {
      this.addEventListener("load", function(){
        if (XDebugConsole.settings.sources["client_requests"] && XDebugConsole.settings.enabled){
          var t = new Date();
          var client_resp='';
          try{
           client_resp=JSON.stringify(JSON.parse(this.responseText), null, 2);
          }catch (e) {
            if(e instanceof SyntaxError){
              client_resp= this.responseText;
            }
          }
          XDebugConsole.showDebugMessage(t.toLocaleString() + ' - Client Request: '+decodeURIComponent(this.responseURL)+'<br>Client Response: '+client_resp);
        }
      }, false);
      this.baseSend(value);
    };
  };

  function getSourcesForWebSocket(){
    var sources = _.extend({},XDebugConsole.settings.sources);
    for (var k in XDebugConsole.client_sources){
      delete sources[k];
    }
    for (var k in sources){
      if (!sources[k]) delete sources[k];
    }
    return sources;
  }

  XDebugConsole.setWebSocketListener = function(){
    var settings = {sources: getSourcesForWebSocket()};
    if (Object.keys(settings.sources).length && XDebugConsole.settings.enabled) {
      if (typeof XDebugConsole.socket.readyState === 'undefined'){
        XDebugConsole.socket = new WebSocket(XDebugConsole.socket_url);
        XDebugConsole.socket.onopen = function (e) {
          XDebugConsole.socket.send(JSON.stringify({setSettings: settings}));
          XDebugConsole.socket.send(JSON.stringify({getHistory: true}));
        };
        XDebugConsole.socket.onclose = function (e) {
          if (!e.wasClean){
            var t = new Date();
            XDebugConsole.showDebugMessage(
              '<span style="color: red;">'+ t.toLocaleString() + ' - ' +
              ' Can\'t connect to Web Socket (URL: '+XDebugConsole.socket_url
              +'; Code: '+e.code+') Will try to reconnect in 2 sec.</span>'
            );
            XDebugConsole.socket={};
            setTimeout(function(){
              var t = new Date();
              XDebugConsole.showDebugMessage(
                '<span style="color: green;">'+ t.toLocaleString() + ' - ' + 'Trying to reconnect to Web Socket.</span>'
              );
              XDebugConsole.setWebSocketListener()
            }, 2000);
          }
        };
        XDebugConsole.socket.onmessage = function (e) {
          try{
            var m = JSON.parse(e.data);
            var t = new Date( m.timestamp);
            XDebugConsole.showDebugMessage(
              '<span style="color: ' + m.color + '">'+ t.toLocaleString() + ' - ' + _.startCase(m.source) + ': ' +  m.txt + '</span>'
            );
          }catch (e) {
            if(e instanceof SyntaxError){
              XDebugConsole.showDebugMessage(
                '<span style="color: red">Can\'t parse json. Error: ' +  e.message + '</span>'
              );
            }else{
              throw e;
            }
          }
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
  };
  XDebugConsole.InitDebugPanel = function(){
    XDebugConsole.setXMLHttpRequestListener();
    XDebugConsole.setWebSocketListener();
    var default_sources = XDebugConsole.default_settings.sources;
    var settingsHtml = '';
    for(var k in default_sources){
      settingsHtml += '<label for="' + k + '">' +
        '<input type="checkbox" name="sources" class="src" id="' + k + '" value="' + k + '"> ' + _.upperFirst(k.replace(/_/g,' ')) + '</label>';
    }
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
    XDebugConsole.DebugDialog.find('.controls i').on('click',onControlHit);
  };
  function onControlHit(e){
    return onControlAction($(e.currentTarget).data("action"));
  }

  function onControlAction(action){
    if (action ==='settings') return XDebugConsole.DebugPanel.find('.debug-settings').toggle();
    if (action ==='minimize') {
      XDebugConsole.DebugPanel.hide();
      XDebugConsole.DebugPanelMin.show();
      XDebugConsole.DebugDialog.removeClass('visible');
      XDebugConsole.settings.minimized=1;
      return jsh.XExt.SetSettingsCookie(XDebugConsole.SETTINGS_ID,XDebugConsole.settings);
    }
    if (action ==='expand') {
      XDebugConsole.DebugPanel.show();
      XDebugConsole.DebugPanelMin.hide();
      XDebugConsole.DebugDialog.show();
      XDebugConsole.DebugDialog.addClass('visible');
      XDebugConsole.settings.minimized=0;
      return jsh.XExt.SetSettingsCookie(XDebugConsole.SETTINGS_ID,XDebugConsole.settings);
    }
    if (action ==='close') {
      XDebugConsole.DebugDialog.hide();
      XDebugConsole.settings.enabled=0;
      XDebugConsole.setWebSocketListener();
      XDebugConsole.setXMLHttpRequestListener();
      XDebugConsole.showDebugMessage('Closed',1);
      return jsh.XExt.SetSettingsCookie(XDebugConsole.SETTINGS_ID,XDebugConsole.settings);
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
    body.prepend('<div class="info-message">'+txt+'</div>');
  };

  return XDebugConsole;
};