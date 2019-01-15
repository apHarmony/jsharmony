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
    this.SETTINGS_ID = 'debugconsole';
    this.socket = {};
    this.socket_url = (window.location.protocol=='https:'?'wss:':'ws:')+"//" + window.location.hostname + ":" + window.location.port + jsh._BASEURL + "_log";
    this.settings = {};
    this.avaliable_positions = ['bottom','right'];
    this.client_sources = {
      "client_requests": true
    };
    this.server_sources = {
      "webserver":true,
      "system": true,
      "database": true,
      "authentication": true
    };
    this.default_settings = {
      "enabled":0,
      "minimized":0,
      "position":'bottom',
      "sources": _.extend({},this.client_sources,this.server_sources)
    };

  };

  XDebugConsole.prototype.Init = function(){
    this.settings = jsh.XExt.GetSettingsCookie(this.SETTINGS_ID);
    if (!this.settings.hasOwnProperty('enabled')
      && !this.settings.hasOwnProperty('sources')
      && !this.settings.hasOwnProperty('minimized')
      && !(typeof this.settings.sources === 'object')
    ){
      this.settings = {};
    }
    this.settings = _.extend(this.default_settings, this.settings);
    jsh.XExt.SetSettingsCookie(this.SETTINGS_ID,this.settings);
    this.CreatePanel();
  };

  XDebugConsole.prototype.isEnabled = function(){
    return (jsh.dev && this.settings.enabled);
  }
  XDebugConsole.prototype.isMinimized = function(){
    return (this.settings.minimized);
  }

  XDebugConsole.prototype.getSourcesForWebSocket = function(){
    var sources = _.extend({},this.settings.sources);
    for (var k in this.client_sources){
      delete sources[k];
    }
    for (var k in sources){
      if (!sources[k]) delete sources[k];
    }
    return sources;
  }

  XDebugConsole.prototype.Show = function(){
    var action='';
    if (this.settings.enabled){
      this.settings.enabled = 0;
      action='close';
    }else{
      this.settings.enabled = 1;
      action='expand';
    }
    this.setWebSocketListener();
    this.setXMLHttpRequestListener();
    return this.onControlAction(action);
  };

  XDebugConsole.prototype.onXMLHttpRequestLoad = function(event){
    if (this.settings.sources["client_requests"] && this.settings.enabled) {
      var t = new Date();
      var client_resp = '';
      try {
        client_resp = JSON.stringify(JSON.parse(event.currentTarget.responseText), null, 2);
      } catch (e) {
        if (e instanceof SyntaxError) {
          client_resp = event.currentTarget.responseText;
        }
      }
      this.showDebugMessage(t.toLocaleString() + ' - Client Request: ' + decodeURIComponent(event.currentTarget.responseURL) + '<br>Client Response: ' + client_resp);
    }
  }

  XDebugConsole.prototype.setXMLHttpRequestListener = function(){
    if(typeof XMLHttpRequest.prototype.baseSend === "undefined") {
      var _this = this;
      XMLHttpRequest.prototype.baseSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function (value) {
        this.addEventListener("load", _this.onXMLHttpRequestLoad.bind(_this), false);
        this.baseSend(value);
      }
    }
  };

  XDebugConsole.prototype.setWebSocketListener = function(){
    var settings = {sources: this.getSourcesForWebSocket()};
    var _this = this;
    if (Object.keys(settings.sources).length && this.settings.enabled) {
      if (typeof this.socket.readyState === 'undefined'){
        this.socket = new WebSocket(this.socket_url);
        this.socket.onopen = function (e) {
          _this.socket.send(JSON.stringify({setSettings: settings}));
          _this.socket.send(JSON.stringify({getHistory: true}));
        };
        this.socket.onclose = function (e) {
          if (!e.wasClean){
            var t = new Date();
            _this.showDebugMessage(
              '<span style="color: red;">'+ t.toLocaleString() + ' - ' +
              ' Can\'t connect to Web Socket (URL: '+XDebugConsole.socket_url
              +'; Code: '+e.code+') Will try to reconnect in 2 sec.</span>'
            );
            _this.socket={};
            setTimeout(function(){
              var t = new Date();
              _this.showDebugMessage(
                '<span style="color: green;">'+ t.toLocaleString() + ' - ' + 'Trying to reconnect to Web Socket.</span>'
              );
              _this.setWebSocketListener()
            }, 2000);
          }
        };
        this.socket.onmessage = function (e) {
          try{
            var m = JSON.parse(e.data);
            var t = new Date( m.timestamp);
            _this.showDebugMessage(
              '<span style="color: ' + m.color + '">'+ t.toLocaleString() + ' - ' + _.startCase(m.source) + ': ' +  m.txt + '</span>'
            );
          }catch (e) {
            if(e instanceof SyntaxError){
              _this.showDebugMessage(
                '<span style="color: red">Can\'t parse json. Error: ' +  e.message + '</span>'
              );
            }else{
              throw e;
            }
          }
        }
      }else{
        this.socket.send(JSON.stringify({setSettings: settings}));
      }
    }else {
      if (typeof this.socket.readyState !== 'undefined') {
        this.socket.close();
        this.socket={};
      }
    }
  };

  XDebugConsole.prototype.CreatePanel = function(){
    this.setXMLHttpRequestListener();
    this.setWebSocketListener();
    var default_sources = this.default_settings.sources;
    var settingsHtml = '';
    for(var k in default_sources){
      settingsHtml += '<label for="' + k + '">' +
        '<input type="checkbox" name="sources" class="src" id="' + k + '" value="' + k + '"> ' + _.upperFirst(k.replace(/_/g,' ')) + '</label>';
    }
    this.DebugDialog = jsh.$root('.xdebugconsole');
    this.DebugPanel  =  this.DebugDialog.find('.debug-panel');
    this.DebugPanel.find('.debug-settings').append($(settingsHtml));
    this.DebugPanelMin  = this.DebugDialog.find('.debug-panel-minimized');
    var checkboxes = this.DebugPanel.find('.src');
    for (var i=0; i<checkboxes.length; i++){
      if (this.settings.sources[checkboxes[i].value]){
        $(checkboxes[i]).click();
      }
    }
    this.setVisibility();
    this.setPosition();
    this.DebugPanel.on('click','.src', this.onSourcesChange.bind(this));
    jsh.XExt.makeResizableDiv('.debug-panel',[
      {selector:'.xdebuginfo-body',correction_y:-39,correction_x:0},
      {selector:'.xdebugconsole',correction_y:0,correction_x:0},
    ]);
    this.DebugDialog.find('.controls i').on('click',this.onControlHit.bind(this));
  };

  XDebugConsole.prototype.setVisibility = function(){
    if (this.isEnabled()){
      this.DebugDialog.show().addClass('visible');
      if (this.isMinimized()){
        this.DebugDialog.removeClass('visible');
        this.DebugPanelMin.show();
        this.DebugPanel.hide();
      }else {
        this.DebugDialog.addClass('visible');
        this.DebugPanel.show();
        this.DebugPanelMin.hide();
      }
    }else{
      this.DebugDialog.hide().removeClass('visible');
    }
  }

  XDebugConsole.prototype.setPosition = function() {
    for(var i=0; i<this.avaliable_positions.length; i++){
      this.DebugDialog.removeClass(this.avaliable_positions[i]);
    }
    return this.DebugDialog.addClass(this.settings.position)
  }

  XDebugConsole.prototype.onControlHit= function(e){
    return this.onControlAction($(e.currentTarget).data("action"));
  }

  XDebugConsole.prototype.onControlAction = function(action){
    if (action ==='settings') return this.DebugPanel.find('.debug-settings').toggle();
    if (action ==='minimize') {
      this.DebugPanel.hide();
      this.DebugPanelMin.show();
      this.DebugDialog.removeClass('visible');
      this.settings.minimized=1;
      return jsh.XExt.SetSettingsCookie(this.SETTINGS_ID,this.settings);
    }
    if (action ==='expand') {
      this.DebugPanel.show();
      this.DebugPanelMin.hide();
      this.DebugDialog.show();
      this.DebugDialog.addClass('visible');
      this.settings.minimized=0;
      return jsh.XExt.SetSettingsCookie(this.SETTINGS_ID,this.settings);
    }
    if (action ==='close') {
      this.DebugDialog.hide();
      this.settings.enabled=0;
      this.setWebSocketListener();
      this.setXMLHttpRequestListener();
      this.showDebugMessage('Closed',1);
      return jsh.XExt.SetSettingsCookie(this.SETTINGS_ID,this.settings);
    }
    if (action ==='pos-right') {
      this.settings.position='right';
      this.showDebugMessage('Position-right');
      this.setPosition();
      return jsh.XExt.SetSettingsCookie(this.SETTINGS_ID,this.settings);
    }
    if (action ==='pos-bottom') {
      this.settings.position='bottom';
      this.showDebugMessage('Position-bottom');
      this.DebugDialog.attr('style',null);
      this.DebugPanel.attr('style',null);
      this.DebugPanel.show();
      this.DebugPanel.find('.xdebuginfo-body').attr('style',null);
      this.setPosition();
      return jsh.XExt.SetSettingsCookie(this.SETTINGS_ID,this.settings);
    }
  }

  XDebugConsole.prototype.onSourcesChange = function(e){
    var jobj = $(e.currentTarget);
    var added = jobj.prop("checked");
    this.settings.sources[jobj.val()] = added;
    var message = 'Added: ';
    if (!added) message = "Removed: ";
    message = message + jobj.val().replace(/_/g,' ');
    this.showDebugMessage(message);
    jsh.XExt.SetSettingsCookie(this.SETTINGS_ID,this.settings);
    this.setWebSocketListener();
  }

  XDebugConsole.prototype.showDebugMessage = function (txt, clear) {
    var body = this.DebugPanel.find('.xdebuginfo-body');
    if(clear) body.empty();
    body.prepend('<div class="info-message">'+txt+'</div>');
  };

  return XDebugConsole;
};