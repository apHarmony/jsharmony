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

  function XLoader(_containerClass){
    var _this = this;
    this.IsLoading = false;
    this.LoadQueue = new Array();
    this.MouseStack = 0;
    this.onSquashedClick = [];
    this.onMouseDown = [];
    this.onMouseUp = [];
    this.containerClass = _containerClass || '.xloadingblock.jsHarmonyElement_'+jsh._instanceClass;

    //DOM Elements
    this.xdContainer = jsh.xd(_this.containerClass);
    this.xdLoadingBox = XDom(this.xdContainer, ' .xloadingbox');

    //Check if required elements have been rendered to the page
    if(!this.xdContainer.length){
      console.error(_this.containerClass+' not found on page during XLoader initialization'); // eslint-disable-line no-console
    }

    //Keep counter to match mousedown / mouseup events, to detect squashed clicks (clicks blocked by the transparent loading background)
    XDom.on(this.xdContainer, 'mousedown', function(e){
      _this.MouseStack++;
      jsh.XExt.trigger(_this.onMouseDown, e);
    });
    XDom.on(this.xdContainer, 'mouseup', function(e){
      jsh.XExt.trigger(_this.onMouseUp, e);
    });
    XDom.on(this.xdContainer, 'click mouseup', function(e){
      if(_this.MouseStack<=0){ jsh.XExt.trigger(_this.onSquashedClick, e); }
      _this.MouseStack--;
    });
  }

  XLoader.prototype.StartLoading = function(obj){
    if(!_.includes(this.LoadQueue,obj)) this.LoadQueue.push(obj);
    if(this.IsLoading) return;
    jsh.xdroot.style.cursor = 'wait';
    this.IsLoading = true;
    this.MouseStack = 0;
    if(jsh.xDialog.length) jsh.xd('input:not([type=button]),select,textarea').blur();
    else jsh.xd('input,select,textarea').blur();
    this.xdLoadingBox.stop();
    this.xdLoadingBox.animate({opacity: 0}, 0);
    this.xdContainer.style.display = true;
    this.xdLoadingBox.animate({opacity: 1}, 2000);
  };

  XLoader.prototype.StopLoading = function (obj){
    _.remove(this.LoadQueue, function (val) { return obj == val; });
    if(this.LoadQueue.length != 0) return;
    this.StopLoadingBase();
  };

  XLoader.prototype.ClearLoading = function () {
    this.LoadQueue = [];
    this.StopLoadingBase();
  };

  XLoader.prototype.StopLoadingBase = function () {
    var _this = this;
    _this.IsLoading = false;
    _this.xdLoadingBox.stop();
    var curfade = GetOpacity(_this.xdLoadingBox);
    XDom.animate(_this.xdLoadingBox, {opacity: 0}, 500 * curfade, function () { if (!_this.IsLoading) { _this.xdContainer.style.display = false; } });
    jsh.xdroot.style.cursor = '';
  };

  function GetOpacity(tgt) {
    var styles = jsh.XDom.style.calc(tgt);
    var ori = styles.opacity;
    var ori2 = styles.filter;
    if (ori2) {
      ori2 = parseInt( ori2.replace(')','').replace('alpha(opacity=','') ) / 100;
      if (!isNaN(ori2) && ori2 != '') {
        ori = ori2;
      }
    }
    return ori;
  }

  return XLoader;
};
