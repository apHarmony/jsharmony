/*
Copyright 2017 apHarmony

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

require('./polyfill.js');
require('./crypto-md5-2.5.3.js');

//Libraries
var csv = require('./csv.min.js');
var _ = require('lodash');
var ejs = require('ejs');
var async = require('async');
var moment = require('moment');
var XGrid = require('./XGrid.js');
var XForm = require('./XForm.js');
var XDom = require('./XDom.js');
var XExt = require('./XExt.js');
var XAPI = require('./XAPI.js');
var XFormat = require('./XFormat.js');
var XValidate = require('./XValidate.js');
var XSearch = require('./XSearch.js');
var XPayment = require('./XPayment.js');
var XBarcode = require('./XBarcode.js');
var XScanner = require('./XScanner.js');
var XEditableGrid = require('./XEditableGrid.js');
var XMenu = require('./XMenu.js');
var JSHFind = require('./JSHFind.js');
var XLoader = require('./XLoader.js');
var XImageLoader = require('./XImageLoader.js');
var XDebugConsole = require('./XDebugConsole.js');
//EJS
var XViews = [];
XViews['jsh_system'] = require('../views/jsh_system.ejs');


//jsHarmony Core Client-side Object
var jsHarmony = function(options){
  if(!options) options = {};
  var _this = this;

  //Events
  this.onRefreshLayout = [];
  this.RefreshLayout = function(){ _this.XExt.trigger(_this.onRefreshLayout); };

  this.onNavigated = [];
  this.Navigated = function(obj){ _this.XExt.trigger(_this.onNavigated, obj); };

  this.onMessage = [];
  this.Message = function(data){
    _this.XExt.trigger(_this.onMessage, data);
    _this.trigger('jsh_message', data);
  };
  this.events = {}; /*{event1: [handlers, ...], event2: [handlers, ...], ...}*/
  this.onInit = null; //function(){};

  //Options
  this.forcequery = {};
  this._BASEURL = '/';
  this._PUBLICURL = '/';
  this._debug = false;
  this._show_system_errors = false;
  this.home_url = '';
  this.uimap = {};
  this._instance = '';
  this._dialogBaseClass = '';
  this.google_api_key = '';
  this.isAuthenticated = false;
  this.urlrouting = true;
  for(var key in options) this[key] = options[key];

  //Libraries
  this._ = _;
  this.ejs = ejs;
  this.async = async;
  this.moment = moment;
  this.csv = csv;
  this.XDom = XDom.with({ renderers: { ejs: function(str, data){ return ejs.render(str, data, { delimiter: '#' }); } } });
  this.XGrid = XGrid(this);
  this.XForm = XForm(this);
  this.XExt = XExt(this);
  this.XAPI = XAPI(this);
  this.XFormat = XFormat();
  this.XValidate = XValidate;
  this.XValidate.jsh = this;
  this.XSearch = XSearch(this);
  this.XPayment = XPayment(this);
  this.XBarcode = XBarcode(this);
  this.XScanner = XScanner(this);
  this.XEditableGrid = XEditableGrid(this);
  this.XMenu = XMenu(this);
  this.JSHFind = JSHFind;
  this.XLoader = XLoader(this);
  this.XImageLoader = XImageLoader(this);
  this.XDebugConsole = XDebugConsole(this);
  this.XViews = XViews;

  //jsh_client_embed
  this.App = {};    //Functions and variables related to the current page - reset between SPA page loads
  this.System = {}; //Global System Functions - unchanged between SPA page loads
  this.XModels = {};
  this.XBase = {};
  this.XModels_root = '';
  this.XPopups = {};
  this.is_popup = false;

  this.XPage = {};
  this.XPage.CustomShortcutKeys = [function(e){ return false; /*  Return true if the shortcut key is handled */ }];

  //global
  this.isHTML5 = (document.createElement('canvas').getContext);
  this.xContextMenuVisible = false;
  this.xContextMenuItem = undefined;
  this.xContextMenuItemData = undefined;
  this.mouseX = 0;
  this.mouseY = 0;
  this.mouseDown = false;
  this.mouseDragObj = undefined; //DOM object
  this.mouseCanDrop = undefined;    //function(obj){ return true; }
  this.last_clicked_time = undefined;
  this.last_clicked = undefined;
  this.DEFAULT_DATEFORMAT = 'MM/DD/YY';
  this.onPaymentProxyComplete = function(){};

  this.imageLoader = null;
  this.xLoader = null;
  this.xDialogLoader = null;
  this.xDebugConsole = null;
  this.xDialog = [];
  this.xfileuploadLoader = null;
  this.appStartTime = Date.now();
  this.pageStartTime = Date.now();

  //jsh_client_page
  this.is_insert = false;
  this.is_browse = false;
  this.init_complete = false;
  this.delete_target = null;
  this.xdfileupload_ctrl = null;
  this.bcrumbs = {};
  this.orig_bcrumbs = '';
  this.jsproxy_hooks = {};
  this.intervals = [];
  this.cur_history_url = ''; //Last URL, to check if link is an anchor # or regular link
  window.onbeforeunload = function(){ if(_this.XPage.OnExit) return _this.XPage.OnExit(); };
  this.cancelExit = false;

  this._instanceClass = this.XExt.escapeCSSClass(this._instance);
  this.xdroot = XDom(document);
  this.xdom = this.xd = function(sel){ return this.xdroot.get(sel); };
  this.xdDialogBlock = null;
  this.globalsMonitorCache = {};
  this.globalsMonitorTimer = null;
  this.jslocals = '';

  //singlepage
  this.cur_model = null;
  this.state = {};
  this.globalparams = {};
  this.Config = {
    max_filesize: 50000000,
    require_html5_after_login: true,
    debug_params: {
      ignore_globals: []
    }
  };
  this.singlepage = false;
  this.prev_title = '';
  this.prev_title_src = '';
  this.prev_bcrumbs = '';
  this.prev_bcrumbs_src = '';
  this.focusHandler = [[]];
  this.focusHandlerIndex = [window];
  this.ignorefocusHandler = false;
  this.queuedInputAction = null;
  this.lastSquashedActionTime = undefined;
  this.static_paths = [];
  this.title_html = '';
  this.title = '';
  this.frontsalt = '';
  this.app_errors = [];
  this.popups = {};
  this.srcfiles = {};
  this.scriptLoader = {};
  this.lastWindowSize = { width: window.innerWidth, height: window.innerHeight };

  this._GET = this.XExt.parseGET();
  _.extend(this._GET, this.forcequery);
  this.is_insert = (this._GET['action'] == 'insert');
  this.is_browse = (this._GET['action'] == 'browse');

  this.BindEvents();
  for(var i=0;i<jsHarmony.Instances.length;i++){ if(jsHarmony.Instances[i]._instance == _this._instance) throw new Error('Duplicate jsHarmony Instance ID: '+_this._instance); }
  jsHarmony.Instances.push(this);

  if(options.globalScope){
    window.moment = moment;
    window.jsh = this;
    if(!_this._instance) _this._instance = 'jsh';
  }
};

