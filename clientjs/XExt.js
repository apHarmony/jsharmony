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
  var XValidate = jsh.XValidate; // eslint-disable-line no-unused-vars
  var XDom = jsh.XDom;
  var XExt = function(){ };

  XExt.XModel = require('./XExt.XModel.js')(jsh);
  XExt.COOKIE_MAX_EXPIRATION = 2147483647;
  XExt.DOUBLECLICK_TIMEOUT = 500; //ms
  XExt.ejsDelimiter = { open: '<%', close: '%>' };

  XExt.parseGET = function (qs) {
    if (typeof qs == 'undefined') qs = window.location.search;
    if (qs == '' || qs.length == 1) return {};
    if (qs[0] == '?' || qs[0] == '#') qs = qs.substr(1);
    var qsa = qs.split('&');
    var b = {};
    for (var i = 0; i < qsa.length; i++) {
      var p = qsa[i].split('=', 2);
      if (p.length == 1)
        b[p[0]] = '';
      else
        b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, ' '));
    }
    return b;
  };

  XExt.RenderLOV = function (_data, ctrl, LOV) {
    XDom(ctrl).html = jsh.ejs.render('\
      <% for(var i=0;i<data.length;i++){ %>\
      <option value="<%=data[i][jsh.uimap.code_val]%>"><%=data[i][jsh.uimap.code_txt]%></option>\
      <% } %>'
    , { data: LOV, jsh: jsh }
    );
  };

  XExt.RenderParentLOV = function (_data, ctrl, parentvals, LOV, field, plural) {
    //Get Previous Value
    var prevval = _data[field.name];
    if (prevval == null) prevval = '';
    var lovfilter = {};
    if (!plural) lovfilter[jsh.uimap.code_parent] = parentvals[0];
    else {
      for (var j = 0; j < parentvals.length; j++) {
        lovfilter[jsh.uimap.code_parent + (j + 1)] = parentvals[j];
      }
    }
    
    var cLOV = [];
    for(var i=0;i<LOV.length;i++){
      var isMatch = true;
      if(!LOV[i]) continue;
      for(var key in lovfilter){
        if((LOV[i][key]===null)&&(lovfilter[key]===null)){ /* Do nothing */ }
        else if((typeof LOV[i][key]==='undefined')&&(typeof lovfilter[key]==='undefined')){ /* Do nothing */ }
        else if(XExt.isNullUndefined(LOV[i][key]) || XExt.isNullUndefined(lovfilter[key])) isMatch = false;
        else if(LOV[i][key] && lovfilter[key] && (LOV[i][key].toString() == lovfilter[key].toString())){ /* Do nothing */ }
        else isMatch = false;
      }
      if(isMatch) cLOV.push(LOV[i]);
    }
    if ((!plural) && (!(jsh.uimap.code_parent in LOV[0]))) cLOV.unshift(LOV[0]);
    else if ((plural) && (!((jsh.uimap.code_parent + '1') in LOV[0]))) cLOV.unshift(LOV[0]);
    else if ('lovblank' in field) cLOV.unshift(LOV[0]);
    XDom(ctrl).html = jsh.ejs.render('\
      <% for(var i=0;i<data.length;i++){ %>\
      <option value="<%=data[i][jsh.uimap.code_val]%>"><%=data[i][jsh.uimap.code_txt]%></option>\
      <% } %>'
    , { data: cLOV, jsh: jsh }
    );
    //Apply prevval
    var lov_matches = _.filter(ctrl.children, function (el) { return String(el.value).toUpperCase() == String(prevval).toUpperCase(); }).length;
    if (lov_matches > 0) ctrl.value = prevval;
  };

  XExt.TagBox_Refresh = function(ctrl, baseinputctrl){
    XDom(ctrl, 'span').remove();
    XExt.TagBox_AddTags(ctrl, baseinputctrl, XDom(baseinputctrl).value.split(','));
  };

  XExt.TagBox_Save = function(ctrl, baseinputctrl){
    var tags = [];
    XDom(ctrl).getChildren('span').elements.forEach(function(el){ tags.push(XDom(el).data.val); });
    var xdBaseInputCtrl = XDom(baseinputctrl);
    var prevval = xdBaseInputCtrl.value;
    xdBaseInputCtrl.value = tags.join(', ');
    if(xdBaseInputCtrl.value!=prevval) xdBaseInputCtrl.emit('input');
  };

  XExt.TagBox_Focus = function(ctrl, onFocus){
    var xdctrl = XDom(ctrl);
    xdctrl.on('click_remove', function(e){
      onFocus.call(this, e.detail);
    });
    XDom(xdctrl, '.xtag_input').on('focus', function(e){
      onFocus.call(this, e);
    });
    xdctrl.on('click', function(e){
      onFocus.call(this, e);
    });
  };

  XExt.TagBox_AddTags = function(ctrl, baseinputctrl, new_tags){
    var xdctrl = XDom(ctrl);
    var addTag = function(val){
      val = val.trim();
      if(!val.length) return;

      var newSpan = XDom.render('<span class="notextselect">'+XExt.escapeHTML(val)+'	&#8203;<div class="xtag_remove xtag_focusable">✕</div></span>');
      var xdnew = XDom(newSpan);
      xdnew.data.val = val;

      xdctrl.insertBefore(newSpan, xdctrl.get('.xtag_input').element);

      XDom(xdnew, '.xtag_remove').on('click', function(e){
        if(xdctrl.class.contains('uneditable')) return;
        xdctrl.emit('click_remove', e);
        XDom(xdctrl, '.xtag_input').blur();
        XDom(this).parent('span').remove();
        XExt.TagBox_Save(ctrl, baseinputctrl);
      });
    };

    _.each(new_tags, function(tag){ addTag(tag); });
    XExt.TagBox_Save(ctrl, baseinputctrl);
  };

  XExt.TagBox_Render = function(ctrl, baseinputctrl){
    var xdctrl = XDom(ctrl);
    var xdbaseinputctrl = XDom(baseinputctrl);

    xdbaseinputctrl.style.display = false;
    xdctrl.clear();

    xdctrl.style.display = 'inline-block';
    xdctrl.class.add('xtag_focusable');
    xdctrl.append('<input class="xtag_input inactive xtag_focusable" size="1" />');

    var xdinput = XDom(xdctrl, '.xtag_input');

    xdctrl.on('click', function(){
      if(xdinput.class.contains('inactive')){
        xdinput.value = '';
        xdinput.element.parentNode.insertBefore(xdinput.element, null);
        xdinput.focus();
      }
    });

    if(xdbaseinputctrl.data.id) xdinput.data.id = xdbaseinputctrl.data.id;

    xdinput.on('input keyup', function(e){
      var xdthis = XDom(this);
      var val = xdthis.value;
      if(val.indexOf(',')>=0){ xdthis.value = ''; XExt.TagBox_AddTags(ctrl, baseinputctrl, val.split(',')); }
      xdthis.attr.size = Math.round((xdthis.value||' ').toString().length/.87);
    });

    var isMovingInput = false;

    xdinput.on('keydown', function(e){
      if(xdctrl.class.contains('uneditable')) return;

      var obj = this;
      var xdobj = XDom(obj);
      var handled = false;
      isMovingInput = false;

      var cursorpos = 0;
      var sel = XExt.getSelection(obj);
      if(sel) cursorpos = sel.start;

      if(e.which==39){ //Right
        if(xdobj.nextSibling().length && (cursorpos==xdobj.value.length)){
          handled = true;
          var objnextnext = null;
          if(xdobj.nextSibling().nextSibling().length) objnextnext = xdobj.nextSibling().nextSibling().element;
          isMovingInput = true;
          xdobj.element.parentNode.insertBefore(xdobj.element, objnextnext);
          xdobj.focus();
          isMovingInput = false;
        }
      }
      else if(e.which==37){ //Left
        if(xdobj.previousSibling().length && (cursorpos==0)){
          handled = true;
          var objprev = xdobj.previousSibling().element;
          isMovingInput = true;
          xdobj.element.parentNode.insertBefore(xdobj.element, objprev);
          xdobj.focus();
          isMovingInput = false;
        }
      }
      else if(e.which==8){ //Backspace
        if(xdobj.previousSibling().length && (cursorpos==0)){
          handled = true;
          xdobj.previousSibling().remove();
          XExt.TagBox_Save(ctrl, baseinputctrl);
        }
      }
      else if(e.which==13){ //Backspace
        var xdthis = XDom(this);
        var val = xdthis.value;
        xdthis.value = '';
        XExt.TagBox_AddTags(ctrl, baseinputctrl, [val]);
      }
      if(handled){
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    });

    xdinput.on('focus', function(){
      XDom(this).class.remove('inactive');
    });

    xdinput.on('focusout', function(){
      if(isMovingInput) return;
      var xdthis = XDom(this);
      if(!xdctrl.class.contains('uneditable')){
        var val = xdthis.value;
        xdthis.value = '';
        XExt.TagBox_AddTags(ctrl, baseinputctrl, [val]);
      }
      xdthis.class.add('inactive');
    });
  };

  /**************
   * DATEPICKER *
   **************/
  
  XExt.DatePickerRender = function(ctrl, date, options){
    options = _.extend({ dateFormat: jsh.DEFAULT_DATEFORMAT, onSelect: null}, options);
    if(jsh.xd('.xdatepicker').length) XExt.DatePickerRemove();
    XDom('body').append(
      '<div class="xdatepicker" style="display: none">\
        <div class="xdatepicker_banner">\
          <div class="xdatepicker_nav"><a class="xdatepicker_prev">&lt</a></div>\
          <div class="xdatepicker_center">\
            <select class="select_month" style="width:100%"><option value="0">Jan</option><option value="1">Feb</option><option value="2">Mar</option><option value="3">Apr</option><option value="4">May</option><option value="5">Jun</option><option value="6">Jul</option><option value="7">Aug</option><option value="8">Sep</option><option value="9">Oct</option><option value="10">Nov</option><option value="11">Dec</option></select>\
            <select class="select_year" style="width:100%"></select>\
          </div>\
          <div class="xdatepicker_nav"><a class="xdatepicker_next">&gt</a></div>\
        </div>\
        <table><thead><tr><th>Su</th><th>Mo</th><th>Tu</th><th>We</th><th>Th</th><th>Fr</th><th>Sa</th></tr></thead><tbody></tbody></table>\
      </div>'
    );
    var selDate = {year: date.getFullYear(), month: date.getMonth(), day: date.getDate()};
    XExt.DatePickerUpdate(date, selDate);

    //Attach handlers:
    var xdDatePicker = jsh.xd('.xdatepicker');
    xdDatePicker.on('click', XDom.liveEvent('.entry', function(e){
      var xdClicked = XDom(e.target);
      XDom(ctrl).value = jsh.moment({year: xdClicked.data.year, month: xdClicked.data.month, day: xdClicked.innerHTML}).format(options.dateFormat);
      XDom(xdDatePicker, '.entry').class.remove('selected');
      xdClicked.class.add('selected');
      XExt.DatePickerHide();
      if(options.onSelect) options.onSelect(ctrl);
    }));
    var xdSelectMonth = XDom(xdDatePicker, '.select_month');
    var xdSelectYear = XDom(xdDatePicker, '.select_year');
    xdDatePicker.on('change', function(){
      XExt.DatePickerUpdate(new Date(xdSelectYear.value, xdSelectMonth.value), selDate);
    });
    XDom(xdDatePicker, '.xdatepicker_next').on('click', function(){
      var currMonth = parseInt(xdSelectMonth.value);
      var currYear = parseInt(xdSelectYear.value);
      if(currMonth >= 11) {currYear++; currMonth = 0;}
      else currMonth++;
      XExt.DatePickerUpdate(new Date(currYear, currMonth), selDate);
    });
    XDom(xdDatePicker, '.xdatepicker_prev').on('click', function(){
      var currMonth = parseInt(xdSelectMonth.value);
      var currYear = parseInt(xdSelectYear.value);
      if(currMonth <= 0) {currYear--; currMonth = 11;}
      else currMonth--;
      XExt.DatePickerUpdate(new Date(currYear, currMonth), selDate);
    });
    XExt.DatePickerShow();
  };

  XExt.DatePickerUpdate = function(date, selDate){
    var xdDatePicker = jsh.xd('.xdatepicker');
    if(!xdDatePicker.length) return;

    var month = date.getMonth();
    var year = date.getFullYear();

    var firstDay = new Date(year, month, 1).getDay();
    var totalDays = new Date(year, month + 1, 0).getDate();
    //Load banner years
    var xdSelectYear = XDom(xdDatePicker, '.select_year');
    xdSelectYear.clear();
    for(var i=-10; i<=10; i++){
      var value = year+i;
      xdSelectYear.append('<option value="'+ value +'">'+ value +'</option>');
    }
    //Update banner values
    XDom(xdDatePicker, '.select_month').value = month;
    XDom(xdDatePicker, '.select_year').value = year;
    //Clear table body for update
    var xdTable = XDom(xdDatePicker, 'tbody');
    xdTable.clear();
    var xdCurrentTr = XDom(XDom.render('<tr></tr>'));
    //Append empty cells for beginning of month
    for(var j=0; j<firstDay; j++){
      xdCurrentTr.append('<td></td>');
    }
    //Fill out cells with dates
    for(var day_idx = 1; day_idx<=totalDays; day_idx++){
      if((day_idx + firstDay - 1) % 7 === 0){
        xdTable.append(xdCurrentTr);
        xdCurrentTr = XDom(XDom.render('<tr></tr>'));
      }
      var xdCell = XDom(XDom.render('<td><a class="entry">' + day_idx + '</a></td>'));
      var xdEntry = XDom(xdCell, 'a.entry');
      xdEntry.data.month = month;
      xdEntry.data.year = year;
      if(selDate.year == year && selDate.month == month && selDate.day == day_idx) xdEntry.class.add('selected');
      xdCurrentTr.append(xdCell);
    }
    //Append last incomplete row
    if(xdCurrentTr.children.length > 0) xdTable.append(xdCurrentTr);
  };

  XExt.DatePickerRemove = function(){
    jsh.xd('.xdatepicker').remove();
  };

  XExt.DatePickerHide = function(){
    jsh.xd('.xdatepicker').animate.opacity(false, XExt.DatePickerRemove, 350);
  };

  XExt.DatePickerShow = function(){
    jsh.xd('.xdatepicker').animate.opacity(true, null, 350);
  };

  XExt.DatePicker = function(ctrl, options){
    var xdctrl = XDom(ctrl);
    xdctrl.on('focus', function(){
      var moment = jsh.moment(xdctrl.value, options.dateFormat);
      if(!moment.isValid()) moment = jsh.moment();
      var date = new Date(moment.year(), moment.month(), [moment.date()]);
      XExt.DatePickerRender(ctrl, date, options);
      var xdDatepicker = jsh.xd('.xdatepicker');
      xdDatepicker.style.top = xdctrl.calc.top()+xdctrl.calc.heightToBorder()+window.scrollY+'px';
      xdDatepicker.style.left = xdctrl.calc.left()+window.scrollX+'px';
    });
    xdctrl.on('keydown', function(e){
      if(e.keyCode == 27) XExt.DatePickerHide(); //esc
      if(e.keyCode == 9) XExt.DatePickerRemove();//tab
    });
  };

  XExt.CancelBubble = function (e) {
    if (!e) e = window.event;
    if (e.stopPropagation) e.stopPropagation();
    else e.cancelBubble = true;
    if(e.preventDefault) e.preventDefault();
  };

  XExt.HideContextMenu = function () {
    jsh.xd('.xcontext_menu').style.display = false;
  };

  XExt.ShowContextMenu = function (selector, context_item, data, options){
    options = _.extend({ top: jsh.mouseY, left: jsh.mouseX }, options);
    if (!selector) selector = '.xcontext_menu';
    XExt.HideContextMenu();
    var xdSelector = jsh.xd(selector);
    xdSelector.style.visibility = 'hidden';
    xdSelector.style.display = true;
    var xtop = options.top; var xleft = options.left;

    var wwidth = window.innerWidth;
    var wheight = window.innerHeight - 20;
    var dwidth = xdSelector.calc.widthToBorder()+4;
    var dheight = xdSelector.calc.heightToBorder()+4;
    if ((xtop + dheight) > wheight) xtop = wheight - dheight;
    if ((xleft + dwidth) > wwidth) xleft = wwidth - dwidth;
    var offsetParent = xdSelector.element.offsetParent;
    xtop -= XDom.calc.top(offsetParent) - 1;
    xleft -= XDom.calc.left(offsetParent) - 1;

    if (xtop < 0) xtop = 0;
    if (xleft < 0) xleft = 0;

    xdSelector.getChildren('a').elements.forEach(function(el){
      var obj = el;
      var xdobj = XDom(obj);
      var onrender = xdobj.data.onrender;
      if(onrender){
        var f = (new Function('context_item', 'data', onrender));
        var frslt = f.call(obj, context_item, data);
        xdobj.style.display = (frslt !== false);
      }
    });

    xdSelector.style.top = xtop+'px';
    xdSelector.style.left = xleft+'px';
    xdSelector.style.visibility = 'visible';
    if(jsh){
      jsh.xContextMenuVisible = true;
      jsh.xContextMenuItem = context_item;
      jsh.xContextMenuItemData = data;
    }
  };

  XExt.CallAppFunc = function (url, method, d, onComplete, onFail, options){
    if(!jsh) throw new Error('XExt requires jsHarmony instance to run CallAppFunc');
    if(!options) options = {};
    var getVars = function () {
      for (var dname in d) {
        var dval = d[dname];
        if (dval && (dval instanceof XExt.InputValue)) {
          dval.Prompt(function (rslt) {
            if (rslt) {
              d[dname] = dval.Value;
              getVars();
            }
          });
          return;
        }
      }
      //All variables ready, run main operation
      var xform = new jsh.XForm(url);
      xform.Data = d;
      var dq = {}, dp = {};
      if (method == 'get') dq = d;
      else if (method == 'postq') { dq = d; method = 'post'; }
      else if (method == 'putq') { dq = d; method = 'put'; if (options.post) { dp = options.post; } }
      else dp = d;
      xform.qExecute(xform.PrepExecute(method, xform.url, dq, dp, function (rslt) {
        if ('_success' in rslt) {
          if (onComplete) onComplete(rslt);
          else XExt.Alert('Operation completed successfully.');
        }
      }, onFail));
    };
    getVars();
  };

  XExt.InputValue = function (_Caption, _Validation, _Default, _PostProcess, options){
    this.Caption = _Caption;
    this.Validation = _Validation;
    this.Default = (_Default ? _Default : '');
    this.PostProcess = _PostProcess;
    this.Value = undefined;
    this.options = _.extend({ PromptText: null }, options);
  };
  XExt.InputValue.prototype.Prompt = function (onComplete) {
    var _this = this;
    XExt.Prompt((_this.options.PromptText || _this.Caption), _this.Default, function (rslt) {
      if (rslt == null) {
        if (onComplete) { onComplete(null); }
        return;
      }
      else {
        if (_this.Validation) {
          var v = new jsh.XValidate(jsh);
          v.AddValidator('_obj.Value', _this.Caption, 'BIUD', _this.Validation);
          v.ResetValidation();
          var verrors = v.Validate('BIUD', { Value: rslt });
          if (!_.isEmpty(verrors)) {
            XExt.Alert(verrors[''].join('\n'), function () { if (onComplete) onComplete(null); });
            return;
          }
        }
        if (_this.PostProcess) rslt = _this.PostProcess(rslt);
        _this.Value = rslt;
        if (onComplete) onComplete(rslt);
      }
    });
  };
  XExt.getLOVTxt = function (LOV, val) {
    var lov = XExt.getLOV(LOV, val);
    if(lov) return lov[jsh.uimap.code_txt];
    return undefined;
  };
  XExt.getLOV = function (LOV, val) {
    if (val) val = val.toString();
    for (var i = 0; i < LOV.length; i++) {
      if (LOV[i][jsh.uimap.code_val] == val) return LOV[i];
    }
    return undefined;
  };
  XExt.pushLOV = function (LOV, val, txt) {
    var newlov = {};
    newlov[jsh.uimap.code_val] = val;
    newlov[jsh.uimap.code_txt] = txt;
    LOV.push(newlov);
  };
  XExt.parseLOV = function (LOV) {
    var rslt = LOV;
    if(_.isArray(LOV)){
      rslt = LOV.slice();
      for(var i=0;i<LOV.length;i++){
        if(_.isString(rslt[i])){
          var val = rslt[i];
          rslt[i] = {};
          rslt[i][jsh.uimap.code_val] = val;
          rslt[i][jsh.uimap.code_txt] = val;
        }
      }
    }
    else if(_.isObject(LOV)){
      rslt = [];
      for(var key in LOV){
        var newval = {};
        newval[jsh.uimap.code_val] = key;
        newval[jsh.uimap.code_txt] = LOV[key];
        rslt.push(newval);
      }
    }
    return rslt;
  };

  XExt.endsWith = function (str, suffix) {
    str = (str || '').toString();
    suffix = (suffix || '').toString();
    var idx = str.lastIndexOf(suffix);
    return (idx >= 0) && (idx == (str.length - suffix.length));
  };
  XExt.beginsWith = function (str, prefix) {
    return (str||'').toString().indexOf(prefix) === 0;
  };

  XExt.hasAction = function (actions, perm) {
    if (actions === undefined) return false;
    for (var i = 0; i < perm.length; i++) {
      if (actions.indexOf(perm[i]) > -1) return true;
    }
    return false;
  };

  XExt.UndefinedBlank = function (val) {
    if (typeof val == 'undefined') return '';
    return val;
  };

  XExt.ReplaceAll = function (val, find, replace) {
    return val.split(find).join(replace);
  };

  XExt.trim = function(str,chr,dir){
    if(!chr) chr = ' \t\n\r\v\f';
    var foundchr = true;
    var rslt = str||'';

    if(!dir){
      rslt = XExt.trim(str, chr, 1);
      rslt = XExt.trim(rslt, chr, -1);
      return rslt;
    }

    while(foundchr){
      foundchr = false;
      if(!rslt) break;
      var tgtchr = '';
      if(dir>0) tgtchr = rslt[rslt.length-1];
      else tgtchr = rslt[0];
      for(var i=0;i<chr.length;i++){
        if(tgtchr==chr[i]){ foundchr = true; break; }
      }
      if(foundchr){
        if(dir>0) rslt = rslt.substr(0,rslt.length - 1);
        else rslt = rslt.substr(1);
      }
    }
    return rslt;
  };

  XExt.trimRight = function(str, chr){
    return XExt.trim(str, chr, 1);
  };

  XExt.trimLeft = function(str, chr){
    return XExt.trim(str, chr, -1);
  };

  XExt.AddHistory = function (url, obj, title) {
    if (jsh && !jsh.isHTML5) return;
    if (typeof obj == 'undefined') obj = {};
    if (typeof title == 'undefined') title = document.title;
    window.history.pushState(obj, title, url);
  };

  XExt.ReplaceHistory = function (url, obj, title) {
    if (jsh && !jsh.isHTML5) return;
    if (typeof obj == 'undefined') obj = {};
    if (typeof title == 'undefined') title = document.title;
    window.history.replaceState(obj, title, url);
  };

  XExt.clearFileInput = function (obj) {
    var oldInput = obj;
    var newInput = document.createElement('input');
    newInput.type = 'file';
    newInput.id = oldInput.id;
    newInput.name = oldInput.name;
    newInput.className = oldInput.className;
    newInput.style.cssText = oldInput.style.cssText;
    newInput.accept = oldInput.accept;
    newInput.multiple = oldInput.multiple;
    oldInput.parentNode.replaceChild(newInput, oldInput);
  };

  XExt.hideTab = function (modelid, tabname) {
    modelid = XExt.resolveModelID(modelid);
    var modelclass = modelid;
    if(modelid in jsh.XModels) modelclass = jsh.XModels[modelid].class;
    jsh.xd('.xtab' + modelclass).elements.forEach(function (obj) {
      var xdobj = XDom(obj);
      if (xdobj.innerHTML == tabname) xdobj.style.display = false;
    });
  };

  //Escape JavaScript string
  XExt.escapeJS = function (q) {
    if(!q) return '';
    return q.replace(/[\\'"]/g, '\\$&');
  };

  //Escape just quotes (for XML/HTML key-value pairs)
  XExt.escapeHTMLQ = function (q) {
    if(!q) return '';
    return q.replace(/["]/g, '&quot;');
  };

  //Escape while enabling escape characters in a string
  XExt.escapeHTMLN = function (val) {
    var rslt = XExt.escapeHTML(val);
    return String(rslt).replace(/&amp;([\w]+);/g, function (s,p1) {
      return '&'+p1+';';
    });
  };

  //Escape all HTML
  XExt.escapeHTML = function (val) {
    var entityMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;',
      '\u00A0':'&#xa0;'
    };
    
    return String(val).replace(/[\u00A0&<>"'/]/g, function (s) {
      return entityMap[s];
    });
  };
  //Escape HTML and replace line breaks with HTML line breaks
  XExt.escapeHTMLBR = function (val) {
    if((typeof val=='undefined')||(val===null)) return val;
    return XExt.ReplaceAll(XExt.ReplaceAll(XExt.escapeHTML(val.toString()), '\n', '<br/>'), '\r', '');
  };
  //Escape HTML and replace line breaks with spaces
  XExt.escapeBRSpace = function (val) {
    if((typeof val=='undefined')||(val===null)) return val;
    return XExt.ReplaceAll(XExt.ReplaceAll(val.toString(), '\n', ' '), '\r', '');
  };
  //Escape string for regular expression matching
  XExt.escapeRegEx = function (q, options) {
    options = _.extend({ ignore: '' }, options);
    var chars = {
      '-':'-',
      '[':'[',
      ']':'\\]',
      '{':'{',
      '}':'}',
      '(':'(',
      ')':')',
      '*':'*',
      '+':'+',
      '?':'?',
      '.':'.',
      ',':',',
      '\\':'\\\\',
      '/':'/',
      '^':'^',
      '$':'$',
      '|':'|',
      '#':'#',
    };
    var rxstr = '';
    for(var key in chars){
      if(!options.ignore || (options.ignore.indexOf(key)<0)) rxstr += chars[key];
    }
    return q.replace(new RegExp('['+rxstr+'\\s]','g'), '\\$&');
  };
  //Escape string for CSS
  XExt.escapeCSSClass = function(val, options){
    //options { nodash: true }
    if(!options) options = { nodash: false };
    var rslt = (val||'').toString();
    if(rslt && options.nodash) rslt = rslt.replace(/[^a-zA-Z0-9_]+/g, '_');
    else rslt = rslt.replace(/[^a-zA-Z0-9_-]+/g, '_');
    rslt = XExt.trimLeft(rslt,'-');
    while(rslt.indexOf('__') > 0) rslt = XExt.ReplaceAll(rslt,'__','_');
    return rslt;
  };
  //Escape URL
  XExt.prettyURL = function(val, options){
    //options { }
    var rslt = (val||'').toString().toLowerCase();
    rslt = rslt.replace(/[^a-zA-Z0-9_-]+/g, '-');
    rslt = XExt.trim(rslt,'-');
    while(rslt.indexOf('--') > 0) rslt = XExt.ReplaceAll(rslt,'--','-');
    return rslt;
  };
  XExt.encodeEJSURI = function (val){
    if(val === null) return '';
    if(typeof val == 'undefined') return '';
    return encodeURI(val);
  };
  XExt.escapeQuery = function(query) {
    function pair(key, value) {
      return encodeURIComponent(key.toString()) + '=' + encodeURIComponent((value || typeof(value) == 'number') ? value.toString() : '');
    }
    function arrayValue(array, prefix) {
      return _.map(array, function(value, index) {
        if (_.isArray(value)) {
          return arrayValue(value, prefix+'['+index+']');
        } else if (_.isObjectLike(value)) {
          return objectValue(value, prefix+'['+index+']');
        } else {
          return pair(prefix+'[]', value);
        }
      }).join('&');
    }
    function objectValue(object, prefix) {
      // can't use _.map because it treats an object with a length as an array
      var result = [];
      _.forIn(object, function(value, _key) {
        var key;
        if (prefix) {
          key = prefix + '[' + _key + ']';
        } else {
          key = _key;
        }
        if (_.isArray(value)) {
          result.push(arrayValue(value, key));
        } else if (_.isObjectLike(value)) {
          result.push(objectValue(value, key));
        } else {
          result.push(pair(key, value));
        }
      });
      return result.join('&');
    }

    return objectValue(query, '');
  };
  XExt.pad = function (val, padding, length) {
    var rslt = val.toString();
    while (rslt.length < length) rslt = padding + rslt;
    return rslt;
  };
  XExt.getMargin = function(ctrl){
    var xdctrl = XDom(ctrl);
    var xdctrlStyles = xdctrl.style.calc;
    return {
      top: parseInt(xdctrlStyles.marginTop),
      right: parseInt(xdctrlStyles.marginRight),
      bottom: parseInt(xdctrlStyles.marginBottom),
      left: parseInt(xdctrlStyles.marginLeft)
    };
  };
  XExt.getPadding = function(ctrl){
    var xdctrl = XDom(ctrl);
    var xdctrlStyles = xdctrl.style.calc;
    return {
      top: parseInt(xdctrlStyles.paddingTop),
      right: parseInt(xdctrlStyles.paddingRight),
      bottom: parseInt(xdctrlStyles.paddingBottom),
      left: parseInt(xdctrlStyles.paddingLeft)
    };
  };
  XExt.getBorder = function(ctrl){
    var xdctrl = XDom(ctrl);
    var xdctrlStyles = xdctrl.style.calc;
    return {
      top: parseInt(xdctrlStyles.borderTopWidth),
      right: parseInt(xdctrlStyles.borderRightWidth),
      bottom: parseInt(xdctrlStyles.borderBottomWidth),
      left: parseInt(xdctrlStyles.borderLeftWidth)
    };
  };
  XExt.xejs = {
    'escapeJS': function(val){ return XExt.escapeJS(val); },
    'escapeHTML': function(val){ return XExt.escapeHTML(val); },
    'escapeHTMLN': function(val){ return XExt.escapeHTMLN(val); },
    'escapeHTMLBR': function(val){ return XExt.escapeHTMLBR(val); },
    'iif': function (cond, tval, fval) {
      if (cond) return tval;
      if (fval !== undefined) return fval;
      return '';
    },
    'ifnull': function (val, nullval) {
      if (val) return val;
      return nullval;
    },
    'case': function () {
      var args = arguments;
      if (args.length == 0) return '';
      var i = 0;
      while (i < args.length) {
        if (i == (args.length - 1)) return args[i];
        if (args[i]) return args[i + 1];
        i += 2;
      }
      return '';
    },
    'visible': function (cond) {
      try {
        if (!cond) return 'display:none;';
      }
      catch (ex) { /* Do nothing */ }
      return '';
    },
    'eachKey': function (fields, func) {
      if(!fields) return;
      for (var i = 0; i < fields.length; i++) {
        if (fields[i].key)
          func(fields[i]);
      }
    },
    'showProp': function (prop, val, unescaped, pre, post) {
      if(!pre) pre = '';
      if(!post) post = '';
      if (typeof val != 'undefined') {
        if (unescaped) return prop + '="' + pre+val+post + '"';
        else return prop + '="' + XExt.escapeHTML(pre+val+post) + '"';
      }
      return '';
    },
    'showSystemButton': function (model, btn) {
      if (model.hide_system_buttons) {
        for (var i = 0; i < model.hide_system_buttons.length; i++) {
          if (model.hide_system_buttons[i] == btn) return false;
        }
      }
      return true;
    },
    'GetValue': function (field, model) {
      var val = '';
      if (model && model.grid_static){ return '<'+"%=data['"+field.name+"']%"+'>'; }
      if ('sample' in field) val = field.sample;
      if ('default' in field){
        if(_.isString(field.default) && (field.default.substr(0,3)=='js:')){ /* Do nothing */ }
        else val = field.default;
      }
      if (val && ('format' in field)) val = jsh.XFormat.Apply(field.format, val);
      return XExt.escapeHTMLN(val);
    },
    'getInputType': function (field) {
      if (field && field.validate) {
        for(var i=0;i<field.validate.length;i++){
          var validator = field.validate[i];
          for(var j=0;j<validator.funcs.length;j++){
            var vfunc = validator.funcs[j];
            if (vfunc.indexOf('XValidate._v_IsEmail()') == 0) return 'email';
            if (vfunc.indexOf('XValidate._v_IsPhone()') == 0) return 'tel';
          }
        }
      }
      if (field && field.type) {
        if ((field.type == 'varchar') || (field.type == 'char')) return 'text';
        //else if (_.includes(['bigint', 'int', 'smallint', 'tinyint', 'decimal', 'float', 'boolean'], field.type)) return 'number';
        //else if ((field.type == 'datetime')) return 'number';// return 'datetime';
        //else if ((field.type == 'date')) return 'number';// return 'date';
        //else if ((field.type == 'time')) return 'number';// return 'time';
      }
      return 'text';
    },
    'getActions': function () {
      if (arguments.length == 0) return '';
      var kfc = '';
      var effperm = arguments[0];
      for (var i = 0; i < arguments.length; i++) {
        effperm = XExt.xejs.intersectperm(effperm, arguments[i]);
        kfc = XExt.xejs.unionperm(kfc, this.intersectperm('KFC', arguments[i]));
      }
      return (effperm + kfc);
    },
    'hasAction': function () {
      if (arguments.length == 0) return '';
      var effperm = arguments[0];
      for (var i = 0; i < arguments.length; i++) {
        effperm = XExt.xejs.intersectperm(effperm, arguments[i]);
      }
      return effperm;
    },
    'intersectperm': function (perm1, perm2) {
      if (typeof perm1 == 'undefined') perm1 = '';
      if (typeof perm2 == 'undefined') perm2 = '';
      var rslt = '';
      if (perm1 == '*') return perm2;
      if (perm2 == '*') return perm1;
      for (var i = 0; i < perm1.length; i++) {
        if (perm2.indexOf(perm1[i]) > -1) rslt += perm1[i];
      }
      return rslt;
    },
    'unionperm': function (perm1, perm2) {
      if ((typeof perm1 == 'undefined') && (typeof perm2 == 'undefined')) return '';
      if (typeof perm1 == 'undefined') return perm2;
      if (typeof perm2 == 'undefined') return perm1;
      if (perm1 == '*') return '*';
      if (perm2 == '*') return '*';
      var rslt = perm1;
      for (var i = 0; i < perm2.length; i++) {
        if (rslt.indexOf(perm2[i]) < 0) rslt += perm2[i];
      }
      return rslt;
    },
    'renderLOV': function (lov, selected_value) {
      var rslt = '';
      _.each(lov, function (lovval) {
        rslt += '<option value="' + XExt.escapeHTML(lovval[jsh.uimap.code_val]) + '" ' + ((lovval[jsh.uimap.code_val] == selected_value)?'selected':'') + '>' + XExt.escapeHTML(lovval[jsh.uimap.code_txt]) + '</option>';
      });
      return rslt;
    },
    'onlyAlphaNum': function (val) {
      if (!val) return '';
      return val.toString().replace(/[^a-zA-Z0-9]+/g, '');
    },
    'is_insert': function (_GET) {
      return (_GET['action'] == 'insert');
    },
    'is_browse': function (_GET) {
      return (_GET['action'] == 'browse');
    }
  };

  XExt.CKEditor = function (id, config, cb) {
    if (!window.CKEDITOR){
      //Dynamically load CKEditor script, and rerun function when finished
      window.CKEDITOR_BASEPATH = jsh._PUBLICURL+'js/ckeditor/';
      jsh.loadScript(jsh._PUBLICURL+'js/ckeditor/ckeditor.js', function(){ XExt.CKEditor(id, config, cb); });
      return;
    }
    if(!id){ if(cb) cb(); return; }
    if (window.CKEDITOR.instances[id]){ if(cb) cb(); return; }
    
    var elem = jsh.xd('#'+id);
    if(!elem.length) elem = jsh.xd('.'+id);
    if(!elem.length){ return XExt.Alert('Cound not initialize editor on '+id+': form control with that id not found'); }
    var orig_width = elem.calc.widthToBorder();
    var orig_height = elem.calc.heightToBorder();
    var xdParent = elem.parent();
    if(!xdParent.class.contains(id + '_container')){
      var wrapper = XDom.render('<div class="' + id + '_container htmlarea_container" style="width:' + orig_width + 'px;"></div>');
      xdParent.element.append(wrapper);
      wrapper.appendChild(elem.element);
    }
    window.CKEDITOR.replace(id, _.extend({ height: orig_height },config));
    if(cb) cb();
    return;
  };
  XExt.TinyMCE = function (id, config, cb) {
    if (!window.tinymce){
      //Dynamically load TinyMCE script, and rerun function when finished
      window.TINYMCE_BASEPATH = jsh._PUBLICURL+'js/tinymce/';
      jsh.loadScript(jsh._PUBLICURL+'js/tinymce/tinymce.min.js', function(){ XExt.TinyMCE(id, config, cb); });
      return;
    }
    if(!config){ if(cb) cb(); return; }
    if (window.tinymce.get(id)){ if(cb) cb(); return; }
    
    var elem = jsh.xd('#'+id);
    if(!elem.length) elem = jsh.xd('.'+id);
    if(!elem.length){ return XExt.Alert('Cound not initialize editor on '+id+': form control with that id not found'); }
    var orig_width = elem.calc.widthToBorder();
    var orig_height = elem.calc.heightToBorder();
    var xdParent = elem.parent();
    if(!xdParent.class.contains(id + '_container')){
      var wrapper = XDom.render('<div class="' + id + '_container htmlarea_container" style="width:' + orig_width + 'px;"></div>');
      xdParent.element.append(wrapper);
      wrapper.appendChild(elem.element);
    }
    config = config || {};
    config.selector = '#' + id;
    var prev_init_instance_callback  = config.init_instance_callback ;
    config.init_instance_callback  = function(instance){
      if(prev_init_instance_callback) prev_init_instance_callback(instance);
      if(cb) cb();
    };
    config = _.extend({ height: orig_height }, config);
    window.tinymce.init(config);
  };

  XExt.getOpenerJSH = function(capabilities){
    if (window.opener) {
      var pjsh = window.opener[jsh.getInstance()];
      if(!pjsh || !pjsh.XPage) return;
      if(pjsh == jsh) return;
      var hasCapabilities = true;
      if(capabilities) _.each(capabilities, function(capability){
        if(!pjsh.XPage[capability]) hasCapabilities = false;
      });
      if(hasCapabilities) return pjsh;
    }
  };
  XExt.notifyPopupComplete = function (id, rslt) {
    var jshOpener = XExt.getOpenerJSH(['PopupComplete']);
    if (jshOpener) {
      jshOpener.XPage.PopupComplete(id, rslt);
    }
  };
  XExt.unescapeEJS = function (ejssrc) {
    if (!ejssrc) return '';
    var rslt = ejssrc;
    rslt = XExt.ReplaceAll(rslt, '&lt;#', '<#');
    rslt = XExt.ReplaceAll(rslt, '#&gt;', '#>');
    rslt = XExt.ReplaceAll(rslt, '&lt;%', '<%');
    rslt = XExt.ReplaceAll(rslt, '%&gt;', '%>');
    return rslt;
  };
  XExt.renderEJS = function(ejssource, modelid, params){
    if(!ejssource) return '';
    modelid = XExt.resolveModelID(modelid);
    var ejsparams = {
      xejs: XExt.xejs,
      jsh: jsh,
      _: jsh._,
      moment: jsh.moment,
      XExt: XExt,
      instance: jsh.getInstance(),
      _GET: jsh._GET,
      js: function(code,options){ return jsh.XExt.wrapJS(code,modelid,options); }
    };
    if(modelid){
      ejsparams.modelid = modelid;
      ejsparams.xmodel = jsh.XModels[modelid];
      ejsparams._this = jsh.App[modelid];
    }
    ejsparams = _.extend(ejsparams, params);
    if(!('ejsparams' in ejsparams)) ejsparams.ejsparams = ejsparams;
    return jsh.ejs.render(ejssource, ejsparams);
  };
  XExt.replaceTempEJSTags = function(ejssrc){
    if(!ejssrc) return '';
    if(ejssrc.indexOf('<#')<0) return ejssrc;
    ejssrc = ejssrc.replace(/<#/g, '<%').replace(/#>/g, '%>');
    return ejssrc;
  };
  XExt.renderClientEJS = function(ejssrc,ejsparams){
    if(!ejssrc) return '';
    return jsh.ejs.render(XExt.replaceTempEJSTags(ejssrc),ejsparams);
  };
  XExt.isSinglePage = function () {
    if (jsh.singlepage) return true;
    return false;
  };
  XExt.navTo = function (url, options) {
    options = _.extend({ force: false }, options);
    if (XExt.isSinglePage()) {
      var a = XExt.getURLObj(url);
      if (!jsh.Navigate(a, undefined, undefined, undefined, options)) return false;
    }
    if(options && options.force){
      window.onbeforeunload = null;
      jsh.cancelExit = true;
    }
    window.location.href = url;
    return false;
  };
  XExt.jumpAnchor = function (name) {
    if (!name) return;
    if (name[0] == '#') name = name.substring(1);
    var xdobj = jsh.xd('a[name="' + name + '"]');
    if (xdobj.length == 0) return;
    window.scrollTo(0, xdobj.calc.top());
  };
  XExt.getURLObj = function (url) {
    var a = document.createElement('a');
    a.href = url;
    return a;
  };
  XExt.aPhoneCheck = function (obj, caption) {
    var xdobj = XDom(obj);
    var val = xdobj.value;
    if (val && (val == '1' || !val.match(/[0123456789]/))) {
      xdobj.class.add('xinputerror');
      XExt.Alert('Invalid ' + caption);
      return false;
    }
    return true;
  };
  XExt.StripTags = function (val, ignore, options) {
    if (!val) return val;

    options = _.extend({ addSpaces: false }, options);
    
    ignore = (((ignore || '') + '').toLowerCase().match(/<[a-z][a-z0-9]*>/g) || []).join('');
    var clienttags = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
    var servertags = /<!--[\s\S]*?-->|<\?(?:php)?[\s\S]*?\?>/gi;
    var replaceStr = (options.addSpaces ? ' ' : '');
    
    var rslt = XExt.unescapeHTMLEntity(val.replace(servertags, replaceStr).replace(clienttags, function ($0, $1) {
      return ignore.indexOf('<' + $1.toLowerCase() + '>') > -1 ? $0 : replaceStr;
    }));
  
    if(options.addSpaces){
      //Trim double-spaces
      while(rslt.indexOf('  ')>=0) rslt = rslt.replace(/ {2}/gi,' ');
      rslt = rslt.trim();
    }
  
    return rslt;
  };
  XExt.unescapeHTMLEntity = function(val){
    var obj = document.createElement('textarea');
    obj.innerHTML = val;
    return obj.value;
  };
  XExt.ParseMultiLine = function (val){
    if (!val) return val;
    if (_.isArray(val)) return val.join(' ');
    return val.toString();
  };

  XExt.makeResizableDiv = function(selector, children, options) {
    if(!options) options = { onDrag: null, onDragEnd: null };
    var obj = document.querySelector(selector);
    for(var j=0;j<children.length; j++){
      children[j].obj = document.querySelector(children[j].selector);
    }
    var resizers = document.querySelectorAll(selector + ' .resizer');
    var minimum_size = 100;
    var counter = 0;
    var original_width = 0;
    var original_height = 0;
    var original_x = 0;
    var original_y = 0;
    var original_mouse_x = 0;
    var original_mouse_y = 0;

    for (var i = 0;i < resizers.length; i++) {
      var currentResizer = resizers[i];

      var resize = function(e) {
        counter++;
        if (counter%2) return counter=1; // ignore 50% to perform better
        if (currentResizer.classList.contains('res-ew')) {
          var width = original_width - (e.pageX - original_mouse_x);
          if (width > minimum_size) {
            obj.style.width = width + 'px';
            obj.style.left = original_x + (e.pageX - original_mouse_x) + 'px';
            for(var i=0;i<children.length; i++){
              var correction_x = children[i].correction_x;
              if(_.isFunction(correction_x)) correction_x = correction_x();
              children[i].obj.style.width = (width + correction_x) + 'px';
              children[i].obj.style.left = original_x + (e.pageX - original_mouse_x - correction_x) + 'px';
            }
          }
        }
        else if (currentResizer.classList.contains('res-ns')) {
          var height = original_height - (e.pageY - original_mouse_y);
          if (height > minimum_size) {
            obj.style.height = height + 'px';
            obj.style.top = original_y + (e.pageY - original_mouse_y) + 'px';
            for(var j=0;j<children.length; j++){
              var correction_y = children[j].correction_y;
              if(_.isFunction(correction_y)) correction_y = correction_y();
              children[j].obj.style.height = (height + correction_y) + 'px';
              children[j].obj.style.top = original_y + (e.pageY - original_mouse_y - correction_y) + 'px';
            }
          }
        }
        if(options.onDrag) options.onDrag();
      };

      var stopResize = function() {
        window.removeEventListener('mousemove', resize);
        window.removeEventListener('mouseup', stopResize);
        if(options.onDragEnd) options.onDragEnd();
      };

      currentResizer.addEventListener('mousedown', function(e) {
        e.preventDefault();
        original_width = parseFloat(getComputedStyle(obj, null).getPropertyValue('width').replace('px', ''));
        original_height = parseFloat(getComputedStyle(obj, null).getPropertyValue('height').replace('px', ''));
        original_x = obj.getBoundingClientRect().left;
        original_y = obj.getBoundingClientRect().top;
        original_mouse_x = e.pageX;
        original_mouse_y = e.pageY;
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResize);
      });
    }
  };

  XExt.readCookie = function(id){
    var rslt = [];
    var cookies = document.cookie.split(';');
    var rx=RegExp('^\\s*'+XExt.escapeRegEx(id)+'=\\s*(.*?)\\s*$');
    for(var i=0;i<cookies.length;i++){
      var m = cookies[i].match(rx);
      if(m) rslt.push(m[1]);
    }
    return rslt;
  };

  XExt.GetCookieNameWithSuffix = function(cname){return cname+jsh.cookie_suffix;};
  XExt.GetCookie = function(cname){
    cname= XExt.GetCookieNameWithSuffix(cname);
    var rslt = [];
    var c_a = XExt.readCookie(cname);
    if (c_a.length>0){
      for(var i=0;i<c_a.length;i++) {
        rslt.push(decodeURIComponent(c_a[i]));
      }
    }
    return rslt;
  };
  XExt.SetCookie = function(cname,cvalue,exmin,options){
    cname= XExt.GetCookieNameWithSuffix(cname);
    if(!options) options = {};
    if(!('samesite' in options) && jsh.cookie_samesite) options.samesite = jsh.cookie_samesite;
    if(!('secure' in options)){ if(window.location.protocol=='https:') options.secure = true; }
    var expires = '';
    if (exmin !== 0){
      var d = new Date();
      d.setTime(d.getTime() + (exmin*60*1000));
      expires = ';expires='+ d.toUTCString();
    }
    var cookieval = cname + '=' + encodeURIComponent(cvalue) + expires + ';path='+jsh._BASEURL;
    if('samesite' in options) cookieval += ';samesite=' + options.samesite.toString().toLowerCase();
    if(options.secure) cookieval += ';secure';
    document.cookie = cookieval;
  };
  XExt.ClearCookie = function(cname){
    return XExt.SetCookie(cname,'',-100000);
  };
  XExt.GetSettingsCookie = function(module_name){
    var settings = {};
    try{
      settings = JSON.parse(jsh.XExt.GetCookie('settings')[0]);
    }catch (e) {
      return settings;
    }
    if (!_.isEmpty(module_name)){
      if (settings.hasOwnProperty(module_name)){
        settings = settings[module_name];
      }else {
        settings = {};
      }
    }
    return settings;
  };
  XExt.SetSettingsCookie = function(module_name,cvalue){
    if (typeof module_name === 'undefined' || module_name.length <=0){
      throw 'Please provide module name!';
    }
    var settings = XExt.GetSettingsCookie();
    settings[module_name]=cvalue;
    return XExt.SetCookie('settings',JSON.stringify(settings),XExt.COOKIE_MAX_EXPIRATION);
  };
  XExt.ClearSettingsCookie = function(){
    return XExt.ClearCookie('settings');
  };

  XExt.currentURL = function(){
    var rslt = window.location.href.toString().split(window.location.host)[1];
    rslt = rslt.split('?')[0];
    rslt = rslt.split('#')[0];
    return rslt;
  };


  /******************
   * TREE RENDERING *
   ******************/

  function XTreeNode() {
    this.Children = [];
    this.ID = null;
    this.Value = '';
    this.Text = '';
    this.Expanded = false;
    this.Selected = false;
    this.Icon = '';
    this.LazyRender = false;
  }

  XExt.TreeRender = function (ctrl, LOV, field) {
    var xdctrl = XDom(ctrl);
    //Create Cache of Opened Nodes
    var firstRender = !xdctrl.children.length;
    var expanded_nodes = XExt.TreeGetExpandedNodes(ctrl);
    var selected_nodes = XExt.TreeGetSelectedNodes(ctrl);

    var tree = [];
    var nodes = {};
    var sortednodes = [];
    
    xdctrl.clear();
    if (LOV.length == 0) return;
    
    //Create Tree
    var has_seq = false;
    var lazy_render = (LOV.length >= 500);
    var controlparams = _.extend({}, (field && field.controlparams));
    if('lazy_render' in controlparams) lazy_render = !!controlparams.lazy_render;
    else if (controlparams.expand_all) lazy_render = false;
    
    //Disable item_dropdown if context menu is empty
    if(controlparams.item_dropdown){
      if(field && field.name){
        var xdContextmenu = jsh.xd('._item_context_menu_' + field.name);
        if(!xdContextmenu.length || !xdContextmenu.children.length) controlparams.item_dropdown = false;
      }
    }

    for (var i = 0; i < LOV.length; i++) {
      var iLOV = LOV[i];
      var node = new XTreeNode();
      node.ID = iLOV[jsh.uimap.code_id];
      node.ParentID = iLOV[jsh.uimap.code_parent_id];
      node.Value = iLOV[jsh.uimap.code_val];
      node.Text = iLOV[jsh.uimap.code_txt];
      node.Icon = iLOV[jsh.uimap.code_icon];
      node.Seq = iLOV[jsh.uimap.code_seq];
      node.LazyRender = lazy_render;
      if (node.Seq) has_seq = true;
      if (_.includes(expanded_nodes, (node.Value||'').toString())) node.Expanded = true;
      if (_.includes(selected_nodes, (node.Value||'').toString())) node.Selected = true;
      
      if (!node.ParentID) tree.push(node);
      nodes[node.ID] = node;
      sortednodes.push(node);
    }
    for (var j = 0; j < sortednodes.length; j++) {
      var sortednode = sortednodes[j];
      if (sortednode.ParentID && (sortednode.ParentID in nodes)) nodes[sortednode.ParentID].Children.push(sortednode);
    }
    if (has_seq) sortednodes = _.sortBy(sortednodes, [jsh.uimap.code_seq, jsh.uimap.code_txt]);
    
    var body = '';
    for (var k = 0; k < tree.length; k++) {
      body += XExt.TreeRenderNode(ctrl, tree[k], controlparams);
    }
    var treeid = xdctrl.data.treeid;
    if(!treeid){
      treeid = 1;
      while(jsh.xd('[data-treeid="'+treeid+'"]').length) treeid++;
      xdctrl.data.treeid = treeid;
    }
    xdctrl.html = body;

    function renderLazy(){
      var xdthis = XDom(this);
      //Get node id
      var nodeid = xdthis.data.id;
      //Find node by node id
      var node = nodes[nodeid];
      if(!node) return;
      //Render that node
      var childrenHtml = '';
      _.each(node.Children, function(child){ childrenHtml += XExt.TreeRenderNode(ctrl, child, controlparams); });
      xdthis.class.remove('tree_render_lazy');
      xdthis.off('tree_render_lazy', renderLazy);
      var xdSibChildren = xdthis.nextSibling('.children');
      xdSibChildren.append(childrenHtml);
      XDom(xdSibChildren, '.tree_render_lazy').on('tree_render_lazy', renderLazy);
    }
    XDom(xdctrl, '.tree_render_lazy').on('tree_render_lazy', renderLazy);
    xdctrl.on('tree_path', function(e){
      var treePathInfo = e.detail;
      if(treePathInfo){
        for(var nodeID in nodes){
          var node = nodes[nodeID];
          if(node.Value == treePathInfo.value){
            treePathInfo.path = [node];
            var parentNode = node;
            do {
              if(parentNode.ParentID) parentNode = nodes[parentNode.ParentID];
              else parentNode = null;
              if(parentNode) treePathInfo.path.unshift(parentNode);
            } while(parentNode);
            break;
          }
        }
      }
    });

    if(firstRender){
      if (controlparams.expand_all) XExt.TreeExpandAll(ctrl);
      else if (controlparams.expand_to_selected) XExt.TreeExpandToSelected(ctrl);
    }
    if(controlparams.ondrop) XExt.TreeEnableDrop(ctrl, controlparams.ondrop, controlparams.drag_anchor_settings);
    if(controlparams.onmove) XExt.TreeEnableDrag(ctrl, controlparams.onmove, controlparams.drag_anchor_settings);
  };

  //ondrop(dropval, anchor, e)
  XExt.TreeEnableDrop = function (ctrl, ondrop, drag_anchor_settings) {
    var xdctrl = XDom(ctrl);
    var _treeitems = xdctrl.get('a.tree_item').elements;
    _.each(_treeitems, function(obj){
      var xdobj = XDom(obj);
      var dragCounter = 0;
      xdobj.on('dragenter', function(e){
        dragCounter++;
        if(!xdobj.class.contains('xdragtarget')) xdobj.class.add('xdragtarget');
        e.preventDefault();
        e.stopPropagation();
      });
      xdobj.on('dragleave', function(e){
        dragCounter--;
        if(dragCounter <= 0){
          dragCounter = 0;
          xdobj.class.remove('xdragtarget');
          xdobj.class.remove('xdragtop');
          xdobj.class.remove('xdragbottom');
          xdobj.class.remove('xdragfull');
          xdobj.class.remove('xdragleft');
          xdobj.class.remove('xdragright');
        }
        e.preventDefault();
        e.stopPropagation();
      });
      xdobj.on('dragover', function(e){
        var targetAnchor = XExt.getObjectAnchors(this, jsh.mouseX, jsh.mouseY, drag_anchor_settings);

        xdobj.class.remove('xdragtop');
        xdobj.class.remove('xdragbottom');
        xdobj.class.remove('xdragfull');
        xdobj.class.remove('xdragleft');
        xdobj.class.remove('xdragright');
        if(targetAnchor[0]=='left') xdobj.class.add('xdragleft');
        else if(targetAnchor[0]=='right') xdobj.class.add('xdragright');

        if(targetAnchor[1]=='top') xdobj.class.add('xdragtop');
        else if(targetAnchor[1]=='bottom') xdobj.class.add('xdragbottom');
        else if(targetAnchor[1]=='full') xdobj.class.add('xdragfull');

        e.preventDefault();
        e.stopPropagation();
      });
      xdobj.on('drop', function(e){
        dragCounter = 0;
        xdobj.class.remove('xdragtarget');
        xdobj.class.remove('xdragtop');
        xdobj.class.remove('xdragbottom');
        xdobj.class.remove('xdragfull');
        xdobj.class.remove('xdragleft');
        xdobj.class.remove('xdragright');
        e.preventDefault();
        e.stopPropagation();

        var targetObjVal = xdobj.data.value;
        var targetAnchor = XExt.getObjectAnchors(this, jsh.mouseX, jsh.mouseY, drag_anchor_settings);
        if(ondrop) ondrop(targetObjVal, targetAnchor, e);
      });
    });
    xdctrl.on('drop dragenter dragleave dragover', function(e){
      e.preventDefault();
      e.stopPropagation();
    });
  };

  //onmove(dragval, dropval, anchor, e)
  XExt.TreeEnableDrag = function (ctrl, onmove, drag_anchor_settings) {
    var xdctrl = XDom(ctrl);
    var mouseDownTimer = null;
    var hoverBorderTimer = null;
    var xdTreeItem = XDom(xdctrl, 'a.tree_item');
    //Set up drop points
    xdTreeItem.class.add('xdrop');
    //Check if the target can be used as a drop point
    function mouseCanDrop(target){
      return true;
    }
    //Start drag operation
    xdTreeItem.on('mousedown', function(e){
      if (e.which == 1) {//left mouse button
        var obj = this;
        if(XExt.isMouseWithin(XDom(obj).parent().getElement('.glyph'))) return;
        if(jsh.xContextMenuVisible) return;
        XExt.CancelBubble(e);
        if(mouseDownTimer) window.clearTimeout(mouseDownTimer);
        mouseDownTimer = window.setTimeout(function(){
          if(mouseDownTimer) jsh.mouseDragBegin(obj, mouseCanDrop, e);
        }, 250);
      }
    });
    xdTreeItem.on('mouseup', function(e){
      if(mouseDownTimer) window.clearTimeout(mouseDownTimer);
      if(hoverBorderTimer) window.clearTimeout(hoverBorderTimer);
      mouseDownTimer = null;
      hoverBorderTimer = null;
    });
    //While dragging, update styles on drop points
    var treeid = xdctrl.data.treeid;
    jsh.off('.jsh_tree_'+treeid);
    var hoverBorderStart = 0;
    jsh.on('jsh_mouseDrag.jsh_tree_'+treeid, function(event, mouseDragObj, targetObj, origEvent){
      var xdDragTarget = XDom(xdctrl, '.xdragtarget');
      xdDragTarget.class.remove('xdragtarget');
      xdDragTarget.class.remove('xdragtop');
      xdDragTarget.class.remove('xdragbottom');
      xdDragTarget.class.remove('xdragfull');
      xdDragTarget.class.remove('xdragleft');
      xdDragTarget.class.remove('xdragright');
      //Check if mouse is hovering over tree border
      var offsetTop = xdctrl.calc.top();
      var offsetLeft = xdctrl.calc.left();
      var w = xdctrl.calc.widthToBorder();
      var h = xdctrl.calc.heightToBorder();
      if ((jsh.mouseX >= offsetLeft) && (jsh.mouseX <= (offsetLeft + w))) {
        if ((jsh.mouseY >= offsetTop) && (jsh.mouseY <= (offsetTop + 15))){
          //Hovering over top
          if(!hoverBorderTimer){
            hoverBorderStart = 0;
            hoverBorderTimer = setInterval(function(){
              var nowTime = new Date().getTime();
              if(!hoverBorderStart) hoverBorderStart = nowTime;
              if((nowTime-hoverBorderStart)>300){
                xdctrl.element.scrollTop = (Math.max(xdctrl.element.scrollTop - 15, 0));
              }
            }, 100);
          }
        }
        else if((jsh.mouseY <= (offsetTop + h)) && (jsh.mouseY >= (offsetTop + h - 15))){
          //Hovering over bottom
          if(!hoverBorderTimer){
            hoverBorderStart = 0;
            hoverBorderTimer = setInterval(function(){
              var nowTime = new Date().getTime();
              if(!hoverBorderStart) hoverBorderStart = nowTime;
              if((nowTime-hoverBorderStart)>300){
                xdctrl.element.scrollTop += 15;
              }
            }, 100);
          }
        }
        else{
          if(hoverBorderTimer) window.clearTimeout(hoverBorderTimer);
          hoverBorderTimer = null;
        }
      }
      else{
        if(hoverBorderTimer) window.clearTimeout(hoverBorderTimer);
        hoverBorderTimer = null;
      }


      if(!targetObj) return;
      var xdTargetObj = XDom(targetObj);
      if(xdTargetObj.data.id==XDom.getData(mouseDragObj, 'id')) return;
      XDom.setStyle(jsh.xdroot.getElements('.xdrag'), 'visibility','visible');

      var targetAnchor = XExt.getObjectAnchors(targetObj, jsh.mouseX, jsh.mouseY, drag_anchor_settings);
      xdTargetObj.class.add('xdragtarget');

      if(targetAnchor[0]=='left') xdTargetObj.class.add('xdragleft');
      else if(targetAnchor[0]=='right') xdTargetObj.class.add('xdragright');

      if(targetAnchor[1]=='top') xdTargetObj.class.add('xdragtop');
      else if(targetAnchor[1]=='bottom') xdTargetObj.class.add('xdragbottom');
      else if(targetAnchor[1]=='full') xdTargetObj.class.add('xdragfull');
    });
    //On Drop
    jsh.on('jsh_mouseDragEnd.jsh_tree_'+treeid,function(event, mouseDragObj, targetObj, origEvent){
      XDom(xdctrl, '.xdragtarget').class.remove('xdragtarget');
      if(!targetObj) return;
      if(XDom.getData(targetObj, 'id')==XDom.getData(mouseDragObj, 'id')) return;
      var targetObjId = XDom.getData(targetObj, 'id');
      if(targetObjId==mouseDragObj) return;

      var mouseDragObjVal = XDom.getData(mouseDragObj, 'value');
      var targetObjVal = XDom.getData(targetObj, 'value');
      
      var targetAnchor = XExt.getObjectAnchors(targetObj, jsh.mouseX, jsh.mouseY, drag_anchor_settings);

      if(onmove) onmove(mouseDragObjVal, targetObjVal, targetAnchor, origEvent);
    });
  };

  XExt.TreeRenderNode = function (ctrl, n, controlparams) {
    var children = '';
    if(n.Expanded || !n.LazyRender){
      for (var i = 0; i < n.Children.length; i++) {
        children += XExt.TreeRenderNode(ctrl, n.Children[i], controlparams);
      }
    }
    var item_dropdown_html = '';
    if(controlparams && controlparams.item_dropdown){
      item_dropdown_html = '<div class="tree_item_dropdown_container"><div class="tree_item_dropdown"  data-value="<%=n.Value%>" onclick=\'<%-instance%>.XExt.TreeItemContextMenu(this,<%-JSON.stringify(n.ID)%>,{ top: <%-instance%>.XDom.calc.top(this)+<%-instance%>.XDom.calc.heightToBorder(this)-1, left: <%-instance%>.XDom.calc.left(this), hideIfOpen: true });event.preventDefault();event.stopPropagation();event.stopImmediatePropagation(); return false;\'>'+XExt.escapeHTML(controlparams.item_dropdown.caption || 'Actions')+'</div></div>';
    }
    var getNodeContent = function(){
      var rslt = XExt.escapeHTML(n.Text);
      if(controlparams && controlparams.ongetnodecontent) rslt = controlparams.ongetnodecontent(n, rslt);
      if(!rslt) rslt = XExt.escapeHTML('\u00A0');
      return rslt;
    };
    var rslt = jsh.ejs.render('\
      <a href="#" class="tree_item tree_item_<%=n.ID%> <%=(n.Children.length && (n.LazyRender&&!n.Expanded)?"tree_render_lazy":"")%> <%=(n.Children.length==0?"nochildren":"")%> <%=(n.Expanded?"expanded":"")%> <%=(n.Selected?"selected":"")%>" data-id="<%=n.ID%>" data-value="<%=n.Value%>" onclick=\'<%-instance%>.XExt.TreeSelectNode(this,<%-JSON.stringify(n.Value)%>,{ source: "click" }); return false;\' oncontextmenu=\'return <%-instance%>.XExt.TreeItemContextMenu(this,<%-JSON.stringify(n.ID)%>);\'><div class="glyph" href="#" onclick=\'<%-instance%>.XExt.CancelBubble(arguments[0]); <%-instance%>.XExt.TreeToggleNode(<%-instance%>.XDom(this).parent(".xform_ctrl.tree").element,<%-JSON.stringify(n.ID)%>); return false;\'><%-(n.Expanded?"&#x25e2;":"&#x25b7;")%></div><% if(n.Icon){ %><img class="icon" src="<%-jsh._PUBLICURL%>images/icon_<%=n.Icon%>.png" /><% } %><span>'+item_dropdown_html+'<%-getNodeContent()%></span></a>\
      <div class="children <%=(n.Expanded?"expanded":"")%> tree_item_<%=n.ID%>" data-id="<%=n.ID%>" data-value="<%=n.Value%>"><%-children%></div>',
    { n: n, children: children, jsh: jsh, instance: jsh.getInstance(), getNodeContent: getNodeContent }
    );
    return rslt;
  };

  XExt.isMobile = function(userAgent){
    if(typeof userAgent == 'undefined') userAgent = navigator.userAgent;
    userAgent = (userAgent||'').toLowerCase();
    return (/android|iphone|ipad|ipod|blackberry|iemobile|opera mini|webos|mobi/i.test(userAgent));
  };

  XExt.getJSLocals = function(modelid){
    modelid = XExt.resolveModelID(modelid);
    var rslt = jsh.jslocals;
    if(modelid) rslt += "var modelid = '"+modelid+"'; var _this = jsh.App[modelid]; var xmodel = jsh.XModels[modelid]; ";
    return rslt;
  };

  XExt.getJSApp = function(modelid,quotechar){
    modelid = XExt.resolveModelID(modelid);
    if(typeof quotechar=='undefined') quotechar = '\'';
    return jsh._instance + '.App[' + quotechar + modelid + quotechar + ']';
  };

  XExt.JSEval = function(str,_thisobj,params){
    if(!_thisobj) _thisobj = jsh;
    if(!params) params = {};
    if('modelid' in params) params.modelid = XExt.resolveModelID(params.modelid);
    var paramstr = '';
    if(params){
      for(var param in params){
        paramstr += 'var '+param+'=params.'+param+';';
      }
    }
    var jscmd = '(function(){'+XExt.getJSLocals(params.modelid)+paramstr+'return (function(){'+str+'})();}).call(_thisobj)';
    return eval(jscmd);
  };

  XExt.wrapJS = function(code,modelid,options){
    modelid = XExt.resolveModelID(modelid);
    options = _.extend({ returnFalse: true }, options);
    return 'return (function(){'+XExt.escapeHTML(XExt.getJSLocals(modelid))+' '+XExt.unescapeEJS(XExt.escapeHTML(code))+'; '+(options.returnFalse?'return false;':'')+' }).call(this);';
  };

  XExt.TreeItemContextMenu = function (ctrl, n, contextMenuOptions) {
    var xdctrl = XDom(ctrl);
    var xdtree = xdctrl.parent('.xform_ctrl.tree');
    var fieldname = XExt.getFieldNameFromObject(ctrl);
    var menuid = '._item_context_menu_' + fieldname;
    if(xdtree.data.oncontextmenu) {
      var f = (new Function('n', xdtree.data.oncontextmenu));
      var frslt = f.call(ctrl, n);
      if((frslt === false) || (frslt===true)) return frslt;
    }
    if (jsh.xd(menuid).length) {
      if(contextMenuOptions && contextMenuOptions.hideIfOpen){
        if(jsh.xd(menuid).isVisible()){
          XExt.HideContextMenu();
          return false;
        }
      }
      XExt.ShowContextMenu(menuid, xdctrl.data.value, { id:n }, contextMenuOptions);
      return false;
    }
    return true;
  };

  XExt.TreeDoubleClickNode = function (ctrl, n) {
    var xdctrl = XDom(ctrl);
    var xdtree = xdctrl.parent('.xform_ctrl.tree');
    if(xdtree.data.ondoubleclick) { var rslt = (new Function('n', xdtree.data.ondoubleclick)); rslt.call(ctrl, n); }
  };

  XExt.TreeGetSelectedNodes = function (ctrl) {
    var rslt = [];
    XDom(ctrl, '.tree_item.selected').elements.forEach(function(el) {
      var val = XDom.getData(el, 'value');
      if (val) rslt.push(val.toString());
    });
    return rslt;
  };

  XExt.TreeGetExpandedNodes = function (ctrl) {
    var rslt = [];
    XDom(ctrl, '.tree_item.expanded').elements.forEach(function(el) {
      var val = XDom.getData(el, 'value');
      if (val) rslt.push(val.toString());
    });
    return rslt;
  };

  XExt.TreeSelectNode = function (ctrl, nodevalue, options) {
    if(!options) options = { triggerChange: true, source: '' };
    if(!('triggerChange' in options)) options.triggerChange = true;

    var xdctrl = XDom(ctrl);

    if(options.source=='click'){
      var curClick = (new Date()).getTime();
      var startX = jsh.mouseX;
      var startY = jsh.mouseY;
      var lastClick = parseInt(xdctrl.data.lastclick||0);
      xdctrl.data.lastclick = curClick.toString();

      if((curClick-lastClick)<=XExt.DOUBLECLICK_TIMEOUT){
        XExt.TreeDoubleClickNode(ctrl, xdctrl.data.id);
        xdctrl.data.lastclick = '';
      }
      else {
        XExt.handleOnce(jsh.xLoader.onMouseDown, function(e){
          var loaderClick = (new Date()).getTime();
          if(xdctrl.data.lastclick && ((loaderClick-curClick)<=XExt.DOUBLECLICK_TIMEOUT)){
            var diffX = Math.abs(jsh.mouseX - startX);
            var diffY = Math.abs(jsh.mouseY - startY);
            if((diffX <= 8) && (diffY <= 8)){
              XExt.TreeDoubleClickNode(ctrl, xdctrl.data.id);
              xdctrl.data.lastclick = '';
            }
          }
        });
      }
    }
    
    var xform = XExt.getFormFromObject(ctrl);
    var fieldname = XExt.getFieldNameFromObject(ctrl);
    var field = undefined;
    if (xform && fieldname) field = xform.Data.Fields[fieldname];
    
    var xdtree = xdctrl.parent('.xform_ctrl.tree');
    if (xdtree.class.contains('uneditable')) return;

    //Deselect previously selected value
    XDom(xdtree, '.selected').class.remove('selected');

    var nodeid = undefined;
    if(nodevalue){
      //Get nodeid from nodevalue
      var findNode = function(){ xdtree.get('.tree_item').elements.forEach(function(el){ if(XDom.getData(el, 'value')==nodevalue) nodeid = XDom.getData(el, 'id'); }); };
      findNode();

      if(typeof nodeid == 'undefined'){
        //Lazy evaluation
        var treePathInfo = { value: nodevalue };
        xdtree.emit('tree_path', treePathInfo);
        _.each(treePathInfo.path, function(node){
          var xdtreenode = XDom(xdtree, '.tree_item_'+node.ID);
          if(xdtreenode.class.contains('tree_render_lazy')) xdtreenode.emit('tree_render_lazy');
        });
        findNode();
        if(typeof nodeid == 'undefined') return;
      }
      XDom(xdtree, '.tree_item.tree_item_' + nodeid).class.add('selected');
      if (field && field.controlparams) {
        if (field.controlparams.expand_to_selected) XExt.TreeExpandToSelected(ctrl);
      }
    }

    //Fire events
    if (field && jsh.init_complete) {
      if(xform && xform.Data && options.triggerChange) xform.Data.OnControlUpdate(ctrl);
    }
    if((typeof nodeid !== 'undefined') && xdtree.data.onselected) { var rslt = (new Function('nodeid', xdtree.data.onselected)); rslt.call(ctrl, nodeid); }
  };

  XExt.TreeToggleNode = function (ctrl, nodeid) {
    var xdctrl = XDom(ctrl).parent('.xform_ctrl.tree');
    if (XDom(xdctrl, '.children.tree_item_' + nodeid).class.contains('expanded'))
      XExt.TreeCollapseNode(xdctrl.element, nodeid);
    else
      XExt.TreeExpandNode(xdctrl.element, nodeid);
  };

  XExt.TreeCollapseNode = function (ctrl, nodeid) {
    var xdctrl = XDom(ctrl).parent('.xform_ctrl.tree');
    XDom(xdctrl, '.tree_item_' + nodeid).class.remove('expanded');
    XDom(xdctrl, '.tree_item.tree_item_' + nodeid + ' > .glyph').html = '&#x25b7;';
  };

  XExt.TreeExpandNode = function (ctrl, nodeid) {
    var xdctrl = XDom(ctrl).parent('.xform_ctrl.tree');
    var xdTreenode = XDom(xdctrl, '.tree_item_' + nodeid);
    if(xdTreenode.class.contains('tree_render_lazy')) xdTreenode.emit('tree_render_lazy');
    xdTreenode.class.add('expanded');
    XDom(xdctrl, '.tree_item.tree_item_' + nodeid + ' > .glyph').html = '&#x25e2;';
  };

  XExt.TreeExpandToSelected = function (ctrl) {
    var toptree = XDom(ctrl).parent('.xform_ctrl.tree');
    var rslt = [];
    toptree.get('.tree_item.selected').elements.forEach(function(el){
      var xdParent = XDom(el).parent();
      while (xdParent.length && (xdParent.element != toptree.element)) {
        XExt.TreeExpandNode(toptree.element, xdParent.data.id);
        xdParent = xdParent.parent();
      }
    });
    return rslt;
  };
  XExt.TreeExpandAll = function (ctrl) {
    var xdctrl = XDom(ctrl).parent('.xform_ctrl.tree');
    var xdTreeItem = XDom(xdctrl, '.tree_item');
    if(!xdctrl.get('.tree_render_lazy').elements.length){
      xdTreeItem.class.add('expanded');
      XDom(xdctrl, '.children').class.add('expanded');
      XDom(xdctrl, '.glyph').html = '&#x25e2;';
    }
    else{
      var unexpanded = xdTreeItem.omit('.expanded');
      var i = 0;
      while(unexpanded.length){
        i++;
        if(i>1000)break;
        unexpanded.elements.forEach(function(el){ XExt.TreeExpandNode(xdctrl.element, XDom.getAttribute(el, 'data-id')); });
        unexpanded = xdTreeItem.omit('.expanded');
      }
    }
  };

  /*********************
   * GENERAL FUNCTIONS *
   *********************/

  XExt.getMaxLength = function (field) {
    var rslt = -1;
    if ('type' in field) {
      var ftype = field.type;
      if ((ftype == 'varchar' || ftype == 'char') && ('length' in field)) rslt = field.length;
      else if (ftype == 'bigint') rslt = 25;
      else if (ftype == 'datetime') rslt = 50;
      else if (ftype == 'time') rslt = 50;
      else if (ftype == 'date') rslt = 50;
      else if (ftype == 'decimal'){
        rslt = 40;
        var prec_h = 38;
        var prec_l = 4;
        if ('precision' in field) {
          prec_h = field.precision[0];
          prec_l = field.precision[1];
        }
        rslt = prec_h + 2 + prec_l;
      }
      else if (ftype == 'float'){ rslt = 128; }
      else if (ftype == 'int') rslt = 15;
      else if (ftype == 'smallint') rslt = 10;
      else if (ftype == 'tinyint') rslt = 3;
      else if (ftype == 'boolean') rslt = 5;
      else if ((ftype == 'binary') && ('length' in field)) rslt = field.length * 2 + 2;

    }
    return rslt;
  };

  XExt.getTypedFieldValue = function (field, value){
    if(!field || !field.type) return value;
    if(XExt.isNullUndefined(value)) return value;
    if (_.includes(['varchar', 'char', 'binary', 'hash'], field.type)) return value.toString();
    else if (_.includes(['bigint', 'int', 'smallint', 'tinyint'], field.type)) return parseInt(value);
    else if (_.includes(['decimal', 'float'], field.type)) return parseFloat(value);
    else if (field.type == 'time'){
      var timestr = jsh.XFormat.time_decode(null, value);
      if(XExt.isNullUndefined(timestr)) return timestr;
      return new Date(timestr);
    }
    else if (_.includes(['datetime', 'date'], field.type)){
      var dtstr = jsh.XFormat.date_decode(null, value);
      if(XExt.isNullUndefined(dtstr)) return dtstr;
      return new Date(dtstr);
    }
    else if (field.type == 'boolean') return jsh.XFormat.bool_decode(value);
    return value;
  };

  XExt.getFieldByName = function (model, fieldname){
    if(!model || !model.fields) return null;
    if(model.fields.length){
      for(var i=0;i<model.fields.length;i++){
        if(model.fields[i] && (model.fields[i].name==fieldname)) return model.fields[i];
      }
    }
    else {
      if(fieldname in model.fields) return model.fields[fieldname];
    }
    return null;
  };

  XExt.XInputAction = function (_obj, _overrideFunc) {
    this.obj = _obj;
    this.tstamp = Date.now();
    this.mouseX = jsh.mouseX;
    this.mouseY = jsh.mouseY;
    this.mouseDown = jsh.mouseDown;
    this.overrideFunc = _overrideFunc;
  };

  XExt.XInputAction.prototype.Exec = function () {
    var _this = this;
    if (_this.obj) _this.obj.focus();
    if (this.overrideFunc) this.overrideFunc();
    else if (_this.obj && _this.mouseDown) {
      XExt.Click(_this.obj, _this.mouseX, _this.mouseY);
    }
  };

  XExt.XInputAction.prototype.IsExpired = function () {
    return ((Date.now() - this.tstamp) > 500);
  };

  XExt.getLastClicked = function () {
    var is_recent_click = (Date.now() - jsh.last_clicked_time) < 100;
    if (jsh.last_clicked && is_recent_click) return jsh.last_clicked;
    return undefined;
  };

  XExt.Click = function (obj, x, y) {
    window.setTimeout(function () {
      obj.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window
      }));
      obj.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window
      }));
      obj.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      }));
    }, 1);
  };

  XExt.isIOS = function () {
    if ((navigator.userAgent.match(/iPhone/i)) ||
        (navigator.userAgent.match(/iPod/i)) ||
        (navigator.userAgent.match(/iPad/i))) {
      return true;
    }
  };

  XExt.clearDialogs = function(){
    _.each(jsh.xDialog, function(xdialog){
      if(xdialog.onDestroy) xdialog.onDestroy();
    });
    jsh.xDialog = [];
    XDom(jsh.xdDialogBlock, '.xdialogbox').remove();
    jsh.xdDialogBlock.style.display = false;
  };

  XExt.dialogButtonFunc = function (obj, oldactive, onComplete, params) {
    if (!params) params = {};
    var rslt = function () {
      //Delete duplicates from stack
      for (var i = 0; i < jsh.xDialog.length; i++) {
        for (var j = 0; j < i; j++) {
          if (jsh.xDialog[j].obj == jsh.xDialog[i].obj) {
            jsh.xDialog.splice(i, 1);
            i--;
            break;
          }
        }
      }
      //Verify this is the topmost dialog
      if ((jsh.xDialog.length > 0) && (jsh.xDialog[0].obj != obj)) return;
      if(jsh.xDialog[0].onDestroy) jsh.xDialog[0].onDestroy();

      if (jsh.xDialog.length == 1) { jsh.xdDialogBlock.style.display = false; }
      if (jsh.xDialog[0].obj != obj) {
        alert('ERROR - Invalid Dialog Stack');
        console.log(obj); // eslint-disable-line no-console
        console.log(jsh.xDialog); // eslint-disable-line no-console
      }
      if(oldactive) XDom.focus(oldactive);
      window.setTimeout(function () { jsh.xDialog.shift(); if (onComplete) onComplete(); }, 1);
      if (params.onCompleteImmediate) params.onCompleteImmediate();
    };
    if(!params.onClosing) return rslt;
    return function(){
      params.onClosing(rslt);
    };
  };

  XExt.getDialogContainer = function (sel) {
    var xdobj = XDom(sel);
    if(!xdobj.length) return window;
    var xdDialog = xdobj.parent('.xdialogbox');
    if(!xdDialog.length) return window;
    return xdDialog.element;
  };

  /**
   * Retrieves and wraps a template element
   *
   * @param {String} sel - The CSS selector used to find the template
   * @returns {XDom} An XDom wrapped template
   */
  XExt.renderTemplate = function (sel) {
    var tmpl = XDom(jsh.xdDialogBlock, sel).innerHTML;
    var container = document.createElement('div');
    container.innerHTML = tmpl||'';
    if(container.children.length != 1) return XDom(container);
    return XDom(container.children[0]);
  };

  XExt.Alert = function (obj, onAccept, options) {
    options = _.extend({
      escapeHTML: true,
      style: '',
      button_ok_caption: 'OK',
      autohide: false, //Timeout in ms, ex. 3000
    }, options);
    var msg = '';
    if (_.isString(obj)) msg = obj;
    else msg = JSON.stringify(obj);
    if(options.escapeHTML){
      msg = XExt.escapeHTML(msg);
      msg = XExt.ReplaceAll(XExt.ReplaceAll(msg, '\n', '<br/>'), '\r', '');
    }
    //alert(msg);
    var xdobj = XExt.renderTemplate('script.template_xalertbox');
    var alertBox = xdobj.element;
    var xDialogObj = {
      obj: alertBox,
      onDestroy: function(){ xdobj.remove(); },
    };
    jsh.xDialog.unshift(xDialogObj);
    xdobj.attr.style = options.style;
    xdobj.style.zIndex = jsh.xDialog.length;
    var oldactive = document.activeElement;
    XDom(oldactive).blur();
    XDom(xdobj, '.xalertmessage').html = msg;
    var isClosing = false;
    var acceptfunc = function(){
      isClosing = true;
      XExt.dialogButtonFunc(alertBox, oldactive, onAccept, { onCompleteImmediate: options.onAcceptImmediate })();
    };
    var xdInput = XDom(xdobj, 'input');
    xdInput.on('click', acceptfunc);
    xdInput.on('keydown', function (e) { if (e.keyCode == 27) { acceptfunc(); } });

    var xdBtnOK = XDom(xdobj, 'input.button_ok');
    if (options.button_ok_caption){
      xdBtnOK.style.display = true;
      xdBtnOK.value = options.button_ok_caption;
    }
    else xdBtnOK.style.display = false;

    xdobj.on('acceptDialog', acceptfunc);
    
    jsh.xdDialogBlock.element.appendChild(alertBox);
    xdobj.style.display = true;
    jsh.xdDialogBlock.style.display = true;
    jsh.XWindowResize();
    if (!XExt.isIOS()) {
      xdInput.focus();
    }
    if(options.autohide) setTimeout(function(){ if(!isClosing) acceptfunc(); }, options.autohide);
  };

  XExt.Confirm = function (obj, onYes, onNo, options) {
    var default_options = {
      button_ok_caption: 'Yes',
      button_no_caption: 'No',
      button_cancel_caption: 'Cancel',
      message_type: 'text'
    };
    if(!options || !options.onCancel){
      default_options.button_cancel_caption = 'No';
    }
    options = _.extend(default_options, options);
    var msg = '';
    if (obj && _.isString(obj)) msg = obj;
    else msg = JSON.stringify(obj);
    if(options.message_type=='html'){ /* Do nothing */ }
    else {
      msg = XExt.escapeHTML(msg);
      msg = XExt.ReplaceAll(XExt.ReplaceAll(msg, '\n', '<br/>'), '\r', '');
    }
    //if (window.confirm(msg)) { if (onYes) onYes(); }
    //if (onNo) onNo();
    var oldactive = document.activeElement;
    XDom(oldactive).blur();

    var xdobj = XExt.renderTemplate('script.template_xconfirmbox');
    var confirmBox = xdobj.element;

    var xDialogObj = {
      obj: confirmBox,
      onDestroy: function(){ xdobj.remove(); },
    };
    jsh.xDialog.unshift(xDialogObj);
    xdobj.style.zIndex = jsh.xDialog.length;

    // prep content, values, and handlers for confirm box
    XDom(xdobj, '.xconfirmmessage').html = msg;
    var cancelfunc = XExt.dialogButtonFunc(confirmBox, oldactive, (options.onCancel ? options.onCancel : onNo));
    var acceptfunc = XExt.dialogButtonFunc(confirmBox, oldactive, onYes);
    var xdBtnOK = XDom(xdobj, 'input.button_ok');
    var xdBtnNo = XDom(xdobj, 'input.button_no');
    var xdBtnCancel = XDom(xdobj, 'input.button_cancel');
    if(options.onCancel){
      xdBtnCancel.style.display = true;
      xdBtnCancel.on('click', XExt.dialogButtonFunc(confirmBox, oldactive, options.onCancel));
    }
    else xdBtnCancel.style.display = false;
    if (options.button_ok_caption) xdBtnOK.value = options.button_ok_caption;
    if (options.button_no_caption) xdBtnNo.value = options.button_no_caption;
    if (options.button_cancel_caption) xdBtnCancel.value = options.button_cancel_caption;
    xdobj.on('acceptDialog', acceptfunc);
    xdobj.on('cancelDialog', cancelfunc);
    xdBtnOK.on('click', acceptfunc);
    xdBtnNo.on('click', XExt.dialogButtonFunc(confirmBox, oldactive, onNo));
    XDom(xdobj, 'input').on('keydown', function (e) { if (e.keyCode == 27) { cancelfunc(); } });
    
    jsh.xdDialogBlock.element.appendChild(confirmBox);
    xdobj.style.display = true;
    jsh.xdDialogBlock.style.display = true;
    jsh.XWindowResize();
    if (!XExt.isIOS()) xdBtnOK.focus();
  };

  XExt.stringify = function (origvalue, replacer, space) {
    // Handle circular JSON structures
    var cache = [];
    return JSON.stringify(origvalue, function(key, value){
      if (typeof value === 'object' && value !== null) {
        if (cache.indexOf(value) !== -1) {
          // Duplicate reference found
          try {
            // If this value does not reference a parent it can be deduped
            return JSON.parse(JSON.stringify(value));
          } catch (error) {
            // discard key if value cannot be deduped
            return;
          }
        }
        // Store value in our collection
        cache.push(value);
      }
      if(replacer) return replacer(key, value);
      return value;
    }, space);
  };

  XExt.Prompt = function (obj, dflt, onComplete) {
    var msg = '';
    if (obj && _.isString(obj)) msg = obj;
    else msg = JSON.stringify(obj);
    
    if (!dflt) dflt = '';
    if (!_.isString(dflt)) dflt = JSON.stringify(dflt);
    
    msg = XExt.escapeHTML(msg);
    msg = XExt.ReplaceAll(XExt.ReplaceAll(msg, '\n', '<br/>'), '\r', '');
    //var rslt = window.prompt(msg, dflt);
    //If cancel or close, rslt = null
    //if (onComplete) onComplete(rslt);
    var xdobj = XExt.renderTemplate('script.template_xpromptbox');
    var promptBox = xdobj.element;

    var xDialogObj = {
      obj: promptBox,
      onDestroy: function(){ xdobj.remove(); },
    };
    jsh.xDialog.unshift(xDialogObj);
    xdobj.style.zIndex = jsh.xDialog.length;
    
    var oldactive = document.activeElement;
    XDom(oldactive).blur();
    XDom(xdobj, '.xpromptmessage').html = msg;
    var xdPromptField = XDom(xdobj, '.xpromptfield');
    xdPromptField.value = dflt;
    var cancelfunc = XExt.dialogButtonFunc(promptBox, oldactive, function () { if (onComplete) onComplete(null); });
    var acceptfunc = XExt.dialogButtonFunc(promptBox, oldactive, function () { if (onComplete) onComplete(xdPromptField.value); });
    XDom(xdobj, 'input.button_ok').on('click', acceptfunc);
    XDom(xdobj, 'input.button_cancel').on('click', cancelfunc);

    xdobj.on('acceptDialog', acceptfunc);
    xdobj.on('cancelDialog', cancelfunc);

    XDom(xdobj, 'input').on('keydown', function (e) { if (e.keyCode == 27) { cancelfunc(); } });
    xdPromptField.on('keydown', function (e) { if (e.keyCode == 13) { acceptfunc(); } });
    
    jsh.xdDialogBlock.element.appendChild(promptBox);
    xdobj.style.display = true;
    jsh.xdDialogBlock.style.display = true;
    jsh.XWindowResize();
    xdPromptField.focus();
  };

  //html - HTML or Element
  XExt.CustomPrompt = function (sel, html, onInit, onAccept, onCancel, onClosed, options) {
    options = _.extend({ backgroundClose: false, restoreFocus: true, onClosing: null, asyncInit: false }, options);
    if(options.specialKeys === false) options.specialKeys = { enter: false, escape: false };
    else options.specialKeys = _.extend({ enter: true, escape: true }, options.specialKeys);

    var reuse = false;
    var customPrompt = null;
    //Classes - default_focus, button_ok, button_cancel
    if(_.isString(html)){
      customPrompt = XDom.render(html.trim());
      if(!customPrompt) customPrompt = document.createElement('div');
    }
    else {
      reuse = true;
      customPrompt = html;
      if(!customPrompt) customPrompt = document.createElement('div');
      for(var j=0;j<jsh.xDialog.length;j++){
        if(jsh.xDialog[j].obj == customPrompt){
          if(jsh.xDialog[j].onDestroy) jsh.xDialog[j].onDestroy({ recycle: true });
          jsh.xDialog.splice(j, 1);
          j--;
        }
      }
    }

    var onDestroy = function(options /* { recycle: false }  */ ){
      options = options || { recycle: false };
      // We always remove handlers even if reuse is false. This is to remove handlers applied beyond the obj (xdialogblock)
      xDialogObj.handlers.forEach(function(obj) {
        XDom.off(obj.target, obj.eventName, obj.handler);
      });
      if(!options.recycle){
        if(reuse) XDom.style.display(customPrompt, false);
        else XDom.remove(customPrompt);
      }
    };

    var xdobj = XDom(customPrompt);
    var xDialogObj = {
      obj: customPrompt,
      handlers: [],
      onDestroy: onDestroy,
    };
    //ShowDialog
    jsh.xDialog.unshift(xDialogObj);
    xdobj.style.zIndex = jsh.xDialog.length;

    var oldactive = document.activeElement;
    XDom(oldactive).blur();
    oldactive = options.restoreFocus ? oldactive : undefined;

    var cancelDialogFunc = function(_onClosed){
      XExt.dialogButtonFunc(customPrompt, oldactive, function () {
        if (onClosed) onClosed(xDialogObj);
        if (_onClosed) _onClosed(xDialogObj);
      }, { onClosing: options.onClosing })();
    };
    var cancelfunc = xDialogObj.cancelfunc = function(options, _onClosed){
      options = _.extend({ force: false }, options);
      options.forceCancel = function(){ cancelfunc({ force: true }); };
      if (onCancel){
        if((onCancel(options)===false) && !options.force) return;
      }
      cancelDialogFunc(_onClosed);
    };
    var acceptfunc_aftervalidate = function(_onClosed){
      XExt.dialogButtonFunc(customPrompt, oldactive, function () {
        if (onClosed) onClosed(xDialogObj);
        if (_onClosed) _onClosed(xDialogObj);
      }, { onClosing: options.onClosing })();
    };
    var acceptfunc = xDialogObj.acceptfunc = function (_onClosed) {
      //Verify this is the topmost dialog
      if ((jsh.xDialog.length > 0) && (jsh.xDialog[0].obj != customPrompt)) return;
      
      if (onAccept) return onAccept(function () { acceptfunc_aftervalidate(_onClosed); });
      else acceptfunc_aftervalidate(_onClosed);
    };
    var bindDialogHandler = xDialogObj.bindDialogHandler = function bindDialogHandler(tgt, eventName, handler){
      XDom.on(tgt, eventName, handler);
      if(reuse) xDialogObj.handlers.push({target: tgt, eventName: eventName, handler: handler});
    };
    XExt.execif(true,
      function(done){
        jsh.xdDialogBlock.element.appendChild(customPrompt);
        if(onInit && options.asyncInit){
          onInit(xDialogObj, done);
        }
        else {
          if (onInit) onInit(xDialogObj);
          return done();
        }
      },
      function(){
        bindDialogHandler(XDom(xdobj, 'input.button_ok'), 'click', function(){ acceptfunc(); });
        bindDialogHandler(XDom(xdobj, 'input.button_cancel'), 'click', function(){ cancelfunc(); });
        bindDialogHandler(xdobj, 'acceptDialog', function(){ acceptfunc(); });
        bindDialogHandler(xdobj, 'cancelDialog', function(){ cancelfunc(); });
        bindDialogHandler(XDom(xdobj, 'input, textarea, select'), 'keydown', function (e) {
          if (options.specialKeys.escape && (e.keyCode == 27)) { e.preventDefault(); e.stopImmediatePropagation(); cancelfunc(); }
        });
        bindDialogHandler(XDom(xdobj, 'input:not([type="checkbox"]):not([type="button"])'), 'keydown', function (e) {
          if (options.specialKeys.enter && (e.keyCode == 13)) { e.preventDefault(); e.stopImmediatePropagation(); acceptfunc(); }
        });

        if(options.backgroundClose){
          
          bindDialogHandler(jsh.xdDialogBlock, 'mousedown', function(e){
            var xdTarget = XDom(e.target);
            if(!(xdTarget.class.contains('xdialogoverlay') || xdTarget.class.contains('xdialogblock'))) return;
            var mouseDownTime = new Date().getTime();
            jsh.xdDialogBlock.on('mouseup', (function mouseUpHandler(e){
              jsh.xdDialogBlock.off('mouseup', mouseUpHandler);
              var mouseUpTime = new Date().getTime();
              if((mouseUpTime - mouseDownTime) > 5000) return;
              if(!(xdTarget.class.contains('xdialogoverlay') || xdTarget.class.contains('xdialogblock'))) return;
              if(jsh.xDialog.length && (jsh.xDialog[0].obj==customPrompt)){ e.preventDefault(); e.stopImmediatePropagation(); cancelfunc(); }
            }));
          });
        }
        xdobj.style.display = true;
        jsh.xdDialogBlock.style.display = true;
        if(jsh.XPage && jsh.XPage.LayoutOneColumn) jsh.XPage.LayoutOneColumn(customPrompt, { reset: true });
        jsh.XWindowResize();
        setTimeout(function(){
          jsh.XWindowResize();
          var xdDefaultFocus = XDom(xdobj, '.default_focus');
          if(xdDefaultFocus.length) xdDefaultFocus.focus();
          else XDom(xdobj, 'input,textarea,select').filter(XDom.isVisible).first().focus();
        }, 1);
      }
    );
  };

  XExt.AcceptDialog = function(){
    if(!jsh.xDialog.length) throw new Error('No dialog currently active');
    XDom(jsh.xDialog[0].obj).emit('acceptDialog');
  };

  XExt.CancelDialog = function(){
    if(!jsh.xDialog.length) throw new Error('No dialog currently active');
    XDom(jsh.xDialog[0].obj).emit('cancelDialog');
  };

  XExt.ZoomEdit = function (val, caption, options, onAccept, onCancel) {
    if(!options) options = {};
    if(!val) val = '';
    val = val.toString();
    var xdobj = XExt.renderTemplate('script.template_xtextzoombox');
    var textZoomBox = xdobj.element;

    var xDialogObj = {
      obj: textZoomBox,
      onDestroy: function(){ xdobj.remove(); },
    };
    jsh.xDialog.unshift(xDialogObj);
    xdobj.style.zIndex = jsh.xDialog.length;
    
    var oldactive = document.activeElement;
    XDom(oldactive).blur();
    XDom(xdobj, '.xtextzoommessage').html = caption;
    var xdTextZoomField = XDom(xdobj, '.xtextzoomfield');
    xdTextZoomField.value = val;
    
    
    if(options.readonly) {
      xdTextZoomField.attr.readonly = 'readonly';
      xdTextZoomField.class.remove('editable');
      xdTextZoomField.class.add('uneditable');
    }
    else {
      xdTextZoomField.class.remove('uneditable');
      xdTextZoomField.class.add('editable');
    }
    var cancelfunc = XExt.dialogButtonFunc(textZoomBox, oldactive, function () { if (onCancel) onCancel(); });
    var acceptfunc = XExt.dialogButtonFunc(textZoomBox, oldactive, function () { if (onAccept) onAccept(xdTextZoomField.value); });
    XDom(xdobj, 'input.button_ok').on('click', acceptfunc);
    XDom(xdobj, 'input.button_cancel').on('click', cancelfunc);
    XDom(xdobj, 'input').on('keydown', function (e) { if (e.keyCode == 27) { cancelfunc(); } });
    jsh.xdDialogBlock.element.appendChild(textZoomBox);
    xdobj.style.display = true;
    jsh.xdDialogBlock.style.display = true;
    jsh.XWindowResize();
    xdTextZoomField.focus();
  };

  XExt.ShowHints = function (lov, caption, options, onInsert, onCancel) {
    if(!options) options = {};
    if(!lov) lov = [];
    var xdobj = XExt.renderTemplate('script.template_xhintsbox');
    var hintsBox = xdobj.element;

    var xDialogObj = {
      obj: hintsBox,
      onDestroy: function(){ xdobj.remove(); },
    };
    jsh.xDialog.unshift(xDialogObj);
    xdobj.style.zIndex = jsh.xDialog.length;

    var oldactive = document.activeElement;
    XDom(oldactive).blur();
    XDom(xdobj, '.xhintsmessage').html = caption;

    var hintsListing = xdobj.get('.xhints_listing').element;
    var tmplRow = XDom(jsh.xdDialogBlock, 'script.xhints_rowtemplate').innerHTML;
    
    if(_.isArray(lov)) _.each(lov, function(item){
      var xdRow = XDom(XDom.render(tmplRow));
      var xdRowInput = XDom(xdRow, 'input');
      xdRowInput.value = item[jsh.uimap.code_val];
      XDom(xdRow, 'span').text = item[jsh.uimap.code_txt];
      if(options.readonly) xdRowInput.remove();
      hintsListing.append(xdRow.element);
    });

    if(options.readonly) XDom(xdobj, 'input.button_ok,input[type="checkbox"]').style.display = false;

    var getValues = function(){
      var rslt = [];
      xdobj.get('.xhints_listing input[type="checkbox"]:checked').elements.forEach(function(obj){ rslt.push(XDom.getValue(obj)); });
      return rslt;
    };
    var cancelfunc = XExt.dialogButtonFunc(hintsBox, oldactive, function () { if (onCancel) onCancel(); });
    var insertfunc = XExt.dialogButtonFunc(hintsBox, oldactive, function () { if (onInsert) onInsert(getValues()); });
    XDom(xdobj, 'input.button_ok').on('click', function(){
      if(!getValues().length) return XExt.Alert('Please select one or more values to insert');
      insertfunc();
    });
    XDom(xdobj, 'input.button_cancel').on('click', cancelfunc);
    var xdInput = XDom(xdobj, 'input');
    xdInput.on('keydown', function (e) { if (e.keyCode == 27) { cancelfunc(); } });
    jsh.xdDialogBlock.element.appendChild(hintsBox);
    xdobj.style.display = true;
    jsh.xdDialogBlock.style.display = true;
    jsh.XWindowResize();
    xdInput.first().focus();
  };

  var popupData = {};

  XExt.popupShow = function (modelid, fieldname, title, parentobj, obj, options) {
    XExt.popup(_.extend(options, {
      modelid: modelid,
      fieldname: fieldname,
      title: title,
      parentobj: parentobj,
      obj: obj
    }));
  };

  XExt.popup = function (options) {
    options = _.extend({
      modelid: undefined,
      fieldname: undefined,
      title: '',
      parentobj: undefined,
      obj: undefined,
      OnControlUpdate: null,
      OnPopupOpen: null,
      OnPopupClosed: null,
      rowid: undefined,
      container: undefined,
    }, options);

    var modelid = XExt.resolveModelID(options.modelid);
    var fieldname = options.fieldname;
    var title = options.title;
    var parentobj = options.parentobj;
    var obj = options.obj;
    var xdobj = XDom(obj);

    var parentmodelid = xdobj.data.model;
    var parentmodelclass = parentmodelid;
    var parentfield = null;
    var parentmodel = null;
    if (parentmodelid){
      parentmodel = jsh.XModels[parentmodelid];
      parentfield = parentmodel.fields[fieldname];
      parentmodelclass = parentmodel.class;
    }
    if(parentmodel && (typeof options.rowid != 'undefined')){
      parentmodel.controller.NavTo(options.rowid, function(){
        delete options.rowid;
        XExt.popup(options);
      });
      return;
    }

    var POPUP_CONTAINER = '.popup_' + fieldname;
    if(parentmodelclass) POPUP_CONTAINER += '.xelem' + parentmodelclass;
    if(options.container) POPUP_CONTAINER = options.container;

    if (!parentobj) parentobj = jsh.xd(POPUP_CONTAINER);
    var numOpens = 0;
    var xmodel = jsh.XModels[modelid];

    popupData[modelid] = {};
    XExt.execif(parentfield && parentfield.controlparams && parentfield.controlparams.onpopup,
      function (f) { parentfield.controlparams.onpopup(modelid, parentmodelid, fieldname, f); },
      function () {
        var code_val = xdobj.data.code_val;
        if (code_val) popupData[modelid].code_val = code_val;
        var xgrid = xmodel.controller.grid;
        var xform = xmodel.controller.form;
        if(xgrid){
          xgrid.RowCount = 0;
          if (xgrid.Prop) xgrid.Prop.Enabled = true;
          jsh.xd(xgrid.PlaceholderID).clear();
        }
        if(xform && xform.Prop){ xform.Prop.Enabled = true; }
        var orig_jsh_ignorefocusHandler = jsh.ignorefocusHandler;
        jsh.ignorefocusHandler = true;
        var onInit = function (xDialogObj) {
          if (options.OnPopupOpen) if(options.OnPopupOpen(popupData[modelid])===false) return;
          numOpens++;
          if(xgrid && (numOpens==1)) xgrid.Select();
          var xdSearchVal = jsh.xd(POPUP_CONTAINER + ' .xsearch_value');
          if (xdSearchVal.isVisible()) xdSearchVal.first().focus();
          else if (jsh.xd(POPUP_CONTAINER).get('td a').length) XDom.focus(jsh.xd(POPUP_CONTAINER).get('td a').element);

          xDialogObj.bindDialogHandler(XDom(xDialogObj.obj, '.xpopupbox_content').element, 'scroll', function(){ jsh.refreshBodyHead(xdPopup.get('.xbodyhead').elements); });
        };
        var onClosed = function () {
          if (parentobj && (typeof popupData[modelid].result !== 'undefined')) {
            if(parentmodel && parentfield && parentfield.name) parentmodel.set(parentfield.name, popupData[modelid].result, null);
            else parentobj.value = popupData[modelid].result;
            if (popupData[modelid].resultrow && parentfield && parentfield.controlparams && parentfield.controlparams.popup_copy_results) {
              for (var fname in parentfield.controlparams.popup_copy_results) {
                parentmodel.set(fname, popupData[modelid].resultrow[parentfield.controlparams.popup_copy_results[fname]], null);
              }
            }
            if (options.OnControlUpdate) options.OnControlUpdate(parentobj.element, popupData[modelid]);
          }
          if (options.OnPopupClosed) options.OnPopupClosed(popupData[modelid]);
          if (parentobj) parentobj.focus();
          jsh.ignorefocusHandler = orig_jsh_ignorefocusHandler;
          if(xgrid && xgrid.Prop){ xgrid.Prop.Enabled = false; }
          if(xform && xform.Prop){ xform.Prop.Enabled = false; }
        };

        var panelWidth = null;
        var panelHeight = null;
        var xsubformPanel = jsh.xd(POPUP_CONTAINER + '.xsubform').get('.xpanel').element;
        if(xsubformPanel) {
          panelWidth = xsubformPanel.style.width;
          panelHeight = xsubformPanel.style.height;
        }

        var xdPopup = XDom(jsh.xdDialogBlock, POPUP_CONTAINER).parent('.xdialogbox.xpopupbox');
        if(!xdPopup.length) {
          xdPopup = XExt.renderTemplate('script.template_popupbox');
          xdPopup.getElement('.xpopupbox_content').appendChild(jsh.xd(POPUP_CONTAINER).element);
          XDom(xdPopup, 'a.xpopupbox_header_close').on('click', function(){ XExt.CancelDialog(); });
        }

        XDom(xdPopup, '.xpopupbox_header_title').text = title;
        var xdPopContext = XDom(xdPopup, '.xpopupbox_content');
        if(panelWidth) xdPopContext.style.width = panelWidth;
        if(panelHeight) xdPopContext.style.minHeight = panelHeight;
        XExt.CustomPrompt(null, xdPopup.element, onInit, null, null, onClosed, {backgroundClose: true});
      });
  };

  XExt.popupSelect = function (modelid, obj) {
    modelid = XExt.resolveModelID(modelid);
    var rslt = undefined;
    var rowid = XExt.XModel.GetRowID(modelid, obj);
    var xmodel = jsh.XModels[modelid];
    
    if (popupData[modelid].code_val){
      rslt = xmodel.controller.form.DataSet[rowid][popupData[modelid].code_val];
      if (!rslt) rslt = '';
    }
    popupData[modelid].result = rslt;
    popupData[modelid].rowid = rowid;
    popupData[modelid].resultrow = xmodel.controller.form.DataSet[rowid];
    XExt.AcceptDialog();
  };

  XExt.popupClear = function (modelid, obj) {
    modelid = XExt.resolveModelID(modelid);
    var rslt = null;
    var xmodel = jsh.XModels[modelid];
    
    popupData[modelid].result = rslt;
    popupData[modelid].rowid = -1;
    popupData[modelid].resultrow = new xmodel.controller.form.DataType();
    XExt.AcceptDialog();
  };

  XExt.AlertFocus = function (ctrl, msg) {
    XExt.Alert(msg, function () { ctrl.focus(); XDom(ctrl).emit('select'); });
  };

  XExt.getModelId = function (obj) {
    var xdobj = XDom(obj);
    var xid = xdobj.parent('.xtbl').data.id;
    if (!xid) xid = xdobj.parent('.xform').data.id;
    if (!xid) return null;
    return xid;
  };

  XExt.getModelMD5 = function (modelid) {
    modelid = XExt.resolveModelID(modelid);
    return Crypto.MD5(jsh.frontsalt + modelid).toString();
  };


  XExt.numOccurrences = function (val, find) {
    if (!val) return 0;
    if (!find) return (val.length + 1);
    
    var rslt = 0;
    var pos = 0;
    var step = find.length;
    
    while (true) {  // eslint-disable-line no-constant-condition
      pos = val.indexOf(find, pos);
      if (pos >= 0) { rslt++; pos += step; }
      else break;
    }
    return rslt;
  };

  XExt.getClasses = function(obj){
    var rslt = [];
    var classes = (XDom.getAttribute(obj, 'class')||'').split(/\s+/);
    for(var i=0;i<classes.length;i++){
      if(classes[i].trim()) rslt.push(classes[i].trim());
    }
    return rslt;
  };

  XExt.ItemContextMenu = function (ctrl) {
    var xdctrl = XDom(ctrl);
    var parent = xdctrl.parent('.xcontext_parent');
    if (!parent.length) return true;
    var menuid = '._item_context_menu_' + parent.data.id;
    if (!jsh.xdroot.get(menuid).length) return true;
    XExt.ShowContextMenu(menuid, xdctrl.data.value);
    return false;
  };

  XExt.basename = function (fname) {
    var rslt = fname;
    if(!rslt) return rslt;
    if(rslt == '/') return '';
    if(rslt == '\\') return '';

    if (rslt.lastIndexOf('/') == (rslt.length-1)) rslt = rslt.substr(0, rslt.length - 1);
    if (rslt.lastIndexOf('\\') == (rslt.length-1)) rslt = rslt.substr(0, rslt.length - 1);

    if (rslt.lastIndexOf('/') >= 0) rslt = rslt.substr(rslt.lastIndexOf('/') + 1);
    if (rslt.lastIndexOf('\\') >= 0) rslt = rslt.substr(rslt.lastIndexOf('\\') + 1);
    return rslt;
  };

  XExt.dirname = function (path) {
    return path.replace(/\\/g, '/').replace(/\/[^/]*\/?$/, '');
  };

  XExt.cleanFileName = function (fname) {
    if (typeof fname == 'undefined') return '';
    if (fname === null) return '';
    
    fname = fname.toString();
    if (fname.length > 247) fname = fname.substr(0, 247);
    return fname.replace(/[/?<>\\:*|":]/g, '').replace(/[\x00-\x1f\x80-\x9f]/g, '').replace(/^\.+$/, '').replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, ''); //eslint-disable-line no-control-regex
  };

  XExt.cleanFilePath = function (fpath, options) {
    options = _.extend({ allow: '/' }, options);
    if (typeof fpath == 'undefined') return '';
    if (fpath === null) return '';
    
    fpath = fpath.toString();
    if (fpath.length > 247) fpath = fpath.substr(0, 247);
    var chars = '/?<>\\:*|":';
    for(var i=0;i < options.allow.length;i++){ chars = chars.replace(options.allow[i], ''); }
    return fpath.replace(new RegExp('['+RegExp.escape(chars)+']','g'), '').replace(/[\x00-\x1f\x80-\x9f]/g, '').replace(/^\.+$/, '').replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, ''); //eslint-disable-line no-control-regex
  };

  XExt.utf8_base64 = function (str) { return window.btoa(unescape(encodeURIComponent(str))); };
  XExt.base64_utf8 = function (str) { return decodeURIComponent(escape(window.atob(str))); };

  XExt.chainObj = function (obj, p, f) {
    if (!(obj[p])) obj[p] = f;
    else {
      var oldf = obj[p];
      obj[p] = function () { f(); oldf(); };
    }
  };

  //Given an original function orig_f, run f(), then run orig_f()
  XExt.chain = function (orig_f, f) {
    if (!orig_f) return f;
    return function () {
      var rslt = f.apply(this, arguments);
      if(typeof rslt != 'undefined') return rslt;
      return orig_f.apply(this, arguments);
    };
  };

  //Given an original function orig_f, run orig_f(), then run f()
  XExt.chainToEnd = function (orig_f, f) {
    if (!orig_f) return f;
    return function () {
      var rslt = orig_f.apply(this, arguments);
      if(typeof rslt != 'undefined') return rslt;
      return f.apply(this, arguments);
    };
  };

  XExt.execif = function (cond, apply, f) {
    if (cond) apply(f);
    else f();
  };

  XExt.LiteralOrLookup = function(str, dictionary, xmodel) {
    //console.log("Evaluating: "+str);
    var rslt = undefined;

    //If numeric, return the value
    if (!isNaN(str)) rslt = str;
    //If a literal 'TEXT', return the value
    else if (str && (str.length >= 2) && (str[0] == "'") && (str[str.length - 1] == "'")) rslt = str.substr(1, str.length - 2);
    //If a JS function, execute and return the value
    else if (str && (str.toString().indexOf('js:') == 0)) rslt = XExt.JSEval(str.substr(3), xmodel, { xmodel: xmodel });
    //If "null", return null
    else if(str && str.trim().toLowerCase()=='null') rslt = null;
    //If a binding, return the evaluated binding
    else if (str && xmodel && xmodel.hasBindingOrRootKey(str)) rslt = xmodel.getBindingOrRootKey(str);
    //If str is the name of a model field, return the field data
    else if (str && xmodel && xmodel.has(str)) rslt = xmodel.get(str,null);
    //If a lookup in the dictionary, return the value
    else if(dictionary) {
      if (_.isArray(dictionary)) {
        //Array of collections
        for (var i = 0; i < dictionary.length; i++) {
          if (str in dictionary[i]) return dictionary[i][str];
        }
      }
      else{
        //Single Collection
        rslt = dictionary[str];
      }
    }
    //Return the value
    return rslt;
  };

  XExt.selectClosest = function (elem, sel, filterFunc) {
    var xdobj = XDom(elem).get(sel);
    if (filterFunc) xdobj = xdobj.filter(filterFunc);
    if (xdobj.length) return xdobj.element;
    var xdparent = XDom(elem).parent();
    if (!xdparent.length) return null;
    return XExt.selectClosest(xdparent.element, sel, filterFunc);
  };

  XExt.getToken = function (onComplete, onFail) {
    if(!jsh) throw new Error('XExt requires jsHarmony instance to run getToken');
    jsh.XForm.prototype.XExecute('../_token', {}, onComplete, onFail);
  };

  XExt.triggerAsync = function(handlers, cb /*, param1, param2 */){
    if(!cb) cb = function(){ };
    if(!handlers) handlers = [];
    if(!_.isArray(handlers)) handlers = [handlers];
    var params = [];
    if(arguments.length > 2) params = Array.prototype.slice.call(arguments, 2);
    //Run handlers
    jsh.async.eachSeries(handlers, function(handler, handler_cb){
      var hparams = [handler_cb].concat(params);
      handler.apply(null, hparams);
    }, cb);
  };

  XExt.trigger = function(handlers /*, param1, param2 */){
    if(!handlers) handlers = [];
    if(!_.isArray(handlers)) handlers = [handlers];
    handlers = handlers.slice();
    var params = [];
    if(arguments.length > 1) params = Array.prototype.slice.call(arguments, 1);
    //Run handlers
    _.each(handlers, function(handler){
      handler.apply(null, params);
    });
  };

  XExt.handleOnce = function(handlers, f){
    var hasExecuted = false;
    var onceHandler = function(){
      for(var i=0;i<handlers.length;i++){
        if(handlers[i] == onceHandler) handlers.splice(i,1);
      }
      if(hasExecuted) return;
      hasExecuted = true;
      f.apply(null, arguments);
    };
    handlers.push(onceHandler);
  };

  /*************************/
  /* Form Helper Functions */
  /*************************/
  XExt.getFormBase = function (id) {
    if (!jsh.XBase[id]) { XExt.Alert('ERROR: Base form ' + id + ' not found.'); return; }
    var basemodelid = jsh.XBase[id][0];
    if (basemodelid) return jsh.XModels[basemodelid].controller.form;
    return undefined;
  };
  XExt.getForm = function (id) {
    if (!(id in jsh.XModels)) { XExt.Alert('ERROR: Form ' + id + ' not found.'); return; }
    return jsh.XModels[id].controller.form;
  };
  XExt.getFormFromObject = function (ctrl) {
    var modelid = XDom(ctrl).parent('.xform,.xtbl').data.id;
    if (modelid) return jsh.XModels[modelid].controller.form;
    return undefined;
  };
  XExt.getModelIdFromObject = function (ctrl) {
    var modelid = XDom(ctrl).parent('.xform').data.id;
    if (modelid) return modelid;
    return undefined;
  };
  XExt.getFieldNameFromObject = function (ctrl) {
    var xdctrl = XDom(ctrl).parent('.xform_ctrl,.xform_file_upload');
    return xdctrl.data.id;
  };
  XExt.getFieldFromObject = function(ctrl){
    var xdctrl = XDom(ctrl).parent('.xform_ctrl,.xform_file_upload');
    if(!xdctrl.length) return undefined;
    var fieldName = xdctrl.data.id;
    var modelid = XExt.getModelId(ctrl);
    if(fieldName && modelid){
      var xmodel = jsh.XModels[modelid];
      if(xmodel && xmodel.fields && (fieldName in xmodel.fields)){
        return xmodel.fields[fieldName];
      }
    }
  };
  XExt.getFormField = function (xform, fieldname) {
    if (!xform) { XExt.Alert('ERROR: Cannot read field ' + fieldname + ' - Parent form not found.'); return; }
    if (!xform.Data.Fields[fieldname]) { XExt.Alert('ERROR: Target field ' + fieldname + ' not found in ' + xform.Data._modelid); return; }
    return xform.Data.GetValue(xform.Data.Fields[fieldname]);
  };
  XExt.formatField = function (xform, fieldname, fieldval) {
    if (!xform) { XExt.Alert('ERROR: Cannot read field ' + fieldname + ' - Parent form not found.'); return; }
    if (!xform.Data.Fields[fieldname]) { XExt.Alert('ERROR: Target field ' + fieldname + ' not found in ' + xform.Data._modelid); return; }
    return jsh.XFormat.Apply(xform.Data.Fields[fieldname].format, fieldval);
  };
  XExt.setFormField = function (xform, fieldname, fieldval) {
    if (!xform) { XExt.Alert('ERROR: Cannot set field ' + fieldname + ' - Parent form not found.'); return; }
    if (!xform.Data.Fields[fieldname]) { XExt.Alert('ERROR: Target field ' + fieldname + ' not found in ' + xform.Data._modelid); return; }
    XExt.XModel.SetFieldValue(xform.Data, xform.Data.Fields[fieldname], fieldval);
  };
  XExt.setFormControl = function (xform, fieldname, fieldval) { //Set fieldval to undefined for refresh
    if (!xform) { XExt.Alert('ERROR: Cannot set field ' + fieldname + ' - Parent form not found.'); return; }
    if (!xform.Data.Fields[fieldname]) { XExt.Alert('ERROR: Target field ' + fieldname + ' not found in ' + xform.Data._modelid); return; }
    XExt.XModel.SetControlValue(xform.Data, xform.Data.Fields[fieldname], fieldval);
  };
  XExt.isFieldTopmost = function(modelid, fieldname){
    if(!modelid) return true;
    var model = jsh.XModels[modelid];
    if(!model) return true;

    var parentmodel = jsh.XModels[model.parent];
    while(parentmodel){
      if(parentmodel.fields && (fieldname in parentmodel.fields)){
        return false;
      }
      parentmodel = jsh.XModels[parentmodel.parent];
    }
    return true;
  };
  /***********************/
  /* UI Helper Functions */
  /***********************/

  // popupForm :: Open the target model as a popup
  //
  // Parameters
  //   modelid (string):           The full path to the model, including any namespace
  //   action (string):            Either "browse", "insert", or "update"
  //   querystringParams (object): Querystring parameters appended to the model URL
  //   windowParams (object):      JavaScript window.open parameters, as an object
  //   existingWindow (Window):    (Optional) Existing JavaScript Window to use instead of opening a new window
  //
  // Returns
  //   (Window) Either the newly created popup window, or the existing window passed as an input parameter
  //
  XExt.popupForm = function (modelid, action, querystringParams, windowParams, existingWindow) {
    modelid = XExt.resolveModelID(modelid);
    if (!querystringParams) querystringParams = {};
    if (action) querystringParams.action = action;
    var url = jsh._BASEURL + modelid;
    var dfltwindowParams = { width: 1000, height: 600, resizable: 1, scrollbars: 1 };
    var modelmd5 = XExt.getModelMD5(modelid);
    if (modelmd5 in jsh.popups) {
      var default_popup_size = jsh.popups[modelmd5];
      dfltwindowParams.width = default_popup_size[0];
      dfltwindowParams.height = default_popup_size[1];
    }
    if (!windowParams) windowParams = {};
    if (querystringParams) url += '?' + XExt.escapeQuery(querystringParams);
    var windowstr = '';
    for (var p in dfltwindowParams) { if (!(p in windowParams)) windowParams[p] = dfltwindowParams[p]; }
    for (var windowParam in windowParams) { windowstr += ',' + windowParam + '=' + windowParams[windowParam]; }
    if (windowstr) windowstr = windowstr.substr(1);
    if (existingWindow) { existingWindow.location = url; existingWindow.focus(); return existingWindow; }
    else return window.open(url, '_blank', windowstr);
  };
  XExt.popupReport = function (modelid, querystringParams, windowParams, existingWindow) {
    modelid = XExt.resolveModelID(modelid);
    var url = jsh._BASEURL + '_d/_report/' + modelid + '/';
    var dfltwindowParams = { width: 1000, height: 600, resizable: 1, scrollbars: 1 };
    var modelmd5 = XExt.getModelMD5(modelid);
    if (modelmd5 in jsh.popups) {
      var default_popup_size = jsh.popups[modelmd5];
      dfltwindowParams.width = default_popup_size[0];
      dfltwindowParams.height = default_popup_size[1];
    }
    if (!windowParams) windowParams = {};
    if (querystringParams) url += '?' + XExt.escapeQuery(querystringParams);
    var windowstr = '';
    for (var p in dfltwindowParams) { if (!(p in windowParams)) windowParams[p] = dfltwindowParams[p]; }
    for (var windowParam in windowParams) { windowstr += ',' + windowParam + '=' + windowParams[windowParam]; }
    if (windowstr) windowstr = windowstr.substr(1);
    if (existingWindow) { existingWindow.location = url; existingWindow.focus(); return existingWindow; }
    else return window.open(url, '_blank', windowstr);
  };
  XExt.fitWindowScript = function(onComplete){
    var rsltFunc = function(callback){
      if (window.opener && window.opener !== window) {
        var targetX = window.screenX;
        var targetY = window.screenY;
        if(window.screen && ('availLeft' in window.screen) && ('availTop' in window.screen)){
          var needsMove = false;
          if(targetX < window.screen.availLeft){ targetX = window.screen.availLeft; needsMove = true; }
          if(targetY < window.screen.availTop){ targetY = window.screen.availTop; needsMove = true; }
          if(needsMove){
            window.moveTo(targetX, targetY);
          }
        }
      }
      return callback();
    };
    return '('+rsltFunc.toString()+')(function(){'+onComplete.toString()+'})';
  };
  XExt.createWindow = function(url, target, params){
    var win = window.open(undefined, target, params);
    var pageBody =
      '<script type="text/javascript">'+
      '(function(){' +
      'setTimeout(function(){' +
      XExt.fitWindowScript('window.location.href = '+JSON.stringify(url)+';')+
      '}, 100);'+
      '})();</script>';
    if(url && (url.substr(0,5)=='data:')){
      pageBody = '<body style="margin:0;padding:0;width:100%;height:100%;box-sizing:border-box;">'+pageBody+'<iframe src="' + XExt.escapeHTML(url) + '" frameBorder="0" style="width:100%;height:100%;box-sizing:border-box;"></iframe></body>';
    }
    win.document.write(pageBody);
    return win;
  };
  XExt.renderCanvasCheckboxes = function () {
    jsh.xd('canvas.checkbox.checked').elements.forEach(function (el) {
      var obj = el;
      var w = obj.width;
      var h = obj.height;
      var ctx = obj.getContext('2d');
      
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.moveTo(0, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.lineTo(0, 0);
      
      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.moveTo(0, 0);
      ctx.lineTo(w, h);
      ctx.moveTo(w, 0);
      ctx.lineTo(0, h);
      ctx.stroke();
    });
  };
  XExt.DataBinding = function(data){
    this.Bindings = [];
    this.Data = data;
  };
  XExt.DataBinding.prototype.Bind = function(obj){
    if(!obj.OnUpdate) throw new Error('Binding missing OnUpdate handler');
    if(!_.includes(this.Bindings,obj)){
      this.Bindings.push(obj);
      obj.OnUpdate(this.Data);
    }
  };
  XExt.DataBinding.prototype.Unbind = function(obj){
    var found = false;
    for(var i=0;i<this.Bindings.length;i++){
      if(this.Bindings[i]==obj){
        found = true;
        this.Bindings.splice(i,1);
        i--;
      }
    }
    if(!found) throw new Error('Binding not found');
  };
  XExt.DataBinding.prototype.Update = function(data){
    var _this = this;
    _this.Data = data;
    for(var i=0;i<_this.Bindings.length;i++){
      var binding = _this.Bindings[i];
      binding.OnUpdate(_this.Data);
    }
  };
  XExt.insertTextAtCursor = function(txt,className){
    if(window.getSelection){
      var s = document.createElement('SPAN');
      s.innerText = txt;
      if(className) s.className = className;
      var sel = window.getSelection();
      if(!sel || !sel.rangeCount) return null;// throw new Error('Control does not have an available');
      sel.getRangeAt(0).insertNode(s);
      return s;
    }
    else if(document.selection && document.selection.createRange){
      document.selection.createRange().text = txt;
      return null;
    }
    else throw new Error('Inserting text into contenteditable not supported.');
  };
  XExt.isChildOf = function(tgt_obj, container_obj){
    if(tgt_obj === container_obj) return false;
    var curElement = tgt_obj;
    while(curElement){
      curElement = curElement.parentNode;
      if(curElement === container_obj) return true;
    }
    return false;
  };
  XExt.selectionIsChildOf = function(obj){
    if(window.getSelection){
      var sel = window.getSelection();
      if(!sel || !sel.rangeCount) return false;
      var rstart = sel.getRangeAt(0);
      var curElement = rstart.startContainer;
      while(curElement){
        if(curElement === obj) return true;
        curElement = curElement.parentNode;
      }
      return false;
    }
    else throw new Error('Inserting text into contenteditable not supported.');
  };
  XExt.hasSelection = function(){
    if (window.getSelection) {
      var sel = window.getSelection();
      if(!sel || !sel.rangeCount) return false;
      var r = sel.getRangeAt(0);
      if(!r) return false;
      return !r.collapsed;
    }
    return false;
  };
  XExt.clearSelection = function(){
    if(!XExt.hasSelection()) return;
    if (window.getSelection) {
      if (window.getSelection().empty) {  // Chrome
        window.getSelection().empty();
      } else if (window.getSelection().removeAllRanges) {  // Firefox
        window.getSelection().removeAllRanges();
      }
    } else if (document.selection) {  // IE
      document.selection.empty();
    }
  };
  XExt.getSelection = function(obj){
    if(typeof obj.selectionStart != 'undefined'){ //Chrome
      return {'start': obj.selectionStart, 'end': obj.selectionEnd};
    }
    else if(document.selection){ //IE
      obj.focus();
      var r = document.selection.createRange();
      var r_len = r.text.length;
      r.moveStart('character', -1 * obj.options.length);
      return {'start': r.text.length - r_len, 'end': r.text.length};
    }
    else return undefined;
  };
  XExt.getSalt = function(len){
    var rslt = '';
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=][}{|~,.<>?';
    for(var i=0;i<len;i++) rslt += chars.charAt(Math.floor(Math.random()*chars.length));
    return rslt;
  };
  XExt.Tick = function(f){
    window.setTimeout(f,1);
  };
  XExt.waitUntil = function(cond, f, cancel, timeout){
    if(!timeout) timeout = 100;
    if(!cancel) cancel = function(f){ return false; };
    if(cancel(f)) return;
    if(cond()) return f();
    setTimeout(function(){ XExt.waitUntil(cond, f, cancel, timeout); }, timeout);
  };
  XExt.scrollIntoView = function(container, pos, h){
    if(!container) return;
    var sTop = container.scrollTop;
    var sLeft = container.scrollLeft;
    var cW = container.clientWidth;
    var cH = container.clientHeight;
    var minV = sTop;
    var maxV = sTop + cH;
    var minH = sLeft;
    var maxH = sLeft + cW;
    var posbottom = pos.top + h;
    if((pos.left < minH) || (pos.left > maxH)) container.scrollLeft = pos.left;
    if((posbottom < minV) || (posbottom > maxV)){
      if(posbottom < minV) container.scrollTop = pos.top;
      else {
        var newscrollTop = posbottom - cH;
        if(newscrollTop < 0) newscrollTop = 0;
        container.scrollTop = newscrollTop;
      }
    }
    else if(pos.top < minV){
      container.scrollTop = pos.top;
    }
  };
  XExt.scrollObjIntoView = function(container, obj){
    var xdcontainer = XDom(container);
    var xdobj = XDom(obj);
    var objpos = {top: xdobj.calc.top(), left: xdobj.calc.left()};
    var containerpos = {top: xdcontainer.calc.top(), left: xdcontainer.calc.left()};
    objpos.top -= containerpos.top - xdcontainer.element.scrollTop;
    objpos.left -= containerpos.left - xdcontainer.element.scrollLeft;
    XExt.scrollIntoView(container, objpos, xdobj.calc.height());
  };
  //Check if the mouse is within the target element
  XExt.isMouseWithin = function(elem) {
    return XExt.isPointWithin(elem, jsh.mouseX, jsh.mouseY);
  };
  //Check if the x,y coordinate is within the element
  XExt.isPointWithin = function(elem, x, y) {
    var xdobj = XDom(elem);
    var offsetTop = xdobj.calc.top();
    var offsetLeft = xdobj.calc.left();
    var w = xdobj.calc.widthToBorder();
    var h = xdobj.calc.heightToBorder();
    if (x < offsetLeft) return false;
    if (x > (offsetLeft + w)) return false;
    if (y < offsetTop) return false;
    if (y > (offsetTop + h)) return false;
    return true;
  };
  XExt.getObjectAnchors = function(elem, x, y, options) {
    //Anchors: 'top','bottom','left','right','full'
    options = _.extend({ anchors: ['full'], full_threshold: 0.25 }, options);
    var anchors = {};
    for(var i=0;i<options.anchors.length;i++) anchors[options.anchors[i]] = 1;
    var xdobj = XDom(elem);
    var offsetTop = xdobj.calc.top();
    var w = xdobj.calc.widthToMargin();
    var h = xdobj.calc.heightToMargin();
    var fph = Math.abs(((h>0)?((y-offsetTop)/h):0) - 0.5);
  
    var lp = ((w>0)?((x-xdobj.calc.left())/w):0) - 0.5;
    var tp = ((h>0)?((y-offsetTop)/h):0) - 0.5;
    var rslt = ['',''];

    if(lp < 0){ if(anchors.left) rslt[0] = 'left'; }
    else{ if(anchors.right) rslt[0] = 'right'; }

    if(anchors.full && (fph <= 0.25)){ rslt[1] = 'full'; }
    else if(tp > 0){ if(anchors.bottom) rslt[1] = 'bottom'; }
    else{ if(anchors.top) rslt[1] = 'top'; }

    if(!rslt[1] && anchors.full) rslt[1] = 'full';

    return rslt;
  };
  XExt.bindDragSource = function(obj){
    var mouseDownTimer = null;
    var xdobj = XDom(obj);
    xdobj.on('mousedown', function(e){
      if (e.which == 1) {//left mouse button
        var obj = this;
        if(jsh.xContextMenuVisible) return;
        XExt.CancelBubble(e);
        if(mouseDownTimer) window.clearTimeout(mouseDownTimer);
        mouseDownTimer = window.setTimeout(function(){
          if(mouseDownTimer) jsh.mouseDragBegin(obj, function(){ return true; }, e);
        }, 250);
      }
    });
    xdobj.on('mouseup', function(e){
      if(mouseDownTimer) window.clearTimeout(mouseDownTimer);
    });
  };
  //Bind tab control events
  XExt.bindTabControl = function(obj){
    var xdobj = XDom(obj);
    var xdTabButtons = xdobj.getChildren('.xtab');
    if(!xdTabButtons.length) xdTabButtons = xdobj.getChildren('.xtabs').getChildren('.xtab');
    var xdTabPanels = xdobj.getChildren('.xpanel').getChildren('.xtabbody');
    xdTabButtons.on('click', function(e){
      var xdTabButton = XDom(this);
      e.preventDefault();
      if(xdTabButton.class.contains('selected')) return;
      var tabFor = xdTabButton.attr.for;
      xdTabButtons.class.remove('selected');
      xdTabButton.class.add('selected');
      if(tabFor){
        xdTabPanels.class.remove('selected');
        xdTabPanels.filter('.'+tabFor).class.add('selected');
      }
      var ontabselected = xdTabButton.data.ontabselected;
      if(ontabselected) XExt.JSEval(ontabselected, xdTabButton.element);
    });
    if(!xdTabButtons.filter('.selected').length) xdTabButtons.first().class.add('selected');
    xdTabPanels.filter('.'+xdTabButtons.filter('.selected').attr.for).class.add('selected');
    xdobj.class.add('initialized');
  };
  //Bind accordion events
  XExt.bindAccordion = function(obj){
    var rightArrow = '&#xE5CC;';
    var downArrow = '&#xE313;';
    var xdobj = XDom(obj);
    var xdbody = xdobj.nextSibling('.xaccordionbody');
    var state = XDom.render('<span class="material-icons xaccordionstate"></span>');
    var xdState = XDom(state);
    obj.appendChild(state);

    var hideBody = function(){
      xdobj.class.remove('expanded');
      xdbody.animate.height(false);
      xdState.html = rightArrow;
    };
    var showBody = function(){
      xdobj.class.add('expanded');
      xdbody.animate.height(true);
      xdState.html = downArrow;
    };


    xdobj.on('click', function(){
      var isExpanded = xdobj.class.contains('expanded');
      if(isExpanded) hideBody();
      else showBody();
    });
    xdobj.class.add('initialized');
    if(xdbody.class.contains('expanded')) showBody();
    else hideBody();
  };
  //Resolve Model ID
  XExt.resolveModelID = function(modelid, sourceModel){
    if(!jsh) return modelid;
    if(!modelid) return modelid;
    //Absolute
    if(modelid.substr(0,1)=='/') return modelid.substr(1);
    if(!sourceModel && jsh.XModels_root) sourceModel = jsh.XModels[jsh.XModels_root];
    if(!sourceModel) return modelid;
    //Relative to namespace
    var testmodel = '';
    if(sourceModel.namespace){
      testmodel = sourceModel.namespace+modelid;
      if(testmodel in jsh.XModels) return testmodel;
    }
    //Model Using
    if(sourceModel.using){
      for(var i=0;i<sourceModel.using.length;i++){
        var namespace = sourceModel.using[i];
        testmodel = namespace+modelid;
        if(testmodel.substr(0,1)=='/') testmodel = testmodel.substr(1);
        if(testmodel in jsh.XModels) return testmodel;
      }
    }
    if(modelid in jsh.XModels) return modelid;
    if(modelid in jsh.XBase) return XExt.resolveModelID(jsh.XBase[modelid][0]);
    return modelid;
  };
  XExt.isNullUndefinedEmpty = function(val){
    if(typeof val === 'undefined') return true;
    if(val === null) return true;
    if(val === '') return true;
    if(val === false) return true;
    return false;
  };
  XExt.isNullUndefined = function(val){
    if(typeof val === 'undefined') return true;
    if(val === null) return true;
    return false;
  };
  
  XExt.isDisplayLayoutColumnHidden = function (field_name, display_layout, fields) {
    if(!display_layout || !display_layout.columns) return false;
    for(var i=0;i<display_layout.columns.length;i++){
      if(display_layout.columns[i].name == field_name) return false;
    }
    if(fields && !fields[field_name]) return false;
    return true;
  };

  XExt.AppendUrlParams = function(url, params)  {
    var hash = url.indexOf('#');
    if (hash != -1) {
      url = url.slice(0,hash);
    }
    if (params) {
      if (typeof(params) == 'object') {
        // If you need blank values, append the escapeQuery value yourself.
        var definedParams = _.omitBy(params, function(x) {return typeof(x)=='undefined';});
        params = XExt.escapeQuery(definedParams);
      }
      if (params) {
        url = url + ((url.indexOf('?') == -1) ? '?' : '&') + params;
      }
    }
    return url;
  };

  XExt.AppendUrlParamsCacheBust = function(url, params) {
    return XExt.AppendUrlParams(url, _.extend({_: Date.now()}, params));
  };

  XExt.Request = function(url, options) {
    options = _.extend({headers: {}}, options);
    if ('async' in options && options.async === false) throw new Error('sync Request is not supported. Use Request_Sync instead');
    if (options.dataType && options.dataType != 'json') throw new Error('Currently only JSON requests are supported.');

    if (typeof(options.cache) === 'boolean') {
      options.cache = options.cache ? 'default' : 'no-store';
    }
    if (options.body instanceof FormData) {
      // leave it alone, the browser handles it.
    } else {
      if (typeof(options.body) == 'object') {
        options.body = XExt.escapeQuery(options.body);
      }
      if (options.body && !options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      }
    }
    if (!options.headers['Accept']) {
      options.headers['Accept'] = 'application/json, text/javascript, */*; q=0.01';
    }

    var request = fetch(url, options).then(function(response){
      return response.text().then(function(text) {
        if (response.ok) {
          try {
            // if we use response.json, we won't be able to get the response text if it fails, and JSHAMRONY_REDIRECT and company expect it.
            var json = JSON.parse(text);
            if (options.success) options.success(json);
            return json;
          } catch (_) {} // eslint-disable-line no-empty
        }
        // not ok OR json decode failed.
        response.responseText = text;
        if (options.error) options.error(response);
        return response;
      });
    });
    options.error && request.catch(options.error);
    options.complete && request.finally(options.complete);
    return request;
  };

  XExt.Request_Sync = function(url, options) {
    options = _.extend({headers: {}}, options);
    if (options.dataType && options.dataType != 'json') throw new Error('Currently only JSON requests are supported.');

    if (options.body instanceof FormData) {
      // leave it alone, the browser handles it.
    } else {
      if (typeof(options.body) == 'object') {
        options.body = XExt.escapeQuery(options.body);
      }
      if (options.body && !options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      }
    }
    if (!options.headers['Accept']) {
      options.headers['Accept'] = 'application/json, text/javascript, */*; q=0.01';
    }

    var request = new XMLHttpRequest();
    request.addEventListener('load', function(e) {
      var isOk = request.status >= 200 && request.status < 300 || request.status === 304;
      if (isOk) {
        try {
          var json = JSON.parse(request.responseText);
          if (options.success) options.success(json);
          return;
        } catch (_) {} // eslint-disable-line no-empty
      }
      // not ok OR json decode failed.
      if (options.error) options.error(request);
      return;
    });
    if (options.error) {
      request.addEventListener('error', function(e) {options.error(e);});
      request.addEventListener('abort', function(e) {options.error(e);});
    }
    request.open(options.method||'GET', url, false);
    _.forEach(options.headers, function(value, key) {
      request.setRequestHeader(key, value);
    });
    if (options.credentials == 'include') {
      request.withCredentials = true;
    }
    try {
      request.send(options.body || null);
    } catch(e) {
      if (options.error) options.error(e);
    }
  };

  XExt.Request_JSONP = function(url, options) {
    var callbackName = 'XExt_Request_JSONP' + Date.now();
    var response;
    window[callbackName] = function(arg) {response = arg;};
    var params = {};
    params[options.jsonp || 'callback'] = callbackName;

    var script = document.createElement('script');
    script.async = true;
    script.src = XExt.AppendUrlParams(url, params);
    XDom.on(script, 'load error', function(e) {
      script.remove();
      delete window[callbackName];
      if (options.error && e.type == 'error') {
        options.error(e);
      }
      if (options.complete && e.type == 'load') {
        options.complete(response);
      }
    });

    document.querySelector('head').append(script);
  };

  return XExt;
};
