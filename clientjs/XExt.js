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

exports.XForm = require('./XExt.XForm.js');

exports.parseGET = function (qs) {
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

exports.RenderLOV = function (_data, ctrl, LOV) {
  ctrl.empty();
  ctrl.html(ejs.render('\
	   <% for(var i=0;i<data.length;i++){ %>\
		 <option value="<%=data[i][window.jshuimap.codeval]%>"><%=data[i][window.jshuimap.codetxt]%></option>\
		 <% } %>'
	  , { data: LOV }
  ));
}

exports.RenderParentLOV = function (_data, ctrl, parentvals, LOV, field, plural) {
  //Get Previous Value
  var prevval = _data[field.name];
  if (prevval == null) prevval = '';
  ctrl.empty();
  var lovfilter = {};
  if (!plural) lovfilter[window.jshuimap.codeparent] = parentvals[0];
  else {
    for (var i = 0; i < parentvals.length; i++) {
      lovfilter[window.jshuimap.codeparent + (i + 1)] = parentvals[i];
    }
  }
  
  var cLOV = _.filter(LOV, lovfilter);
  if ((!plural) && (!(window.jshuimap.codeparent in LOV[0]))) cLOV.unshift(LOV[0]);
  else if ((plural) && (!((window.jshuimap.codeparent + '1') in LOV[0]))) cLOV.unshift(LOV[0]);
  else if ('lovblank' in field) cLOV.unshift(LOV[0]);
  ctrl.html(ejs.render('\
	   <% for(var i=0;i<data.length;i++){ %>\
		 <option value="<%=data[i][window.jshuimap.codeval]%>"><%=data[i][window.jshuimap.codetxt]%></option>\
		 <% } %>'
	  , { data: cLOV }
  ));
  //Apply prevval
  var lov_matches = ctrl.children('option').filter(function () { return String($(this).val()).toUpperCase() == String(prevval).toUpperCase(); }).length;
  if (lov_matches > 0) ctrl.val(prevval);
}

exports.CancelBubble = function (e) {
  if (!e) e = window.event;
  if (e.stopPropagation) e.stopPropagation();
  else e.cancelBubble = true;
}

exports.ShowContextMenu = function (selector,context_item,data){
  if (!selector) selector = '.xcontext_menu';
  $('.xcontext_menu').hide();
  $(selector).css('visibility', 'hidden');
  $(selector).show();
  var xtop = mouseY; var xleft = mouseX;
  var offset = $(selector).offsetParent().offset();
  xtop -= offset.top - 1;
  xleft -= offset.left - 1;

  var wwidth = $(window).width();
  var wheight = $(window).height() - 20;
  var dwidth = $(selector).outerWidth()+4;
  var dheight = $(selector).outerHeight()+4;
  if ((xtop + dheight) > wheight) xtop = wheight - dheight;
  if ((xleft + dwidth) > wwidth) xleft = wwidth - dwidth;
  if (xtop < 0) xtop = 0;
  if (xleft < 0) xleft = 0;

  $(selector).css({ 'top': xtop, 'left': xleft });
  $(selector).css('visibility', 'visible');
  global.xContextMenuVisible = true;
  global.xContextMenuItem = context_item;
  global.xContentMenuItemData = data;
}

exports.CallAppFunc = function (q, method, d, onComplete, onFail, options){
  if(!options) options = {};
  var getVars = function () {
    for (var dname in d) {
      var dval = d[dname];
      if (dval && (dval instanceof exports.InputValue)) {
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
    var xpost = new XPost(q, '', '');
    xpost.Data = d;
    var dq = {}, dp = {};
    if (method == 'get') dq = d;
    else if (method == 'postq') { dq = d; method = 'post'; }
    else if (method == 'putq') { dq = d; method = 'put'; if (options.post) { dp = options.post; } }
    else dp = d;
    xpost.qExecute(xpost.PrepExecute(method, xpost.q, dq, dp, function (rslt) {
      if ('_success' in rslt) {
        if (onComplete) onComplete(rslt);
        else XExt.Alert('Operation completed successfully.');
      }
    }, onFail));
  }
  getVars();
}

exports.InputValue = function (_Caption, _Validation, _Default, _PostProcess){
  this.Caption = _Caption;
  this.Validation = _Validation;
  this.Default = (_Default ? _Default : '');
  this.PostProcess = _PostProcess;
  this.Value = undefined;
}
exports.InputValue.prototype.Prompt = function (onComplete) {
  var _this = this;
  XExt.Prompt(_this.Caption, _this.Default, function (rslt) {
    if (rslt == null) {
      if (onComplete) { onComplete(null); }
      return;
    }
    else {
      if (_this.Validation) {
        var v = new XValidate();
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
exports.getLOVTxt = function (LOV, val) {
  if (val) val = val.toString();
  for (var i = 0; i < LOV.length; i++) {
    if (LOV[i][window.jshuimap.codeval] == val) return LOV[i][window.jshuimap.codetxt];
  }
  return undefined;
}
exports.pushLOV = function (LOV, val, txt) {
  var newlov = {};
  newlov[window.jshuimap.codeval] = val;
  newlov[window.jshuimap.codetxt] = txt;
  LOV.push(newlov);
}

exports.endsWith = function (str, suffix) {
  return str.match(suffix + "$") == suffix;
}
exports.beginsWith = function (str, prefix) {
  return str.indexOf(prefix) === 0;
}

exports.HasAccess = function (access, perm) {
  if (access === undefined) return false;
  for (var i = 0; i < perm.length; i++) {
    if (access.indexOf(perm[i]) > -1) return true;
  }
  return false;
};

exports.access = exports.HasAccess;

exports.UndefinedBlank = function (val) {
  if (typeof val == 'undefined') return '';
  return val;
}

exports.ReplaceAll = function (val, find, replace) {
  return val.split(find).join(replace);
}

exports.AddHistory = function (url, obj, title) {
  if (!global.isHTML5) return;
  if (typeof obj == 'undefined') obj = {};
  if (typeof title == 'undefined') title = document.title;
  window.history.pushState(obj, title, url);
}

exports.ReplaceHistory = function (url, obj, title) {
  if (!global.isHTML5) return;
  if (typeof obj == 'undefined') obj = {};
  if (typeof title == 'undefined') title = document.title;
  window.history.replaceState(obj, title, url);
}

exports.clearFileInput = function (id) {
  var oldInput = document.getElementById(id);
  var newInput = document.createElement("input");
  newInput.type = "file";
  newInput.id = oldInput.id;
  newInput.name = oldInput.name;
  newInput.className = oldInput.className;
  newInput.style.cssText = oldInput.style.cssText;
  oldInput.parentNode.replaceChild(newInput, oldInput);
};

exports.hideTab = function (modelid, tabname) {
  $('.xtab' + modelid).each(function (i, obj) {
    var jobj = $(obj);
    if (jobj.html() == tabname) jobj.hide();
  });
}

//Escape JavaScript string
exports.escapeJS = function (q) {
  return q.replace(/[\\'"]/g, "\\$&");
}

//Escape just quotes (for XML/HTML key-value pairs)
exports.escapeHTMLQ = function (q) {
  return q.replace(/["]/g, "&quot;");
}

//Escape while enabling escape characters in a string
exports.escapeHTMLN = function (val) {
  var rslt = exports.escapeHTML(val);
  return String(val).replace(/&amp;([\w]+);/g, function (s,p1) {
    return '&'+p1+';';
  });
}

//Escape all HTML
exports.escapeHTML = function (val) {
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
exports.escapeHTMLBR = function (val) {
  if((typeof val=='undefined')||(val===null)) return val;
  return XExt.ReplaceAll(XExt.ReplaceAll(exports.escapeHTML(val.toString()), '\n', '<br/>'), '\r', '');
}
//Escape HTML and replace line breaks with spaces
exports.escapeBRSpace = function (val) {
  if((typeof val=='undefined')||(val===null)) return val;
  return XExt.ReplaceAll(XExt.ReplaceAll(val.toString(), '\n', ' '), '\r', '');
}
//Escape string for regular expression matching
exports.escapeRegEx = function (q) {
  return q.replace(/[-[\]{}()*+?.,\\/^$|#\s]/g, "\\$&");
}
exports.pad = function (val, padding, length) {
  var rslt = val.toString();
  while (rslt.length < length) rslt = padding + rslt;
  return rslt;
}
exports.getMargin = function(jctrl){
  return {
    top: parseInt(jctrl.css('margin-top')),
    right: parseInt(jctrl.css('margin-right')),
    bottom: parseInt(jctrl.css('margin-bottom')),
    left: parseInt(jctrl.css('margin-left'))
  };
}
exports.getPadding = function(jctrl){
  return {
    top: parseInt(jctrl.css('padding-top')),
    right: parseInt(jctrl.css('padding-right')),
    bottom: parseInt(jctrl.css('padding-bottom')),
    left: parseInt(jctrl.css('padding-left'))
  };
}
exports.getBorder = function(jctrl){
  return {
    top: parseInt(jctrl.css('border-top-width')),
    right: parseInt(jctrl.css('border-right-width')),
    bottom: parseInt(jctrl.css('border-bottom-width')),
    left: parseInt(jctrl.css('border-left-width'))
  };
}
exports.xejs = {
  'escapeJS': function(val){ return exports.escapeJS(val); },
  'escapeHTMLN': function(val){ return exports.escapeHTMLN(val); },
  'escapeHTMLBR': function(val){ return exports.escapeHTMLBR(val); },
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
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].key)
        func(fields[i]);
    }
  },
  'showProp': function (prop, val, unescaped) {
    if (typeof val != 'undefined') {
      if (unescaped) return prop + '="' + val + '"';
      else return prop + '="' + exports.escapeHTML(val) + '"';
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
      //else if (_.includes(['bigint', 'int', 'smallint', 'boolean'], field.type)) return 'number';
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
      effperm = exports.xejs.intersectperm(effperm, arguments[i]);
      kfc = exports.xejs.unionperm(kfc, this.intersectperm('KFC', arguments[i]));
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
      rslt += '<option value="' + exports.escapeHTML(lovval[window.jshuimap.codeval]) + '" ' + ((lovval[window.jshuimap.codeval] == selected_value)?'selected':'') + '>' + exports.escapeHTML(lovval[window.jshuimap.codetxt]) + '</option>';
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

exports.CKEditor = function (id) {
  if (CKEDITOR.instances[id]) return;
  var elem = $('#' + id);
  var orig_width = elem.outerWidth();
  var orig_height = elem.outerHeight();
  elem.wrap('<div id="' + id + '_container" style="width:' + orig_width + 'px;border:1px solid #999;display:inline-block;"></div>');
  CKEDITOR.replace(id);
}
exports.notifyPopupComplete = function (id, rslt) {
  if (window.opener) {
    if ('XPopupComplete' in window.opener) window.opener.XPopupComplete(id, rslt);
  }
}
exports.unescapeEJS = function (ejssrc) {
  if (!ejssrc) return '';
  var rslt = ejssrc;
  rslt = XExt.ReplaceAll(rslt, '&lt;#', '<#');
  rslt = XExt.ReplaceAll(rslt, '#&gt;', '#>');
  return rslt;
}
exports.isOnePage = function () {
  if ((typeof window['jsh_onepage'] != 'undefined') && (window.jsh_onepage)) return true;
  return false;
}
exports.navTo = function (url) {
  if (exports.isOnePage()) {
    var a = exports.getURLObj(url);
    if (!window.jshNavigate(a, undefined, undefined, undefined)) return false;
  }
  window.location.href = url;
  return false;
}
exports.jumpAnchor = function (name) {
  if (!name) return;
  if (name[0] == '#') name = name.substring(1);
  var jobj = $('a[name=' + name + ']');
  if (jobj.size() == 0) return;
  var elem = jobj.get(0);
  var elemoff = $(elem).offset();
  window.scrollTo(0, elemoff.top);
}
exports.getURLObj = function (url) {
  var a = document.createElement('a');
  a.href = url;
  return a;
};
exports.aPhoneCheck = function (jobj, caption) {
  var val = jobj.val()
  if (val && (val == '1' || !val.match(/[0123456789]/))) {
    jobj.addClass('xinputerror');
    XExt.Alert('Invalid ' + caption);
    return false;
  }
  return true;
}
exports.StripTags = function (val, ignore) {
  if (!val) return val;
  
  ignore = (((ignore || '') + '').toLowerCase().match(/<[a-z][a-z0-9]*>/g) || []).join('')
  var clienttags = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi
  var servertags = /<!--[\s\S]*?-->|<\?(?:php)?[\s\S]*?\?>/gi
  
  return exports.unescapeHTMLEntity(val.replace(servertags, '').replace(clienttags, function ($0, $1) {
    return ignore.indexOf('<' + $1.toLowerCase() + '>') > -1 ? $0 : ''
  }));
}
exports.unescapeHTMLEntity = function(val){
  var obj = document.createElement("textarea");
  obj.innerHTML = val;
  return obj.value;
}
exports.readCookie = function(id){
  var rslt = [];
  var cookies = document.cookie.split(';');
  var rx=RegExp("^\\s*"+exports.escapeRegEx(id)+"=\\s*(.*?)\\s*$");
  for(var i=0;i<cookies.length;i++){
    var m = cookies[i].match(rx);
    if(m) rslt.push(m[1]);
  }
  return rslt;
}
exports.currentURL = function(){
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

exports.TreeRender = function (ctrl, LOV, field) {
  //Create Cache of Opened Nodes
  var expanded_nodes = exports.TreeGetExpandedNodes(ctrl);
  var selected_nodes = exports.TreeGetSelectedNodes(ctrl);
  
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
    node.ID = iLOV[window.jshuimap.codeid];
    node.ParentID = iLOV[window.jshuimap.codeparentid];
    node.Value = iLOV[window.jshuimap.codeval];
    node.Text = iLOV[window.jshuimap.codetxt];
    node.Icon = iLOV[window.jshuimap.codeicon];
    node.Seq = iLOV[window.jshuimap.codeseq];
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
  if (has_seq) sortednodes = _.sortBy(sortednodes, [window.jshuimap.codeseq, window.jshuimap.codetxt]);
  
  var body = '';
  for (var i = 0; i < tree.length; i++) {
    body += exports.TreeRenderNode(ctrl, tree[i]);
  }
  ctrl.html(body);
  if (field && field.controlparams) {
    if (field.controlparams.expand_all) exports.TreeExpandAll(ctrl);
    else if ((typeof field.controlparams.expand_to_selected == 'undefined') || (field.controlparams.expand_to_selected)) exports.TreeExpandToSelected(ctrl);
  }
}

exports.TreeRenderNode = function (ctrl, n) {
  var children = '';
  for (var i = 0; i < n.Children.length; i++) {
    children += exports.TreeRenderNode(ctrl, n.Children[i]);
  }
  var rslt = ejs.render('\
    <a href="#" class="tree_item tree_item_<%=n.ID%> <%=(n.Children.length==0?"nochildren":"")%> <%=(n.Expanded?"expanded":"")%> <%=(n.Selected?"selected":"")%>" data-value="<%=n.Value%>" onclick=\'XExt.TreeSelectNode(this,<%-JSON.stringify(n.ID)%>); return false;\' ondblclick=\'XExt.TreeDoubleClickNode(this,<%-JSON.stringify(n.ID)%>); return false;\' oncontextmenu=\'return XExt.TreeItemContextMenu(this,<%-JSON.stringify(n.ID)%>);\'><div class="glyph" href="#" onclick=\'XExt.CancelBubble(arguments[0]); XExt.TreeToggleNode($(this).closest(".xform_ctrl.tree"),<%-JSON.stringify(n.ID)%>); return false;\'><%-(n.Expanded?"&#x25e2;":"&#x25b7;")%></div><img class="icon" src="/images/icon_<%=n.Icon%>.png"><span><%=n.Text%></span></a>\
    <div class="children <%=(n.Expanded?"expanded":"")%> tree_item_<%=n.ID%>" data-value="<%=n.Value%>"><%-children%></div>',
    { n: n, children: children }
  );
  return rslt;
}

exports.TreeItemContextMenu = function (ctrl, n) {
  var jctrl = $(ctrl);
  var jtree = jctrl.closest('.xform_ctrl.tree');
  var fieldname = exports.getFieldFromObject(ctrl);
  var menuid = '#_item_context_menu_' + fieldname;
  if(jtree.data('oncontextmenu')) { var rslt = (new Function('n', jtree.data('oncontextmenu'))); rslt.call(ctrl, n); }
  if ($(menuid).length) {
    exports.ShowContextMenu(menuid, $(ctrl).data('value'), { id:n });
    return false;
  }
  return true;
}

exports.TreeDoubleClickNode = function (ctrl, n) {
  var jctrl = $(ctrl);
  var jtree = jctrl.closest('.xform_ctrl.tree');
  var fieldname = exports.getFieldFromObject(ctrl);
  if(jtree.data('ondoubleclick')) { var rslt = (new Function('n', jtree.data('ondoubleclick'))); rslt.call(ctrl, n); }
}

exports.TreeGetSelectedNodes = function (ctrl) {
  var rslt = [];
  $(ctrl).find('.tree_item.selected').each(function () {
    var val = $(this).data('value');
    if (val) rslt.push(val.toString());
  });
  return rslt;
}

exports.TreeGetExpandedNodes = function (ctrl) {
  var rslt = [];
  $(ctrl).find('.tree_item.expanded').each(function () {
    var val = $(this).data('value');
    if (val) rslt.push(val.toString());
  });
  return rslt;
}

exports.TreeSelectNode = function (ctrl, nodeid) {
  var jctrl = $(ctrl);
  
  var xform = exports.getFormFromObject(ctrl);
  var fieldname = exports.getFieldFromObject(ctrl);
  var field = undefined;
  if (xform && fieldname) field = xform.Data.Fields[fieldname];
  
  var jtree = jctrl.closest('.xform_ctrl.tree');
  if (jtree.hasClass('uneditable')) return;
  jtree.find('.selected').removeClass('selected');
  jtree.find('.tree_item.tree_item_' + nodeid).addClass('selected');
  if (field && field.controlparams) {
    if ((typeof field.controlparams.expand_to_selected == 'undefined') || (field.controlparams.expand_to_selected)) exports.TreeExpandToSelected(ctrl);
  }
  if (field && init_complete) {
    if ('onchange' in field) { var rslt = (new Function('obj', 'newval', 'e', field.onchange)); rslt.call(xform.Data, ctrl, xform.Data.GetValue(field), null); }
  }
  if(jtree.data('onselected')) { var rslt = (new Function('nodeid', jtree.data('onselected'))); rslt.call(ctrl, nodeid); }
}

exports.TreeToggleNode = function (jctrl, nodeid) {
  var jctrl = jctrl.closest('.xform_ctrl.tree');
  if (jctrl.find('.children.tree_item_' + nodeid).hasClass('expanded'))
    exports.TreeCollapseNode(jctrl, nodeid);
  else
    exports.TreeExpandNode(jctrl, nodeid);
}

exports.TreeCollapseNode = function (jctrl, nodeid) {
  var jctrl = jctrl.closest('.xform_ctrl.tree');
  jctrl.find('.tree_item_' + nodeid).removeClass('expanded');
  jctrl.find('.tree_item.tree_item_' + nodeid + ' > .glyph').html('&#x25b7;');
}

exports.TreeExpandNode = function (jctrl, nodeid) {
  var jctrl = jctrl.closest('.xform_ctrl.tree');
  jctrl.find('.tree_item_' + nodeid).addClass('expanded');
  jctrl.find('.tree_item.tree_item_' + nodeid + ' > .glyph').html('&#x25e2;');
}

exports.TreeExpandToSelected = function (ctrl) {
  var toptree = $(ctrl).closest('.xform_ctrl.tree');
  var rslt = [];
  toptree.find('.tree_item.selected').each(function () {
    var jctrl = $(this);
    var jparent = jctrl.parent();
    while (jparent.length && !jparent.is(toptree)) {
      exports.TreeExpandNode(toptree, jparent.data('value'));
      jparent = jparent.parent();
    }
  });
  return rslt;
}
exports.TreeExpandAll = function (ctrl) {
  var jctrl = $(ctrl).closest('.xform_ctrl.tree');
  jctrl.find('.tree_item').addClass('expanded');
  jctrl.find('.children').addClass('expanded');
  jctrl.find('.glyph').html('&#x25e2;');
}

/*********************
 * GENERAL FUNCTIONS *
 *********************/

exports.getMaxLength = function (field) {
  var rslt = -1;
  if ('type' in field) {
    var ftype = field.type;
    if ((ftype == 'varchar' || ftype == 'char') && ('length' in field)) rslt = field.length;
    else if (ftype == 'bigint') rslt = 25;
    else if (ftype == 'datetime') rslt = 25;
    else if (ftype == 'time') rslt = 20;
    else if (ftype == 'date') rslt = 10;
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
    else if (ftype == 'int') rslt = 15;
    else if (ftype == 'smallint') rslt = 10;
    else if (ftype == 'boolean') rslt = 5;
  }
  return rslt;
}

exports.XInputAction = function (_obj, _overrideFunc) {
  if (_obj && (_obj instanceof jQuery) && (_obj.length)) this.obj = _obj[0];
  else this.obj = _obj;
  this.tstamp = Date.now();
  this.mouseX = window.mouseX;
  this.mouseY = window.mouseY;
  this.mouseDown = window.mouseDown;
  this.overrideFunc = _overrideFunc;
}

exports.XInputAction.prototype.Exec = function () {
  var _this = this;
  if (_this.obj) $(_this.obj).focus();
  if (this.overrideFunc) this.overrideFunc();
  else if (_this.obj && _this.mouseDown) {
    exports.Click(_this.obj);
  }
}

exports.XInputAction.prototype.IsExpired = function () {
  return (new Date().getTime() - this.tstamp) > 100;
}

exports.getLastClicked = function () {
  var is_recent_click = (new Date().getTime() - window.last_clicked_time) < 100;
  if (window.last_clicked && is_recent_click) return window.last_clicked;
  return undefined;
}

exports.Click = function (obj) {
  var gevent = new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    view: window,
  });
  window.setTimeout(function () { obj.dispatchEvent(gevent); }, 1);
}

exports.isIOS = function () {
  if ((navigator.userAgent.match(/iPhone/i)) || 
      (navigator.userAgent.match(/iPod/i)) || 
      (navigator.userAgent.match(/iPad/i))) {
    return true;
  }
}

exports.clearDialogs = function(){
  window.xDialog = [];
  $('#xdialogblock').children().hide();
  $('#xdialogblock').hide();
}

exports.dialogButtonFunc = function (dialogClass, oldactive, onComplete, params) {
  if (!params) params = {};
  return function () {
    //Delete duplicates from stack
    for (var i = 0; i < window.xDialog.length; i++) {
      for (var j = 0; j < i; j++) {
        if (window.xDialog[j] == window.xDialog[i]) {
          window.xDialog.splice(i, 1);
          i--;
          break;
        }
      }
    }
    //Verify this is the topmost dialog
    if ((window.xDialog.length > 0) && (window.xDialog[0] != dialogClass)) return;
    $('#xdialogblock ' + dialogClass).hide();
    if (window.xDialog.length == 1) { $('#xdialogblock').hide(); }
    if (window.xDialog[0] != dialogClass) { alert('ERROR - Invalid Dialog Stack'); console.log(dialogClass); console.log(window.xDialog); }
    if (oldactive) oldactive.focus();
    window.setTimeout(function () { window.xDialog.shift(); if (onComplete) onComplete(); }, 1);
    if (params.onCompleteImmediate) params.onCompleteImmediate();
  }
}

exports.Alert = function (obj, onAccept, params) {
  if (!params) params = {};
  var msg = '';
  if (obj && _.isString(obj)) msg = obj;
  else msg = JSON.stringify(obj);
  msg = XExt.escapeHTML(msg);
  msg = XExt.ReplaceAll(XExt.ReplaceAll(msg, '\n', '<br/>'), '\r', '');
  //alert(msg);
  window.xDialog.unshift('#xalertbox');
  $('#xdialogblock #xalertbox').zIndex(window.xDialog.length);
  
  var oldactive = document.activeElement;
  if (oldactive) $(oldactive).blur();
  $('#xalertmessage').html(msg);
  $('#xalertbox input').off('click');
  $('#xalertbox input').off('keydown');
  var acceptfunc = exports.dialogButtonFunc('#xalertbox', oldactive, onAccept, { onCompleteImmediate: params.onAcceptImmediate });
  $('#xalertbox input').on('click', acceptfunc);
  $('#xalertbox input').on('keydown', function (e) { if (e.keyCode == 27) { acceptfunc(); } });
  
  $('#xdialogblock,#xalertbox').show();
  window.XWindowResize();
  if (!exports.isIOS()) $('#xalertbox input').focus();
}

exports.Confirm = function (obj, onAccept, onCancel, options) {
  if (!options) options = {};
  var msg = '';
  if (obj && _.isString(obj)) msg = obj;
  else msg = JSON.stringify(obj);
  msg = XExt.escapeHTML(msg);
  msg = XExt.ReplaceAll(XExt.ReplaceAll(msg, '\n', '<br/>'), '\r', '');
  //if (window.confirm(msg)) { if (onAccept) onAccept(); }
  //if (onCancel) onCancel(); 
  window.xDialog.unshift('#xconfirmbox');
  $('#xdialogblock #xconfirmbox').zIndex(window.xDialog.length);
  
  var oldactive = document.activeElement;
  if (oldactive) $(oldactive).blur();
  $('#xconfirmmessage').html(msg);
  $('#xconfirmbox input').off('click');
  $('#xconfirmbox input').off('keydown');
  var cancelfunc = exports.dialogButtonFunc('#xconfirmbox', oldactive, onCancel);
  if (options.button_no) {
    $('#xconfirmbox input.button_no').show();
    $('#xconfirmbox input.button_no').on('click', exports.dialogButtonFunc('#xconfirmbox', oldactive, options.button_no));
  }
  else $('#xconfirmbox input.button_no').hide();
  if (options.button_ok_caption) $('#xconfirmbox input.button_ok').val(options.button_ok_caption);
  if (options.button_no_caption) $('#xconfirmbox input.button_no').val(options.button_no_caption);
  if (options.button_cancel_caption) $('#xconfirmbox input.button_cancel').val(options.button_cancel_caption);


  $('#xconfirmbox input.button_ok').on('click', exports.dialogButtonFunc('#xconfirmbox', oldactive, onAccept));
  $('#xconfirmbox input.button_cancel').on('click', cancelfunc);
  $('#xconfirmbox input').on('keydown', function (e) { if (e.keyCode == 27) { cancelfunc(); } });
  $('#xdialogblock,#xconfirmbox').show();
  window.XWindowResize();
  if (!exports.isIOS()) $('#xconfirmbox input.button_ok').focus();
}

exports.Prompt = function (obj, dflt, onComplete) {
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
  window.xDialog.unshift('#xpromptbox');
  $('#xdialogblock #xpromptbox').zIndex(window.xDialog.length);
  
  var oldactive = document.activeElement;
  if (oldactive) $(oldactive).blur();
  $('#xpromptmessage').html(msg);
  $('#xpromptbox input').off('click');
  $('#xpromptbox input').off('keydown');
  $('#xpromptfield').val(dflt);
  var cancelfunc = exports.dialogButtonFunc('#xpromptbox', oldactive, function () { if (onComplete) onComplete(null); });
  var acceptfunc = exports.dialogButtonFunc('#xpromptbox', oldactive, function () { if (onComplete) onComplete($('#xpromptfield').val()); });
  $('#xpromptbox input.button_ok').on('click', acceptfunc);
  $('#xpromptbox input.button_cancel').on('click', cancelfunc);
  $('#xpromptbox input').on('keydown', function (e) { if (e.keyCode == 27) { cancelfunc(); } });
  $('#xpromptfield').on('keydown', function (e) { if (e.keyCode == 13) { acceptfunc(); } });
  $('#xdialogblock,#xpromptbox').show();
  window.XWindowResize();
  $('#xpromptfield').focus();
}

exports.CustomPrompt = function (id, html, onInit, onAccept, onCancel, onClosed) {
  //Classes - default_focus, button_ok, button_cancel
  if ($('#xdialogblock #' + id).length) $('#xdialogblock #' + id).remove();
  $('#xdialogblock').append(html);
  
  //ShowDialog
  window.xDialog.unshift('#' + id);
  $('#xdialogblock #' + id).zIndex(window.xDialog.length);
  
  var oldactive = document.activeElement;
  if (oldactive) $(oldactive).blur();
  
  $('#' + id + ' input').off('click');
  $('#' + id + ' input').off('keydown');
  var cancelfunc = exports.dialogButtonFunc('#' + id, oldactive, function () { if (onCancel) onCancel(); if (onClosed) onClosed(); });
  var acceptfunc_aftervalidate = exports.dialogButtonFunc('#' + id, oldactive, function () { if (onClosed) onClosed(); });
  var acceptfunc = function () {
    //Verify this is the topmost dialog
    if ((window.xDialog.length > 0) && (window.xDialog[0] != ('#' + id))) return;
    
    if (onAccept) return onAccept(function () { acceptfunc_aftervalidate(); });
    else acceptfunc_aftervalidate();
  }
  if (onInit) onInit(acceptfunc, cancelfunc);
  $('#' + id + ' input.button_ok').on('click', acceptfunc);
  $('#' + id + ' input.button_cancel').on('click', cancelfunc);
  $('#' + id + ' input').on('keydown', function (e) { if (e.keyCode == 27) { cancelfunc(); } });
  $('#' + id + ' input:not(:checkbox):not(:button)').on('keydown', function (e) { if (e.keyCode == 13) { acceptfunc(); } });
  $('#xdialogblock,#' + id).show();
  window.XWindowResize();
  $('#' + id + ' .default_focus').focus();
}

exports.ZoomEdit = function (val, caption, options, onAccept, onCancel) {
  if(!options) options = {};
  if(!val) val = '';
  val = val.toString();
  window.xDialog.unshift('#xtextzoombox');
  $('#xdialogblock #xtextzoombox').zIndex(window.xDialog.length);
  
  var oldactive = document.activeElement;
  if (oldactive) $(oldactive).blur();
  $('#xtextzoommessage').html(caption);
  $('#xtextzoombox input').off('click');
  $('#xtextzoombox input').off('keydown');
  $('#xtextzoomfield').val(val);
  
  $('#xtextzoomfield').prop('readonly', (options.readonly?true:false));
  if(options.readonly) $('#xtextzoomfield').removeClass('editable').addClass('uneditable');
  else $('#xtextzoomfield').removeClass('uneditable').addClass('editable');

  var cancelfunc = exports.dialogButtonFunc('#xtextzoombox', oldactive, function () { if (onCancel) onCancel(); });
  var acceptfunc = exports.dialogButtonFunc('#xtextzoombox', oldactive, function () { if (onAccept) onAccept($('#xtextzoomfield').val()); });
  $('#xtextzoombox input.button_ok').on('click', acceptfunc);
  $('#xtextzoombox input.button_cancel').on('click', cancelfunc);
  $('#xtextzoombox input').on('keydown', function (e) { if (e.keyCode == 27) { cancelfunc(); } });
  $('#xdialogblock,#xtextzoombox').show();
  window.XWindowResize();
  $('#xtextzoomfield').focus();
}

var popupData = {};

exports.popupShow = function (modelid, fieldid, title, parentobj, obj, options) {
  if (typeof options == 'undefined') options = {};
  var parentmodelid = $(obj).data('model');
  var parentfield = null;
  if (parentmodelid) parentfield = window['XForm' + parentmodelid].prototype.Fields[fieldid];
  if (!parentobj) parentobj = $('#' + fieldid + '.xform_ctrl' + '.xelem' + parentmodelid);
  var numOpens = 0;
  
  popupData[modelid] = {};
  exports.execif(parentfield && parentfield.controlparams && parentfield.controlparams.onpopup,
    function (f) { parentfield.controlparams.onpopup(modelid, parentmodelid, fieldid, f); },
    function () {
    var codeval = $(obj).data('codeval');
    if (codeval) popupData[modelid].codeval = codeval;
    var xdata = window['xform_' + modelid];
    xdata.RowCount = 0;
    if (xdata.Prop) xdata.Prop.Enabled = true;
    $(xdata.PlaceholderID).html('');
    var orig_jsh_ignorefocusHandler = window.jsh_ignorefocusHandler;
    window.jsh_ignorefocusHandler = true;
    var popup_options = {};
    popup_options = {
      modelid: modelid,
      href: "#popup_" + fieldid + '.xelem' + parentmodelid, inline: true, closeButton: true, arrowKey: false, preloading: false, overlayClose: true, title: title, fixed: true,
      fadeOut:0,
      onOpen: function () {
        //When nested popUps are called, onOpen is not called
      },
      onComplete: function () {
        numOpens++;
        if(numOpens==1) xdata.Select();
        if ($('#popup_' + fieldid + '.xelem' + parentmodelid + ' .xfilter_value').first().is(':visible')) $('#popup_' + fieldid + ' .xfilter_value').first().focus();
        else if ($('#popup_' + fieldid + '.xelem' + parentmodelid).find('td a').length) $('#popup_' + fieldid).find('td a').first().focus();
          //else $('#popup_' + fieldid + '.xelem' + parentmodelid).find('input,select,textarea').first().focus();
      },
      onClosed: function () {
        var found_popup = false;
        for(var i=window.xPopupStack.length-1;i>=0;i--){
          if(window.xPopupStack[i].modelid==modelid){ window.xPopupStack.splice(i,1); found_popup = true; break; }
        }
        if(!found_popup) { alert('ERROR - Invalid Popup Stack'); console.log(modelid); console.log(window.xPopupStack); };

        if(window.xPopupStack.length) $.colorbox(window.xPopupStack[window.xPopupStack.length-1]);

        if (typeof popupData[modelid].result !== 'undefined') {
          parentobj.val(popupData[modelid].result);
          if (popupData[modelid].resultrow && parentfield && parentfield.controlparams && parentfield.controlparams.popup_copy_results) {
            for (var fname in parentfield.controlparams.popup_copy_results) {
              exports.setFormField(XExt.getForm(parentmodelid), fname, popupData[modelid].resultrow[parentfield.controlparams.popup_copy_results[fname]])
            }
          }
          if (options.OnControlUpdate) options.OnControlUpdate(parentobj[0], popupData[modelid]);
        }
        parentobj.focus();
        window.jsh_ignorefocusHandler = orig_jsh_ignorefocusHandler;
      }
    };
    xPopupStack.push(popup_options);
    $.colorbox(popup_options);
  });
}

exports.popupSelect = function (modelid, obj) {
  var rslt = null;
  var rowid = XExt.XForm.GetRowID(modelid, obj);
  var xdata = window['xform_' + modelid];
  var xpost = window['xform_post_' + modelid];
  
  if (popupData[modelid].codeval) rslt = xpost.DataSet[rowid][popupData[modelid].codeval];
  if (!rslt) rslt = '';
  popupData[modelid].result = rslt;
  popupData[modelid].rowid = rowid;
  popupData[modelid].resultrow = xpost.DataSet[rowid];
  xdata.Prop.Enabled = false;
  $.colorbox.close();
}

exports.popupClear = function (modelid, obj) {
  var rslt = null;
  var xdata = window['xform_' + modelid];
  var xpost = window['xform_post_' + modelid];
  
  popupData[modelid].result = rslt;
  popupData[modelid].rowid = -1;
  popupData[modelid].resultrow = new xpost.DataType();
  xdata.Prop.Enabled = false;
  $.colorbox.close();
}

exports.AlertFocus = function (ctrl, msg) {
  XExt.Alert(msg, function () { $(ctrl).focus().select(); });
}

exports.getModelId = function (obj) {
  var xid = $(obj).closest('.xtbl').attr('id');
  if (!xid) xid = $(obj).closest('.xform').attr('id');
  if (!xid) return null;
  return xid.substr(5);
}

exports.getModelMD5 = function (modelid) {
  return Crypto.MD5(jsh_frontsalt + modelid).toString();
}


exports.numOccurrences = function (val, find) {
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

exports.ItemContextMenu = function (ctrl) {
  var parent = $(ctrl).closest('.xcontext_parent');
  if (!parent.length) return true;
  var menuid = '#_item_context_menu_' + parent.attr('id');
  if (!$(menuid).length) return true;
  exports.ShowContextMenu(menuid, $(ctrl).data('value'));
  return false;
}

exports.basename = function (fname) {
  var rslt = fname;
  if (rslt.lastIndexOf('/') > 0) rslt = rslt.substr(rslt.lastIndexOf('/') + 1);
  if (rslt.lastIndexOf('\\') > 0) rslt = rslt.substr(rslt.lastIndexOf('\\') + 1);
  return rslt;
}

exports.dirname = function (path) {
  return path.replace(/\\/g, '/').replace(/\/[^\/]*\/?$/, '');
}

exports.cleanFileName = function (fname) {
  if (typeof fname === undefined) return '';
  if (fname === null) return '';
  
  fname = fname.toString();
  if (fname.length > 247) fname = fname.substr(0, 247);
  return fname.replace(/[\/\?<>\\:\*\|":]/g, '').replace(/[\x00-\x1f\x80-\x9f]/g, '').replace(/^\.+$/, '').replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, '');
}

exports.utf8_base64 = function (str) { return window.btoa(unescape(encodeURIComponent(str))); }
exports.base64_utf8 = function (str) { return decodeURIComponent(escape(window.atob(str))); }

exports.chainObj = function (obj, p, f) {
  if (!(obj[p])) obj[p] = f;
  else {
    var oldf = obj[p];
    obj[p] = function () { f(); oldf(); };
  }
}

exports.chain = function (obj, f) {
  if (!obj) return f;
  return function () { f(); obj(); };
}

exports.execif = function (cond, apply, f) {
  if (cond) apply(f);
  else f();
}

exports.findClosest = function (elem, sel) {
  var jobj = $(elem).find(sel);
  if (jobj.length) return jobj;
  var parent = $(elem).parent();
  if (!parent.length) return $();
  return exports.findClosest(parent, sel);
}

exports.getToken = function (onComplete, onFail) {
  XPost.prototype.XExecute('../_token', {}, onComplete, onFail);
}

/*************************/
/* Form Helper Functions */
/*************************/
exports.isGridControl = function (ctrl) {
  return ($('.SQ_CARRIER_PRO').closest('.xtbl').length > 0);
}
exports.getFormBase = function (id) {
  if (!XBase[id]) { XExt.Alert('ERROR: Base form ' + id + ' not found.'); return; }
  var fname = XBase[id][0];
  if (fname) return window['xform_' + fname];
  return undefined;
}
exports.getForm = function (id) {
  if (!(id in XForms)) { XExt.Alert('ERROR: Form ' + id + ' not found.'); return; }
  if (XForms[id]._layout == 'grid') return window['xform_post_' + id];
  return window['xform_' + id];
}
exports.getFormFromObject = function (ctrl) {
  var fname = $(ctrl).closest('.xform').attr('id');
  if (fname) return window['xform_' + fname.substr(5)];
  return undefined;
}
exports.getModelIdFromObject = function (ctrl) {
  var fname = $(ctrl).closest('.xform').attr('id');
  if (fname) return fname.substr(5);;
  return undefined;
}
exports.getFieldFromObject = function (ctrl) {
  return $(ctrl).closest('.xform_ctrl').attr('id');
}
exports.getFormField = function (xform, fieldname) {
  if (!xform) { XExt.Alert('ERROR: Cannot read field ' + fieldname + ' - Parent form not found.'); return; }
  if (!xform.Data.Fields[fieldname]) { XExt.Alert('ERROR: Target field ' + fieldname + ' not found in ' + xform.Data._modelid); return; }
  return xform.Data.GetValue(xform.Data.Fields[fieldname]);
}
exports.formatField = function (xform, fieldname, fieldval) {
  if (!xform) { XExt.Alert('ERROR: Cannot read field ' + fieldname + ' - Parent form not found.'); return; }
  if (!xform.Data.Fields[fieldname]) { XExt.Alert('ERROR: Target field ' + fieldname + ' not found in ' + xform.Data._modelid); return; }
  return XFormat.Apply(xform.Data.Fields[fieldname].format, fieldval);
}
exports.setFormField = function (xform, fieldname, fieldval) {
  if (!xform) { XExt.Alert('ERROR: Cannot set field ' + fieldname + ' - Parent form not found.'); return; }
  if (!xform.Data.Fields[fieldname]) { XExt.Alert('ERROR: Target field ' + fieldname + ' not found in ' + xform.Data._modelid); return; }
  exports.XForm.SetFieldValue(xform.Data, xform.Data.Fields[fieldname], fieldval);
}
exports.setFormControl = function (xform, fieldname, fieldval) { //Set fieldval to undefined for refresh
  if (!xform) { XExt.Alert('ERROR: Cannot set field ' + fieldname + ' - Parent form not found.'); return; }
  if (!xform.Data.Fields[fieldname]) { XExt.Alert('ERROR: Target field ' + fieldname + ' not found in ' + xform.Data._modelid); return; }
  exports.XForm.SetControlValue(xform.Data, xform.Data.Fields[fieldname], fieldval);
}
/***********************/
/* UI Helper Functions */
/***********************/
exports.popupForm = function (modelid, action, params, windowparams, win) {
  if (!params) params = {};
  if (action) params.action = action;
  var url = _BASEURL + modelid;
  var dfltwindowparams = { width: 1000, height: 600, resizable: 1, scrollbars: 1 };
  var modelmd5 = exports.getModelMD5(modelid);
  if (modelmd5 in jsh_popups) {
    default_popup_size = jsh_popups[modelmd5];
    dfltwindowparams.width = default_popup_size[0];
    dfltwindowparams.height = default_popup_size[1];
  }
  if (!windowparams) windowparams = {};
  if (params) url += '?' + $.param(params);
  var windowstr = '';
  for (var p in dfltwindowparams) { if (!(p in windowparams)) windowparams[p] = dfltwindowparams[p]; }
  for (var p in windowparams) { windowstr += ',' + p + '=' + windowparams[p]; }
  if (windowstr) windowstr = windowstr.substr(1);
  if (win) { win.location = url; win.focus(); }
  else return window.open(url, '_blank', windowstr);
}
exports.popupReport = function (modelid, params, windowparams, win) {
  var url = _BASEURL + '_d/_report/' + modelid + '/';
  var dfltwindowparams = { width: 1000, height: 600, resizable: 1, scrollbars: 1 };
  var modelmd5 = exports.getModelMD5('_report_' + modelid);
  if (modelmd5 in jsh_popups) {
    default_popup_size = jsh_popups[modelmd5];
    dfltwindowparams.width = default_popup_size[0];
    dfltwindowparams.height = default_popup_size[1];
  }
  if (!windowparams) windowparams = {};
  if (params) url += '?' + $.param(params);
  var windowstr = '';
  for (var p in dfltwindowparams) { if (!(p in windowparams)) windowparams[p] = dfltwindowparams[p]; }
  for (var p in windowparams) { windowstr += ',' + p + '=' + windowparams[p]; }
  if (windowstr) windowstr = windowstr.substr(1);
  if (win) { win.location = url; win.focus(); }
  else return window.open(url, '_blank', windowstr);
}
exports.renderCanvasCheckboxes = function () {
  $('canvas.checkbox.checked').each(function () {
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
exports.DataBinding = function(data){
  this.Bindings = [];
  this.Data = data;
}
exports.DataBinding.prototype.Bind = function(obj){
  if(!obj.OnUpdate) throw new Error('Binding missing OnUpdate handler');
  if(!_.includes(this.Bindings,obj)){
    this.Bindings.push(obj);
    obj.OnUpdate(this.Data);
  }
}
exports.DataBinding.prototype.Unbind = function(obj){
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
exports.DataBinding.prototype.Update = function(data){
  var _this = this;
  _this.Data = data;
  for(var i=0;i<_this.Bindings.length;i++){
    var binding = _this.Bindings[i];
    binding.OnUpdate(_this.Data);
  }
}
exports.insertTextAtCursor = function(txt,className){
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
exports.selectionIsChildOf = function(jobj){
  if(window.getSelection){
    var sel = window.getSelection();
    if(!sel || !sel.rangeCount) return false;
    var rstart = sel.getRangeAt(0);
    if(jobj[0] == rstart.startContainer) return true;
    return $.contains(jobj[0],rstart.startContainer);
  }
  else throw new Error('Inserting text into contenteditable not supported.');
}
exports.hasSelection = function(){
  if (window.getSelection) {
    var sel = window.getSelection();
    if(!sel || !sel.rangeCount) return false;
    var r = sel.getRangeAt(0);
    if(!r) return false;
    return !r.collapsed;
  }
  return false;
}
exports.clearSelection = function(){
  if(!exports.hasSelection()) return;
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
exports.Tick = function(f){
  window.setTimeout(f,1);
}
exports.scrollIntoView = function(jcontainer, pos, h){
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
exports.scrollObjIntoView = function(jcontainer, jobj){
  var jobjpos = jobj.offset();
  var jcontainerpos = jcontainer.offset();
  jobjpos.top -= jcontainerpos.top - jcontainer.scrollTop();
  jobjpos.left -= jcontainerpos.left - jcontainer.scrollLeft();
  exports.scrollIntoView(jcontainer, jobjpos, jobj.height());
}