jsHarmony.prototype.getInstance = function(){
  if(!this._instance) throw new Error('jsHarmony._instance is required');
  return this._instance;
};

jsHarmony.prototype.getFileProxy = function(){
  var _this = this;
  return _this.xd('#'+_this.getInstance()+'_xfileproxy').element;
};

jsHarmony.prototype.postFileProxy = function(url, params){
  var _this = this;
  var xdform_container = XDom('#'+_this.getInstance()+'_xfileform_container');
  xdform_container.clear();
  var form = XDom.render('<form method="post" id="'+_this.getInstance()+'_xfileform"></form>');
  form.action = url;
  form.target = _this.getInstance()+'_xfileproxy';
  for(var key in params){
    var input = XDom.render('<input type="hidden" />');
    input.name = key;
    input.value = (params[key]||'').toString();
    form.appendChild(input);
  }
  xdform_container.append(form);
  form.submit();
  XDom.remove(form);
};

jsHarmony.prototype.loadScript = function(url, cb){
  var _this = this;
  if(url in _this.scriptLoader){
    if(_this.scriptLoader[url] === null) return cb();
    else return _this.scriptLoader[url].push(cb);
  }
  _this.scriptLoader[url] = [cb];
  var script = document.createElement('script');
  script.onload = function(){
    var funcs = _this.scriptLoader[url];
    _this.scriptLoader[url] = null;
    _.each(funcs, function(func){ func(); });
  };
  script.onerror = function (err) {
    console.log(err); // eslint-disable-line no-console
    _this.XExt.Alert('Error loading script: '+err.toString());
  };
  script.src = url;
  script.async = true;
  document.head.appendChild(script);
};

