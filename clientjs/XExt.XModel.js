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

  var XExtXModel = function(){ }

  XExtXModel.GetRowID = function (modelid,obj){
    modelid = jsh.XExt.resolveModelID(modelid);
    var jobj = $(obj);
    var xmodel = jsh.XModels[modelid];
    if(jobj.hasClass('row_independent')) return -1;
    var cur_row = jobj.closest('.xrow_'+xmodel.class);
    if (cur_row.length) {
      return cur_row.data('id');
    }
    return -1;
  }

  XExtXModel.OnRender = function (modelid) {
    modelid = jsh.XExt.resolveModelID(modelid);
    return function(){
      var _this = this; //datamodel
      var parentobj = jsh.root;
      if (this._jrow) parentobj = this._jrow;
      var xmodel = jsh.XModels[modelid];
      var isGrid = (xmodel.layout == 'grid');
      //Clear highlighted background of currently edited cells
      parentobj.find('.xelem'+xmodel.class+'.xform_ctrl.updated').removeClass('updated');
      
      if (xmodel.layout == 'form-m') {
        if (xmodel.controller.form.Count()==0) {
          jsh.$root('.xelem'+xmodel.class+'.xnorecords').show();
          jsh.$root('.xelem'+xmodel.class+'.xformcontainer').css('visibility', 'hidden');
        }
        else {
          jsh.$root('.xelem'+xmodel.class+'.xnorecords').hide();
          jsh.$root('.xelem'+xmodel.class+'.xformcontainer').css('visibility', 'visible');
        }
      }
      else if(xmodel.layout == 'form') {
        if(!jsh.is_insert){
          if (xmodel.controller.form.Data._is_insert) {
            jsh.$root('.xelem'+xmodel.class+'.xnorecords').show();
            jsh.$root('.xelem'+xmodel.class+'.xformcontainer').css('visibility', 'hidden');
          }
          else {
            jsh.$root('.xelem'+xmodel.class+'.xnorecords').hide();
            jsh.$root('.xelem'+xmodel.class+'.xformcontainer').css('visibility', 'visible');
          }
        }
      }
    
      //Set List of Values
      if ('_LOVs' in this) {
        for (var _LOV in this._LOVs) {
          var lovselector = '.' + _LOV + '.xelem' + xmodel.class;
          if (isGrid) lovselector = '.' + _LOV + '.xelem' + xmodel.class;
          var ctrl = parentobj.find(lovselector);
          if (('control' in this.Fields[_LOV]) && (this.Fields[_LOV].control == 'tree'))
            jsh.XExt.TreeRender(ctrl, this._LOVs[_LOV], this.Fields[_LOV]);
          else if ('lovparent' in this.Fields[_LOV])
            jsh.XExt.RenderParentLOV(_this, ctrl, [_this[this.Fields[_LOV].lovparent]], this._LOVs[_LOV], this.Fields[_LOV], false);
          else if ('lovparents' in this.Fields[_LOV]) {
            var parentvals = [];
            for (var i = 0; i < this.Fields[_LOV].lovparents.length; i++) {
              parentvals.push(_this[this.Fields[_LOV].lovparents[i]]);
            }
            jsh.XExt.RenderParentLOV(_this, ctrl, parentvals, this._LOVs[_LOV], this.Fields[_LOV], true);
          }
          else
            jsh.XExt.RenderLOV(this, ctrl, this._LOVs[_LOV]);
        }
      }
      //Put data into the form
      _.each(this.Fields, function (field) {
        if(field.control=='tagbox'){
          jsh.XExt.TagBox_Render(parentobj.find('.'+field.name+'_editor.xtagbox'+'.xelem'+xmodel.class), parentobj.find('.'+field.name+'.xelem'+xmodel.class));
        }
        XExtXModel.RenderField(_this, parentobj, modelid, field);
      });
      if (xmodel.layout == 'form-m') {
        jsh.$root('.navtext_' + xmodel.class).html((xmodel.controller.form.Index + 1) + ' of ' + xmodel.controller.form.Count());
      }
    };
  };

  XExtXModel.SetFieldValue = function (xformdata, field, val){
    xformdata[field.name] = val;
    var parentobj = jsh.root;
    if (xformdata._jrow) parentobj = xformdata._jrow;
    XExtXModel.RenderField(xformdata, parentobj, xformdata._modelid, field, val);
  }

  XExtXModel.SetControlValue = function (xformdata, field, val) { //Leave val to "undefined" for refresh
    var parentobj = jsh.root;
    if (xformdata._jrow) parentobj = xformdata._jrow;
    var jctrl = XExtXModel.RenderField(xformdata, parentobj, xformdata._modelid, field, val, { updatePreviousValue: false });
    if(jctrl && jctrl.length) xformdata.OnControlUpdate(jctrl[0]);
  }

  XExtXModel.RenderField = function (_this, parentobj, modelid, field, val, options){
    if(!options) options = { updatePreviousValue: true };
    modelid = jsh.XExt.resolveModelID(modelid);
    var xmodel = jsh.XModels[modelid];
    var isGrid = (xmodel.layout == 'grid');
    if(typeof val === 'undefined'){
      val = _this[field.name];
    }
    var dataval = val;
    //Apply formatting
    if ((field.name in _this) && (typeof val == 'undefined')) val = '';
    else val = jsh.XFormat.Apply(field.format, val);
    
    if(options.updatePreviousValue) field._previous_value = dataval;

    //Get LOV Txt
    var lovTxt = '';
    if(field.showlovtxt){
      var lovTxtName = '__'+jsh.uimap.code_txt+'__'+field.name;
      lovTxt = _this[lovTxtName];
      //Apply formatting
      if ((lovTxtName in _this) && (typeof lovTxt == 'undefined')) lovTxt = '';
      else lovTxt = jsh.XFormat.Apply(field.format, lovTxt);
    }
    
    var fieldselector = '.' + field.name + '.xelem' + xmodel.class;
    var jctrl = parentobj.find(fieldselector);
    //Apply value to hidden field if updateable non-control element
    if(jsh.XExt.hasAction(field.actions,'BIU') && _.includes(['html','label','linkbutton','button'],field.control)){
      var jctrl_hidden = parentobj.find('.'+field.name+'_field_value.xelem'+xmodel.class);
      jctrl_hidden.val(val);
    }
    if (('control' in field) && ((field.control == 'file_upload')||(field.control == 'file_download')||(field.control == 'image'))) {
      //Show "Upload File" always
      var filefieldselector = '.xelem' + xmodel.class + ' .' + field.name;
      if(field.control=='image') filefieldselector = '.xelem' + xmodel.class + '.' + field.name;
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
        if (jctrl_thumbnail.length && ((field.control=='image') || (field.controlparams.show_thumbnail))) {
          var keys = xmodel.controller.form.GetKeys();
          if (xmodel.keys.length != 1) { throw new Error('File models require one key.'); }
          var thumb_url = jsh._BASEURL + '_dl/' + modelid + '/' + keys[xmodel.keys[0]] + '/' + field.name + '?view=1&_=' + (Date.now());
          if(field.controlparams.show_thumbnail) thumb_url += '&thumb='+field.controlparams.show_thumbnail;
          jctrl_thumbnail.attr('src', thumb_url).show();
          if(typeof field.controlparams.thumbnail_width != 'undefined') jctrl_thumbnail.attr('width', field.controlparams.thumbnail_width + 'px');
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
        if (jctrl_thumbnail.length && field.controlparams.show_thumbnail) {
          var thumb_url = jsh._BASEURL + '_dl/_temp/' + file_token + '?view=1';
          jctrl_thumbnail.attr('src', thumb_url).show();
          if(typeof field.controlparams.thumbnail_width != 'undefined') jctrl_thumbnail.attr('width', field.controlparams.thumbnail_width + 'px');
        }
        else jctrl_thumbnail.hide();
      }
    }
    else if (('control' in field) && (field.control == 'tree')) {
      jsh.XExt.TreeSelectNode(jctrl, val, { triggerChange: false });
    }
    else if(('control' in field) && (field.control == 'button')){ }
    else if (('control' in field) && (field.control == 'checkbox')) {
      var checkval = false;
      var checkhidden = false;
      if ((val == null) || (typeof val == 'undefined')) val = '';
      if ('controlparams' in field) {
        if (('value_hidden' in field.controlparams) && (val.toString().toUpperCase() == field.controlparams.value_hidden.toString().toUpperCase())) checkhidden = true;
        if (('value_true' in field.controlparams) && (val.toString().toUpperCase() == field.controlparams.value_true.toString().toUpperCase())) checkval = true;
        else if (('value_false' in field.controlparams) && (val.toString().toUpperCase() == field.controlparams.value_false.toString().toUpperCase())) checkval = false;
        else checkval = jsh.XFormat.bool_decode(val);
      }
      else checkval = jsh.XFormat.bool_decode(val);
      jctrl.prop('checked', checkval);
      if (checkhidden) jctrl.css('visibility', 'hidden');
      else if (checkhidden) jctrl.css('visibility', 'visible');
    }
    else if ((jctrl.size() > 0) && jctrl.hasClass('xform_label')) {
      var showLabel = true;
      if(lovTxt) val = lovTxt;
      if(jctrl.hasClass('xform_label_static')){
        if(field.value && field.value.indexOf('<#')>=0){
          val = field.value;
          val = val.replace(/<#/g, '<'+'%').replace(/#>/g, '%'+'>');
          val = jsh.XExt.renderEJS(val, modelid, {
            data: _this
          });
          jctrl.html(val);
          showLabel = !!val;
        }
      }
      else{ jctrl.html(jsh.XExt.escapeHTMLBR(val)); }
      if(field.type && jctrl.parent().hasClass('xform_link')){
        showLabel = showLabel && !!dataval;
      }
      jctrl.toggleClass('hidden',!showLabel);
    }
    else if ((jctrl.size() > 0) && jctrl.hasClass('xform_html')) {
      if(lovTxt) val = lovTxt;
      if(val.indexOf('<#') >= 0){
        val = val.replace(/<#/g, '<'+'%').replace(/#>/g, '%'+'>');
        val = jsh.XExt.renderEJS(val, modelid, {
          data: _this
        });
      }
      jctrl.html(val);
      jctrl.toggleClass('hidden',!val);
    }
    else if ((jctrl.size() > 0) && (String(jctrl.prop('nodeName')).toUpperCase() == 'SELECT')) {
      //Check if SELECT has value.  If not, add it as an additional option at the end
      var lov_matches = jctrl.children('option').filter(function () { return String($(this).val()).toUpperCase() == String(val).toUpperCase(); }).length;
      var has_lov = (lov_matches > 0);
      var has_parent = (('lovparent' in field) || ('lovparents' in field));
      //If has parent and item missing, don't set the value
      if (has_lov || !has_parent) {
        if (!has_lov) {
          var codtxt = _this['__' + jsh.uimap.code_txt + '__' + field.name];
          if (!codtxt) codtxt = val;
          jctrl.append($('<option>', { value: val }).text(codtxt));
        }
        jctrl.val(val);
      }
    }
    else if (('control' in field) && (field.control == 'tagbox')) {
      jctrl.val(val);
      jsh.XExt.TagBox_Refresh(parentobj.find('.'+field.name+'_editor.xtagbox'+'.xelem'+xmodel.class), jctrl);
    }
    else{
      jctrl.val(val);
    }

    //Update CKEditor, if applicable
    var ckeditorid = xmodel.class+'_'+field.name;
    if ((typeof window.CKEDITOR != 'undefined') && (ckeditorid in window.CKEDITOR.instances)) {
      window.CKEDITOR.instances[ckeditorid].setData(val);
    }
    
    //Make fields editable or locked / read-only
    var show_lookup_when_readonly = false;

    var action = (_this._is_insert?'I':'U');
    if ((xmodel.layout=='exec')||(xmodel.layout=='report')) action = 'B';
    var is_editable = jsh.XExt.hasAction(field.actions, action);
    if (is_editable && !field.locked_by_querystring && ((action == 'I') || ((xmodel.layout=='exec')||(xmodel.layout=='report')))){ }
    else {
      if (is_editable && ('readonly' in field) && field.readonly) is_editable = false;
      if (_this._querystring_applied && _.includes(_this._querystring_applied, field.name)) is_editable = false;
      if (field.name in xmodel.binding_fields){
        var binding_val = xmodel.getBindingOrRootKey(field.name);
        if((typeof binding_val != 'undefined') && (binding_val !== null) && (binding_val !== '')) is_editable = false;
      }
    }
    if (('always_editable' in field) && field.always_editable) is_editable = true;
    if (is_editable && ('controlparams' in field) && (field.controlparams.base_readonly)) {
      is_editable = false;
      show_lookup_when_readonly = true;
    }

    if (is_editable && !jctrl.hasClass('editable')) { jsh.XPage.Enable(jctrl); }
    else if (!is_editable && !jctrl.hasClass('uneditable')) { jsh.XPage.Disable(jctrl, show_lookup_when_readonly); }

    return jctrl;
  }

  XExtXModel.OnControlUpdate = function (modelid) {
    modelid = jsh.XExt.resolveModelID(modelid);
    return function (obj, e) {
      var jobj = $(obj);
      var id = jsh.XExt.getFieldFromObject(obj);
      var _this = this;
      var field = this.Fields[id];
      if(field){
        if (!this._is_insert && !field.unbound && (field.control != 'tree') && jsh.XExt.hasAction(field.actions,'IU')) {
          if (this.HasUpdate(id)) {
            if (!jobj.hasClass('updated')) {
              jobj.addClass('updated');
              if(jobj.parent().hasClass('xform_checkbox_container')) jobj.parent().addClass('updated');
              if(field.control=='tagbox') jobj.prev().addClass('updated');
            }
          }
          else {
            if (jobj.hasClass('updated')) {
              jobj.removeClass('updated');
              if (jobj.parent().hasClass('xform_checkbox_container')) jobj.parent().removeClass('updated');
              if(field.control=='tagbox') jobj.prev().removeClass('updated');
            }
          }
        }
        var oldval = field._previous_value;
        var newval = _this.GetValue(field);
        var firedUndo = false;
        if ('onchange' in field) {
          var undoChange = function(){ firedUndo = true; var xmodel = jsh.XModels[modelid]; field._previous_value = oldval; xmodel.set(field.name, oldval, null); };
          if(!XExtXModel.StringEquals(oldval, newval)){
            var rslt = (new Function('obj', 'newval', 'undoChange', 'e', field.onchange)); rslt.call(_this, obj, newval, undoChange, e);
          }
        }
        if(!firedUndo) field._previous_value = newval;
      }
    };
  };

  XExtXModel.GetValues = function () {
    return function (perm) {
      var _this = this;
      _.each(this.Fields, function (field) {
        if (!jsh.XExt.hasAction(field.actions, perm)) return;
        var newval = _this.GetValue(field);
        //if (!('control' in field) && (newval == undefined)) return;
        _this[field.name] = newval;
      });
    };
  };

  XExtXModel.GetValue = function (modelid) {
    modelid = jsh.XExt.resolveModelID(modelid);
    return function (field) {
      var _this = this;
      var parentobj = jsh.root;
      if (this._jrow) parentobj = this._jrow;
      var xmodel = jsh.XModels[modelid];
      var isGrid = (xmodel.layout == 'grid');
      
      var fieldselector = '.' + field.name + '.xelem' + xmodel.class;
      if (isGrid) fieldselector = '.' + field.name + '.xelem' + xmodel.class;
      var jctrl = parentobj.find(fieldselector);
      var val = '';

      if (('control' in field) && (field.control == 'file_upload')) {
        var filefieldselector = '.xelem' + xmodel.class + ' .' + field.name;
        if (isGrid) filefieldselector = '.xelem' + xmodel.class + ' .' + field.name;

        var jctrl_token = parentobj.find(filefieldselector + '_token');
        var jctrl_dbdelete = parentobj.find(filefieldselector + '_dbdelete');
        var jctrl_dbexists = parentobj.find(filefieldselector + '_dbexists');
        var file_token = jctrl_token.val();
        if (file_token) val = file_token;
        else if (jctrl_dbdelete.val() == '1') val = '';
        else if (jctrl_dbexists.val() == '1') val = true;
        else val = false;
      }
      else if (('control' in field) && (field.control == 'tree')) {
        if (jctrl.length) {
          var selected_nodes = jsh.XExt.TreeGetSelectedNodes(jctrl[0]);
          if (selected_nodes.length > 0) val = selected_nodes[0];
          else val = null;
        }
        else val = null;
      }
      else if (('control' in field) && (field.control == 'checkbox')) {
        var checked = jctrl.prop('checked');
        var ishidden = jctrl.css('visibility').toLowerCase() == 'hidden';
        var checkval = checked ? '1':'0';
        
        if ('controlparams' in field) {
          if(ishidden && ('value_hidden' in field.controlparams)) checkval = field.controlparams.value_hidden;
          else if (checked && ('value_true' in field.controlparams)) checkval = field.controlparams.value_true;
          else if (!checked && ('value_false' in field.controlparams)) checkval = field.controlparams.value_false;
        }
        val = checkval;
      }
      else {
        val = jctrl.val();
        if(_.includes(['html','label','linkbutton','button'],field.control)){
          var jctrl_hidden = parentobj.find('.'+field.name+'_field_value.xelem'+xmodel.class);
          val = jctrl_hidden.val();
        }
        if(typeof val === 'undefined') val = '';
        var ckeditorid = xmodel.class+'_'+field.name;
        if ((typeof window.CKEDITOR != 'undefined') && (ckeditorid in window.CKEDITOR.instances)) {
          val = window.CKEDITOR.instances[ckeditorid].getData();
          val = jsh.XExt.ReplaceAll(val, '&lt;%', '<' + '%');
          val = jsh.XExt.ReplaceAll(val, '%&gt;', '%' + '>');
          val = jsh.XExt.ReplaceAll(val, '&#39;', '\'');
          val = jsh.XExt.ReplaceAll(val, '&quot;', '"');
        }
      }

      //If field is in bindings
      if (xmodel.bindings && (field.name in xmodel.bindings)) {
        var binding_val = xmodel.bindings[field.name]();
        if(!val || ((typeof binding_val != 'undefined') && (binding_val !== null) && (binding_val !== ''))) val = binding_val;
      }

      if (field.ongetvalue) val = field.ongetvalue(val, field, xmodel);
      if ('format' in field) {
        val = jsh.XFormat.Decode(field.format, val);
      }
      return val;
    };
  };

  XExtXModel.HasUpdates = function () {
    return function () {
      if (jsh.XModels[this._modelid].layout=='exec') return false;
      if (jsh.XModels[this._modelid].layout=='report') return false;
      var _this = this;
      if (this._is_insert) { return true; }
      var action = (this._is_insert?'I':'U');
      var hasUpdates = false;
      _.each(this.Fields, function (field) {
        if (!jsh.XExt.hasAction(field.actions, action)) return;
        if (field.unbound) return;
        if (_this.HasUpdate(field.name)) { hasUpdates = true; }
      });
      return hasUpdates;
    };
  };

  XExtXModel.StringEquals = function(a,b){
    if (typeof a === 'undefined') a = '';
    if (a === null) a = '';
    if (typeof b === 'undefined') b = '';
    if (b === null) b = '';
    if (a != b) {
      a = jsh.XExt.ReplaceAll(a.toString(), '\r\n', '\n');
      b = jsh.XExt.ReplaceAll(b.toString(), '\r\n', '\n');
      if(a == b) return true;
      return false;
    }
    return true;
  }

  XExtXModel.HasUpdate = function () {
    return function (id) {
      if (jsh.XModels[this._modelid].layout=='exec') return false;
      if (jsh.XModels[this._modelid].layout=='report') return false;
      var field = this.Fields[id];
      if (!field) return false;
      var oldval = this[id];
      oldval = jsh.XFormat.Decode(field.format, oldval);
      var newval = this.GetValue(field);
      if(!XExtXModel.StringEquals(oldval, newval)){
        console.log(id + " Old: " + oldval); console.log(id + " New: " + newval);
        return true;
      }
      return false;
    };
  };

  XExtXModel.Commit = function (xmodel) {
    return function (perm) {
      var _this = this;
      var parentobj = jsh.root;
      if (this._jrow) parentobj = this._jrow;
      if ((xmodel.layout == 'form-m') || (xmodel.layout == 'grid')) {
        if (xmodel.controller.form.Count()==0) return true;
      }
      //_is_insert at record-level
      var _this = this;
      var action = (this._is_insert?'I':'U');
      if ((xmodel.layout=='exec')||(xmodel.layout=='report')) action = 'B';
      if (this.HasUpdates()) {
        if (!this._is_dirty) {
          //Clone Data to Orig
          this._orig = XExtXModel.GetOwnFields(this);
          this._is_dirty = true;
        }
      }
      this.GetValues(action);
      var _xvalidate = xmodel.datamodel.prototype.xvalidate;
      if (_xvalidate) {
        this.xvalidate = _xvalidate;
        var valid = xmodel.controller.form.Validate(action);
        delete this.xvalidate;
        if (!valid) return false;
      }
      xmodel.saveUnboundFields(this);
      return true;
    };
  };

  XExtXModel.GetOwnFields = function(val) {
    var rslt = {};
    _.forOwn(val, function (val, key) {
      if (key == '_LOVs') return;
      if (key == '_defaults') return;
      if (key == '_title') return;
      if (key == '_bcrumbs') return;
      if (key == '_is_insert') return;
      if (key == '_is_dirty') return;
      if (key == '_is_deleted') return;
      if (key == '_orig') return;
      if (key == '_jrow') return;
      if (key == '_modelid') return;
      if (key == '_readonly') return;
      rslt[key] = val;
    });
    return rslt;
  }

  XExtXModel.BindLOV = function (modelid) {
    modelid = jsh.XExt.resolveModelID(modelid);
    return function (xform, parentobj) {
      if (!parentobj) parentobj = jsh.root;
      var xmodel = jsh.XModels[modelid];
      var isGrid = (xmodel.layout == 'grid');
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
            var curselector = (isGrid?'.':'.') + lovparents[i] + '.xelem' + xmodel.class;
            lovparents_selector += ((i > 0)?',':'') + curselector;
            lovparents_val += 'parentvals.push(parentobj.find("' + curselector + '").val()); ';
          }
          parentobj.find(lovparents_selector).change(function (evt) {
            var parentvals = [];
            //Narrow value of child LOV to values where CODVAL1 = that value
            var ctrl = parentobj.find((isGrid?'.':'.') + field.name + '.xelem' + xmodel.class);
            jsh.XExt.JSEval(lovparents_val,this,{ parentvals: parentvals, parentobj: parentobj, xform: xform, modelid: modelid });
            jsh.XExt.RenderParentLOV(xform.Data, ctrl, parentvals, xform.Data._LOVs[field.name], xform.Data.Fields[field.name], ('lovparents' in field));
          });
        }
      });
    };
  }

  XExtXModel.ParseDefault = function (dflt, jslocals) {
    if(_.isString(dflt) && (dflt.substr(0,3)=='js:')){
      return 'function(data){'+jslocals+'return '+dflt.substr(3)+';}';
    }
    return JSON.stringify(dflt);
  }

  XExtXModel.ApplyDefaults = function (xformdata) {
    if(!('_querystring_applied' in xformdata)) xformdata._querystring_applied = [];
    for(var fname in xformdata.Fields){
      if((fname in jsh._GET) && jsh._GET[fname] && jsh.XExt.isFieldTopmost(xformdata._modelid, fname)){
        xformdata[fname] = jsh._GET[fname];
        xformdata._querystring_applied.push(fname);
      }
    }  
  }

  /*** XController ***/

  XExtXModel.XController = function(xmodel){
    this.xmodel = xmodel;
    this.form = undefined;
    this.grid = undefined;
  }

  XExtXModel.XController.prototype.Select = function(onDone){
    if(this.grid) return this.grid.Select(onDone);
    else if(this.form) return this.form.Select(onDone);
  }

  XExtXModel.XController.prototype.HasUpdates = function(){
    if(this.grid) return this.grid.HasUpdates();
    else if(this.form) return this.form.HasUpdates();
  }

  XExtXModel.XController.prototype.HasBreadCrumbs = function(){
    if(this.grid) return ('bcrumbs' in this.grid);
    else if(this.form) return ('bcrumbs' in this.form);
  }

  XExtXModel.XController.prototype.GetBreadCrumbs = function(){
    if(this.grid) return this.grid.bcrumbs;
    else if(this.form) return this.form.bcrumbs;
  }

  XExtXModel.XController.prototype.HasTitle = function(){
    if(this.grid) return ('title' in this.grid);
    else if(this.form) return ('title' in this.form);
  }

  XExtXModel.XController.prototype.GetTitle = function(){
    if(this.grid) return this.grid.title;
    else if(this.form) return this.form.title;
  }

  /*** XField ***/

  XExtXModel.XField = function(props){
    this._previous_value = undefined;
    for(var prop in props) this[prop] = props[prop];
  }

  XExtXModel.XField.prototype.hasDefault = function(){
    if('default' in this) return true;
    return false;
  }

  XExtXModel.XField.prototype.getDefault = function(data){
    if('default' in this){
      if(_.isFunction(this.default)) return this.default(data);
      return this.default;
    }
    return undefined;
  }

  return XExtXModel;
}