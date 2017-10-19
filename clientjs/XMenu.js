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

exports = module.exports = {};

var XMenuItems = [];
var XMenuLeft = 0;
var XMenuMoreWidth = 0;

var XSubMenuItems = [];
var XSubMenuLeft = 0;
var XSubMenuMoreWidth = 0;
var curSubMenuSel = '';

var isXMenuInit = false;
function XMenuInit() {
  if (isXMenuInit) return;
  //Set up Top Menu Sidebar
  if ($('#xmenu').size() > 0) {
    $('#xmenu a').each(function (i, obj) {
      if (obj.id == 'xmenu_more') return;
      XMenuItems.push($(obj));
    });
    XMenuCalcDimensions(true);
    
    $('#xmenu_more').click(function () {
      var xmenuside = $('#xmenuside');
      $('#xsubmenuside').hide();
      if (!xmenuside.is(":visible")) xmenuside.show();
      else xmenuside.hide();
      return false;
    });
    
    //Create xmenuside
    var xmenuside = $('#xmenuside');
    if (xmenuside.size() > 0) {
      for (var i = 0; i < XMenuItems.length; i++) {
        var xmenuitem = XMenuItems[i];
        var htmlobj = '<a id="side' + xmenuitem[0].id + '" href="' + xmenuitem.attr('href') + '" onclick="' + xmenuitem.attr('onclick') + '" class="' + (xmenuitem.hasClass('selected')?'selected':'') + '">' + xmenuitem.html() + '</a>';
        xmenuside.append(htmlobj);
      }
    }
  }
  isXMenuInit = true;
}

function XMenuCalcDimensions(force){
  if(!force && (XMenuItems.length > 0)){
    var jobj = XMenuItems[0];
    if(jobj.outerWidth(true).toString() == jobj.data('width')) return;
  }
  for(var i=0;i<XMenuItems.length;i++){
    var jobj = XMenuItems[i];
    var jwidth = jobj.outerWidth(true);
    jobj.data('width', jwidth);
  }
  XMenuLeft = $('#xmenu').offset().left + parseInt($('#xmenu').css('padding-left').replace(/\D/g, ''));
  if (isNaN(XMenuLeft)) XMenuLeft = 0;
}

exports.XSubMenuInit = function (menuid){
  global.curSubMenu = menuid;
  var selsubmenu = '#xsubmenu_' + String(menuid).toUpperCase();
  curSubMenuSel = selsubmenu;

  //Set up Side Menu Sidebar
  XSubMenuItems = [];
  XSubMenuLeft = 0;
  XSubMenuMoreWidth = 0;
  $('.xsubmenu').hide();
  $('#xsubmenuside').hide().empty();

  if ($(selsubmenu).size() > 0) {
    $(selsubmenu).show();
    $(selsubmenu + ' a, ' + selsubmenu + ' div').each(function (i, obj) {
      if ($(obj).hasClass('xsubmenu_more')) return;
      var jobj = $(obj);
      var jwidth = jobj.outerWidth(true);
      jobj.data('width', jwidth);
      XSubMenuItems.push(jobj);
    });
    XSubMenuLeft = $(selsubmenu).offset().left + parseInt($(selsubmenu).css('padding-left').replace(/\D/g, ''));
    //Add .head width to XSubMenuLeft
    if (isNaN(XSubMenuLeft)) XSubMenuLeft = 0;
    
    $(selsubmenu + ' .xsubmenu_more').off('click');
    $(selsubmenu + ' .xsubmenu_more').on('click', function () {
      var xsubmenuside = $('#xsubmenuside');
      if (!xsubmenuside.is(":visible")) xsubmenuside.show();
      else xsubmenuside.hide();
      return false;
    });
  }
  //Initialize xsubmenuside for this submenu
  var xsubmenuside = $('#xsubmenuside');
  if (xsubmenuside.size() > 0) {
    for (var i = 0; i < XSubMenuItems.length; i++) {
      var xsubmenuitem = XSubMenuItems[i];
      if ($(xsubmenuitem).is('a')) {
        var link_onclick = xsubmenuitem.attr('onclick');
        if(link_onclick){
          link_onclick = 'onclick="$(\'#xsubmenuside\').hide(); ' + link_onclick + '"';
        }
        var htmlobj = '<a id="side' + xsubmenuitem[0].id + '" href="' + xsubmenuitem.attr('href') + '" ' + link_onclick + ' class="' + (xsubmenuitem.hasClass('selected')?'selected':'') + '">' + xsubmenuitem.html() + '</a>';
        xsubmenuside.append(htmlobj);
      }
    }
  }
  exports.XMenuResize();
}

exports.XMenuResize = function() {
  if ($('#xmenu').size() == 0) return;
  if (!isXMenuInit) XMenuInit();
  var maxw = $(window).width()-1;
  
  //Refresh dimensions, if necessary
  XMenuCalcDimensions();

  var showmore = false;
  //Find out if we need to show "more" menu
  var curleft = XMenuLeft;
  for (var i = 0; i < XMenuItems.length; i++) { curleft += XMenuItems[i].data('width'); }
  if (curleft > maxw) showmore = true;
  
  var jmore = $('#xmenu_more');
  if (jmore.size() > 0) {
    if (showmore) {
      if (!jmore.is(":visible")) jmore.show();
      if (XMenuMoreWidth <= 0) { XMenuMoreWidth = jmore.outerWidth(true); }
      maxw -= XMenuMoreWidth;
    }
    else {
      if (jmore.is(":visible")) { jmore.hide(); $('#xmenuside').hide(); }
    }
  }
  
  var curleft = XMenuLeft;
  for (var i = 0; i < XMenuItems.length; i++) {
    var xmenuitem = XMenuItems[i];
    curleft += xmenuitem.data('width');
    if (curleft > maxw) {
      if (xmenuitem.is(":visible")) xmenuitem.hide();
    }
    else {
      if (!xmenuitem.is(":visible")) xmenuitem.show();
    }
  }
  XSubMenuResize();
}

function XSubMenuResize() {
  if(!curSubMenuSel || ($(curSubMenuSel).size() == 0)) return;
  var maxw = $(window).width()-1;
  
  var showmore = false;
  //Find out if we need to show "more" menu
  var curleft = XSubMenuLeft;
  //$('.dev_marker').remove();
  for (var i = 0; i < XSubMenuItems.length; i++) {
    curleft += XSubMenuItems[i].data('width');
    //$('body').prepend('<div class="dev_marker" style="background-color:red;width:1px;height:120px;position:absolute;top:0px;left:'+curleft+'px;z-index:9999;"></div>');
  }
  if (curleft > maxw) showmore = true;
  
  var jmore = $(curSubMenuSel + ' .xsubmenu_more');
  if (jmore.size() > 0) {
    if (showmore) {
      if (!jmore.is(":visible")) jmore.show();
      if (XSubMenuMoreWidth <= 0) { XSubMenuMoreWidth = jmore.outerWidth(true); }
      maxw -= XSubMenuMoreWidth;
    }
    else {
      if (jmore.is(":visible")) { jmore.hide(); $(curSubMenuSel + ' .xsubmenu_more').hide(); }
    }
  }
  
  var curleft = XSubMenuLeft;
  for (var i = 0; i < XSubMenuItems.length; i++) {
    var xsubmenuitem = XSubMenuItems[i];
    curleft += xsubmenuitem.data('width');
    if (curleft > maxw) {
      if (xsubmenuitem.is(":visible")) xsubmenuitem.hide();
    }
    else {
      if (!xsubmenuitem.is(":visible")) xsubmenuitem.show();
    }
  }
}