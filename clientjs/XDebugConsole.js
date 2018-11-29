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
  XDebugConsole.cookie_name = 'x_debug_console';
  XDebugConsole.default_settings = {"enabled":1,"minimized":0,"source":["web server","client requests","system","database","authentication"]};
  function isEnabled(){
    return (jsh.dev && XDebugConsole.settings.enabled);
  }
  function isMinimized(){
    return (XDebugConsole.settings.minimized);
  }

  XDebugConsole.setXMLHttpRequestListener = function(){
    XMLHttpRequest.prototype.baseSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(value) {
      // this.addEventListener("progress", function(){
      //   XDebugConsole.showDebugMessage('loading');
      // }, false);

      this.addEventListener("load", function(){
        if (XDebugConsole.settings.source.indexOf("client requests")>-1){
          XDebugConsole.showDebugMessage('Client Request: '+this.responseURL+'<br>Client Response: '+JSON.stringify(JSON.parse(this.responseText), null, 2));
        }
      }, false);
      this.baseSend(value);
    };
  }
  XDebugConsole.socket = '';
  XDebugConsole.setWebSocketListener = function(){
    if (XDebugConsole.settings.source.indexOf("web server")>-1){
      XDebugConsole.socket = new WebSocket("ws://"+window.location.hostname+":"+window.location.port+jsh._BASEURL+"_log");
      XDebugConsole.socket.onmessage = function(e){
        XDebugConsole.showDebugMessage('Server request: '+JSON.stringify(JSON.parse(e.data), null, 2));
      }
    }else {
      if (typeof XDebugConsole.socket === 'object'){
        XDebugConsole.socket.close(1000,'close');
        XDebugConsole.socket='';
      }
    }
  }


  XDebugConsole.InitDebugPanel = function(){
    XDebugConsole.setXMLHttpRequestListener();
    XDebugConsole.setWebSocketListener();
    var default_sources = XDebugConsole.default_settings.source;
    var settingsHtml = '';
    for (var i=0; i<default_sources.length; i++) {
      settingsHtml += '<label for="' + default_sources[i] + '"><input type="checkbox" name="source" class="src" id="' + default_sources[i] + '" value="' + default_sources[i] + '"> ' + default_sources[i] + '</label><br>';
    }
    XDebugConsole.DebugDialog = jsh.$root('.xdebugconsole');
    XDebugConsole.DebugPanel  =  XDebugConsole.DebugDialog.find('#debug-panel');
    XDebugConsole.DebugPanel.find('.debug-settings').append($(settingsHtml));
    XDebugConsole.DebugPanelMin  = XDebugConsole.DebugDialog.find('#debug-panel-minimized');
    var checkboxes = XDebugConsole.DebugPanel.find('.src');
    for (var i=0; i<checkboxes.length; i++){
      if (XDebugConsole.settings.source.indexOf(checkboxes[i].value)>-1){
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
    XDebugConsole.DebugPanel.on('click','.src', processSourcesChange);
    XDebugConsole.DebugDialog.on('click','i',handleControlHit);
  }

  function handleControlHit(e){
    var action = $(e.currentTarget).data("s");
    if (action ==='settings') return XDebugConsole.DebugPanel.find('.debug-settings').toggle();
    if (action ==='minimize') {
      XDebugConsole.DebugPanel.toggle();
      XDebugConsole.DebugPanelMin.toggle();
      XDebugConsole.DebugDialog.removeClass('visible');
      XDebugConsole.settings.minimized=1;
      jsh.XExt.SetSettingsCookie(XDebugConsole.cookie_name,XDebugConsole.settings,60*24*300);
    }
    if (action ==='expand') {
      XDebugConsole.DebugPanel.toggle();
      XDebugConsole.DebugPanelMin.toggle();
      XDebugConsole.DebugDialog.addClass('visible');
      XDebugConsole.settings.minimized=0;
      jsh.XExt.SetSettingsCookie(XDebugConsole.cookie_name,XDebugConsole.settings,60*24*300);
    }
    if (action ==='close') {
      XDebugConsole.DebugDialog.toggle();
      XDebugConsole.settings.enabled=0;
      XDebugConsole.showDebugMessage('closed',1);
      jsh.XExt.SetSettingsCookie(XDebugConsole.cookie_name,XDebugConsole.settings,60*24*300);
    }
  }

  // TODO  _.extend | we should not combine here !!! ???
  XDebugConsole.Init = function(){
    this.settings = jsh.XExt.GetSettingsCookie(XDebugConsole.cookie_name);
    if (!this.settings.hasOwnProperty('enabled') && !this.settings.hasOwnProperty('source') && !this.settings.hasOwnProperty('minimized')){
      this.settings = {};
    }
    if(_.isEmpty(this.settings)){
      this.settings = this.default_settings
    }
    jsh.XExt.SetSettingsCookie(XDebugConsole.cookie_name,XDebugConsole.settings,60*24*300);
    this.InitDebugPanel();
  };

  function processSourcesChange(e){
    var elem = e.currentTarget;
    if($(elem).prop("checked") === true){
      XDebugConsole.settings.source.push(elem.value);
      XDebugConsole.showDebugMessage('Aded: '+elem.value, true);
    }
    else if($(elem).prop("checked") === false){
      var removed = _.remove(XDebugConsole.settings.source, function(n) {
        return n === elem.value;
      });
      XDebugConsole.showDebugMessage('Removed: '+removed[0],true);
    }
    jsh.XExt.SetSettingsCookie(XDebugConsole.cookie_name,XDebugConsole.settings,60*24*300);
    XDebugConsole.setWebSocketListener();
  }

  XDebugConsole.showDebugMessage = function (txt, clear) {
    var body = XDebugConsole.DebugPanel.find('.xdebuginfo-body');
    if(clear) body.empty();
    body.prepend('<div class="info-message"><pre>'+txt+'</pre></div>');
  }

  return XDebugConsole;
}