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
var $ = require('./jquery-1.11.2');
var jQuery = $;
require('../public/jquery-ui/js/jquery-ui-1.10.3.custom-aspa.min.js')(jQuery);
require('../public/js/jquery.colorbox-min.js')(jQuery);
var _ = require('lodash');
var ejs = require('ejs');
var async = require('async');
var moment = require('moment');
var XGrid = require('./XGrid.js');
var XForm = require('./XForm.js');
var XExt = require('./XExt.js');
var XFormat = require('./XFormat.js');
var XValidate = require('jsharmony-validate');
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
  this.RefreshLayout = function(){ _this.XExt.trigger(_this.onRefreshLayout); }

  this.onNavigated = [];
  this.Navigated = function(obj){ _this.XExt.trigger(_this.onNavigated, obj); }

  //Options
  this.forcequery = {};
  this._BASEURL = '/';
  this._debug = false;
  this.home_url = '';
  this.uimap = {};
  this._instance = '';
  this.google_api_key = '';
  this.isAuthenticated = false;
  for(var key in options) this[key] = options[key];

  //Libraries
  this.$ = $;
  this._ = _;
  this.ejs = ejs;
  this.async = async;
  this.moment = moment;
  this.XGrid = XGrid(this);
  this.XForm = XForm(this);
  this.XExt = XExt(this);
  this.XFormat = XFormat;
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
  this.XPage.CustomShortcutKeys = function(e){ return false; /*  Return true if the shortcut key is handled */ };

  //global
  this.isHTML5 = (document.createElement('canvas').getContext);
  this.xContextMenuVisible = false;
  this.xContextMenuItem = undefined;
  this.xContentMenuItemData = undefined;
  this.mouseX = 0;
  this.mouseY = 0;
  this.mouseDown = false;
  this.last_clicked_time = undefined;
  this.last_clicked = undefined;
  this.DEFAULT_DATEFORMAT = 'mm/dd/yy';
  this.onPaymentProxyComplete = function(){};

  this.imageLoader = null;
  this.xLoader = null;
  this.xDebugConsole = null;
  this.xDialog = [];
  this.xPopupStack = [];
  this.xfileuploadLoader = null;

  //jsh_client_topmost
  this.is_add = false;
  this.init_complete = false;
  this.delete_target = null;
  this.xfileupload_ctrl = null;
  this.bcrumbs = {};
  this.orig_bcrumbs = '';
  this.jsproxy_hooks = {};
  this.intervals = [];
  this.cur_history_url = ''; //Last URL, to check if link is an anchor # or regular link
  window.onbeforeunload = function(){ if(_this.XPage.OnExit) return _this.XPage.OnExit(); };
  this.cancelExit = false;

  this.root = $(document);
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
  this.focusHandler = [];
  this.ignorefocusHandler = false;
  this.qInputAction = null;
  this.static_paths = [];
  this.title_html = '';
  this.title = '';
  this.frontsalt = '';
  this.app_errors = [];
  this.popups = {};
  this.srcfiles = {};

  this._GET = this.XExt.parseGET();
  _.extend(this._GET, this.forcequery);
  this.is_add = (this._GET['action'] == 'add');

  this.BindEvents();
  jsHarmony.Instances.push(this);

  if(options.globalScope){
    window.$ = $;
    window.jQuery = $;
    window.moment = moment;
    window.jsh = this;
    if(!_instance) _instance = 'jsh';
  }
}

jsHarmony.prototype.$root = function(sel){
  return this.root.find(sel);
}

jsHarmony.prototype.getInstance = function(){
  if(!this._instance) throw new Error('jsHarmony._instance is required');
  return this._instance;
}

jsHarmony.prototype.getFileProxy = function(){
  var _this = this;
  return _this.$root('#'+_this.getInstance()+'_xfileproxy');
}

jsHarmony.prototype.BindEvents = function(){
  var _this = this;
  $(document).ready(function(){ _this.Init(); });
  $(document).ready(function () { _this.XWindowResize(); });
  $(window).resize(function () { _this.XWindowResize(); });
  $(window).scroll(function () { _this.XWindowResize('scroll'); });
  $(document).keydown(function (e) { if(_this.XPage.handleShortcutKeys) _this.XPage.handleShortcutKeys(e); })
}

