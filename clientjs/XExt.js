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
  var XValidate = jsh.XValidate;

  var XExt = function(){ }

  XExt.XModel = require('./XExt.XModel.js')(jsh);

  XExt.parseGET = function (qs) {
    if (typeof qs == 'undefined') qs = window.location.search;
    if (qs == "" || qs.length == 1) return {};
    if (qs[0] == '?' || qs[0] == '#') qs = qs.substr(1);
    var qsa = qs.split('&');
    var b = {};
    for (var i = 0; i < qsa.length; i++) {
      var p = qsa[i].split('=', 2);
      if (p.length == 1)
        b[p[0]] = "";
      else
        b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
    }
    return b;
  };

  XExt.RenderLOV = function (_data, ctrl, LOV) {
    ctrl.empty();
    ctrl.html(jsh.ejs.render('\
      <% for(var i=0;i<data.length;i++){ %>\
      <option value="<%=data[i][jsh.uimap.codeval]%>"><%=data[i][jsh.uimap.codetxt]%></option>\
      <% } %>'
      , { data: LOV, jsh: jsh }
    ));
  }

  XExt.RenderParentLOV = function (_data, ctrl, parentvals, LOV, field, plural) {
    //Get Previous Value
    var prevval = _data[field.name];
    if (prevval == null) prevval = '';
    ctrl.empty();
    var lovfilter = {};
    if (!plural) lovfilter[jsh.uimap.codeparent] = parentvals[0];
    else {
      for (var i = 0; i < parentvals.length; i++) {
        lovfilter[jsh.uimap.codeparent + (i + 1)] = parentvals[i];
      }
    }
    
    var cLOV = _.filter(LOV, lovfilter);
    if ((!plural) && (!(jsh.uimap.codeparent in LOV[0]))) cLOV.unshift(LOV[0]);
    else if ((plural) && (!((jsh.uimap.codeparent + '1') in LOV[0]))) cLOV.unshift(LOV[0]);
    else if ('lovblank' in field) cLOV.unshift(LOV[0]);
    ctrl.html(jsh.ejs.render('\
      <% for(var i=0;i<data.length;i++){ %>\
      <option value="<%=data[i][jsh.uimap.codeval]%>"><%=data[i][jsh.uimap.codetxt]%></option>\
      <% } %>'
      , { data: cLOV, jsh: jsh }
    ));
    //Apply prevval
    var lov_matches = ctrl.children('option').filter(function () { return String($(this).val()).toUpperCase() == String(prevval).toUpperCase(); }).length;
    if (lov_matches > 0) ctrl.val(prevval);
  }

  XExt.CancelBubble = function (e) {
    if (!e) e = window.event;
    if (e.stopPropagation) e.stopPropagation();
    else e.cancelBubble = true;
  }

  XExt.ShowContextMenu = function (selector,context_item,data){
    if (!selector) selector = '.xcontext_menu';
    jsh.$root('.xcontext_menu').hide();
    jsh.$root(selector).css('visibility', 'hidden');
    jsh.$root(selector).show();
    var xtop = jsh.mouseY; var xleft = jsh.mouseX;
    var offset = jsh.$root(selector).offsetParent().offset();
    xtop -= offset.top - 1;
    xleft -= offset.left - 1;

    var wwidth = $(window).width();
    var wheight = $(window).height() - 20;
    var dwidth = jsh.$root(selector).outerWidth()+4;
    var dheight = jsh.$root(selector).outerHeight()+4;
    if ((xtop + dheight) > wheight) xtop = wheight - dheight;
    if ((xleft + dwidth) > wwidth) xleft = wwidth - dwidth;
    if (xtop < 0) xtop = 0;
    if (xleft < 0) xleft = 0;

    jsh.$root(selector).css({ 'top': xtop, 'left': xleft });
    jsh.$root(selector).css('visibility', 'visible');
    if(jsh){
      jsh.xContextMenuVisible = true;
      jsh.xContextMenuItem = context_item;
      jsh.xContentMenuItemData = data;
    }
  }

  XExt.CallAppFunc = function (q, method, d, onComplete, onFail, options){
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
      var xform = new jsh.XForm(q, '', '');
      xform.Data = d;
      var dq = {}, dp = {};
      if (method == 'get') dq = d;
      else if (method == 'postq') { dq = d; method = 'post'; }
      else if (method == 'putq') { dq = d; method = 'put'; if (options.post) { dp = options.post; } }
      else dp = d;
      xform.qExecute(xform.PrepExecute(method, xform.q, dq, dp, function (rslt) {
        if ('_success' in rslt) {
          if (onComplete) onComplete(rslt);
          else XExt.Alert('Operation completed successfully.');
        }
      }, onFail));
    }
    getVars();
  }

  XExt.InputValue = function (_Caption, _Validation, _Default, _PostProcess){
    this.Caption = _Caption;
    this.Validation = _Validation;
    this.Default = (_Default ? _Default : '');
    this.PostProcess = _PostProcess;
    this.Value = undefined;
  }
  XExt.InputValue.prototype.Prompt = function (onComplete) {
    var _this = this;
    XExt.Prompt(_this.Caption, _this.Default, function (rslt) {
      if (rslt == null) {
        if (onComplete) { onComplete(null); }
        return;
      }
      else {
        if (_this.Validation) {
          var v = new XValidate(jsh);
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
  }
  XExt.getLOVTxt = function (LOV, val) {
    if (val) val = val.toString();
    for (var i = 0; i < LOV.length; i++) {
      if (LOV[i][jsh.uimap.codeval] == val) return LOV[i][jsh.uimap.codetxt];
    }
    return undefined;
  }
  XExt.pushLOV = function (LOV, val, txt) {
    var newlov = {};
    newlov[jsh.uimap.codeval] = val;
    newlov[jsh.uimap.codetxt] = txt;
    LOV.push(newlov);
  }

  XExt.endsWith = function (str, suffix) {
    return str.match(suffix + "$") == suffix;
  }
  XExt.beginsWith = function (str, prefix) {
    return str.indexOf(prefix) === 0;
  }

  XExt.HasAccess = function (access, perm) {
    if (access === undefined) return false;
    for (var i = 0; i < perm.length; i++) {
      if (access.indexOf(perm[i]) > -1) return true;
    }
    return false;
  };

  XExt.access = XExt.HasAccess;

  XExt.UndefinedBlank = function (val) {
    if (typeof val == 'undefined') return '';
    return val;
  }

  XExt.ReplaceAll = function (val, find, replace) {
    return val.split(find).join(replace);
  }

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
  }

  XExt.trimRight = function(str, chr){
    return XExt.trim(str, chr, 1);
  }

  XExt.trimLeft = function(str, chr){
    return XExt.trim(str, chr, -1);
  }

  XExt.AddHistory = function (url, obj, title) {
    if (jsh && !jsh.isHTML5) return;
    if (typeof obj == 'undefined') obj = {};
    if (typeof title == 'undefined') title = document.title;
    window.history.pushState(obj, title, url);
  }

  XExt.ReplaceHistory = function (url, obj, title) {
    if (jsh && !jsh.isHTML5) return;
    if (typeof obj == 'undefined') obj = {};
    if (typeof title == 'undefined') title = document.title;
    window.history.replaceState(obj, title, url);
  }

  XExt.clearFileInput = function (obj) {
    var oldInput = obj;
    var newInput = document.createElement("input");
    newInput.type = "file";
    newInput.id = oldInput.id;
    newInput.name = oldInput.name;
    newInput.className = oldInput.className;
    newInput.style.cssText = oldInput.style.cssText;
    oldInput.parentNode.replaceChild(newInput, oldInput);
  };

  XExt.hideTab = function (modelid, tabname) {
    var modelclass = modelid;
    if(modelid in jsh.XModels) modelclass = jsh.XModels[modelid].class;
    jsh.$root('.xtab' + modelclass).each(function (i, obj) {
      var jobj = $(obj);
      if (jobj.html() == tabname) jobj.hide();
    });
  }

  //Escape JavaScript string
  XExt.escapeJS = function (q) {
    if(!q) return '';
    return q.replace(/[\\'"]/g, "\\$&");
  }

  //Escape just quotes (for XML/HTML key-value pairs)
  XExt.escapeHTMLQ = function (q) {
    if(!q) return '';
    return q.replace(/["]/g, "&quot;");
  }

  //Escape while enabling escape characters in a string
  XExt.escapeHTMLN = function (val) {
    var rslt = XExt.escapeHTML(val);
    return String(val).replace(/&amp;([\w]+);/g, function (s,p1) {
      return '&'+p1+';';
    });
  }

  //Escape all HTML
  XExt.escapeHTML = function (val) {
    var entityMap = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': '&quot;',
      "'": '&#39;',
      "/": '&#x2F;',
      '\u00A0':'&#xa0;'
    };
    
    return String(val).replace(/[\u00A0&<>"'\/]/g, function (s) {
      return entityMap[s];
    });
  }
  //Escape HTML and replace line breaks with HTML line breaks
  XExt.escapeHTMLBR = function (val) {
    if((typeof val=='undefined')||(val===null)) return val;
    return XExt.ReplaceAll(XExt.ReplaceAll(XExt.escapeHTML(val.toString()), '\n', '<br/>'), '\r', '');
  }
  //Escape HTML and replace line breaks with spaces
  XExt.escapeBRSpace = function (val) {
    if((typeof val=='undefined')||(val===null)) return val;
    return XExt.ReplaceAll(XExt.ReplaceAll(val.toString(), '\n', ' '), '\r', '');
  }
  //Escape string for regular expression matching
  XExt.escapeRegEx = function (q) {
    return q.replace(/[-[\]{}()*+?.,\\/^$|#\s]/g, "\\$&");
  }
  XExt.pad = function (val, padding, length) {
    var rslt = val.toString();
    while (rslt.length < length) rslt = padding + rslt;
    return rslt;
  }
  XExt.getMargin = function(jctrl){
    return {
      top: parseInt(jctrl.css('margin-top')),
      right: parseInt(jctrl.css('margin-right')),
      bottom: parseInt(jctrl.css('margin-bottom')),
      left: parseInt(jctrl.css('margin-left'))
    };
  }
  XExt.getPadding = function(jctrl){
    return {
      top: parseInt(jctrl.css('padding-top')),
      right: parseInt(jctrl.css('padding-right')),
      bottom: parseInt(jctrl.css('padding-bottom')),
      left: parseInt(jctrl.css('padding-left'))
    };
  }
  XExt.getBorder = function(jctrl){
    return {
      top: parseInt(jctrl.css('border-top-width')),
      right: parseInt(jctrl.css('border-right-width')),
      bottom: parseInt(jctrl.css('border-bottom-width')),
      left: parseInt(jctrl.css('border-left-width'))
    };
  }
  XExt.xejs = {
    'escapeJS': function(val){ return XExt.escapeJS(val); },
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
      } catch (ex) { }
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
    'GetValue': function (field) {
      if ('sample' in field) return field.sample;
      return '';
    },
    'getInputType': function (field) {
      if (field && field.validate) {
        if (field.validate.indexOf('XValidate._v_IsEmail()') >= 0) return 'email';
        if (field.validate.indexOf('XValidate._v_IsPhone()') >= 0) return 'tel';
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
    'getaccess': function () {
      if (arguments.length == 0) return '';
      var kfc = '';
      var effperm = arguments[0];
      for (var i = 0; i < arguments.length; i++) {
        effperm = XExt.xejs.intersectperm(effperm, arguments[i]);
        kfc = XExt.xejs.unionperm(kfc, this.intersectperm('KFC', arguments[i]));
      }
      return (effperm + kfc);
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
        rslt += '<option value="' + XExt.escapeHTML(lovval[jsh.uimap.codeval]) + '" ' + ((lovval[jsh.uimap.codeval] == selected_value)?'selected':'') + '>' + XExt.escapeHTML(lovval[jsh.uimap.codetxt]) + '</option>';
      });
      return rslt;
    },
    'onlyAlphaNum': function (val) {
      if (!val) return '';
      return val.toString().replace(/[^a-zA-Z0-9]+/g, '');
    },
    'is_add': function (_GET) {
      return (_GET['action'] == 'add');
    }
  };

  XExt.CKEditor = function (id) {
    if (CKEDITOR.instances[id]) return;
    var elem = jsh.$root('.' + id+'.xform_ctrl');
    if(!elem.length){ return XExt.Alert('Cound not initialize editor on '+id+': form control not found'); }
    var orig_width = elem.outerWidth();
    var orig_height = elem.outerHeight();
    elem.wrap('<div class="' + id + '_container" style="width:' + orig_width + 'px;border:1px solid #999;display:inline-block;"></div>');
    CKEDITOR.replace(id);
  }
  XExt.getOpenerJSH = function(capabilities){
    if (window.opener) {
      var pjsh = window.opener[jsh.getInstance()];
      var hasCapabilities = true;
      if(!pjsh.XPage) return;
      if(capabilities) _.each(capabilities, function(capability){
        if(!pjsh.XPage[capability]) hasCapabilities = false;
      });
      if(hasCapabilities) return pjsh;
    }
  }
  XExt.notifyPopupComplete = function (id, rslt) {
    var jshOpener = XExt.getOpenerJSH(['PopupComplete']);
    if (jshOpener) {
      jshOpener.XPage.PopupComplete(id, rslt);
    }
  }
  XExt.unescapeEJS = function (ejssrc) {
    if (!ejssrc) return '';
    var rslt = ejssrc;
    rslt = XExt.ReplaceAll(rslt, '&lt;#', '<#');
    rslt = XExt.ReplaceAll(rslt, '#&gt;', '#>');
    return rslt;
  }
  XExt.renderClientEJS = function(ejssrc,ejsparams){
    if(ejssrc.indexOf('<#')<0) return ejssrc;
    ejssrc = ejssrc.replace(/<#/g, '<%').replace(/#>/g, '%>');
    return jsh.ejs.render(ejssrc,ejsparams);
  }
  XExt.isSinglePage = function () {
    if (jsh.singlepage) return true;
    return false;
  }
  XExt.navTo = function (url) {
    if (XExt.isSinglePage()) {
      var a = XExt.getURLObj(url);
      if (!jsh.Navigate(a, undefined, undefined, undefined)) return false;
    }
    window.location.href = url;
    return false;
  }
  XExt.jumpAnchor = function (name) {
    if (!name) return;
    if (name[0] == '#') name = name.substring(1);
    var jobj = jsh.$root('a[name=' + name + ']');
    if (jobj.size() == 0) return;
    var elem = jobj.get(0);
    var elemoff = $(elem).offset();
    window.scrollTo(0, elemoff.top);
  }
  XExt.getURLObj = function (url) {
    var a = document.createElement('a');
    a.href = url;
    return a;
  };
  XExt.aPhoneCheck = function (jobj, caption) {
    var val = jobj.val()
    if (val && (val == '1' || !val.match(/[0123456789]/))) {
      jobj.addClass('xinputerror');
      XExt.Alert('Invalid ' + caption);
      return false;
    }
    return true;
  }
  XExt.StripTags = function (val, ignore) {
    if (!val) return val;
    
    ignore = (((ignore || '') + '').toLowerCase().match(/<[a-z][a-z0-9]*>/g) || []).join('')
    var clienttags = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi
    var servertags = /<!--[\s\S]*?-->|<\?(?:php)?[\s\S]*?\?>/gi
    
    return XExt.unescapeHTMLEntity(val.replace(servertags, '').replace(clienttags, function ($0, $1) {
      return ignore.indexOf('<' + $1.toLowerCase() + '>') > -1 ? $0 : ''
    }));
  }
  XExt.unescapeHTMLEntity = function(val){
    var obj = document.createElement("textarea");
    obj.innerHTML = val;
    return obj.value;
  }
  XExt.readCookie = function(id){
    var rslt = [];
    var cookies = document.cookie.split(';');
    var rx=RegExp("^\\s*"+XExt.escapeRegEx(id)+"=\\s*(.*?)\\s*$");
    for(var i=0;i<cookies.length;i++){
      var m = cookies[i].match(rx);
      if(m) rslt.push(m[1]);
    }
    return rslt;
  }
  XExt.currentURL = function(){
    var rslt = window.location.href.toString().split(window.location.host)[1];
    rslt = rslt.split('?')[0];
    rslt = rslt.split('#')[0];
    return rslt;
  }


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
  }

  XExt.TreeRender = function (ctrl, LOV, field) {
    //Create Cache of Opened Nodes
    var expanded_nodes = XExt.TreeGetExpandedNodes(ctrl);
    var selected_nodes = XExt.TreeGetSelectedNodes(ctrl);
    
    ctrl.empty();
    if (LOV.length == 0) return;
    
    //Create Tree
    var tree = [];
    var nodes = {};
    var sortednodes = [];
    var has_seq = false;
    for (var i = 0; i < LOV.length; i++) {
      var iLOV = LOV[i];
      var node = new XTreeNode();
      node.ID = iLOV[jsh.uimap.codeid];
      node.ParentID = iLOV[jsh.uimap.codeparentid];
      node.Value = iLOV[jsh.uimap.codeval];
      node.Text = iLOV[jsh.uimap.codetxt];
      node.Icon = iLOV[jsh.uimap.codeicon];
      node.Seq = iLOV[jsh.uimap.codeseq];
      if (node.Seq) has_seq = true;
      if (_.includes(expanded_nodes, node.Value)) node.Expanded = true;
      if (_.includes(selected_nodes, node.Value)) node.Selected = true;
      
      if (!node.ParentID) tree.push(node);
      nodes[node.ID] = node;
      sortednodes.push(node);
    }
    for (var i = 0; i < sortednodes.length; i++) {
      var node = sortednodes[i];
      if (node.ParentID && (node.ParentID in nodes)) nodes[node.ParentID].Children.push(node);
    }
    if (has_seq) sortednodes = _.sortBy(sortednodes, [jsh.uimap.codeseq, jsh.uimap.codetxt]);
    
    var body = '';
    for (var i = 0; i < tree.length; i++) {
      body += XExt.TreeRenderNode(ctrl, tree[i]);
    }
    ctrl.html(body);
    if (field && field.controlparams) {
      if (field.controlparams.expand_all) XExt.TreeExpandAll(ctrl);
      else if ((typeof field.controlparams.expand_to_selected == 'undefined') || (field.controlparams.expand_to_selected)) XExt.TreeExpandToSelected(ctrl);
    }
  }

  XExt.TreeRenderNode = function (ctrl, n) {
    var children = '';
    for (var i = 0; i < n.Children.length; i++) {
      children += XExt.TreeRenderNode(ctrl, n.Children[i]);
    }
    var rslt = jsh.ejs.render('\
      <a href="#" class="tree_item tree_item_<%=n.ID%> <%=(n.Children.length==0?"nochildren":"")%> <%=(n.Expanded?"expanded":"")%> <%=(n.Selected?"selected":"")%>" data-id="<%=n.ID%>" data-value="<%=n.Value%>" onclick=\'<%-instance%>.XExt.TreeSelectNode(this,<%-JSON.stringify(n.Value)%>); return false;\' ondblclick=\'<%-instance%>.XExt.TreeDoubleClickNode(this,<%-JSON.stringify(n.ID)%>); return false;\' oncontextmenu=\'return <%-instance%>.XExt.TreeItemContextMenu(this,<%-JSON.stringify(n.ID)%>);\'><div class="glyph" href="#" onclick=\'<%-instance%>.XExt.CancelBubble(arguments[0]); <%-instance%>.XExt.TreeToggleNode(<%-instance%>.$(this).closest(".xform_ctrl.tree"),<%-JSON.stringify(n.ID)%>); return false;\'><%-(n.Expanded?"&#x25e2;":"&#x25b7;")%></div><img class="icon" src="/images/icon_<%=n.Icon%>.png"><span><%=n.Text%></span></a>\
      <div class="children <%=(n.Expanded?"expanded":"")%> tree_item_<%=n.ID%>" data-id="<%=n.ID%>" data-value="<%=n.Value%>"><%-children%></div>',
      { n: n, children: children, jsh: jsh, instance: jsh.getInstance() }
    );
    return rslt;
  }

  XExt.getJSLocals = function(modelid){
    var rslt = jsh.jslocals;
    if(modelid) rslt += "var modelid = '"+modelid+"'; var _this = jsh.App[modelid]; var xmodel = jsh.XModels[modelid]; ";
    return rslt;
  }

  XExt.getJSApp = function(modelid,quotechar){
    if(typeof quotechar=='undefined') quotechar = '\'';
    return jsh._instance + '.App[' + quotechar + modelid + quotechar + ']';
  }

  XExt.JSEval = function(str,_thisobj,params){
    if(!_thisobj) thisobj = jsh;
    if(!params) params = {};
    var paramstr = '';
    if(params){
      for(var param in params){
        paramstr += 'var '+param+'=params.'+param+';';
      }
    }
    var jscmd = '(function(){'+XExt.getJSLocals(params.modelid)+paramstr+'return '+str+'}).call(_thisobj)';
    return eval(jscmd);
  }

  XExt.wrapJS = function(code,modelid){
    return 'return (function(){'+XExt.escapeHTML(XExt.getJSLocals(modelid))+' '+XExt.unescapeEJS(XExt.escapeHTML(code))+'; return false; }).call(this);';
  }

  XExt.TreeItemContextMenu = function (ctrl, n) {
    var jctrl = $(ctrl);
    var jtree = jctrl.closest('.xform_ctrl.tree');
    var fieldname = XExt.getFieldFromObject(ctrl);
    var menuid = '._item_context_menu_' + fieldname;
    if(jtree.data('oncontextmenu')) { 
      var f = (new Function('n', jtree.data('oncontextmenu'))); 
      var frslt = f.call(ctrl, n);
      if((frslt === false) || (frslt===true)) return frslt;
    }
    if (jsh.$root(menuid).length) {
      XExt.ShowContextMenu(menuid, $(ctrl).data('value'), { id:n });
      return false;
    }
    return true;
  }

  XExt.TreeDoubleClickNode = function (ctrl, n) {
    var jctrl = $(ctrl);
    var jtree = jctrl.closest('.xform_ctrl.tree');
    var fieldname = XExt.getFieldFromObject(ctrl);
    if(jtree.data('ondoubleclick')) { var rslt = (new Function('n', jtree.data('ondoubleclick'))); rslt.call(ctrl, n); }
  }

  XExt.TreeGetSelectedNodes = function (ctrl) {
    var rslt = [];
    $(ctrl).find('.tree_item.selected').each(function () {
      var val = $(this).data('value');
      if (val) rslt.push(val.toString());
    });
    return rslt;
  }

  XExt.TreeGetExpandedNodes = function (ctrl) {
    var rslt = [];
    $(ctrl).find('.tree_item.expanded').each(function () {
      var val = $(this).data('value');
      if (val) rslt.push(val.toString());
    });
    return rslt;
  }

  XExt.TreeSelectNode = function (ctrl, nodevalue) {
    var jctrl = $(ctrl);
    
    var xform = XExt.getFormFromObject(ctrl);
    var fieldname = XExt.getFieldFromObject(ctrl);
    var field = undefined;
    if (xform && fieldname) field = xform.Data.Fields[fieldname];
    
    var jtree = jctrl.closest('.xform_ctrl.tree');
    if (jtree.hasClass('uneditable')) return;

    //Deselect previously selected value
    jtree.find('.selected').removeClass('selected');

    var nodeid = '';
    if(nodevalue){
      //Get nodeid from nodevalue
      jtree.find('.tree_item').each(function(){
        if($(this).data('value')==nodevalue) nodeid = $(this).data('id');
      });
      if(!nodeid){ return XExt.Alert('Tree node with value \'' + nodevalue + '\' not found'); }

      jtree.find('.tree_item.tree_item_' + nodeid).addClass('selected');
      if (field && field.controlparams) {
        if ((typeof field.controlparams.expand_to_selected == 'undefined') || (field.controlparams.expand_to_selected)) XExt.TreeExpandToSelected(ctrl);
      }
    }

    //Fire events
    if (field && jsh.init_complete) {
      if ('onchange' in field) { var rslt = (new Function('obj', 'newval', 'e', field.onchange)); rslt.call(xform.Data, ctrl, xform.Data.GetValue(field), null); }
    }
    if(nodeid && jtree.data('onselected')) { var rslt = (new Function('nodeid', jtree.data('onselected'))); rslt.call(ctrl, nodeid); }
  }

  XExt.TreeToggleNode = function (jctrl, nodeid) {
    var jctrl = jctrl.closest('.xform_ctrl.tree');
    if (jctrl.find('.children.tree_item_' + nodeid).hasClass('expanded'))
      XExt.TreeCollapseNode(jctrl, nodeid);
    else
      XExt.TreeExpandNode(jctrl, nodeid);
  }

  XExt.TreeCollapseNode = function (jctrl, nodeid) {
    var jctrl = jctrl.closest('.xform_ctrl.tree');
    jctrl.find('.tree_item_' + nodeid).removeClass('expanded');
    jctrl.find('.tree_item.tree_item_' + nodeid + ' > .glyph').html('&#x25b7;');
  }

  XExt.TreeExpandNode = function (jctrl, nodeid) {
    var jctrl = jctrl.closest('.xform_ctrl.tree');
    jctrl.find('.tree_item_' + nodeid).addClass('expanded');
    jctrl.find('.tree_item.tree_item_' + nodeid + ' > .glyph').html('&#x25e2;');
  }

  XExt.TreeExpandToSelected = function (ctrl) {
    var toptree = $(ctrl).closest('.xform_ctrl.tree');
    var rslt = [];
    toptree.find('.tree_item.selected').each(function () {
      var jctrl = $(this);
      var jparent = jctrl.parent();
      while (jparent.length && !jparent.is(toptree)) {
        XExt.TreeExpandNode(toptree, jparent.data('value'));
        jparent = jparent.parent();
      }
    });
    return rslt;
  }
  XExt.TreeExpandAll = function (ctrl) {
    var jctrl = $(ctrl).closest('.xform_ctrl.tree');
    jctrl.find('.tree_item').addClass('expanded');
    jctrl.find('.children').addClass('expanded');
    jctrl.find('.glyph').html('&#x25e2;');
  }

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
        rslt = prec_h + 2;
      }
      else if (ftype == 'float'){ rslt = 128; }
      else if (ftype == 'int') rslt = 15;
      else if (ftype == 'smallint') rslt = 10;
      else if (ftype == 'tinyint') rslt = 3;
      else if (ftype == 'boolean') rslt = 5;
      else if ((ftype == 'binary') && ('length' in field)) rslt = field.length * 2 + 2;

    }
    return rslt;
  }

  XExt.XInputAction = function (_obj, _overrideFunc) {
    if (_obj && (_obj instanceof $) && (_obj.length)) this.obj = _obj[0];
    else this.obj = _obj;
    this.tstamp = Date.now();
    this.mouseX = jsh.mouseX;
    this.mouseY = jsh.mouseY;
    this.mouseDown = jsh.mouseDown;
    this.overrideFunc = _overrideFunc;
  }

  XExt.XInputAction.prototype.Exec = function () {
    var _this = this;
    if (_this.obj) $(_this.obj).focus();
    if (this.overrideFunc) this.overrideFunc();
    else if (_this.obj && _this.mouseDown) {
      XExt.Click(_this.obj);
    }
  }

  XExt.XInputAction.prototype.IsExpired = function () {
    return (new Date().getTime() - this.tstamp) > 100;
  }

  XExt.getLastClicked = function () {
    var is_recent_click = (new Date().getTime() - jsh.last_clicked_time) < 100;
    if (jsh.last_clicked && is_recent_click) return jsh.last_clicked;
    return undefined;
  }

  XExt.Click = function (obj) {
    var gevent = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    window.setTimeout(function () { obj.dispatchEvent(gevent); }, 1);
  }

  XExt.isIOS = function () {
    if ((navigator.userAgent.match(/iPhone/i)) || 
        (navigator.userAgent.match(/iPod/i)) || 
        (navigator.userAgent.match(/iPad/i))) {
      return true;
    }
  }

  XExt.clearDialogs = function(){
    jsh.xDialog = [];
    jsh.$root('.xdialogblock').children().hide();
    jsh.$root('.xdialogblock').hide();
  }

  XExt.dialogButtonFunc = function (dialogClass, oldactive, onComplete, params) {
    if (!params) params = {};
    return function () {
      //Delete duplicates from stack
      for (var i = 0; i < jsh.xDialog.length; i++) {
        for (var j = 0; j < i; j++) {
          if (jsh.xDialog[j] == jsh.xDialog[i]) {
            jsh.xDialog.splice(i, 1);
            i--;
            break;
          }
        }
      }
      //Verify this is the topmost dialog
      if ((jsh.xDialog.length > 0) && (jsh.xDialog[0] != dialogClass)) return;
      jsh.$root('.xdialogblock ' + dialogClass).hide();
      if (jsh.xDialog.length == 1) { jsh.$root('.xdialogblock').hide(); }
      if (jsh.xDialog[0] != dialogClass) { alert('ERROR - Invalid Dialog Stack'); console.log(dialogClass); console.log(jsh.xDialog); }
      if (oldactive) oldactive.focus();
      window.setTimeout(function () { jsh.xDialog.shift(); if (onComplete) onComplete(); }, 1);
      if (params.onCompleteImmediate) params.onCompleteImmediate();
    }
  }

  XExt.Alert = function (obj, onAccept, params) {
    if (!params) params = {};
    var msg = '';
    if (obj && _.isString(obj)) msg = obj;
    else msg = JSON.stringify(obj);
    msg = XExt.escapeHTML(msg);
    msg = XExt.ReplaceAll(XExt.ReplaceAll(msg, '\n', '<br/>'), '\r', '');
    //alert(msg);
    jsh.xDialog.unshift('.xalertbox');
    jsh.$root('.xdialogblock .xalertbox').zIndex(jsh.xDialog.length);
    
    var oldactive = document.activeElement;
    if (oldactive) $(oldactive).blur();
    jsh.$root('.xalertmessage').html(msg);
    jsh.$root('.xalertbox input').off('click');
    jsh.$root('.xalertbox input').off('keydown');
    var acceptfunc = XExt.dialogButtonFunc('.xalertbox', oldactive, onAccept, { onCompleteImmediate: params.onAcceptImmediate });
    jsh.$root('.xalertbox input').on('click', acceptfunc);
    jsh.$root('.xalertbox input').on('keydown', function (e) { if (e.keyCode == 27) { acceptfunc(); } });
    
    jsh.$root('.xdialogblock,.xalertbox').show();
    jsh.XWindowResize();
    if (!XExt.isIOS()) jsh.$root('.xalertbox input').focus();
  }

  XExt.Confirm = function (obj, onAccept, onCancel, options) {
    if (!options) options = {};
    var msg = '';
    if (obj && _.isString(obj)) msg = obj;
    else msg = JSON.stringify(obj);
    msg = XExt.escapeHTML(msg);
    msg = XExt.ReplaceAll(XExt.ReplaceAll(msg, '\n', '<br/>'), '\r', '');
    //if (window.confirm(msg)) { if (onAccept) onAccept(); }
    //if (onCancel) onCancel(); 
    jsh.xDialog.unshift('.xconfirmbox');
    jsh.$root('.xdialogblock .xconfirmbox').zIndex(jsh.xDialog.length);
    
    var oldactive = document.activeElement;
    if (oldactive) $(oldactive).blur();
    jsh.$root('.xconfirmmessage').html(msg);
    jsh.$root('.xconfirmbox input').off('click');
    jsh.$root('.xconfirmbox input').off('keydown');
    var cancelfunc = XExt.dialogButtonFunc('.xconfirmbox', oldactive, onCancel);
    if (options.button_no) {
      jsh.$root('.xconfirmbox input.button_no').show();
      jsh.$root('.xconfirmbox input.button_no').on('click', XExt.dialogButtonFunc('.xconfirmbox', oldactive, options.button_no));
    }
    else jsh.$root('.xconfirmbox input.button_no').hide();
    if (options.button_ok_caption) jsh.$root('.xconfirmbox input.button_ok').val(options.button_ok_caption);
    if (options.button_no_caption) jsh.$root('.xconfirmbox input.button_no').val(options.button_no_caption);
    if (options.button_cancel_caption) jsh.$root('.xconfirmbox input.button_cancel').val(options.button_cancel_caption);


    jsh.$root('.xconfirmbox input.button_ok').on('click', XExt.dialogButtonFunc('.xconfirmbox', oldactive, onAccept));
    jsh.$root('.xconfirmbox input.button_cancel').on('click', cancelfunc);
    jsh.$root('.xconfirmbox input').on('keydown', function (e) { if (e.keyCode == 27) { cancelfunc(); } });
    jsh.$root('.xdialogblock,.xconfirmbox').show();
    jsh.XWindowResize();
    if (!XExt.isIOS()) jsh.$root('.xconfirmbox input.button_ok').focus();
  }

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
    jsh.xDialog.unshift('.xpromptbox');
    jsh.$root('.xdialogblock .xpromptbox').zIndex(jsh.xDialog.length);
    
    var oldactive = document.activeElement;
    if (oldactive) $(oldactive).blur();
    jsh.$root('.xpromptmessage').html(msg);
    jsh.$root('.xpromptbox input').off('click');
    jsh.$root('.xpromptbox input').off('keydown');
    jsh.$root('.xpromptfield').val(dflt);
    var cancelfunc = XExt.dialogButtonFunc('.xpromptbox', oldactive, function () { if (onComplete) onComplete(null); });
    var acceptfunc = XExt.dialogButtonFunc('.xpromptbox', oldactive, function () { if (onComplete) onComplete(jsh.$root('.xpromptfield').val()); });
    jsh.$root('.xpromptbox input.button_ok').on('click', acceptfunc);
    jsh.$root('.xpromptbox input.button_cancel').on('click', cancelfunc);
    jsh.$root('.xpromptbox input').on('keydown', function (e) { if (e.keyCode == 27) { cancelfunc(); } });
    jsh.$root('.xpromptfield').on('keydown', function (e) { if (e.keyCode == 13) { acceptfunc(); } });
    jsh.$root('.xdialogblock,.xpromptbox').show();
    jsh.XWindowResize();
    jsh.$root('.xpromptfield').focus();
  }

  XExt.CustomPrompt = function (sel, html, onInit, onAccept, onCancel, onClosed) {
    //Classes - default_focus, button_ok, button_cancel
    if (jsh.$root('.xdialogblock ' + sel).length) jsh.$root('.xdialogblock ' + sel).remove();
    jsh.$root('.xdialogblock').append(html);
    
    //ShowDialog
    jsh.xDialog.unshift(sel);
    jsh.$root('.xdialogblock ' + sel).zIndex(jsh.xDialog.length);
    
    var oldactive = document.activeElement;
    if (oldactive) $(oldactive).blur();
    
    jsh.$root(sel + ' input').off('click');
    jsh.$root(sel + ' input').off('keydown');
    var cancelfunc = XExt.dialogButtonFunc(sel, oldactive, function () { if (onCancel) onCancel(); if (onClosed) onClosed(); });
    var acceptfunc_aftervalidate = XExt.dialogButtonFunc(sel, oldactive, function () { if (onClosed) onClosed(); });
    var acceptfunc = function () {
      //Verify this is the topmost dialog
      if ((jsh.xDialog.length > 0) && (jsh.xDialog[0] != (sel))) return;
      
      if (onAccept) return onAccept(function () { acceptfunc_aftervalidate(); });
      else acceptfunc_aftervalidate();
    }
    if (onInit) onInit(acceptfunc, cancelfunc);
    jsh.$root(sel + ' input.button_ok').on('click', acceptfunc);
    jsh.$root(sel + ' input.button_cancel').on('click', cancelfunc);
    jsh.$root(sel + ' input').on('keydown', function (e) { if (e.keyCode == 27) { cancelfunc(); } });
    jsh.$root(sel + ' input:not(:checkbox):not(:button)').on('keydown', function (e) { if (e.keyCode == 13) { acceptfunc(); } });
    jsh.$root('.xdialogblock,' + sel).show();
    jsh.XWindowResize();
    jsh.$root(sel + ' .default_focus').focus();
  }

  XExt.ZoomEdit = function (val, caption, options, onAccept, onCancel) {
    if(!options) options = {};
    if(!val) val = '';
    val = val.toString();
    jsh.xDialog.unshift('.xtextzoombox');
    jsh.$root('.xdialogblock .xtextzoombox').zIndex(jsh.xDialog.length);
    
    var oldactive = document.activeElement;
    if (oldactive) $(oldactive).blur();
    jsh.$root('.xtextzoommessage').html(caption);
    jsh.$root('.xtextzoombox input').off('click');
    jsh.$root('.xtextzoombox input').off('keydown');
    jsh.$root('.xtextzoomfield').val(val);
    
    jsh.$root('.xtextzoomfield').prop('readonly', (options.readonly?true:false));
    if(options.readonly) jsh.$root('.xtextzoomfield').removeClass('editable').addClass('uneditable');
    else jsh.$root('.xtextzoomfield').removeClass('uneditable').addClass('editable');

    var cancelfunc = XExt.dialogButtonFunc('.xtextzoombox', oldactive, function () { if (onCancel) onCancel(); });
    var acceptfunc = XExt.dialogButtonFunc('.xtextzoombox', oldactive, function () { if (onAccept) onAccept(jsh.$root('.xtextzoomfield').val()); });
    jsh.$root('.xtextzoombox input.button_ok').on('click', acceptfunc);
    jsh.$root('.xtextzoombox input.button_cancel').on('click', cancelfunc);
    jsh.$root('.xtextzoombox input').on('keydown', function (e) { if (e.keyCode == 27) { cancelfunc(); } });
    jsh.$root('.xdialogblock,.xtextzoombox').show();
    jsh.XWindowResize();
    jsh.$root('.xtextzoomfield').focus();
  }

  var popupData = {};

  XExt.popupShow = function (modelid, fieldid, title, parentobj, obj, options) {
    if (typeof options == 'undefined') options = {};
    var parentmodelid = $(obj).data('model');
    var parentmodelclass = parentmodelid;
    var parentfield = null;
    if (parentmodelid){
      var parentmodel = jsh.XModels[parentmodelid];
      parentfield = parentmodel.datamodel.prototype.Fields[fieldid];
      parentmodelclass = parentmodel.class;
    }
    if (!parentobj) parentobj = jsh.$root('.' + fieldid + '.xform_ctrl' + '.xelem' + parentmodelclass);
    var numOpens = 0;
    var xmodel = jsh.XModels[modelid];
    
    popupData[modelid] = {};
    XExt.execif(parentfield && parentfield.controlparams && parentfield.controlparams.onpopup,
      function (f) { parentfield.controlparams.onpopup(modelid, parentmodelid, fieldid, f); },
      function () {
      var codeval = $(obj).data('codeval');
      if (codeval) popupData[modelid].codeval = codeval;
      var xgrid = xmodel.controller.grid;
      xgrid.RowCount = 0;
      if (xgrid.Prop) xgrid.Prop.Enabled = true;
      jsh.$root(xgrid.PlaceholderID).html('');
      var orig_jsh_ignorefocusHandler = jsh.ignorefocusHandler;
      jsh.ignorefocusHandler = true;
      var popup_options = {};
      popup_options = {
        modelid: modelid,
        href: ".popup_" + fieldid + '.xelem' + parentmodelclass, inline: true, closeButton: true, arrowKey: false, preloading: false, overlayClose: true, title: title, fixed: true,
        fadeOut:0,
        onOpen: function () {
          //When nested popUps are called, onOpen is not called
        },
        onComplete: function () {
          numOpens++;
          if(numOpens==1) xgrid.Select();
          if (jsh.$root('.popup_' + fieldid + '.xelem' + parentmodelclass + ' .xfilter_value').first().is(':visible')) jsh.$root('.popup_' + fieldid + ' .xfilter_value').first().focus();
          else if (jsh.$root('.popup_' + fieldid + '.xelem' + parentmodelclass).find('td a').length) jsh.$root('.popup_' + fieldid).find('td a').first().focus();
            //else jsh.$root('.popup_' + fieldid + '.xelem' + parentmodelclass).find('input,select,textarea').first().focus();
        },
        onClosed: function () {
          var found_popup = false;
          for(var i=jsh.xPopupStack.length-1;i>=0;i--){
            if(jsh.xPopupStack[i].modelid==modelid){ jsh.xPopupStack.splice(i,1); found_popup = true; break; }
          }
          if(!found_popup) { alert('ERROR - Invalid Popup Stack'); console.log(modelid); console.log(jsh.xPopupStack); };

          if(jsh.xPopupStack.length) $.colorbox(jsh.xPopupStack[jsh.xPopupStack.length-1]);

          if (typeof popupData[modelid].result !== 'undefined') {
            parentobj.val(popupData[modelid].result);
            if (popupData[modelid].resultrow && parentfield && parentfield.controlparams && parentfield.controlparams.popup_copy_results) {
              for (var fname in parentfield.controlparams.popup_copy_results) {
                XExt.setFormField(XExt.getForm(parentmodelid), fname, popupData[modelid].resultrow[parentfield.controlparams.popup_copy_results[fname]])
              }
            }
            if (options.OnControlUpdate) options.OnControlUpdate(parentobj[0], popupData[modelid]);
          }
          parentobj.focus();
          jsh.ignorefocusHandler = orig_jsh_ignorefocusHandler;
        }
      };
      jsh.xPopupStack.push(popup_options);
      $.colorbox(popup_options);
    });
  }

  XExt.popupSelect = function (modelid, obj) {
    var rslt = null;
    var rowid = XExt.XModel.GetRowID(modelid, obj);
    var xmodel = jsh.XModels[modelid];
    
    if (popupData[modelid].codeval) rslt = xmodel.controller.form.DataSet[rowid][popupData[modelid].codeval];
    if (!rslt) rslt = '';
    popupData[modelid].result = rslt;
    popupData[modelid].rowid = rowid;
    popupData[modelid].resultrow = xmodel.controller.form.DataSet[rowid];
    xmodel.controller.grid.Prop.Enabled = false;
    $.colorbox.close();
  }

  XExt.popupClear = function (modelid, obj) {
    var rslt = null;
    var xmodel = jsh.XModels[modelid];
    
    popupData[modelid].result = rslt;
    popupData[modelid].rowid = -1;
    popupData[modelid].resultrow = new xmodel.controller.form.DataType();
    xmodel.controller.grid.Prop.Enabled = false;
    $.colorbox.close();
  }

  XExt.AlertFocus = function (ctrl, msg) {
    XExt.Alert(msg, function () { $(ctrl).focus().select(); });
  }

  XExt.getModelId = function (obj) {
    var xid = $(obj).closest('.xtbl').data('id');
    if (!xid) xid = $(obj).closest('.xform').data('id');
    if (!xid) return null;
    return xid;
  }

  XExt.getModelMD5 = function (modelid) {
    return Crypto.MD5(jsh.frontsalt + modelid).toString();
  }


  XExt.numOccurrences = function (val, find) {
    if (!val) return 0;
    if (!find) return (val.length + 1);
    
    var rslt = 0;
    var pos = 0;
    var step = find.length;
    
    while (true) {
      pos = val.indexOf(find, pos);
      if (pos >= 0) { rslt++; pos += step; } 
      else break;
    }
    return rslt;
  }

  XExt.getClasses = function(obj){
    var jobj = $(obj);
    var rslt = [];
    var classes = jobj.attr('class').split(/\s+/);
    for(var i=0;i<classes.length;i++){
      if(classes[i].trim()) rslt.push(classes[i].trim());
    }
    return rslt;
  }

  XExt.ItemContextMenu = function (ctrl) {
    var parent = $(ctrl).closest('.xcontext_parent');
    if (!parent.length) return true;
    var menuid = '._item_context_menu_' + parent.data('id');
    if (!jsh.$root(menuid).length) return true;
    XExt.ShowContextMenu(menuid, $(ctrl).data('value'));
    return false;
  }

  XExt.basename = function (fname) {
    var rslt = fname;
    if (rslt.lastIndexOf('/') > 0) rslt = rslt.substr(rslt.lastIndexOf('/') + 1);
    if (rslt.lastIndexOf('\\') > 0) rslt = rslt.substr(rslt.lastIndexOf('\\') + 1);
    return rslt;
  }

  XExt.dirname = function (path) {
    return path.replace(/\\/g, '/').replace(/\/[^\/]*\/?$/, '');
  }

  XExt.cleanFileName = function (fname) {
    if (typeof fname === undefined) return '';
    if (fname === null) return '';
    
    fname = fname.toString();
    if (fname.length > 247) fname = fname.substr(0, 247);
    return fname.replace(/[\/\?<>\\:\*\|":]/g, '').replace(/[\x00-\x1f\x80-\x9f]/g, '').replace(/^\.+$/, '').replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, '');
  }

  XExt.utf8_base64 = function (str) { return window.btoa(unescape(encodeURIComponent(str))); }
  XExt.base64_utf8 = function (str) { return decodeURIComponent(escape(window.atob(str))); }

  XExt.chainObj = function (obj, p, f) {
    if (!(obj[p])) obj[p] = f;
    else {
      var oldf = obj[p];
      obj[p] = function () { f(); oldf(); };
    }
  }

  XExt.chain = function (obj, f) {
    if (!obj) return f;
    return function () { f(); obj(); };
  }

  XExt.execif = function (cond, apply, f) {
    if (cond) apply(f);
    else f();
  }

  XExt.LiteralOrLookup = function(str, dictionary, xmodel) {
    //console.log("Evaluating: "+str);
    var rslt = undefined;

    //If numeric, return the value
    if (!isNaN(str)) rslt = str;
    //If a literal 'TEXT', return the value
    else if (str && (str.length >= 2) && (str[0] == "'") && (str[str.length - 1] == "'")) rslt = str.substr(1, str.length - 2);
    //If "null", return null
    else if(str && str.trim().toLowerCase()=='null') rslt = null; 
    //If a binding, return the evaluated binding
    else if (str && xmodel && xmodel.hasBindingOrRootKey(str)) rslt = xmodel.getBindingOrRootKey(str);
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
  }

  XExt.findClosest = function (elem, sel) {
    var jobj = $(elem).find(sel);
    if (jobj.length) return jobj;
    var parent = $(elem).parent();
    if (!parent.length) return $();
    return XExt.findClosest(parent, sel);
  }

  XExt.getToken = function (onComplete, onFail) {
    if(!jsh) throw new Error('XExt requires jsHarmony instance to run getToken');
    jsh.XForm.prototype.XExecute('../_token', {}, onComplete, onFail);
  }

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
  }

  XExt.trigger = function(handlers /*, param1, param2 */){
    if(!handlers) handlers = [];
    if(!_.isArray(handlers)) handlers = [handlers];
    var params = [];
    if(arguments.length > 1) params = Array.prototype.slice.call(arguments, 1);
    //Run handlers
    _.each(handlers, function(handler){
      handler.apply(null, params);
    });
  }

  /*************************/
  /* Form Helper Functions */
  /*************************/
  XExt.isGridControl = function (ctrl) {
    return (jsh.$root('.SQ_CARRIER_PRO').closest('.xtbl').length > 0);
  }
  XExt.getFormBase = function (id) {
    if (!jsh.XBase[id]) { XExt.Alert('ERROR: Base form ' + id + ' not found.'); return; }
    var basemodelid = jsh.XBase[id][0];
    if (basemodelid) return jsh.XModels[basemodelid].controller.form;
    return undefined;
  }
  XExt.getForm = function (id) {
    if (!(id in jsh.XModels)) { XExt.Alert('ERROR: Form ' + id + ' not found.'); return; }
    return jsh.XModels[id].controller.form;
  }
  XExt.getFormFromObject = function (ctrl) {
    var modelid = $(ctrl).closest('.xform').data('id');
    if (modelid) return jsh.XModels[modelid].controller.form;
    return undefined;
  }
  XExt.getModelIdFromObject = function (ctrl) {
    var modelid = $(ctrl).closest('.xform').data('id');
    if (modelid) return modelid;
    return undefined;
  }
  XExt.getFieldFromObject = function (ctrl) {
    return $(ctrl).closest('.xform_ctrl').data('id');
  }
  XExt.getFormField = function (xform, fieldname) {
    if (!xform) { XExt.Alert('ERROR: Cannot read field ' + fieldname + ' - Parent form not found.'); return; }
    if (!xform.Data.Fields[fieldname]) { XExt.Alert('ERROR: Target field ' + fieldname + ' not found in ' + xform.Data._modelid); return; }
    return xform.Data.GetValue(xform.Data.Fields[fieldname]);
  }
  XExt.formatField = function (xform, fieldname, fieldval) {
    if (!xform) { XExt.Alert('ERROR: Cannot read field ' + fieldname + ' - Parent form not found.'); return; }
    if (!xform.Data.Fields[fieldname]) { XExt.Alert('ERROR: Target field ' + fieldname + ' not found in ' + xform.Data._modelid); return; }
    return jsh.XFormat.Apply(xform.Data.Fields[fieldname].format, fieldval);
  }
  XExt.setFormField = function (xform, fieldname, fieldval) {
    if (!xform) { XExt.Alert('ERROR: Cannot set field ' + fieldname + ' - Parent form not found.'); return; }
    if (!xform.Data.Fields[fieldname]) { XExt.Alert('ERROR: Target field ' + fieldname + ' not found in ' + xform.Data._modelid); return; }
    XExt.XModel.SetFieldValue(xform.Data, xform.Data.Fields[fieldname], fieldval);
  }
  XExt.setFormControl = function (xform, fieldname, fieldval) { //Set fieldval to undefined for refresh
    if (!xform) { XExt.Alert('ERROR: Cannot set field ' + fieldname + ' - Parent form not found.'); return; }
    if (!xform.Data.Fields[fieldname]) { XExt.Alert('ERROR: Target field ' + fieldname + ' not found in ' + xform.Data._modelid); return; }
    XExt.XModel.SetControlValue(xform.Data, xform.Data.Fields[fieldname], fieldval);
  }
  /***********************/
  /* UI Helper Functions */
  /***********************/
  XExt.popupForm = function (modelid, action, params, windowparams, win) {
    if (!params) params = {};
    if (action) params.action = action;
    var url = jsh._BASEURL + modelid;
    var dfltwindowparams = { width: 1000, height: 600, resizable: 1, scrollbars: 1 };
    var modelmd5 = XExt.getModelMD5(modelid);
    if (modelmd5 in jsh.popups) {
      default_popup_size = jsh.popups[modelmd5];
      dfltwindowparams.width = default_popup_size[0];
      dfltwindowparams.height = default_popup_size[1];
    }
    if (!windowparams) windowparams = {};
    if (params) url += '?' + $.param(params);
    var windowstr = '';
    for (var p in dfltwindowparams) { if (!(p in windowparams)) windowparams[p] = dfltwindowparams[p]; }
    for (var p in windowparams) { windowstr += ',' + p + '=' + windowparams[p]; }
    if (windowstr) windowstr = windowstr.substr(1);
    if (win) { win.location = url; win.focus(); return win; }
    else return window.open(url, '_blank', windowstr);
  }
  XExt.popupReport = function (modelid, params, windowparams, win) {
    var url = jsh._BASEURL + '_d/_report/' + modelid + '/';
    var dfltwindowparams = { width: 1000, height: 600, resizable: 1, scrollbars: 1 };
    var modelmd5 = XExt.getModelMD5(modelid);
    if (modelmd5 in jsh.popups) {
      default_popup_size = jsh.popups[modelmd5];
      dfltwindowparams.width = default_popup_size[0];
      dfltwindowparams.height = default_popup_size[1];
    }
    if (!windowparams) windowparams = {};
    if (params) url += '?' + $.param(params);
    var windowstr = '';
    for (var p in dfltwindowparams) { if (!(p in windowparams)) windowparams[p] = dfltwindowparams[p]; }
    for (var p in windowparams) { windowstr += ',' + p + '=' + windowparams[p]; }
    if (windowstr) windowstr = windowstr.substr(1);
    if (win) { win.location = url; win.focus(); return win; }
    else return window.open(url, '_blank', windowstr);
  }
  XExt.renderCanvasCheckboxes = function () {
    jsh.$root('canvas.checkbox.checked').each(function () {
      var obj = this;
      var w = obj.width;
      var h = obj.height;
      var ctx = obj.getContext("2d");
      
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
  }
  XExt.DataBinding = function(data){
    this.Bindings = [];
    this.Data = data;
  }
  XExt.DataBinding.prototype.Bind = function(obj){
    if(!obj.OnUpdate) throw new Error('Binding missing OnUpdate handler');
    if(!_.includes(this.Bindings,obj)){
      this.Bindings.push(obj);
      obj.OnUpdate(this.Data);
    }
  }
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
  }
  XExt.DataBinding.prototype.Update = function(data){
    var _this = this;
    _this.Data = data;
    for(var i=0;i<_this.Bindings.length;i++){
      var binding = _this.Bindings[i];
      binding.OnUpdate(_this.Data);
    }
  }
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
  }
  XExt.selectionIsChildOf = function(jobj){
    if(window.getSelection){
      var sel = window.getSelection();
      if(!sel || !sel.rangeCount) return false;
      var rstart = sel.getRangeAt(0);
      if(jobj[0] == rstart.startContainer) return true;
      return $.contains(jobj[0],rstart.startContainer);
    }
    else throw new Error('Inserting text into contenteditable not supported.');
  }
  XExt.hasSelection = function(){
    if (window.getSelection) {
      var sel = window.getSelection();
      if(!sel || !sel.rangeCount) return false;
      var r = sel.getRangeAt(0);
      if(!r) return false;
      return !r.collapsed;
    }
    return false;
  }
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
  }
  XExt.Tick = function(f){
    window.setTimeout(f,1);
  }
  XExt.scrollIntoView = function(jcontainer, pos, h){
    if(!jcontainer.length) return;
    var sTop = jcontainer.scrollTop();
    var sLeft = jcontainer.scrollLeft();
    var cW = jcontainer[0].clientWidth;
    var cH = jcontainer[0].clientHeight;
    var minV = sTop;
    var maxV = sTop + cH;
    var minH = sLeft;
    var maxH = sLeft + cW;
    var posbottom = pos.top + h;
    if((pos.left < minH) || (pos.left > maxH)) jcontainer.scrollLeft(pos.left);
    if((posbottom < minV) || (posbottom > maxV)){
      if(posbottom < minV) jcontainer.scrollTop(pos.top);
      else { 
        var newscrollTop = posbottom - cH;
        if(newscrollTop < 0) newscrollTop = 0;
        jcontainer.scrollTop(newscrollTop);
      }
    }
    else if(pos.top < minV){
      jcontainer.scrollTop(pos.top);
    }
  }
  XExt.scrollObjIntoView = function(jcontainer, jobj){
    var jobjpos = jobj.offset();
    var jcontainerpos = jcontainer.offset();
    jobjpos.top -= jcontainerpos.top - jcontainer.scrollTop();
    jobjpos.left -= jcontainerpos.left - jcontainer.scrollLeft();
    XExt.scrollIntoView(jcontainer, jobjpos, jobj.height());
  }
  //Check if the mouse is within the target element
  XExt.isMouseWithin = function(elem) {
    return XExt.isPointWithin(elem, jsh.mouseX, jsh.mouseY);
  }
  //Check if the x,y coordinate is within the element
  XExt.isPointWithin = function(elem, x, y) {
    var jobj = $(elem);
    var joff = jobj.offset();
    var w = jobj.outerWidth();
    var h = jobj.outerHeight();
    if (x < joff.left) return false;
    if (x > (joff.left + w)) return false;
    if (y < joff.top) return false;
    if (y > (joff.top + h)) return false;
    return true;
  }
  //Bind tab control events
  XExt.bindTabControl = function(obj){
    var jobj = $(obj);
    var jtabbuttons = jobj.children('.xtab');
    var jtabpanels = jobj.children('.xpanel').children('.xtabbody');
    jtabbuttons.on('click', function(){
      var jtabbutton = $(this);
      if(jtabbutton.hasClass('selected')) return;
      jtabbuttons.removeClass('selected');
      jtabpanels.removeClass('selected');
      jtabbutton.addClass('selected');
      jtabpanels.filter('.'+jtabbutton.attr('for')).addClass('selected');
    });
    if(!jtabbuttons.filter('.selected').length) jtabbuttons.first().addClass('selected');
    jtabpanels.filter('.'+jtabbuttons.filter('.selected').attr('for')).addClass('selected');
    jobj.addClass('initialized');
  }

  return XExt;
}