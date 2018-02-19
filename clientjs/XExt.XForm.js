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

exports.GetRowID = function (modelid,obj){
  var jobj = $(obj);
  if(jobj.hasClass('row_independent')) return -1;
  var cur_row = jobj.closest('.xrow_'+modelid);
  if (cur_row.length) {
    return cur_row.data('id');
  }
  return -1;
}

exports.OnRender = function (modelid) {
  return function(){
    var _this = this;
    var parentobj = $(document);
    if (this._jrow) parentobj = this._jrow;
    var isGrid = (XForms[modelid]._layout == 'grid');
    //Clear highlighted background of currently edited cells
    parentobj.find('.xelem'+modelid+'.xform_ctrl').removeClass('updated');
    
    if (XForms[modelid]._layout == 'form-m') {
      if (window['xform_'+modelid].Count()==0) {
        $('.xelem'+modelid+'.xnorecords').show();
        $('.xelem'+modelid+'.xformcontainer').css('visibility', 'hidden');
      }
      else {
        $('.xelem'+modelid+'.xnorecords').hide();
        $('.xelem'+modelid+'.xformcontainer').css('visibility', 'visible');
      }
    }
  
    //Set List of Values
    if ('_LOVs' in this) {
      for (var _LOV in this._LOVs) {
        var lovselector = '#' + _LOV + '.xelem' + modelid;
        if (isGrid) lovselector = '.' + _LOV + '.xelem' + modelid;
        var ctrl = parentobj.find(lovselector);
        if (('control' in this.Fields[_LOV]) && (this.Fields[_LOV].control == 'tree'))
          XExt.TreeRender(ctrl, this._LOVs[_LOV], this.Fields[_LOV]);
        else if ('lovparent' in this.Fields[_LOV])
          XExt.RenderParentLOV(_this, ctrl, [_this[this.Fields[_LOV].lovparent]], this._LOVs[_LOV], this.Fields[_LOV], false);
        else if ('lovparents' in this.Fields[_LOV]) {
          var parentvals = [];
          for (var i = 0; i < this.Fields[_LOV].lovparents.length; i++) {
            parentvals.push(_this[this.Fields[_LOV].lovparents[i]]);
          }
          XExt.RenderParentLOV(_this, ctrl, parentvals, this._LOVs[_LOV], this.Fields[_LOV], true);
        }
        else
          XExt.RenderLOV(this, ctrl, this._LOVs[_LOV]);
      }
    }
    //Put data into the form
    _.each(this.Fields, function (field) {
      exports.RenderField(_this, parentobj, modelid, field);
    });
    if (XForms[modelid]._layout == 'form-m') {
      $('#navtext_' + modelid).html((window['xform_' + modelid].Index + 1) + ' of ' + window['xform_' + modelid].Count());
    }
  };
};

exports.SetFieldValue = function (xformdata, field, val){
  xformdata[field.name] = val;
  var parentobj = $(document);
  if (xformdata._jrow) parentobj = xformdata._jrow;
  exports.RenderField(xformdata, parentobj, xformdata._modelid, field, val);
}

exports.SetControlValue = function (xformdata, field, val) { //Leave val to "undefined" for refresh
  var parentobj = $(document);
  if (xformdata._jrow) parentobj = xformdata._jrow;
  var jctrl = exports.RenderField(xformdata, parentobj, xformdata._modelid, field, val);
  if(jctrl && jctrl.length) xformdata.OnControlUpdate(jctrl[0]);
}