jsHarmony.prototype.BindEvents = function(){
  var _this = this;
  XDom.onPageLoad(function(){
    _this.Init();
    _this.XWindowResize();
  });
  XDom(document).on('keydown', function (e) {
    var handled = false;
    if (_this.XPage.CustomShortcutKeys) {
      for(var i=0;i<_this.XPage.CustomShortcutKeys.length;i++){
        if(_this.XPage.CustomShortcutKeys[i](e)){
          handled = true;
          break;
        }
      }
    }
    if(!handled && _this.XPage.handleShortcutKeys) handled = _this.XPage.handleShortcutKeys(e);
    if(handled){
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  });
  var xdWin = XDom(window);
  xdWin.on('load', function () { _this.XWindowResize(); });
  xdWin.on('resize', function () { _this.XWindowResize(); });
  xdWin.on('scroll', function () { _this.XWindowResize('scroll'); });
  xdWin.on('message', function(event){ _this.Message((event.data || '').toString()); });
  window.setInterval(function(){
    var newWindowSize = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    if((newWindowSize.width != _this.lastWindowSize.width) || (newWindowSize.height != _this.lastWindowSize.height)){ _this.XWindowResize(); }
    _this.lastWindowSize = newWindowSize;
  }, 500);

};

jsHarmony.prototype.Init = function(){
  var _this = this;
  if(_this.xd('body').length) _this.xdroot = _this.xd('body');
  if(_this.XExt.isMobile()) _this.xd('.xmain').class.add('xmain_mobile');
  _this.InitFileUpload();
  this.imageLoader = new this.XImageLoader();
  this.imageLoader.loadqueue = new Array(
    _this._PUBLICURL+'images/loading.gif',
    _this._PUBLICURL+'images/arrow_down.png',
    _this._PUBLICURL+'images/arrow_down_over.png',
    _this._PUBLICURL+'images/arrow_up.png',
    _this._PUBLICURL+'images/arrow_up_over.png'
  );
  this.imageLoader.StartLoad();
  XDom('html').on('click', function (e) {
    if(!_this.XDom(e.target).parent('.xdatepicker,.datepicker').length) _this.XExt.DatePickerHide();
    _this.hideContextMenu();
  });
  _this.InitDialogs();
  _this.InitControls();
  _this.XMenu.Init();
  if(!this.xLoader) this.xLoader = new this.XLoader();
  if(!this.xDialogLoader) this.xDialogLoader = new this.XLoader('.xdialogblock.jsHarmonyElement_'+_this._instanceClass+' .xdialogloadingblock');
  this.xLoader.onSquashedClick.push(function(e){ _this.lastSquashedActionTime = Date.now(); });
  this.xDebugConsole = new this.XDebugConsole();
  var xdDoc = XDom(document);
  xdDoc.on('mousemove', function (e) {
    _this.mouseX = e.pageX;
    _this.mouseY = e.pageY;
    if(_this.mouseDragObj) _this.mouseDrag(_this.mouseDragObj, e);
  });
  xdDoc.on('mousedown', function (e) {
    _this.mouseDown = true;
  });
  xdDoc.on('mouseup', function (e) {
    _this.mouseDown = false;
    if(_this.mouseDragObj){
      _this.mouseDragEnd(_this.mouseDragObj, e);
      _this.mouseDragObj = undefined;
      e.preventDefault();
      e.stopPropagation();
    }
  });
  xdDoc.on('mouseleave', function (e) {
    _this.mouseDown = false;
  });
  this.xd('a').on('click', function () {
    _this.last_clicked_time = Date.now();
    _this.last_clicked = XDom(this);
  });
  if(this.isAuthenticated && this.Config.require_html5_after_login){
    this.requireHTML5();
  }
  if(this.Config.debug_params.monitor_globals) this.runGlobalsMonitor();
  if(_this.onInit) _this.onInit();
};

jsHarmony.prototype.mouseDragBegin = function(mouseDragObj, mouseCanDrop, e){
  var _this = this;
  _this.hideContextMenu();
  if(!mouseDragObj) return;
  _this.mouseDragObj = mouseDragObj;
  _this.mouseCanDrop = mouseCanDrop;
  var xdClone = XDom(XDom.render(mouseDragObj.outerHTML));
  xdClone.style.position =  'absolute';
  xdClone.style.zIndex = 99998;
  xdClone.style.left = _this.mouseX+'px';
  xdClone.style.top = _this.mouseY+'px';
  xdClone.class.add('xdrag');
  xdClone.class.remove('xdrop');
  _this.xdroot.prepend(xdClone);

  _this.trigger('jsh_mouseDragBegin', [mouseDragObj, e]);
};

jsHarmony.prototype.mouseDrag = function(mouseDragObj, e){
  var _this = this;
  if(!mouseDragObj) return;
  
  var xdClone = _this.xd('.xdrag');
  xdClone.style.left = _this.mouseX+'px';
  xdClone.style.top = _this.mouseY+'px';
  var targetObj = null;
  _this.xdroot.getElements('.xdrop').forEach(function(el){
    if(_this.XExt.isMouseWithin(el)){
      if(!_this.mouseCanDrop || _this.mouseCanDrop(el)){
        if(!targetObj || _this.XExt.isChildOf(targetObj, this)) targetObj = el;
      }
    }
  });

  _this.trigger('jsh_mouseDrag', [mouseDragObj, targetObj, e]);
};

jsHarmony.prototype.mouseDragEnd = function(mouseDragObj, e){
  var _this = this;
  if(!mouseDragObj) return;
  this.xd('.xdrag').remove();
  var targetObj = null;
  this.xdroot.getElements('.xdrop').forEach(function(el){
    if(_this.XExt.isMouseWithin(el)){
      if(!_this.mouseCanDrop || _this.mouseCanDrop(el)){
        if(!targetObj || _this.XExt.isChildOf(targetObj, el)) targetObj = el;
      }
    }
  });
  _this.trigger('jsh_mouseDragEnd', [mouseDragObj, targetObj, e]);
};

jsHarmony.prototype.hideContextMenu = function(){
  if (this.xContextMenuVisible) {
    this.xContextMenuVisible = false;
    this.xContextMenuItem = undefined;
    this.xContextMenuItemData = undefined;
    this.xd('.xcontext_menu').style.display = false;
  }
};

jsHarmony.prototype.DefaultErrorHandler = function(num,txt){
  if(num == -9) {
    //Custom Error Message
    this.XExt.Alert(txt);
    return true;
  }
  else if(num == -10) {
    //User not logged in
    this.XExt.Confirm('Your session has timed out or you have logged out of the system.  Proceed to login page?  You will lose any pending changes.', function () {
      location.reload(true);
    });
    return true;
  }
  return false;
};

jsHarmony.prototype.XDebugInfo = function (txt,clear) {
  var xdobj = this.xd('.xdebuginfo.jsHarmonyElement_'+this._instanceClass);
  xdobj.style.display = true;
  if (clear) xdobj.clear();
  xdobj.prepend(txt + '<br/>');
};
jsHarmony.prototype.InitDialogs = function () {
  var _this = this;
  this.xdroot.append(ejs.render(XViews['jsh_system'],{ jsh: _this }));
  this.xdDialogBlock = this.xd('.xdialogblock.jsHarmonyElement_'+this._instanceClass);
};
jsHarmony.prototype.InitControls = function() {
  var _this = this;
  XDom('.xtabcontrol').omit('.initialized').elements.forEach(function(el){ _this.XExt.bindTabControl(el); });
  XDom('.xaccordiontab').omit('.initialized').elements.forEach(function(el){ _this.XExt.bindAccordion(el); });
};
jsHarmony.prototype.refreshBodyHead = function(_el){
  if(!_el) _el = this.xdroot.getElements('.xbodyhead');
  if(_el.length === 0) return;
  var ww = window.innerWidth;
  _.each(_el, function(el){
    var bodyhead_width = null;
    var dialogParent = XDom.parent(el, '.xdialogbox');
    if(dialogParent.length && XDom.filter(dialogParent, '.xpopupbox').length){
      bodyhead_width = XDom.calc.width(dialogParent) - XDom.calc.leftFromOffsetParent(el) - 10;
    }
    else bodyhead_width = (ww - XDom.calc.left(el) - 10);
    XDom.setStyle(el, 'max-width', bodyhead_width + 'px');
  });
};
jsHarmony.prototype.XWindowResize = function (source) {
  var ww = window.innerWidth;
  var wh = window.innerHeight;
  var sleft = window.scrollX;
  var stop = window.scrollY;
  var docw = document.documentElement.scrollWidth;
  var doch = document.documentElement.scrollHeight;
  var pw = ((docw > ww) ? docw : ww); //Page width = greater of document or window width
  var ph = ((doch > wh) ? doch : wh); //Page height = greater of document or window height
  var params = { ww: ww, wh: wh, sleft: sleft, stop: stop, docw: docw, doch: doch, pw: pw, ph: ph };
  this.refreshBodyHead();
  XDom.setStyle(this.xdroot.getElement('.xhead'), 'top', (-1 * stop) + 'px');
  this.XDialogResize(source, params);
  this.RefreshLayout();
  this.lastWindowSize = {
    width: ww,
    height: wh,
  };
};
jsHarmony.prototype.XDialogResize = function (source, params) {
  var xdDebugInfo = this.xd('.xdebuginfo.jsHarmonyElement_'+this._instanceClass);
  xdDebugInfo.style.top = params.stop + 'px';
  xdDebugInfo.style.left = params.sleft + 'px';
  xdDebugInfo.style.width = params.ww + 'px';

  if(this.xdDialogBlock){
    this.xdDialogBlock.style.width = params.pw + 'px';
    this.xdDialogBlock.style.height = params.ph + 'px';
    _.each(this.xdDialogBlock.getElements('.xdialogbox'), function (obj) {
      var xdobj = XDom(obj);
      if (!XDom.isVisible(obj)) return;
      if (document.activeElement && document.activeElement.matches('input,select,textarea') && XDom(document.activeElement).parent().length) {
        if (source == 'scroll') return;
      }
      var dw = xdobj.calc.widthToBorder();
      var dh = xdobj.calc.heightToBorder();
      /*if (wh != ph) {
        if (source == 'scroll') return;
      }*/
      var dleft = (params.ww / 2 - dw / 2);
      if (dleft < 0) dleft = 0;
      var dtop = (params.wh / 2 - dh / 2);
      if (dtop < 0) dtop = 0;
      //dleft += sleft;
      //dtop += stop;

      xdobj.style.left = dleft + 'px';
      xdobj.style.top = dtop + 'px';
      if(params.docw) xdobj.style.maxWidth = params.docw + 'px';
    });
  }
};

jsHarmony.prototype.addFocusHandler = function (dialogContainer, handler) {
  if(!dialogContainer) dialogContainer = window;
  var handlerIdx = this.focusHandlerIndex.indexOf(dialogContainer);
  if(handlerIdx < 0){
    this.focusHandlerIndex.push(dialogContainer);
    this.focusHandler.push([]);
    handlerIdx = this.focusHandlerIndex.length - 1;
  }
  this.focusHandler[handlerIdx].push(handler);
};

jsHarmony.prototype.getFocusHandlers = function (dialogContainer) {
  if(!dialogContainer) return [];
  var handlerIdx = this.focusHandlerIndex.indexOf(dialogContainer);
  if(handlerIdx < 0) return [];
  return this.focusHandler[handlerIdx]||[];
};

jsHarmony.prototype.getTopDialogContainer = function () {
  if(!this.xDialog.length) return window;
  return this.xDialog[0].obj;
};

jsHarmony.prototype.InitFileUpload = function () {
  if (this.xfileuploadLoader != null) return;
  this.xfileuploadLoader = new Object();
  this.xdroot.append(
    '<div style="display:none;">\
      <div class="xdialogbox xfileuploader" align="center" style="height:130px;"><div style="position:relative;">\
        <strong class="xfileuploader_title"></strong>\
        <form class="xfileuploader_form" enctype="multipart/form-data" method="post" target="'+this.getInstance()+'_xfileproxy">\
          <input type="hidden" name="MAX_FILE_SIZE" value="'+this.Config.max_filesize+'" />\
          <input type="hidden" name="prevtoken" class="xfileuploader_prevtoken" value="" />\
          <table cellspacing="3">\
            <tr>\
              <td align="right">Upload File:</td>\
              <td align="left"><input type="file" class="xfileuploader_file" name="file" /></td>\
            </tr>\
            <tr>\
              <td></td>\
              <td style="padding-top:10px;">\
                <a class="linkbutton" style="padding-right:15px;" href="#" onClick="'+this.getInstance()+'.XPage.FileUploadSubmit();return false;"><img src="'+this._PUBLICURL+'images/icon_ok.png" alt="Upload" title="Upload" />Upload</a>\
                <a class="linkbutton" href="javascript:'+this.getInstance()+'.XExt.CancelDialog()"><img src="'+this._PUBLICURL+'images/icon_cancel.png" alt="Cancel" title="Cancel" />Cancel</a></td>\
            </tr>\
          </table>\
        </form>\
      </div></div>\
      <div id="'+this.getInstance()+'_xfileform_container"></div>\
      <iframe id="'+this.getInstance()+'_xfileproxy" name="'+this.getInstance()+'_xfileproxy" src="about:blank" style="width:0;height:0;border:0px solid #fff;"></iframe>\
    </div>');
};

jsHarmony.prototype.requireHTML5 = function(){
  var _this = this;
  XDom.onPageLoad(function(){
    if (!document.createElement('canvas').getContext) {
      var content = '\
      <div class="browser_upgrade_msg xdialogbox" style="height: 165px; text-align: center; width: 450px;">\
        <strong>Did you know that your browser is out of date?</strong>\
        <p>In order to use this system, you will need to upgrade your web browser to a modern version that supports HTML5.  Please click "Upgrade" to view supported browsers.</p>\
        <div>\
        <input style="padding:2px 6px;" type="button" value="Upgrade" onclick="window.location.href=\'http://www.browsehappy.com\';" />\
        <input style="padding:2px 6px;" type="button" value="Logout" onclick="window.location.href=\''+_this._BASEURL+'logout\';" />\
        </div>\
      </div>\
      ';
      _this.XExt.CustomPrompt(null, content);
    }
  });
};

jsHarmony.prototype.runGlobalsMonitor = function(){
  var _this = this;
  _this.globalsMonitorCache = {};
  for(var id in window) _this.globalsMonitorCache[id] = true;
  if(_this.globalsMonitorTimer) window.clearTimeout(_this.globalsMonitorTimer);
  _this.globalsMonitorTimer = window.setTimeout(function(){
    _this.globalsMonitorTimer = null;
    for(var id in window){
      if(!(id in _this.globalsMonitorCache)){
        _this.globalsMonitorCache[id] = true;
        if(_.includes(['google','_xdc_','data-cke-expando','CKEDITOR','CKEDITOR_BASEPATH','data-cke-expando','OverlayView','tinyMCE','tinymce','TINYMCE_BASEPATH'],id)) continue;
        if(_.includes(_this.Config.debug_params.ignore_globals,id)) continue;
        if(_this.XExt.beginsWith(id, 'module$contents$')) continue;
        if(_this.XExt.beginsWith(id, 'mce-data-')) continue;
        if(parseInt(id).toString()==id.toString()) continue;
        console.log('New global variable: window.'+id); // eslint-disable-line no-console
        _this.XExt.Alert('New global variable: window.'+id);
      }
    }
    _this.runGlobalsMonitor();
  },1000);
};

jsHarmony.prototype.on = function(eventName, handler){
  if(!eventName || !handler) return;
  if(!this.events[eventName]) this.events[eventName] = [];
  this.events[eventName].push(handler);
};
jsHarmony.prototype.off = function(eventName, handler){
  if(!eventName || !this.events[eventName]) return;
  if(handler) {
    for(var i=0; i<this.events[eventName].length; i++){
      if(this.events[eventName][i] === handler){
        this.events[eventName].splice(i, 1);
        i--;
      }
    }
  }
  else {
    this.events[eventName] = [];
  }
};
jsHarmony.prototype.trigger = function(eventName /*, param1, param2 */){
  if(!eventName || !this.events[eventName]) return;
  this.XExt.trigger.apply(null, [this.events[eventName]].concat(Array.prototype.slice.call(arguments, 1)));
};

var instances = [];
if(global.jsHarmony) instances = global.jsHarmony.Instances;
if(window.jsHarmony) instances = window.jsHarmony.Instances;
jsHarmony.Instances = instances;
jsHarmony.XDom = XDom;

global.jsHarmony = jsHarmony;