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
$.fn.$find = function(){ return $.fn.find.apply(this, arguments); };
var _ = require('lodash');

exports = module.exports = function(jsh){
  var XDebugConsole = function(){
    this.isInitialized = false;
    this.SettingsCookieID = 'debugconsole';
    this.socket = null;
    this.socket_url = (window.location.protocol=='https:'?'wss:':'ws:')+'//' + window.location.hostname + ':' + window.location.port + jsh._BASEURL + '_log';
    this.settings = {};
    this.dock_positions = ['bottom','right'];
    this.client_sources = {
      'client_requests': 'Client Requests'
    };
    this.server_sources = {
      'webserver':'Web Server',
      'system': 'System',
      'database': 'Database',
      'database_raw_sql': 'Database Raw SQL',
      'authentication': 'Authentication'
    };
    this.all_sources = _.extend({}, this.client_sources, this.server_sources);
    this.default_settings = {
      'running':0,
      'minimized':0,
      'dock':'bottom',
      'sources': {
        client_requests: false,
        webserver: true,
        system: true,
        database: false,
        database_raw_sql: false,
        authentication: false
      },
      'window_size': { width:500, height:300 },
      'settings_visible': true
    };
    this.saveSettingsTimer = null;

    this.init();
  };

  //XDebugConsole.init - Called during jsHarmony.Init on page load
  XDebugConsole.prototype.init = function(){
    this.loadSettings();
    this.saveSettings();

    this.createPanel();

    this.isInitialized = true;

    if(this.settings.running) this.start(true);
  };

  XDebugConsole.prototype.isRunning = function(){
    return (jsh.dev && this.settings && this.settings.running);
  };
  XDebugConsole.prototype.isMinimized = function(){
    return (this.settings.minimized);
  };

  XDebugConsole.prototype.loadSettings = function(){
    this.settings = jsh.XExt.GetSettingsCookie(this.SettingsCookieID)||{};
    this.settings = _.extend({},this.default_settings, this.settings);
  };

  XDebugConsole.prototype.saveSettings = function(options){
    options = _.extend({ debounce: false }, options);
    var _this = this;
    if(options.debouce){
      if(this.saveSettingsTimer) return;
      this.saveSettingsTimer = window.setTimeout(function(){ _this.saveSettings(_.extend(options,{ debounce: false })); });
      return;
    }
    if(this.saveSettingsTimer){ window.clearTimeout(this.saveSettingsTimer); this.saveSettingsTimer = null; }
    try{
      jsh.XExt.SetSettingsCookie(this.SettingsCookieID,this.settings);
    }
    catch(ex){
      console.error(ex); // eslint-disable-line no-console
    }
  };

  XDebugConsole.prototype.getSourcesForWebSocket = function(){
    var sources = _.extend({},this.settings.sources);
    for (var client_source in this.client_sources){
      delete sources[client_source];
    }
    for (var k in sources){
      if (!sources[k]) delete sources[k];
    }
    return sources;
  };
  
  XDebugConsole.prototype.toggle = function(){
    if(this.isRunning()) this.close();
    else this.start();
  };

  XDebugConsole.prototype.start = function(force){
    if(!force && this.isRunning()) return;

    this.settings.running = 1;
    this.saveSettings();

    this.expandWindow();

    this.startWebSocketListener();
    this.bindXMLHttpRequestListener();

    this.saveSettings();
  };

  XDebugConsole.prototype.close = function(){
    this.settings.running = 0;
    this.saveSettings();

    this.DebugDialog.hide();
    this.clear();

    if(this.isRunning()){
      this.endWebSocketListener();
      this.unbindXMLHttpRequestListener();
    }
  };

  XDebugConsole.prototype.onXMLHttpRequestLoad = function(event){
    if (this.settings.sources['client_requests'] && this.settings.running) {
      var t = new Date();
      var client_resp = '';
      try {
        client_resp = JSON.stringify(JSON.parse(event.currentTarget.responseText), null, 2);
      } catch (e) {
        if (e instanceof SyntaxError) {
          client_resp = event.currentTarget.responseText;
        }
      }
      this.log(t.toLocaleString() + ' - Client Request: ' + decodeURIComponent(event.currentTarget.responseURL) + '<br>Client Response: ' + client_resp);
    }
  };

  XDebugConsole.prototype.bindXMLHttpRequestListener = function(){
    if(!XMLHttpRequest.prototype._baseSend) {
      var _this = this;
      XMLHttpRequest.prototype._baseSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function (value) {
        this.addEventListener('load', _this.onXMLHttpRequestLoad.bind(_this), false);
        this._baseSend(value);
      };
    }
  };

  XDebugConsole.prototype.unbindXMLHttpRequestListener = function(){
    if(XMLHttpRequest.prototype._baseSend) {
      XMLHttpRequest.prototype.send = XMLHttpRequest.prototype._baseSend;
      delete XMLHttpRequest.prototype._baseSend;
    }
  };

  XDebugConsole.prototype.startWebSocketListener = function(){
    var _this = this;
    if (!this.socket || (typeof this.socket.readyState === 'undefined')){
      this.socket = new WebSocket(this.socket_url);
      this.socket.onopen = function (e) {
        _this.socket.send(JSON.stringify({setSettings: {sources: _this.getSourcesForWebSocket()}}));
        _this.socket.send(JSON.stringify({getHistory: true}));
      };
      this.socket.onclose = function (e) {
        if (!e.wasClean){
          var t = new Date();
          _this.log(
            '<span style="color: red;">'+ t.toLocaleString() + ' - ' +
            ' Can\'t connect to Web Socket (URL: '+XDebugConsole.socket_url +'; Code: '+e.code+') Will try to reconnect in 2 sec.</span>'
          );
          _this.socket=null;
          setTimeout(function(){
            var t = new Date();
            _this.log(
              '<span style="color: green;">'+ t.toLocaleString() + ' - ' + 'Trying to reconnect to Web Socket.</span>'
            );
            if(!_this.settings.running) return;
            _this.startWebSocketListener();
          }, 2000);
        }
      };
      this.socket.onmessage = function (e) {
        try{
          var m = JSON.parse(e.data);
          var t = new Date( m.timestamp);
          _this.log(
            '<span style="color: ' + m.color + '">'+ t.toLocaleString() + ' - ' + _this.all_sources[m.source] + ': ' +  m.txt + '</span>'
          );
        }catch (e) {
          if(e instanceof SyntaxError){
            _this.log(
              '<span style="color: red">Can\'t parse json. Error: ' +  e.message + '</span>'
            );
          }else{
            throw e;
          }
        }
      };
    }
    else{
      this.updateWebSocketSources();
    }
  };

  XDebugConsole.prototype.updateWebSocketSources = function(){
    var _this = this;
    if (this.socket && (typeof this.socket.readyState !== 'undefined')) {
      this.socket.send(JSON.stringify({setSettings: {sources: _this.getSourcesForWebSocket()}}));
    }
  };

  XDebugConsole.prototype.endWebSocketListener = function(){
    if (this.socket && (typeof this.socket.readyState !== 'undefined')) {
      this.socket.close();
      this.socket = null;
    }
  };

  XDebugConsole.prototype.createPanel = function(){
    var _this = this;
    var settingsHtml = '';
    for(var source_id in _this.all_sources){
      var obj_id = 'xdebugconsole_source_'+source_id;
      settingsHtml +=
        '<label for="' + obj_id + '">' +
          '<input type="checkbox" class="xdebugconsole_source" id="' + obj_id + '" value="' + source_id + '"> ' + _this.all_sources[source_id] +
        '</label>';
    }
    //Filter Input
    settingsHtml +=
      '<label for="debugconsole_filter">' +
        '<input type="text" placeholder="Filter" class="xdebugconsole_filter" id="debugconsole_filter"></input>'+
      '</label>';
    this.DebugDialog = jsh.$root('.xdebugconsole');
    this.DebugPanel  =  this.DebugDialog.$find('.debug-panel');
    this.DebugPanel.$find('.debug-settings').append($(settingsHtml));
    this.DebugPanelMin  = this.DebugDialog.$find('.debug-panel-minimized');
    var checkboxes = this.DebugPanel.$find('.xdebugconsole_source');
    for (var i=0; i<checkboxes.length; i++){
      if (this.settings.sources[checkboxes[i].value]){
        $(checkboxes[i]).click();
      }
    }
    this.DebugDialog.hide().removeClass('visible');
    this.updatePanelLayout();
    jsh.XExt.makeResizableDiv('.debug-panel',[
      {selector:'.xdebuginfo-body',
        correction_y:function(){ return _this.getBodyHeight(0); },
        correction_x:function(){ return (_this.settings.dock == 'bottom') ? 0 : -3; }
      },
      {selector:'.xdebugconsole',correction_y:0,correction_x:0},
    ], { onDragEnd: function(){
      _this.settings.window_size = _this.getWindowSize();
      _this.saveSettings();
    } });
    //Source Checkboxes
    this.DebugPanel.on('click','.xdebugconsole_source', function(){
      var jobj = $(this);
      _this.settings.sources[jobj.val()] = !!jobj.prop('checked');
      _this.saveSettings();
      _this.updateWebSocketSources();
    });
    //Apply Filter
    this.DebugPanel.on('change keydown paste input', '.xdebugconsole_filter', function(){
      var filterTxt = $(this).val().toLowerCase();
      var messages = document.querySelector('.xdebuginfo-body').children;
      for(var i=0; i < messages.length; i++) {
        var container = messages[i];
        var isVisible = container.classList.contains('visible');
        if(filterTxt.length == 0 || ((container.innerText.toLowerCase().indexOf(filterTxt)) >= 0)) {
          if(!isVisible) container.classList.add('visible');
        }
        else if(isVisible) container.classList.remove('visible');
      }
    });
    this.DebugDialog.$find('.controls i').on('click',function(){
      var action = $(this).data('action');
      if(action && _this[action]) _this[action]();
    });
  };

  XDebugConsole.prototype.getWindowSize = function(){
    var width = $('.debug-panel').width();
    var height = $('.debug-panel').height();
    if(this.settings.dock == 'bottom') return { height: height };
    return { width: width, height: height };
  };

  XDebugConsole.prototype.getBodyHeight = function(baseHeight){
    return baseHeight - 31 - (this.settings.settings_visible ? this.DebugPanel.$find('.debug-settings').outerHeight() : 0);
  };

  XDebugConsole.prototype.setWindowSize = function(size){
    if(!size) size = {};
    if(!('width' in size)) size.width = this.default_settings.window_size.width;
    if(!('height' in size)) size.height = this.default_settings.window_size.height;

    if(this.settings.dock == 'bottom'){
      $('.debug-panel').height(size.height);
      $('.xdebuginfo-body').height(this.getBodyHeight(size.height));
    }
    else if(this.settings.dock == 'right'){
      $('.debug-panel').width(size.width);
      $('.debug-panel').height(size.height);
      $('.xdebuginfo-body').height(this.getBodyHeight(size.height));
    }
  };

  XDebugConsole.prototype.updatePanelLayout = function() {
    for(var i=0; i<this.dock_positions.length; i++){
      this.DebugDialog.removeClass(this.dock_positions[i]);
    }
    this.DebugDialog.addClass(this.settings.dock);
    this.setWindowSize(this.settings.window_size);
    this.renderSettings();
  };

  XDebugConsole.prototype.renderSettings = function(){
    this.DebugPanel.$find('.debug-settings').toggle(!!this.settings.settings_visible);
  };

  XDebugConsole.prototype.toggleSettings = function(){
    this.settings.settings_visible = !this.settings.settings_visible;
    this.saveSettings();
    this.renderSettings();
  };

  XDebugConsole.prototype.minimizeWindow = function(){
    this.DebugPanel.hide();
    this.DebugPanelMin.show();
    this.DebugDialog.removeClass('visible');
    this.settings.minimized = 1;
    this.saveSettings();
  };

  XDebugConsole.prototype.expandWindow = function(){
    this.DebugPanel.show();
    this.DebugPanelMin.hide();
    this.DebugDialog.show();
    this.DebugDialog.addClass('visible');
    this.settings.minimized = 0;
    this.saveSettings();
  };

  XDebugConsole.prototype.dockRight = function(){
    this.settings.dock = 'right';
    this.updatePanelLayout();
    this.saveSettings();
  };

  XDebugConsole.prototype.dockBottom = function(){
    this.settings.dock = 'bottom';
    this.DebugPanel.attr('style',null);
    this.DebugPanel.show();
    this.DebugPanel.$find('.xdebuginfo-body').attr('style',null);
    this.updatePanelLayout();
    this.saveSettings();
  };

  XDebugConsole.prototype.clear = function() {
    this.DebugPanel.$find('.xdebuginfo-body').empty();
  };

  XDebugConsole.prototype.log = function (txt, clear) {
    if(clear) this.clear();
    var filterTxt = this.DebugPanel.$find('.xdebugconsole_filter').val().toLowerCase();
    var showMsg = !filterTxt.length || (txt.toLowerCase().indexOf(filterTxt) >= 0);
    this.DebugPanel.$find('.xdebuginfo-body').prepend($('<div class="info-message'+(showMsg ? ' visible': '')+'">'+txt+'</div>'));
  };

  return XDebugConsole;
};