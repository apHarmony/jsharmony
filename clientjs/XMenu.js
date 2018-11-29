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

var $ = require('./jquery-1.11.2');
var _ = require('lodash');

exports = module.exports = function(jsh){

  //------------------------
  //XMenu :: Menu Controller
  //------------------------
  var XMenu = function(){ }
  XMenu.Menus = {};      //Menu Instances
  XMenu.Interfaces = {}; //Menu Interfaces (ex. horizontal)
  XMenu.Init = function(){
    var _this = this;
    for(var menuType in _this.Interfaces){
      if(menuType in _this.Menus) continue;

      var interface = _this.Interfaces[menuType];
      if(interface.isActive && interface.isActive()){
        var object = new interface();
        object.Init();
        _this.Menus[menuType] = object;
      }
    }
  }
  XMenu.Select = function(selectedmenu){
    var _this = this;
    for(var menuType in _this.Menus){
      _this.Menus[menuType].Select(selectedmenu);
    }
  }

  //-----------------------------
  //XMenuBase :: Menu Base Object
  //-----------------------------
  var XMenuBase = function(){
    this.isInitialized = false;
  }
  XMenuBase.prototype.Init = function(){
    var _this = this;
    if(this.isInitialized) return false;

    //Register into global RefreshLayout function
    jsh.onRefreshLayout.push(function(){ _this.RefreshLayout(); });
    //Register into global HidePopups function
    jsh.onHidePopups.push(function(obj){ _this.HidePopups(obj); });

    this.isInitialized = true;
    return true;
  }
  XMenuBase.prototype.Select = function(selectedmenu){ }
  XMenuBase.isActive = function(){ return false; }   //Must be implemented for each Menu Type - not a prototype function
  XMenuBase.prototype.RefreshLayout = function(){ }
  XMenuBase.prototype.HidePopups = function(){ }

  //-----------------------------------------------------------------
  //XMenuHorizontal :: Menu Implementation for Horizontal Menu System
  //-----------------------------------------------------------------
  var XMenuHorizontal = function(){
    this.MenuItems = [];       //Top Menu items
    this.MenuOverhang = 0;     //How much the full menu would exceed window dimensions
    this.MenuMoreWidth = 0;    //Width of the "More" button

    this.SubMenuItems = [];    //Submenu Items
    this.SubMenuOverhang = 0;  //How much the full submenu would exceed window dimensions
    this.SubMenuMoreWidth = 0; //Width of the submenu "More" button

    this.menuid = '';          //Currently selected Menu ID
    this.submenuid = '';       //Currently selected SubMenu ID
  }

  XMenuHorizontal.prototype = new XMenuBase();

  XMenuHorizontal.isActive = function(){ return jsh.$root('.xmenuhorizontal').length; }

  XMenuHorizontal.prototype.Init = function(){
    var _this = this;
    if(!XMenuBase.prototype.Init.apply(this)) return;

    //Set up Top Menu Sidebar
    if (jsh.$root('.xmenu').size() > 0) {
      jsh.$root('.xmenu a').each(function (i, obj) {
        if ($(obj).hasClass('xmenu_more')) return;
        _this.MenuItems.push($(obj));
      });
      _this.CalcDimensions(true);
      
      jsh.$root('.xmenu_more').click(function () {
        var xmenuside = jsh.$root('.xmenuside');
        jsh.$root('.xsubmenuside').hide();
        if (!xmenuside.is(":visible")) xmenuside.show();
        else xmenuside.hide();
        return false;
      });
      
      //Create xmenuside
      var xmenuside = jsh.$root('.xmenuside');
      if (xmenuside.size() > 0) {
        for (var i = 0; i < _this.MenuItems.length; i++) {
          var xmenuitem = _this.MenuItems[i];
          var htmlobj = '<a href="' + xmenuitem.attr('href') + '" onclick="' + xmenuitem.attr('onclick') + '" class="xmenusideitem xmenusideitem_' + xmenuitem.data('id') + ' ' + (xmenuitem.hasClass('selected')?'selected':'') + '">' + xmenuitem.html() + '</a>';
          xmenuside.append(htmlobj);
        }
      }
    }

  }

  //Update the currently selected menu item
  XMenuHorizontal.prototype.Select = function(selectedmenu){
    var _this = this;
    if(!selectedmenu) selectedmenu = '';

    //Get top menu item
    if(!_.isString && _.isArray(selectedmenu)) selectedmenu = selectedmenu[selectedmenu.length-1];
    selectedmenu = (selectedmenu||'').toString().toUpperCase();

    //Find item
    var jsubmenuitem = jsh.$root('.xsubmenu .xsubmenuitem_'+selectedmenu).first();
    var jmenuitem = null;
    var submenuid = '';
    var menuid = '';
    if(jsubmenuitem.length){
      submenuid = selectedmenu;
      menuid = jsubmenuitem.closest('.xsubmenu').data('parent');
      jmenuitem = jsh.$root('.xmenu .xmenuitem_'+menuid).first();
    }
    else{
      jsubmenuitem = null;
      jmenuitem = jsh.$root('.xmenu .xmenuitem_'+selectedmenu).first();
      if(jmenuitem.length){
        menuid = selectedmenu;
      }
      else{
        jmenuitem = null;
      }
    }

    _this.menuid = menuid;
    _this.submenuid = submenuid;

    //Render submenu
    _this.RenderSubmenu();

    var jmenusideitem = null;
    if(menuid) jmenusideitem = jsh.$root('.xmenuside .xmenusideitem_'+menuid);

    var jsubmenusideitem = null;
    if(submenuid) jsubmenusideitem = jsh.$root('.xsubmenuside .xsubmenusideitem_'+submenuid);

    jsh.$root('.xmenu .xmenuitem').not(jmenuitem).removeClass('selected');
    jsh.$root('.xmenuside .xmenusideitem').not(jmenusideitem).removeClass('selected');
    if (jmenuitem && !jmenuitem.hasClass('selected')) jmenuitem.addClass('selected');
    if (jmenusideitem && !jmenusideitem.hasClass('selected')) jmenusideitem.addClass('selected');

    jsh.$root('.xsubmenu .xsubmenuitem').not(jsubmenuitem).removeClass('selected');
    jsh.$root('.xsubmenuside .xsubmenusideitem').not(jsubmenusideitem).removeClass('selected');
    if (jsubmenuitem && !jsubmenuitem.hasClass('selected')) jsubmenuitem.addClass('selected');
    if (jsubmenusideitem && !jsubmenusideitem.hasClass('selected')) jsubmenusideitem.addClass('selected');
  }

  XMenuHorizontal.prototype.RefreshLayout = function(){
    var _this = this;
    if(!this.isInitialized) return;

    if (jsh.$root('.xmenu').size() == 0) return;
    var maxw = $(window).width()-1;
    
    //Refresh dimensions, if necessary
    _this.CalcDimensions();

    var showmore = false;
    //Find out if we need to show "more" menu
    var curleft = _this.MenuOverhang;
    for (var i = 0; i < _this.MenuItems.length; i++) { curleft += _this.MenuItems[i].data('width'); }
    if (curleft > maxw) showmore = true;
    
    var jmore = jsh.$root('.xmenu_more');
    if (jmore.size() > 0) {
      if (showmore) {
        if (!jmore.is(":visible")) jmore.show();
        if (_this.MenuMoreWidth <= 0) { _this.MenuMoreWidth = jmore.outerWidth(true); }
        maxw -= _this.MenuMoreWidth;
      }
      else {
        if (jmore.is(":visible")) { jmore.hide(); jsh.$root('.xmenuside').hide(); }
      }
    }
    
    var curleft = _this.MenuOverhang;
    for (var i = 0; i < _this.MenuItems.length; i++) {
      var xmenuitem = _this.MenuItems[i];
      curleft += xmenuitem.data('width');
      if (curleft > maxw) {
        if (xmenuitem.is(":visible")) xmenuitem.hide();
      }
      else {
        if (!xmenuitem.is(":visible")) xmenuitem.show();
      }
    }
    this.RefreshSubmenuLayout();
  }

  XMenuHorizontal.prototype.RefreshSubmenuLayout = function(){
    var _this = this;
    var jSubMenu = _this.getSubmenu();
    if(!jSubMenu.length) return;
    var maxw = $(window).width()-1;
    
    var showmore = false;
    //Find out if we need to show "more" menu
    var curleft = _this.SubMenuOverhang;
    //jsh.$root('.dev_marker').remove();
    for (var i = 0; i < _this.SubMenuItems.length; i++) {
      curleft += _this.SubMenuItems[i].data('width');
      //jsh.root.prepend('<div class="dev_marker" style="background-color:red;width:1px;height:120px;position:absolute;top:0px;left:'+curleft+'px;z-index:9999;"></div>');
    }
    if (curleft > maxw) showmore = true;
    
    var jmore = jSubMenu.find('.xsubmenu_more');
    if (jmore.size() > 0) {
      if (showmore) {
        if (!jmore.is(":visible")) jmore.show();
        if (_this.SubMenuMoreWidth <= 0) { _this.SubMenuMoreWidth = jmore.outerWidth(true); }
        maxw -= _this.SubMenuMoreWidth;
      }
      else {
        if (jmore.is(":visible")) { jmore.hide(); jSubMenu.find('.xsubmenu_more').hide(); }
      }
    }
    
    var curleft = _this.SubMenuOverhang;
    for (var i = 0; i < _this.SubMenuItems.length; i++) {
      var xsubmenuitem = _this.SubMenuItems[i];
      curleft += xsubmenuitem.data('width');
      if (curleft > maxw) {
        if (xsubmenuitem.is(":visible")) xsubmenuitem.hide();
      }
      else {
        if (!xsubmenuitem.is(":visible")) xsubmenuitem.show();
      }
    }
  }

  XMenuHorizontal.prototype.getSubmenu = function(menuid){
    var _this = this;
    if(!menuid) menuid = _this.menuid;
    return jsh.$root('.xsubmenu_' + String(menuid).toUpperCase());
  }

  XMenuHorizontal.prototype.RenderSubmenu = function(){
    var _this = this;
    var jSubMenu = _this.getSubmenu();

    //Set up Side Menu Sidebar
    _this.SubMenuItems = [];
    _this.SubMenuOverhang = 0;
    _this.SubMenuMoreWidth = 0;
    jsh.$root('.xsubmenu').hide();
    jsh.$root('.xsubmenuside').hide().empty();

    if (jSubMenu.size() > 0) {
      jSubMenu.show();
      jSubMenu.find('a, div').each(function (i, obj) {
        if ($(obj).hasClass('xsubmenu_more')) return;
        var jobj = $(obj);
        var jwidth = jobj.outerWidth(true);
        jobj.data('width', jwidth);
        _this.SubMenuItems.push(jobj);
      });
      _this.SubMenuOverhang = jSubMenu.offset().left + parseInt(jSubMenu.css('padding-left').replace(/\D/g, ''));
      //Add .head width to SubMenuOverhang
      if (isNaN(_this.SubMenuOverhang)) _this.SubMenuOverhang = 0;
      
      jSubMenu.find('.xsubmenu_more').off('click');
      jSubMenu.find('.xsubmenu_more').on('click', function () {
        var xsubmenuside = jsh.$root('.xsubmenuside');
        if (!xsubmenuside.is(":visible")) xsubmenuside.show();
        else xsubmenuside.hide();
        return false;
      });
    }
    //Initialize xsubmenuside for this submenu
    var xsubmenuside = jsh.$root('.xsubmenuside');
    if (xsubmenuside.size() > 0) {
      for (var i = 0; i < _this.SubMenuItems.length; i++) {
        var xsubmenuitem = _this.SubMenuItems[i];
        if ($(xsubmenuitem).is('a')) {
          var link_onclick = xsubmenuitem.attr('onclick');
          if(link_onclick){
            link_onclick = 'onclick="'+jsh.getInstance()+'.$root(\'.xsubmenuside\').hide(); ' + link_onclick + '"';
          }
          var htmlobj = '<a href="' + xsubmenuitem.attr('href') + '" ' + link_onclick + ' class="xsubmenusideitem xsubmenusideitem_' + xsubmenuitem.data('id') + ' ' + (xsubmenuitem.hasClass('selected')?'selected':'') + '">' + xsubmenuitem.html() + '</a>';
          xsubmenuside.append(htmlobj);
        }
      }
    }
    _this.RefreshLayout();
  }

  XMenuHorizontal.prototype.CalcDimensions = function(force){
    var _this = this;
    if(!force && (_this.MenuItems.length > 0)){
      var jobj = _this.MenuItems[0];
      if(jobj.outerWidth(true).toString() == jobj.data('width')) return;
    }
    for(var i=0;i<_this.MenuItems.length;i++){
      var jobj = _this.MenuItems[i];
      var jwidth = jobj.outerWidth(true);
      jobj.data('width', jwidth);
    }
    _this.MenuOverhang = jsh.$root('.xmenu').offset().left + parseInt(jsh.$root('.xmenu').css('padding-left').replace(/\D/g, ''));
    if (isNaN(_this.MenuOverhang)) _this.MenuOverhang = 0;
  }

  XMenuHorizontal.prototype.HidePopups = function(obj){
    var jobj = $(obj);
    var jmenuside = jsh.$root('.xmenuside');
    var jsubmenuside = jsh.$root('.xsubmenuside');

    if(!jobj.hasClass('xmenu_more')) jmenuside.hide();
    if(!jobj.hasClass('xsubmenu_more')) jsubmenuside.hide();
  }


  XMenu.Base = XMenuBase;
  XMenu.Interfaces['horizontal'] = XMenuHorizontal;

  return XMenu;
}