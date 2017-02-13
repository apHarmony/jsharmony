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
global.$ = global.jQuery = require('./jquery-1.11.2');
require('./crypto-md5-2.5.3.js');
global._ = require('lodash');
global.ejs = require('ejs');
global.async = require('async');
global.moment = require('moment');
global.XData = require('./XData.js');
global.XPost = require('./XPost.js');
global.XExt = require('./XExt.js');
global.XFormat = require('./XFormat.js');
global.XValidate = require('jsharmony-validate');
global.XSearch = require('./XSearch.js');
global.XPayment = require('./XPayment.js');
global.XBarcode = require('./XBarcode.js');
global.XScanner = require('./XScanner.js');
global.XGrid = require('./XGrid.js');
global.XMenu = require('./XMenu.js');
var XLoader = require('./XLoader.js');
var XImageLoader = require('./XImageLoader.js');
global._GET = XExt.parseGET();
_.extend(global._GET, global.forcequery);
global.XForms = [];
global.isHTML5 = (document.createElement('canvas').getContext);
global.xContextMenuVisible = false;
global.xContextMenuItem = undefined;
global.mouseX = 0;
global.mouseY = 0;
global.mouseDown = false;
global.curSubMenu = '';

global.DefaultErrorHandler = function(num,txt){
	if(num == -9) { 
		//Custom Error Message
    XExt.Alert(txt);
    return true; 
	}
	else if(num == -10) { 
		//User not logged in
    XExt.Confirm('Your session has timed out or you have logged out of the system.  Proceed to login page?  You will lose any pending changes.', function () {
      location.reload(true);
    });
		return true; 
	}
	return false;
}

$(document).ready(function(){
	global.imageLoader = new XImageLoader();
	global.imageLoader.loadqueue = new Array(
		'/images/loading.gif',
		'/images/arrow_down.png',
		'/images/arrow_down_over.png',
		'/images/arrow_up.png',
		'/images/arrow_up_over.png'
  );
  global.imageLoader.StartLoad();
	global.xLoader = new XLoader();
  if (typeof global._BASEURL == 'undefined') global._BASEURL = '/';
  $('html').click(function () {
    if (global.xContextMenuVisible) {
      global.xContextMenuVisible = false;
      global.xContextMenuItem = undefined;
      $('.xcontext_menu').hide();
    }
  });
  global.init_dialogs();
  $(document).mousemove(function (e) {
    global.mouseX = e.pageX;
    global.mouseY = e.pageY;
  }).mousedown(function (e) {
    global.mouseDown = true;
  }).mouseup(function (e) {
    global.mouseDown = false;
  }).mouseleave(function (e) {
    global.mouseDown = false;
  });
  $('a').on('click', function () {
    window.last_clicked_time = new Date().getTime();
    window.last_clicked = $(this);
  });
});