jsHarmony.prototype.Init = function(){
  var _this = this;
  if(_this.root.find('body').length) _this.root = _this.root.find('body');
  this.imageLoader = new this.XImageLoader();
	this.imageLoader.loadqueue = new Array(
		'/images/loading.gif',
		'/images/arrow_down.png',
		'/images/arrow_down_over.png',
		'/images/arrow_up.png',
		'/images/arrow_up_over.png'
  );
  this.imageLoader.StartLoad();
	this.xLoader = new this.XLoader();
  $('html').click(function () {
    if (_this.xContextMenuVisible) {
      _this.xContextMenuVisible = false;
      _this.xContextMenuItem = undefined;
      _this.xContentMenuItemData = undefined;
      _this.$root('.xcontext_menu').hide();
    }
  });
  _this.InitDialogs();
  _this.InitControls();
  _this.XMenu.Init();
  _this.xDebugConsole = new _this.XDebugConsole();
  _this.xDebugConsole.Init();
  $(document).mousemove(function (e) {
    _this.mouseX = e.pageX;
    _this.mouseY = e.pageY;
  }).mousedown(function (e) {
    _this.mouseDown = true;
  }).mouseup(function (e) {
    _this.mouseDown = false;
  }).mouseleave(function (e) {
    _this.mouseDown = false;
  });
  this.$root('a').on('click', function () {
    _this.last_clicked_time = new Date().getTime();
    _this.last_clicked = $(this);
  });
  if(this.isAuthenticated && this.Config.require_html5_after_login){
    this.requireHTML5();
  }
  if(this.Config.debug_params.monitor_globals) this.runGlobalsMonitor();
}

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
}

jsHarmony.prototype.XDebugInfo = function (txt,clear) {
  this.$root('.xdebuginfo').show();
  if (clear) this.$root('.xdebuginfo').empty();
  this.$root('.xdebuginfo').prepend(txt + '<br/>');
}
jsHarmony.prototype.InitDialogs = function () {
  this.root.append($(XViews['jsh_system']));
};
jsHarmony.prototype.InitControls = function() {
  var _this = this;
  $('.xtabcontrol').not('.initialized').each(function(){ _this.XExt.bindTabControl(this); });
}
jsHarmony.prototype.XWindowResize = function (source) {
  var ww = $(window).width();
  var wh = $(window).height();
  var sleft = $(window).scrollLeft();
  var stop = $(window).scrollTop();
  var docw = $(document).width();
  var doch = $(document).height();
  var pw = ((docw > ww) ? docw : ww);
  var ph = ((doch > wh) ? doch : wh);
  var params = { ww: ww, wh: wh, sleft: sleft, stop: stop, docw: docw, doch: doch, pw: pw, ph: ph };
  if (this.$root('.xbodyhead').length) {
    var bodyhead_width = (ww - this.$root('.xbodyhead').offset().left - 10 + sleft);
    this.$root('.xbodyhead').css('max-width', bodyhead_width + 'px');
  }
  this.XDialogResize(source, params);
  this.RefreshLayout();
}
jsHarmony.prototype.XDialogResize = function (source, params) {
  this.$root('.xdialogblock').css('width', params.pw + 'px');
  this.$root('.xdialogblock').css('height', params.ph + 'px');

  this.$root('.xdebuginfo').css('top', params.stop + 'px');
  this.$root('.xdebuginfo').css('left', params.sleft + 'px');
  this.$root('.xdebuginfo').css('width', params.ww + 'px');

  this.$root('.xdialogblock .xdialogbox').each(function () {
    var jobj = $(this);
    if (!jobj.is(':visible')) return;
    if (document.activeElement && $(document.activeElement).is('input,select,textarea') && $(document.activeElement).parents(jobj).length) {
      if (source == 'scroll') return;
    }
    var dw = jobj.outerWidth();
    var dh = jobj.outerHeight();
    /*if (wh != ph) {
      if (source == 'scroll') return;
    }*/
    var dleft = (params.ww / 2 - dw / 2);
    if (dleft < 0) dleft = 0;
    var dtop = (params.wh / 2 - dh / 2);
    if (dtop < 0) dtop = 0;
    //dleft += sleft;
    //dtop += stop;
    var dpadleft = parseInt(jobj.css('padding-left').replace(/\D/g, '')) || 0;
    var dpadright = parseInt(jobj.css('padding-right').replace(/\D/g, '')) || 0;
    var dborderleft = parseInt(jobj.css('border-left-width').replace(/\D/g, '')) || 0;
    var dborderright = parseInt(jobj.css('border-right-width').replace(/\D/g, '')) || 0;

    jobj.css('left', dleft + 'px');
    jobj.css('top', dtop + 'px');
    jobj.css('max-width', (params.docw - dpadleft - dpadright - dborderleft - dborderright) + 'px');
  });
}