exports.RenderField = function (_this, parentobj, modelid, field, val){
  var isGrid = (XForms[modelid]._layout == 'grid');
  if(typeof val === 'undefined') val = _this[field.name];
  //Apply formatting
  if ((field.name in _this) && (typeof val == 'undefined')) val = '';
  else val = XFormat.Apply(field.format, val);
  
  var fieldselector = '#' + field.name + '.xelem' + modelid;
  if (isGrid) fieldselector = '.' + field.name + '.xelem' + modelid;
  var jctrl = parentobj.find(fieldselector);
  if (('control' in field) && (field.control == 'file_upload')) {
    //Show "Upload File" always
    var filefieldselector = '.xelem' + modelid + ' #' + field.name;
    if (isGrid) filefieldselector = '.xelem' + modelid + ' .' + field.name;
    var jctrl_download = parentobj.find(filefieldselector + '_download');
    var jctrl_upload = parentobj.find(filefieldselector + '_upload');
    var jctrl_delete = parentobj.find(filefieldselector + '_delete');
    var jctrl_token = parentobj.find(filefieldselector + '_token');
    var jctrl_dbdelete = parentobj.find(filefieldselector + '_dbdelete');
    var jctrl_dbexists = parentobj.find(filefieldselector + '_dbexists');
    var jctrl_preview = parentobj.find(filefieldselector + '_preview');
    var jctrl_thumbnail = parentobj.find(filefieldselector + '_thumbnail');
    var file_token = jctrl_token.val();
    if (val === true) {
      //Has DB file
      jctrl.removeClass('nodocument');
      jctrl_token.val('');
      jctrl_dbdelete.val('0');
      jctrl_dbexists.val('1');
      //Set thumbnail
      if (jctrl_thumbnail.length && field.controlparams.thumbnail_width) {
        var keys = window['xform_' + modelid].GetKeys();
        if (XForms[modelid]._keys.length != 1) { throw new Error('File models require one key.'); }
        var thumb_url = _BASEURL + '_dl/' + modelid + '/' + keys[XForms[modelid]._keys[0]] + '/' + field.name + '?view=1&thumb=1&_=' + (new Date().getTime());
        jctrl_thumbnail.attr('src', thumb_url).show();
        jctrl_thumbnail.attr('width', field.controlparams.thumbnail_width + 'px');
      }
      else jctrl_thumbnail.hide();
    }
    else if (val === false) {
      //No DB File
      jctrl.addClass('nodocument');
      jctrl_token.val('');
      jctrl_dbdelete.val('0');
      jctrl_dbexists.val('0');
    }
    else if (val === '') {
      //Delete action (either delete temp file or DB file
      jctrl.addClass('nodocument');
      jctrl_token.val('');
      if (jctrl_dbexists.val() == '1') jctrl_dbdelete.val('1');
      else jctrl_dbdelete.val('0');
    }
    else if (_.isString(val)) {
      //Uploaded new temp file
      jctrl.removeClass('nodocument');
      jctrl_token.val(val);
      jctrl_dbdelete.val('0');
      //Set thumbnail
      if (jctrl_thumbnail.length && field.controlparams.thumbnail_width) {
        var thumb_url = _BASEURL + '_dl/_temp/' + file_token + '?view=1';
        jctrl_thumbnail.attr('src', thumb_url).show();
        jctrl_thumbnail.attr('width', field.controlparams.thumbnail_width + 'px');
      }
      else jctrl_thumbnail.hide();
    }
  }
  else if (('control' in field) && (field.control == 'tree')) {
    XExt.TreeSelectNode(jctrl, val);
  }
  else if (('control' in field) && (field.control == 'checkbox')) {
    var checkval = false;
    var checkhidden = false;
    if ((val == null) || (typeof val == 'undefined')) val = '';
    if ('controlparams' in field) {
      if (('value_hidden' in field.controlparams) && (val.toString().toUpperCase() == field.controlparams.value_hidden.toUpperCase())) checkhidden = true;
      if (('value_true' in field.controlparams) && (val.toString().toUpperCase() == field.controlparams.value_true.toUpperCase())) checkval = true;
      else if (('value_false' in field.controlparams) && (val.toString().toUpperCase() == field.controlparams.value_false.toUpperCase())) checkval = false;
      else checkval = XFormat.bool_decode(val);
    }
    else checkval = XFormat.bool_decode(val);
    jctrl.prop('checked', checkval);
    if (checkhidden) jctrl.css('visibility', 'hidden');
    else if (checkhidden) jctrl.css('visibility', 'visible');
  }
  else if ((jctrl.size() > 0) && jctrl.hasClass('xform_label')) { 
    if(jctrl.hasClass('xform_label_static')){
      if(val) jctrl.show();
      else jctrl.hide();
    }
    else{ jctrl.html(XExt.escapeHTMLBR(val)); }
  }
  else if ((jctrl.size() > 0) && (String(jctrl.prop('nodeName')).toUpperCase() == 'SELECT')) {
    //Check if SELECT has value.  If not, add it as an additional option at the end
    var lov_matches = jctrl.children('option').filter(function () { return String($(this).val()).toUpperCase() == String(val).toUpperCase(); }).length;
    var has_lov = (lov_matches > 0);
    var has_parent = (('lovparent' in field) || ('lovparents' in field));
    //If has parent and item missing, don't set the value
    if (has_lov || !has_parent) {
      if (!has_lov) {
        var codtxt = _this['__' + window.jshuimap.codetxt + '__' + field.name];
        if (!codtxt) codtxt = val;
        jctrl.append($('<option>', { value: val }).text(codtxt));
      }
      jctrl.val(val);
    }
  }
  else{
    jctrl.val(val);
  }
  
  //Make fields editable or locked / read-only
  var show_lookup_when_readonly = false;

  var access = (_this._is_new?'I':'U');
  var is_editable = XExt.HasAccess(field.actions, access);
  if (is_editable && ('readonly' in field) && (field.readonly == 1)) is_editable = false;
  if (('virtual' in field) && field.virtual) is_editable = true;
  if (is_editable && ('controlparams' in field) && (field.controlparams.base_readonly)) {
    is_editable = false;
    show_lookup_when_readonly = true;
  }
  if (is_editable && !jctrl.hasClass('editable')) { XEnable(jctrl); }
  else if (!is_editable && !jctrl.hasClass('uneditable')) { XDisable(jctrl, show_lookup_when_readonly); }

  return jctrl;
}