global.xDialog = [];
global.debugConsole = function (txt,clear) {
  $('#xdebugconsole').show();
  if(clear) $('#xdebugconsole').empty();
  $('#xdebugconsole').prepend(txt+'<br/>');
}
global.init_dialogs = function () {
  $("body").append($('\
    <div id="xdialogblock" style="display:none;">\
    <div id="xalertbox" class="xdialogbox"><div id="xalertmessage"></div><div align="center"><input type="button" value="OK" /></div></div>\
    <div id="xconfirmbox" class="xdialogbox"><div id="xconfirmmessage"></div><div align="center"><input type="button" value="OK" class="button_ok" style="margin-right:15px;" /> <input type="button" value="Cancel" class="button_cancel" /></div></div>\
    <div id="xpromptbox" class="xdialogbox xpromptbox"><div id="xpromptmessage"></div><div align="right"><input id="xpromptfield" type="text"><br/><input type="button" value="OK" class="button_ok" style="margin-right:15px;" /> <input type="button" value="Cancel" class="button_cancel" /></div></div>\
    </div>\
    <div id="xdebugconsole"></div>\
    <div id="xloadingblock"><div><div id="xloadingbox">Loading<br/><img src="/images/loading.gif" alt="Loading" title="Loading" /></div></div></div>\
  '));
};
global.XWindowResize = function (source) {
  var ww = $(window).width();
  var wh = $(window).height();
  var sleft = $(window).scrollLeft();
  var stop = $(window).scrollTop();
  var docw = $(document).width();
  var doch = $(document).height();
  var pw = ((docw > ww) ? docw : ww);
  var ph = ((doch > wh) ? doch : wh);
  var params = { ww: ww, wh: wh, sleft: sleft, stop: stop, docw: docw, doch: doch, pw: pw, ph: ph };
  if ($('.xbodyhead').length) {
    var bodyhead_width = (ww - $('.xbodyhead').offset().left - 10 + sleft);
    $('.xbodyhead').css('max-width', bodyhead_width + 'px');
  }
  global.XDialogResize(source, params);
}
global.XDialogResize = function (source, params) {
  $('#xdialogblock').css('width', params.pw + 'px');
  $('#xdialogblock').css('height', params.ph + 'px');

  $('#xdebugconsole').css('top', params.stop + 'px');
  $('#xdebugconsole').css('left', params.sleft + 'px');
  $('#xdebugconsole').css('width', params.ww + 'px');

  $('#xdialogblock .xdialogbox').each(function () {
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
$(document).ready(function () { global.XWindowResize(); });
$(window).resize(function () { global.XWindowResize(); });
$(window).scroll(function () { global.XWindowResize('scroll'); });
$(document).keydown(function (e) { if(window.XForm_ShortcutKeys) window.XForm_ShortcutKeys(e); })

global.xfileuploadLoader = null;
global.init_xfileupload = function () {
  if (xfileuploadLoader != null) return;
  xfileuploadLoader = new Object();
  document.write('\
    <div style="display:none;">\
	    <div id="xfileuploader" class="colorbox_inline" align="center" style="height:80px;"><div style="position:relative;">\
        <form id="xfileuploader_form" enctype="multipart/form-data" method="post" target="xfileproxy">\
          <input type="hidden" name="MAX_FILE_SIZE" value="<%=global.max_filesize%>" />\
          <input type="hidden" name="prevtoken" id="xfileuploader_prevtoken" value="" />\
          <table cellspacing="3">\
            <tr>\
              <td align="right">Upload File:</td>\
              <td align="left"><input type="file" id="xfileuploader_file" name="file" /></td>\
            </tr>\
            <tr>\
              <td></td>\
              <td style="padding-top:10px;">\
                <a class="linkbutton" style="padding-right:15px;" href="#" onClick="XUpload_submit();return false;"><img src="/images/icon_ok.png" alt="Upload" title="Upload" />Upload</a>\
                <a class="linkbutton" href="javascript:$.colorbox.close()"><img src="/images/icon_cancel.png" alt="Cancel" title="Cancel" />Cancel</a></td>\
            </tr>\
          </table>\
        </form>\
      </div></div>\
      <iframe id="xfileproxy" name="xfileproxy" src="about:blank" style="width:0;height:0;border:0px solid #fff;"></iframe>\
    </div>');
};

global.SelectMenu = function (menuid) {
  $('#xmenu').children('a').each(function (i, obj) {
    var jobj = $(obj);
    var jsideobj =$('#side'+obj.id);
    if (obj.id == 'menu_' + String(menuid).toUpperCase()) {
      if (!jobj.hasClass('selected')) jobj.addClass('selected');
      if (!jsideobj.hasClass('selected')) jsideobj.addClass('selected');
    }
    else {
      if (jobj.hasClass('selected')) jobj.removeClass('selected');
      if (jsideobj.hasClass('selected')) jsideobj.removeClass('selected');
    }
  });
  //Deal with xmenuside
  XMenu.XSubMenuInit(menuid);
};