jsHarmony.prototype.InitFileUpload = function () {
  if (this.xfileuploadLoader != null) return;
  this.xfileuploadLoader = new Object();
  document.write('\
    <div style="display:none;">\
	    <div class="xfileuploader colorbox_inline" align="center" style="height:80px;"><div style="position:relative;">\
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
                <a class="linkbutton" style="padding-right:15px;" href="#" onClick="'+this.getInstance()+'.XPage.FileUploadSubmit();return false;"><img src="/images/icon_ok.png" alt="Upload" title="Upload" />Upload</a>\
                <a class="linkbutton" href="javascript:'+this.getInstance()+'.$.colorbox.close()"><img src="/images/icon_cancel.png" alt="Cancel" title="Cancel" />Cancel</a></td>\
            </tr>\
          </table>\
        </form>\
      </div></div>\
      <iframe id="'+this.getInstance()+'_xfileproxy" name="'+this.getInstance()+'_xfileproxy" src="about:blank" style="width:0;height:0;border:0px solid #fff;"></iframe>\
    </div>');
};

jsHarmony.prototype.requireHTML5 = function(){
  var _this = this;
  $(document).ready(function() {
    if (!document.createElement('canvas').getContext) {
      var content = '\
      <div class="browser_upgrade_msg" style="height: 120px; text-align: center; width: 450px;">\
        <p>In order to use this system, you will need to upgrade your web browser to a modern version that supports HTML5.  Please click "Upgrade" to view supported browsers.</p>\
        <div>\
        <input style="padding:2px 6px;" type="button" value="Upgrade" onclick="window.location.href=\'http://www.browsehappy.com\';" />\
        <input style="padding:2px 6px;" type="button" value="Logout" onclick="window.location.href=\''+_this._BASEURL+'logout\';" />\
        </div>\
      </div>\
      ';
      $.colorbox({ 
        html: content, 
        closeButton: false, 
        arrowKey: false, 
        preloading: false, 
        overlayClose: false, 
        escKey: false,
        opacity: 0.5, 
        title: 'Did you know that your browser is out of date?' 
      });
    }
  });
}

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
        if(_.includes(['google','_xdc_','data-cke-expando','CKEDITOR','data-cke-expando','OverlayView'],id)) continue;
        if(_.includes(_this.Config.debug_params.ignore_globals,id)) continue;
        if(_this.XExt.beginsWith(id, 'module$contents$')) continue;
        if(parseInt(id).toString()==id.toString()) continue;
        _this.XExt.Alert('New global variable: window.'+id);
      }
    }
    _this.runGlobalsMonitor();
  },1000);
}

jsHarmony.prototype.on = function(){ $(this).on.apply($(this), arguments); }
jsHarmony.prototype.off = function(){ $(this).off.apply($(this), arguments); }
jsHarmony.prototype.trigger = function(){ $(this).trigger.apply($(this), arguments); }

var jsHarmonyGlobal = { };

var instances = [];
if(global.jsHarmony) instances = global.jsHarmony.instances;
if(window.jsHarmony) instances = window.jsHarmony.instances;
jsHarmony.Instances = instances;
jsHarmony.jQuery = $;

global.jsHarmony = jsHarmony;