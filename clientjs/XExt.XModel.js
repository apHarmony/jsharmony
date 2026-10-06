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

  var XExtXModel = function(){ };

  function getPreviousValue(xdata, id){
    if(!xdata || !xdata._previous_values) return undefined;
    return xdata._previous_values[id];
  }

  function setPreviousValue(xdata, id, val){
    if(!xdata) return;
    if(!xdata._previous_values) xdata._previous_values = {};
    xdata._previous_values[id] = val;
  }

  XExtXModel.GetRowID = function (modelid,obj){
    modelid = jsh.XExt.resolveModelID(modelid);
    var xmodel = jsh.XModels[modelid];
    var rslt = -1;
    if(jsh.XDom.class.contains(obj, 'row_independent')){ /* Do nothing */ }
    else if (obj) {
      var cur_row = obj.closest('.xrow_'+xmodel.class);
      if (cur_row) rslt = parseInt(jsh.XDom.getData(cur_row, 'id'));
    }
    return rslt;
  };

  XExtXModel.OnRender = function (modelid) {
    modelid = jsh.XExt.resolveModelID(modelid);
    return function(){
      var _this = this; //datamodel
      var parentobj = jsh.xdroot.element;
      if (this._row) parentobj = this._row;
      var xmodel = jsh.XModels[modelid];
      if(!xmodel) return;
      var isGrid = (xmodel.layout == 'grid');
      //Clear highlighted background of currently edited cells
      jsh.XDom(parentobj, '.xelem'+xmodel.class+'.xform_ctrl.updated').class.remove('updated');

      if (xmodel.layout == 'form-m') {
        if (xmodel.controller.form.Count()==0) {
          jsh.xd('.xelem'+xmodel.class+'.xnorecords').style.display = true;
          jsh.xd('.xelem'+xmodel.class+'.xformcontainer').style.visibility = 'hidden';
        }
        else {
          jsh.xd('.xelem'+xmodel.class+'.xnorecords').style.display = false;
          jsh.xd('.xelem'+xmodel.class+'.xformcontainer').style.visibility = 'visible';
        }
      }
      else if(xmodel.layout == 'form') {
        if(!jsh.is_insert){
          if (xmodel.controller.form.Data._is_insert) {
            jsh.xd('.xelem'+xmodel.class+'.xnorecords').style.display = true;
            jsh.xd('.xelem'+xmodel.class+'.xformcontainer').style.visibility = 'hidden';
          }
          else {
            jsh.xd('.xelem'+xmodel.class+'.xnorecords').style.display = false;
            jsh.xd('.xelem'+xmodel.class+'.xformcontainer').style.visibility = 'visible';
          }
        }
      }
    
      //Set List of Values
      if ('_LOVs' in this) {
        for (var _LOV in this._LOVs) {
          var lovselector = '.' + _LOV + '.xelem' + xmodel.class;
          if (isGrid) lovselector = '.' + _LOV + '.xelem' + xmodel.class;
          var ctrl = jsh.XDom(parentobj, lovselector).element;
          if (!ctrl) {
            // noop
          } else if (('control' in this.Fields[_LOV]) && (this.Fields[_LOV].control == 'tree')) {
            jsh.XExt.TreeRender(ctrl, this._LOVs[_LOV], this.Fields[_LOV]);
          } else if ('lovparent' in this.Fields[_LOV]) {
            jsh.XExt.RenderParentLOV(_this, ctrl, [_this[this.Fields[_LOV].lovparent]], this._LOVs[_LOV], this.Fields[_LOV], false);
          } else if ('lovparents' in this.Fields[_LOV]) {
            var parentvals = [];
            for (var i = 0; i < this.Fields[_LOV].lovparents.length; i++) {
              parentvals.push(_this[this.Fields[_LOV].lovparents[i]]);
            }
            jsh.XExt.RenderParentLOV(_this, ctrl, parentvals, this._LOVs[_LOV], this.Fields[_LOV], true);
          } else {
            jsh.XExt.RenderLOV(this, ctrl, this._LOVs[_LOV]);
          }
        }
      }
      //Put data into the form
      _.each(this.Fields, function (field) {
        if(field.control=='tagbox'){
          jsh.XExt.TagBox_Render(jsh.XDom(parentobj, '.'+field.name+'_editor.xtagbox'+'.xelem'+xmodel.class).elements, jsh.XDom(parentobj, '.'+field.name+'.xelem'+xmodel.class).elements);
        }
        XExtXModel.RenderField(_this, parentobj, modelid, field);
      });
      if (xmodel.layout == 'form-m') {
        jsh.xd('.navtext_' + xmodel.class).text = (xmodel.controller.form.Index + 1) + ' of ' + xmodel.controller.form.Count();
      }
    };
  };

  XExtXModel.SetFieldValue = function (xformdata, field, val){
    xformdata[field.name] = val;
    var parentobj = jsh.xdroot.element;
    if (xformdata._row) parentobj = xformdata._row;
    XExtXModel.RenderField(xformdata, parentobj, xformdata._modelid, field, val);
  };

  XExtXModel.SetControlValue = function (xformdata, field, val) { //Leave val to "undefined" for refresh
    var parentobj = jsh.xdroot.element;
    if (xformdata._row) parentobj = xformdata._row;
    var ctrl = XExtXModel.RenderField(xformdata, parentobj, xformdata._modelid, field, val, { updatePreviousValue: false });
    if(ctrl){
      jsh.XDom.emit(ctrl, 'change');
      xformdata.OnControlUpdate(ctrl);
    }
  };

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
    
    if(options.updatePreviousValue) setPreviousValue(_this, field.name, dataval);

    //Get LOV Txt
    var lovTxt = '';
    if(field.showlovtxt){
      var lovTxtName = '__'+jsh.uimap.code_txt+'__'+field.name;
      if(lovTxtName in _this){
        lovTxt = _this[lovTxtName];
      }
      else if(_this._LOVs && (field.name in _this._LOVs)){
        lovTxt = jsh.XExt.getLOVTxt(_this._LOVs[field.name], val);
        if ((!val) && typeof lovTxt == 'undefined') lovTxt = '';
      }
      //Apply formatting
      if ((lovTxtName in _this) && (typeof lovTxt == 'undefined')) lovTxt = '';
      else lovTxt = jsh.XFormat.Apply(field.format, lovTxt);
    }
    
    var fieldselector = '.' + field.name + '.xelem' + xmodel.class;
    var xdCtrl = jsh.XDom(parentobj, fieldselector);
    //Apply value to hidden field if updateable non-control element
    if(jsh.XExt.hasAction(field.actions,'BIU') && _.includes(['html','label','linkbutton','button'],field.control)){
      var ctrl_hidden = jsh.XDom(parentobj, '.'+field.name+'_field_value.xelem'+xmodel.class).element;
      if (ctrl_hidden) ctrl_hidden.value = val;
    }
    if (('control' in field) && ((field.control == 'file_upload')||(field.control == 'file_download')||(field.control == 'image'))) {
      //Show "Upload File" always
      var filefieldselector = '.xelem' + xmodel.class + ' .' + field.name;
      if(field.control=='image') filefieldselector = '.xelem' + xmodel.class + '.' + field.name;
      var ctrl_token = jsh.XDom(parentobj, filefieldselector + '_token').element;
      var ctrl_dbdelete = jsh.XDom(parentobj, filefieldselector + '_dbdelete').element;
      var ctrl_dbexists = jsh.XDom(parentobj, filefieldselector + '_dbexists').element;
      var ctrl_thumbnail = jsh.XDom(parentobj, filefieldselector + '_thumbnail').element;
      var file_token = ctrl_token && ctrl_token.value;
      if (val === true) {
        //Has DB file
        xdCtrl.class.remove('nodocument');
        if (ctrl_token) ctrl_token.value = '';
        if (ctrl_dbdelete) ctrl_dbdelete.value = '0';
        if (ctrl_dbexists) ctrl_dbexists.value = '1';
        //Set thumbnail
        if (ctrl_thumbnail) {
          if ((field.control=='image') || (field.controlparams.show_thumbnail)) {
            var keys = xmodel.controller.form.GetKeys();
            if (xmodel.keys.length != 1) { throw new Error('File models require one key.'); }
            var download_thumb_url = jsh._BASEURL + '_dl/' + modelid + '/' + keys[xmodel.keys[0]] + '/' + field.name + '?view=1&_=' + (Date.now());
            if(field.controlparams.show_thumbnail) download_thumb_url += '&thumb='+field.controlparams.show_thumbnail;
            ctrl_thumbnail.src = download_thumb_url;
            jsh.XDom(ctrl_thumbnail).style.display = true;
            if(typeof field.controlparams.thumbnail_width != 'undefined') ctrl_thumbnail.style.maxWidth = field.controlparams.thumbnail_width + 'px';
          }
          else jsh.XDom(ctrl_thumbnail).style.display = false;
        }
      }
      else if (val === false) {
        //No DB File
        xdCtrl.class.add('nodocument');
        if (ctrl_token) ctrl_token.value = '';
        if (ctrl_dbdelete) ctrl_dbdelete.value = '0';
        if (ctrl_dbexists) ctrl_dbexists.value = '0';
      }
      else if (val === '') {
        //Delete action (either delete temp file or DB file
        xdCtrl.class.add('nodocument');
        if (ctrl_token) ctrl_token.value = '';
        if (ctrl_dbdelete) {
          if (ctrl_dbexists && ctrl_dbexists.value == '1') ctrl_dbdelete.value = '1';
          else ctrl_dbdelete.value = '0';
        }
      }
      else if (_.isString(val)) {
        //Uploaded new temp file
        xdCtrl.class.remove('nodocument');
        if (ctrl_token) ctrl_token.value = val;
        if (ctrl_dbdelete) ctrl_dbdelete.value = '0';
        //Set thumbnail
        if (ctrl_thumbnail) {
          if (field.controlparams.show_thumbnail) {
            var thumb_url = jsh._BASEURL + '_dl/_temp/' + file_token + '?view=1&thumb='+field.controlparams.show_thumbnail;
            ctrl_thumbnail.src = thumb_url;
            jsh.XDom(ctrl_thumbnail).style.display = true;
            if(typeof field.controlparams.thumbnail_width != 'undefined') ctrl_thumbnail.style.maxWidth = field.controlparams.thumbnail_width + 'px';
          }
          else jsh.XDom(ctrl_thumbnail).style.display = false;
        }
      }
    }
    else if (('control' in field) && (field.control == 'tree')) {
      jsh.XExt.TreeSelectNode(xdCtrl.element, val, { triggerChange: false });
    }
    else if(('control' in field) && (field.control == 'button')){ /* Do nothing */ }
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
      xdCtrl.element.checked = checkval;
      if (checkhidden) xdCtrl.style.visibility = 'hidden';
      else xdCtrl.style.visibility = 'visible';
    }
    else if ((xdCtrl.length > 0) && xdCtrl.class.contains('xform_label')) {
      var showLabel = true;
      if(lovTxt) val = lovTxt;
      if(xdCtrl.class.contains('xform_label_static')){
        if(field.value && field.value.indexOf('<#')>=0){
          var baseval = val;
          val = field.value;
          val = val.replace(/<#/g, '<'+'%').replace(/#>/g, '%'+'>');
          val = jsh.XExt.renderEJS(val, modelid, {
            data: _this,
            val: baseval,
            obj: xdCtrl.element,
            enabled: (xdCtrl.class.contains('editable') ? true : xdCtrl.class.contains('uneditable') ? false : null),
          });
          xdCtrl.html = val;
          showLabel = !!val;
        }
      }
      else{ xdCtrl.html = jsh.XExt.escapeHTMLBR(val); }
      if(field.type && xdCtrl.parent().class.contains('xform_link')){
        showLabel = showLabel && !!dataval;
      }
      if (showLabel) {
        xdCtrl.class.remove('hidden');
      } else {
        xdCtrl.class.add('hidden');
      }
    }
    else if ((xdCtrl.length > 0) && xdCtrl.class.contains('xform_html')) {
      if(lovTxt) val = lovTxt;
      if(val.indexOf('<#') >= 0){
        val = val.replace(/<#/g, '<'+'%').replace(/#>/g, '%'+'>');
        val = jsh.XExt.renderEJS(val, modelid, {
          data: _this,
          obj: xdCtrl.element,
          enabled: (xdCtrl.class.contains('editable') ? true : xdCtrl.class.contains('uneditable') ? false : null),
        });
      }
      xdCtrl.html = val;
      if (val) {
        xdCtrl.class.remove('hidden');
      } else {
        xdCtrl.class.add('hidden');
      }
    }
    else if ((xdCtrl.length > 0) && (String(xdCtrl.element.nodeName).toUpperCase() == 'SELECT')) {
      //Check if SELECT has value.  If not, add it as an additional option at the end
      var lov_matches = xdCtrl.children.filter(function (el) { return el.nodeName == 'OPTION' && String(el.value).toUpperCase() == String(val).toUpperCase(); }).length;
      var has_lov = (lov_matches > 0);
      var has_parent = (('lovparent' in field) || ('lovparents' in field));
      //If has parent and item missing, don't set the value, unless it is read-only
      var form_action = (_this._is_insert?'I':'U');
      if (has_lov || !has_parent || !jsh.XExt.hasAction(field.actions, form_action)) {
        if (!has_lov) {
          var codtxt = _this['__' + jsh.uimap.code_txt + '__' + field.name];
          if (!codtxt) codtxt = val;
          var newOption = document.createElement('option');
          newOption.value = val;
          newOption.text = codtxt;
          xdCtrl.append(newOption.outerHTML);
        }
        xdCtrl.value = val;
      }
    }
    else if (('control' in field) && (field.control == 'tagbox')) {
      xdCtrl.value = val;
      jsh.XExt.TagBox_Refresh(jsh.XDom(parentobj, '.'+field.name+'_editor.xtagbox'+'.xelem'+xmodel.class).element, xdCtrl.elements);
    }
    else{
      xdCtrl.value = val;
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
    if (is_editable && !field.locked_by_querystring && ((action == 'I') || ((xmodel.layout=='exec')||(xmodel.layout=='report')))){ /* Do nothing */ }
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
    if(is_editable && xdCtrl.class.contains('readonly')) is_editable = false;
    if(is_editable && isGrid && xdCtrl.parent('tr.xrow').class.contains('readonly')) is_editable = false;

    if (is_editable && !xdCtrl.class.contains('editable')) { jsh.XPage.Enable(xdCtrl.elements, field); }
    else if (!is_editable && !xdCtrl.class.contains('uneditable')) { jsh.XPage.Disable(xdCtrl.elements, field, show_lookup_when_readonly); }

    return xdCtrl.element;
  };

  XExtXModel.OnControlUpdate = function (modelid) {
    modelid = jsh.XExt.resolveModelID(modelid);
    return function (obj, e) {
      var xdObj = jsh.XDom(obj);
      var id = jsh.XExt.getFieldNameFromObject(obj);
      var _this = this;
      var field = this.Fields[id];
      if(field){
        if (!this._is_insert && !field.unbound && (field.control != 'tree') && jsh.XExt.hasAction(field.actions,'IU')) {
          if (this.HasUpdate(id)) {
            if (!xdObj.class.contains('updated')) {
              xdObj.class.add('updated');
              if(xdObj.parent().class.contains('xform_checkbox_container')) xdObj.parent().class.add('updated');
              if(field.control=='tagbox') xdObj.previousSibling().class.add('updated');
            }
          }
          else {
            if (xdObj.class.contains('updated')) {
              xdObj.class.remove('updated');
              if (xdObj.parent().class.contains('xform_checkbox_container')) xdObj.parent().class.remove('updated');
              if(field.control=='tagbox') xdObj.previousSibling(). class.remove('updated');
            }
          }
        }
        var xform = jsh.XExt.getFormFromObject(obj);
        var oldval = getPreviousValue(xform && xform.Data, id);
        var newval = _this.GetValue(field);
        var firedUndo = false;
        var xmodel = jsh.XModels[modelid];
        if (('onchange' in field) || (xmodel && ('onchange' in xmodel))){
          var undoChange = function(){
            firedUndo = true;
            var xmodel = jsh.XModels[modelid];
            setPreviousValue(xform && xform.Data, id, oldval);
            xmodel.set(field.name, oldval, null);
          };
          if(!XExtXModel.StringEquals(oldval, newval)){
            if(field.onchange){
              var fieldEvent = (new Function('obj', 'newval', 'undoChange', 'e', field.onchange));
              fieldEvent.call(_this, obj, newval, undoChange, e);
            }

            if(xmodel && xmodel.onchange){
              xmodel.onchange.call(_this, obj, newval, e);
            }
          }
        }
        if(!firedUndo) setPreviousValue(xform && xform.Data, id, newval);
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
      var parentobj = jsh.xdroot.element;
      if (this._row) parentobj = this._row;
      var xmodel = jsh.XModels[modelid];
      var isGrid = (xmodel.layout == 'grid');
      
      var fieldselector = '.' + field.name + '.xelem' + xmodel.class;
      if (isGrid) fieldselector = '.' + field.name + '.xelem' + xmodel.class;
      var ctrl = jsh.XDom(parentobj, fieldselector).element;
      var val = '';

      if (('control' in field) && (field.control == 'file_upload')) {
        var filefieldselector = '.xelem' + xmodel.class + ' .' + field.name;
        if (isGrid) filefieldselector = '.xelem' + xmodel.class + ' .' + field.name;

        var ctrl_token = jsh.XDom(parentobj, filefieldselector + '_token');
        var ctrl_dbdelete = jsh.XDom(parentobj, filefieldselector + '_dbdelete').element;
        var ctrl_dbexists = jsh.XDom(parentobj, filefieldselector + '_dbexists').element;
        var file_token = ctrl_token.value;
        if (file_token) val = file_token;
        else if (ctrl_dbdelete.value == '1') val = '';
        else if (ctrl_dbexists.value == '1') val = true;
        else val = false;
      }
      else if (('control' in field) && (field.control == 'tree')) {
        if (ctrl) {
          var selected_nodes = jsh.XExt.TreeGetSelectedNodes(ctrl);
          if (selected_nodes.length > 0) val = selected_nodes[0];
          else val = null;
        }
        else val = null;
      }
      else if (('control' in field) && (field.control == 'checkbox')) {
        var checked = ctrl && ctrl.checked;
        var ishidden = ctrl && ctrl.style.visibility.toLowerCase() == 'hidden';
        var checkval = checked ? '1':'0';
        
        if ('controlparams' in field) {
          if(ishidden && ('value_hidden' in field.controlparams)) checkval = field.controlparams.value_hidden;
          else if (checked && ('value_true' in field.controlparams)) checkval = field.controlparams.value_true;
          else if (!checked && ('value_false' in field.controlparams)) checkval = field.controlparams.value_false;
        }
        val = checkval;
      }
      else {
        val = ctrl && ctrl.value;
        if(_.includes(['html','label','linkbutton','button'],field.control)){
          var ctrl_hidden = jsh.XDom(parentobj, '.'+field.name+'_field_value.xelem'+xmodel.class).element;
          val = ctrl_hidden && ctrl_hidden.value;
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

      if (field.ongetvalue) val = field.ongetvalue(val, field, xmodel, ctrl, parentobj);
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
  };

  XExtXModel.HasUpdate = function () {
    return function (id) {
      if (jsh.XModels[this._modelid].layout=='exec') return false;
      if (jsh.XModels[this._modelid].layout=='report') return false;
      var field = this.Fields[id];
      if (!field) return false;
      var oldval = this[id];
      if ('format' in field) {
        var oldval_fmt = jsh.XFormat.Apply(field.format, oldval);
        oldval = jsh.XFormat.Decode(field.format, oldval_fmt);
      }
      var newval = this.GetValue(field);
      if(!XExtXModel.StringEquals(oldval, newval)){
        if(jsh && jsh._debug){
          console.log(id + ' Old: ' + oldval); // eslint-disable-line no-console
          console.log(id + ' New: ' + newval); // eslint-disable-line no-console
        }
        return true;
      }
      return false;
    };
  };

  XExtXModel.Commit = function (xmodel) {
    return function (perm) {
      if ((xmodel.layout == 'form-m') || (xmodel.layout == 'grid')) {
        if (xmodel.controller.form.Count()==0) return true;
      }
      //_is_insert at record-level
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
      if (key == '_previous_values') return;
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
  };

  XExtXModel.BindLOV = function (modelid) {
    modelid = jsh.XExt.resolveModelID(modelid);
    return function (xform, parentobj) {
      if (!parentobj) parentobj = jsh.xdroot.element;
      var xmodel = jsh.XModels[modelid];
      if(!xmodel) return;
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
          for (var i = 0; i < lovparents.length; i++) {
            var curselector = (isGrid?'.':'.') + lovparents[i] + '.xelem' + xmodel.class;
            lovparents_selector += ((i > 0)?',':'') + curselector;
            lovparents_val += 'parentvals.push(jsh.XDom(parentobj, "' + curselector + '").value); ';
          }
          jsh.XDom(parentobj, lovparents_selector).on('change', function (evt) {
            var parentvals = [];
            //Narrow value of child LOV to values where CODVAL1 = that value
            var ctrl = jsh.XDom(parentobj, (isGrid?'.':'.') + field.name + '.xelem' + xmodel.class).element;
            jsh.XExt.JSEval(lovparents_val,this,{ parentvals: parentvals, parentobj: parentobj, xform: xform, modelid: modelid });
            jsh.XExt.RenderParentLOV(xform.Data, ctrl, parentvals, xform.Data._LOVs[field.name], xform.Data.Fields[field.name], ('lovparents' in field));
          });
        }
      });
    };
  };

  XExtXModel.ParseDefault = function (dflt, jslocals) {
    if(_.isString(dflt) && (dflt.substr(0,3)=='js:')){
      return 'function(data){'+jslocals+'return '+dflt.substr(3)+';}';
    }
    return JSON.stringify(dflt);
  };

  XExtXModel.ApplyDefaults = function (xformdata) {
    if(!('_querystring_applied' in xformdata)) xformdata._querystring_applied = [];
    for(var fname in xformdata.Fields){
      if((fname in jsh._GET) && jsh._GET[fname] && jsh.XExt.isFieldTopmost(xformdata._modelid, fname)){
        xformdata[fname] = jsh._GET[fname];
        xformdata._querystring_applied.push(fname);
      }
    }
  };

  /*** XController ***/

  XExtXModel.XController = function(xmodel){
    this.xmodel = xmodel;
    this.form = undefined;
    this.grid = undefined;
  };

  XExtXModel.XController.prototype.Select = function(onDone){
    if(this.grid) return this.grid.Select(onDone);
    else if(this.form) return this.form.Select(onDone);
  };

  XExtXModel.XController.prototype.HasUpdates = function(){
    if(this.grid) return this.grid.HasUpdates();
    else if(this.form) return this.form.HasUpdates();
  };

  XExtXModel.XController.prototype.HasBreadCrumbs = function(){
    if(this.grid) return ('bcrumbs' in this.grid);
    else if(this.form) return ('bcrumbs' in this.form);
  };

  XExtXModel.XController.prototype.GetBreadCrumbs = function(){
    if(this.grid) return this.grid.bcrumbs;
    else if(this.form) return this.form.bcrumbs;
  };

  XExtXModel.XController.prototype.HasTitle = function(){
    if(this.grid) return ('title' in this.grid);
    else if(this.form) return ('title' in this.form);
  };

  XExtXModel.XController.prototype.GetTitle = function(){
    if(this.grid) return this.grid.title;
    else if(this.form) return this.form.title;
  };

  /*** XField ***/

  XExtXModel.XField = function(props){
    for(var prop in props) this[prop] = props[prop];
  };

  XExtXModel.XField.prototype.hasDefault = function(){
    if('default' in this) return true;
    return false;
  };

  XExtXModel.XField.prototype.getDefault = function(data){
    if('default' in this){
      if(_.isFunction(this.default)) return this.default(data);
      return this.default;
    }
    return undefined;
  };

  return XExtXModel;
};