exports.OnControlUpdate = function () {
  return function (obj, e) {
    var jobj = $(obj);
    var id = $(obj).data('id');
    if(!id) id = $(obj).attr('id');
    var field = this.Fields[id];
    var _this = this;
    if (!is_add) {
      if (this.HasUpdate(id)) {
        if (!jobj.hasClass('updated')) {
          jobj.addClass('updated');
          if(jobj.parent().hasClass('checkbox_container')) jobj.parent().addClass('updated');
        }
      }
      else {
        if (jobj.hasClass('updated')) {
          jobj.removeClass('updated');
          if (jobj.parent().hasClass('checkbox_container')) jobj.parent().removeClass('updated');
        }
      }
    }
    if ('onchange' in field) { var rslt = (new Function('obj', 'newval', 'e', field.onchange)); rslt.call(_this, obj, _this.GetValue(field), e); }
  };
};

exports.GetValues = function () {
  return function (perm) {
    var _this = this;
    _.each(this.Fields, function (field) {
      if (!(('virtual' in field) && field.virtual) && !XExt.HasAccess(field.actions, perm)) return;
      var newval = _this.GetValue(field);
      //if (!('control' in field) && (newval == undefined)) return;
      _this[field.name] = newval;
    });
  };
};

exports.GetValue = function (modelid) {
  return function (field) {
    var _this = this;
    var parentobj = $(document);
    if (this._jrow) parentobj = this._jrow;
    var isGrid = (XForms[modelid]._layout == 'grid');
    
    var fieldselector = '#' + field.name + '.xelem' + modelid;
    if (isGrid) fieldselector = '.' + field.name + '.xelem' + modelid;
    var jctrl = parentobj.find(fieldselector);

    if (('control' in field) && (field.control == 'file_upload')) {
      var filefieldselector = '.xelem' + modelid + ' #' + field.name;
      if (isGrid) filefieldselector = '.xelem' + modelid + ' .' + field.name;

      var jctrl_token = parentobj.find(filefieldselector + '_token');
      var jctrl_dbdelete = parentobj.find(filefieldselector + '_dbdelete');
      var jctrl_dbexists = parentobj.find(filefieldselector + '_dbexists');
      var file_token = jctrl_token.val();
      if (file_token) return file_token;
      if (jctrl_dbdelete.val() == '1') return '';
      if (jctrl_dbexists.val() == '1') return true;
      return false;
    }
    if (('control' in field) && (field.control == 'tree')) {
      if (jctrl.length) {
        var selected_nodes = XExt.TreeGetSelectedNodes(jctrl[0]);
        if (selected_nodes.length > 0) return selected_nodes[0];
      }
      return null;
    }
    if (('control' in field) && (field.control == 'checkbox')) {
      var checked = jctrl.prop('checked');
      var ishidden = jctrl.css('visibility').toLowerCase() == 'hidden';
      var checkval = checked ? '1':'0';
      
      if ('controlparams' in field) {
        if(ishidden && ('value_hidden' in field.controlparams)) checkval = field.controlparams.value_hidden;
        else if (checked && ('value_true' in field.controlparams)) checkval = field.controlparams.value_true;
        else if (!checked && ('value_false' in field.controlparams)) checkval = field.controlparams.value_false;
      }
      return checkval;
    }
    var val = jctrl.val();
    if(typeof val === 'undefined') val = '';
    if ((typeof CKEDITOR != 'undefined') && (field.name in CKEDITOR.instances)) {
      val = CKEDITOR.instances[field.name].getData();
      val = XExt.ReplaceAll(val, '&lt;%', '<' + '%');
      val = XExt.ReplaceAll(val, '%&gt;', '%' + '>');
      val = XExt.ReplaceAll(val, '&#39;', '\'');
      val = XExt.ReplaceAll(val, '&quot;', '"');
    }
    //If field is in bindings
    var xform = XForms[modelid];
    if (('_bindings' in xform) && (_.includes(xform._bindings, field.name))) {
      val = xform[field.name]();
    }
    if ('static' in field) {
      if (field.static.indexOf('js:') == 0) {
        val = eval(field.static.substr(3));
      }
      else val = field.static;
    }
    if ('format' in field) {
      var format = field.format;
      if (_.isString(format)) val = XFormat[format + '_decode'](val);
      else {
        var fargs = [];
        for (var i = 1; i < format.length; i++) fargs.push(format[i]);
        fargs.push(val);
        val = XFormat[format[0] + '_decode'].apply(this, fargs);
      }
    }
    return val;
  };
};

