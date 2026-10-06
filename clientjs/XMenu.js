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

var _ = require('lodash');

exports = module.exports = function(jsh){
  var XDom = jsh.XDom;
  //------------------------
  //XMenu :: Menu Controller
  //------------------------
  var XMenu = function(){ };
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
  };
  XMenu.Select = function(selectedmenu){
    var _this = this;
    for(var menuType in _this.Menus){
      _this.Menus[menuType].Select(selectedmenu);
    }
  };
  //-----------------------------
  //XMenuBase :: Menu Base Object
  //-----------------------------
  var XMenuBase = function(){
    this.isInitialized = false;
  };
  XMenuBase.prototype.Init = function(){
    var _this = this;
    if(this.isInitialized) return false;

    //Register into global RefreshLayout function
    jsh.onRefreshLayout.push(function(){ _this.RefreshLayout(); });
    //Register into global onNavigated function
    jsh.onNavigated.push(function(obj){ _this.Navigated(obj); });

    this.isInitialized = true;
    return true;
  };
  XMenuBase.prototype.getMenuItems = function(){ return []; };
  XMenuBase.prototype.getSubMenuItems = function(){ return []; };
  XMenuBase.prototype.Select = function(selectedmenu){ };
  XMenuBase.isActive = function(){ return false; };   //Must be implemented for each Menu Type - not a prototype function
  XMenuBase.prototype.RefreshLayout = function(){ };
  XMenuBase.prototype.Navigated = function(obj){ };

  //-----------------------------------------------------------------
  //XMenuHorizontal :: Menu Implementation for Horizontal Menu System
  //-----------------------------------------------------------------
  var XMenuHorizontal = function(){
    this.MenuItems = [];       //Top Menu items
    this.MenuOverhang = 0;     //How much the full menu would exceed window dimensions
    this.MenuMoreWidth = 0;    //Width of the "More" button

    this.SubMenuItems = [];    //Array of {xdobj: XDom(Item), width: Item-width} Submenu Items
    this.SubMenuOverhang = 0;  //How much the full submenu would exceed window dimensions
    this.SubMenuMoreWidth = 0; //Width of the submenu "More" button

    this.paddleAnimation = null;

    this.menuid = '';          //Currently selected Menu ID
    this.submenuid = '';       //Currently selected SubMenu ID
  };

  XMenuHorizontal.prototype = new XMenuBase();

  XMenuHorizontal.isActive = function(){ return jsh.xd('.xmenuhorizontal').length; };

  XMenuHorizontal.prototype.Init = function(){
    var _this = this;
    if(!XMenuBase.prototype.Init.apply(this)) return;

    //Set up Top Menu Sidebar
    if (jsh.xd('.xmenu').length > 0) {
      jsh.xd('.xmenu a').elements.forEach(function (obj) {
        var xdobj = XDom(obj);
        if (xdobj.class.contains('xmenu_more')) return;
        _this.MenuItems.push({xdobj: xdobj, width: null});
      });
      _this.CalcDimensions(true);
      
      jsh.xd('.xmenu_more').on('click', function () {
        var xmenuside = jsh.xd('.xmenuside');
        jsh.xd('.xsubmenuside').style.display = false;
        xmenuside.style.display = !xmenuside.isVisible();
        return false;
      });
      
      //Create xmenuside
      var xmenuside = jsh.xd('.xmenuside');
      if (xmenuside.length > 0) {
        _.each(_this.getMenuItems(), function(item){
          var link_onclick = item.onclick;
          if(link_onclick){
            link_onclick = 'onclick="' + link_onclick + ' ;"';
          }
          var htmlobj = '<a href="' + item.href + '" ' + link_onclick + ' class="xmenusideitem xmenusideitem_' + jsh.XExt.escapeCSSClass(item.id) + ' ' + (item.isSelected?'selected':'') + '">' + item.text + '</a>';
          xmenuside.append(htmlobj);
        });
      }
    }
    //Delegate click handler to xsubmenu_more
    jsh.xd('.xmenuhorizontal').on('click', XDom.liveEvent('.xsubmenu_more', function (e) {
      var xsubmenuside = jsh.xd('.xsubmenuside');
      if (!xsubmenuside.isVisible()) xsubmenuside.style.display = true;
      else xsubmenuside.style.display = false;
      return false;
    }));
  };
  
  XMenuHorizontal.prototype.getMenuItems = function(){
    return jsh.xd('.xmenu a').omit('.xmenu_more').items.map(function(xdobj){
      return {
        href: xdobj.attr.href,
        text: xdobj.text,
        onClick: xdobj.attr.onclick,
        id: xdobj.data.id,
        isSelected: xdobj.class.contains('selected'),
      };
    });
  };

  XMenuHorizontal.prototype.getSubMenuItems = function(){
    return this.getSubmenu().getChildren('a').omit('.xsubmenu_more').items.map(function(xdobj){
      return {
        href: xdobj.attr.href,
        text: xdobj.text,
        onClick: xdobj.attr.onclick,
        id: xdobj.data.id,
        isSelected: xdobj.class.contains('selected'),
      };
    });
  };

  XMenuHorizontal.prototype.RenderPaddle = function(newDimensions){
    var _this = this;
    var xdpaddle = jsh.xd('.xmenupaddle');
    if(!xdpaddle.length) return;
    var xdmenuitem = jsh.xd('.xmenu .xmenuitem.selected');
    var curOpacity = 0;
    if(typeof xdpaddle.element.style.opacity != 'undefined'){ curOpacity = parseFloat(xdpaddle.element.style.opacity)||0; }

    var animateParams = {};
    if(!xdmenuitem.length || !xdmenuitem.isVisible()){
      if(curOpacity != 0){
        if(_this.paddleAnimation && (_this.paddleAnimation.opacity !== 0)){
          animateParams = { opacity: 0 };
        }
        else if(!_this.paddleAnimation){
          animateParams = { opacity: 0 };
        }
      }
    }
    else{
      //Get target position
      var tgtparent = xdmenuitem.parent();
      var tgttop = Math.round(xdmenuitem.calc.top() + xdmenuitem.calc.heightToBorder());
      var tgtleft = Math.round(xdmenuitem.calc.left() - tgtparent.calc.left());
      var tgtwidth = Math.round(xdmenuitem.calc.widthToBorder());

      var curwidth = Math.round(parseFloat(xdpaddle.element.style.width));
      var curheight = Math.round(xdpaddle.calc.height());
      tgttop -= curheight;

      var animateOpacity = curOpacity != 1;
      var animatePosition = (Math.round(xdpaddle.calc.left()) != tgtleft) || (Math.round(xdpaddle.calc.top()) != tgttop) || (tgtwidth != curwidth);

      //Set target position if opacity=0, otherwise animate
      if(curOpacity == 0){
        xdpaddle.style.top = tgttop;
        xdpaddle.style.left = tgtleft;
        xdpaddle.style.width = tgtwidth;
        animatePosition = false;
      }

      if(animateOpacity) animateParams.opacity = 1;
      if(animatePosition){
        animateParams.top = tgttop+'px';
        animateParams.left = tgtleft+'px';
        animateParams.width = tgtwidth+'px';
      }
    }

    if(!_.isEmpty(animateParams)){
      if(_this.paddleAnimation){
        if(JSON.stringify(animateParams) == JSON.stringify(_this.paddleAnimation)) return;
      }
      _this.paddleAnimation = animateParams;
      //console.log('Animating '+ JSON.stringify(animateParams));
      xdpaddle.stop();
      xdpaddle.animate(animateParams, 250, function(){ _this.paddleAnimation = null; });
    }
  };

  //Update the currently selected menu item
  XMenuHorizontal.prototype.Select = function(selectedmenu){
    var _this = this;
    if(!selectedmenu) selectedmenu = '';

    //Get top menu item
    if(!_.isString && _.isArray(selectedmenu)) selectedmenu = selectedmenu[selectedmenu.length-1];
    selectedmenu = (selectedmenu||'').toString().toUpperCase();

    selectedmenu = jsh.XExt.escapeCSSClass(selectedmenu);

    //Find item
    var xdsubmenuitem = jsh.xd('.xsubmenu .xsubmenuitem_'+selectedmenu).first();
    var xdmenuitem = null;
    var submenuid = '';
    var menuid = '';
    if(xdsubmenuitem.length){
      submenuid = selectedmenu;
      menuid = jsh.XExt.escapeCSSClass(xdsubmenuitem.parent('.xsubmenu').data.parent);
      xdmenuitem = jsh.xd('.xmenu .xmenuitem_'+menuid).first();
    }
    else{
      xdsubmenuitem = null;
      xdmenuitem = jsh.xd('.xmenu .xmenuitem_'+selectedmenu).first();
      if(xdmenuitem.length){
        menuid = selectedmenu;
      }
      else{
        xdmenuitem = null;
      }
    }

    _this.menuid = menuid;
    _this.submenuid = submenuid;

    //Render submenu
    _this.RenderSubmenu();

    var xdmenusideitem = null;
    if(menuid) xdmenusideitem = jsh.xd('.xmenuside .xmenusideitem_'+menuid);

    var xdsubmenusideitem = null;
    if(submenuid) xdsubmenusideitem = jsh.xd('.xsubmenuside .xsubmenusideitem_'+submenuid);

    jsh.xd('.xmenu .xmenuitem').omit(xdmenuitem && xdmenuitem.element).class.remove('selected');
    jsh.xd('.xmenuside .xmenusideitem').omit(xdmenusideitem && xdmenusideitem.element).class.remove('selected');
    if (xdmenuitem && !xdmenuitem.class.contains('selected')) xdmenuitem.class.add('selected');
    if (xdmenusideitem && !xdmenusideitem.class.contains('selected')) xdmenusideitem.class.add('selected');

    jsh.xd('.xsubmenu .xsubmenuitem').omit(xdsubmenuitem && xdsubmenuitem.element).class.remove('selected');
    jsh.xd('.xsubmenuside .xsubmenusideitem').omit(xdsubmenusideitem && xdsubmenusideitem.element).class.remove('selected');
    if (xdsubmenuitem && !xdsubmenuitem.class.contains('selected')) xdsubmenuitem.class.add('selected');
    if (xdsubmenusideitem && !xdsubmenusideitem.class.contains('selected')) xdsubmenusideitem.class.add('selected');

    this.RenderPaddle();
  };

  XMenuHorizontal.prototype.RefreshLayout = function(){
    var _this = this;
    if(!this.isInitialized) return;

    if (jsh.xd('.xmenu').length == 0) return;
    var maxw = document.documentElement.clientWidth - 1;
    // this can happen in headless mode.
    if (maxw <= 0) return;
    
    //Refresh dimensions, if necessary
    var newDimensions = _this.CalcDimensions();

    var showmore = false;
    //Find out if we need to show "more" menu
    var curleft = _this.MenuOverhang;
    for (var i = 0; i < _this.MenuItems.length; i++) { curleft += _this.MenuItems[i].width; }
    if (curleft > maxw) showmore = true;
    
    var xdmore = jsh.xd('.xmenu_more');
    if (xdmore.length > 0) {
      if (showmore) {
        if (!xdmore.isVisible()) xdmore.style.display = true;
        if (_this.MenuMoreWidth <= 0) { _this.MenuMoreWidth = xdmore.calc.widthToMargin(); }
        maxw -= _this.MenuMoreWidth;
      }
      else {
        if (xdmore.isVisible()) { xdmore.style.display = false; jsh.xd('.xmenuside').style.display = false; }
      }
    }
    
    curleft = _this.MenuOverhang;
    for (var j = 0; j < _this.MenuItems.length; j++) {
      var xmenuitem = _this.MenuItems[j].xdobj;
      curleft += _this.MenuItems[j].width;
      if (curleft > maxw) {
        if (xmenuitem.isVisible()) xmenuitem.style.display = false;
      }
      else {
        if (!xmenuitem.isVisible()) xmenuitem.style.display = true;
      }
    }
    this.RefreshSubmenuLayout();
    this.RenderPaddle(newDimensions);
  };

  XMenuHorizontal.prototype.RefreshSubmenuLayout = function(){
    var _this = this;
    var xdSubMenu = _this.getSubmenu();
    if(!xdSubMenu.length) return;
    var maxw = document.documentElement.clientWidth - 1;

    //Refresh dimensions, if necessary
    _this.CalcSubmenuDimensions();
    
    var showmore = false;
    //Find out if we need to show "more" menu
    var curleft = _this.SubMenuOverhang;
    for (var i = 0; i < _this.SubMenuItems.length; i++) {
      curleft += _this.SubMenuItems[i].width;
    }
    if (curleft > maxw) showmore = true;
    
    var xdmore = XDom(xdSubMenu, '.xsubmenu_more');
    if (xdmore.length > 0) {
      if (showmore) {
        if (!xdmore.isVisible()) xdmore.style.display = true;
        if (_this.SubMenuMoreWidth <= 0) { _this.SubMenuMoreWidth = xdmore.calc.widthToMargin(); }
        maxw -= _this.SubMenuMoreWidth;
      }
      else {
        if (xdmore.isVisible()) { xdmore.style.display = false; XDom(xdSubMenu, '.xsubmenu_more').style.display = false; }
      }
    }
    
    curleft = _this.SubMenuOverhang;
    for (var j = 0; j < _this.SubMenuItems.length; j++) {
      var xsubmenuitem = _this.SubMenuItems[j].xdobj;
      curleft += _this.SubMenuItems[j].width;
      if (curleft > maxw) {
        if (xsubmenuitem.isVisible()) xsubmenuitem.style.display = false;
      }
      else {
        if (!xsubmenuitem.isVisible()) xsubmenuitem.style.display = true;
      }
    }
  };

  XMenuHorizontal.prototype.getSubmenu = function(menuid){
    var _this = this;
    if(!menuid) menuid = _this.menuid;
    return jsh.xd('.xsubmenu_' + String(menuid).toUpperCase());
  };

  XMenuHorizontal.prototype.RenderSubmenu = function(){
    var _this = this;
    var xdSubMenu = _this.getSubmenu();

    //Set up Side Menu Sidebar
    _this.SubMenuItems = [];
    _this.SubMenuOverhang = 0;
    _this.SubMenuMoreWidth = 0;
    jsh.xd('.xsubmenu').style.display = false;
    var xdSubMenuSide = jsh.xd('.xsubmenuside');
    xdSubMenuSide.style.display = false;
    xdSubMenuSide.clear();

    if (xdSubMenu.length > 0) {
      xdSubMenu.style.display = true;
      XDom(xdSubMenu, 'a, div').elements.forEach(function(obj){
        var xdobj = XDom(obj);
        if (xdobj.class.contains('xsubmenu_more')) return;
        _this.SubMenuItems.push({xdobj: xdobj, width: null});
      });
      _this.CalcSubmenuDimensions(true);
    }
    //Initialize xsubmenuside for this submenu
    var xsubmenuside = jsh.xd('.xsubmenuside');
    if (xsubmenuside.length > 0) {
      _.each(_this.getSubMenuItems(), function(item){
        var link_onclick = item.onclick;
        if(link_onclick){
          link_onclick = 'onclick="'+jsh.getInstance()+'.XDom('+jsh.getInstance()+'.xdroot, \'.xsubmenuside\').style.display = false; ' + link_onclick + ';"';
        }
        var htmlobj = '<a href="' + item.href + '" ' + link_onclick + ' class="xsubmenusideitem xsubmenusideitem_' + jsh.XExt.escapeCSSClass(item.id) + ' ' + (item.isSelected?'selected':'') + '">' + item.text + '</a>';
        xsubmenuside.append(htmlobj);
      });
    }
    _this.RefreshLayout();
  };

  XMenuHorizontal.prototype.CalcDimensions = function(force){
    var _this = this;
    if(!force && (_this.MenuItems.length > 0)){
      var xdmenuitem = _this.MenuItems[0].xdobj;
      if(xdmenuitem.calc.widthToMargin().toString() == _this.MenuItems[0].width) return false;
    }
    for(var i=0;i<_this.MenuItems.length;i++){
      var xdobj = _this.MenuItems[i].xdobj;
      var reveal = !xdobj.isVisible();
      if(reveal) xdobj.style.display = true;
      var width = xdobj.calc.widthToMargin(); // obj must be visible on widthToMargin() call
      if(reveal) xdobj.style.display = false;
      _this.MenuItems[i].width = width;
    }
    var xmenu = jsh.xd('.xmenu');
    _this.MenuOverhang = xmenu.calc.left() + parseInt(xmenu.style.calc.paddingLeft.replace(/\D/g, ''));
    if (isNaN(_this.MenuOverhang)) _this.MenuOverhang = 0;
    return true;
  };

  XMenuHorizontal.prototype.CalcSubmenuDimensions = function(force){
    var _this = this;
    var xdSubMenu = _this.getSubmenu();
    if(!force && (_this.SubMenuItems.length > 0)){
      var xdsubmenuitem = _this.SubMenuItems[0].xdobj;
      if(xdsubmenuitem.calc.widthToMargin().toString() == _this.SubMenuItems[0].width) return;
    }
    for(var i=0;i<_this.SubMenuItems.length;i++){
      var xdobj = _this.SubMenuItems[i].xdobj;
      var reveal = !xdobj.isVisible();
      if(reveal) xdobj.style.display = true;
      var width = xdobj.calc.widthToMargin(); // obj must be visible on widthToMargin() call
      if(reveal) xdobj.style.display = false;
      _this.SubMenuItems[i].width = width;
    }
    _this.SubMenuOverhang = xdSubMenu.calc.left() + parseInt(xdSubMenu.style.calc.paddingLeft.replace(/\D/g, ''));
    if (isNaN(_this.SubMenuOverhang)) _this.SubMenuOverhang = 0;
  };

  XMenuHorizontal.prototype.Navigated = function(obj){
    var xdobj = XDom(obj);
    var xdmenuside = jsh.xd('.xmenuside');
    var xdsubmenuside = jsh.xd('.xsubmenuside');

    if(!xdobj.class.contains('xmenu_more')) xdmenuside.style.display = false;
    if(!xdobj.class.contains('xsubmenu_more')) xdsubmenuside.style.display = false;
  };


  XMenu.Base = XMenuBase;
  XMenu.Interfaces['horizontal'] = XMenuHorizontal;

  return XMenu;
};