exports.HasUpdates = function () {
  return function () {
    var _this = this;
    if (this._is_new) { return true; }
    var access = (this._is_new?'I':'U');
    var hasUpdates = false;
    _.each(this.Fields, function (field) {
      if (!XExt.HasAccess(field.actions, access)) return;
      if (_this.HasUpdate(field.name)) { hasUpdates = true; }
    });
    return hasUpdates;
  };
};

exports.HasUpdate = function () {
  return function (id) {
    var field = this.Fields[id];
    if (('virtual' in field) && field.virtual) return false;
    if (('static' in field) && field.static) return false;
    var oldval = this[id];
    if (typeof oldval === 'undefined') oldval = '';
    if (oldval === null) oldval = '';
    var newval = this.GetValue(field);
    if (typeof newval === 'undefined') newval = '';
    if (newval === null) newval = '';
    if (newval != oldval) { 
      if(newval.toString() == oldval.toString()) return false;
      console.log(id + " Old: " + oldval); console.log(id + " New: " + newval); return true; 
    }
    return false;
  };
};

exports.Commit = function (modelid,xpostid) {
  return function (perm) {
    var _this = this;
    var parentobj = $(document);
    if (this._jrow) parentobj = this._jrow;
    if ((XForms[modelid]._layout == 'form-m') || (XForms[modelid]._layout == 'grid')) {
      if (window[xpostid].Count()==0) return true;
    }
    //_is_new at record-level
    var _this = this;
    var access = (this._is_new?'I':'U');
    if (this.HasUpdates()) {
      if (!this._is_dirty) {
        //Clone Data to Orig
        this._orig = exports.GetOwnFields(this);
        this._is_dirty = true;
      }
    }
    this.GetValues(access);
    var _xvalidate = window['XForm' + modelid].prototype.xvalidate;
    if (_xvalidate) {
      this.xvalidate = _xvalidate;
      var valid = window[xpostid].Validate(access);
      delete this.xvalidate;
      if (!valid) return false;
    }
    return true;
  };
};

exports.GetOwnFields = function(val) {
  var rslt = {};
  _.forOwn(val, function (val, key) {
    if (key == '_LOVs') return;
    if (key == '_defaults') return;
    if (key == '_title') return;
    if (key == '_bcrumbs') return;
    if (key == '_is_new') return;
    if (key == '_is_dirty') return;
    if (key == '_is_deleted') return;
    if (key == '_orig') return;
    if (key == '_jrow') return;
    if (key == '_modelid') return;
    rslt[key] = val;
  });
  return rslt;
}

exports.BindLOV = function (modelid) {
  return function (xform, parentobj) {
    if (!parentobj) parentobj = $(document);
    var isGrid = (XForms[modelid]._layout == 'grid');
    _.each(this.Fields, function (field) {
      if (!('control' in field)) return; if (field.control == 'subform') return;
      if (field.control == 'dropdown') {
        var lovparents = [];
        var lovparents_selector = '';
        var lovparents_val = '';
        if (field.lovparent) lovparents = [field.lovparent];
        else if (field.lovparents) lovparents = field.lovparents;
        if (lovparents.length == 0) return;
        var lovparents_val = '';
        for (var i = 0; i < lovparents.length; i++) {
          var curselector = (isGrid?'.':'#') + lovparents[i] + '.xelem' + modelid;
          lovparents_selector += ((i > 0)?',':'') + curselector;
          lovparents_val += 'parentvals.push(parentobj.find("' + curselector + '").val()); ';
        }
        parentobj.find(lovparents_selector).change(function (evt) {
          var parentvals = [];
          //Narrow value of child LOV to values where CODVAL1 = that value
          var ctrl = parentobj.find((isGrid?'.':'#') + field.name + '.xelem' + modelid);
          eval(lovparents_val);
          XExt.RenderParentLOV(xform.Data, ctrl, parentvals, xform.Data._LOVs[field.name], xform.Data.Fields[field.name], ('lovparents' in field));
        });
      }
    });
  };
}