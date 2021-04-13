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

  function XEditableGrid(options) {
    options = _.extend({
      modelid: undefined,
      CommitLevel: 'row',
      ValidationLevel: 'row',
      DialogContainer: undefined,
    }, options);
    this.modelid = options.modelid;
    this.ErrorClass = 'xinputerror';
    this.CommitLevel = options.CommitLevel;
    this.ValidationLevel = options.ValidationLevel;
    this.DialogContainer = options.DialogContainer;
    this.CurrentCell = null;
    this.OnCellEnter = null; //(obj,e)
    this.OnCellLeave = null; //(oldobj,newobj,e)
    this.OnRowEnter = null; //(rowid)
    this.OnRowLeave = null; //(rowid)
    this.OnGridEnter = null; //()
    this.OnGridLeave = null; //(oldobj)
    this.OnControlUpdate = null; //(obj,e)
    this.OnValiding = null; //(rowid,obj,oncancel) return true/false
    this.OnCommit = null; //(rowid,obj,onsuccess,oncancel) return true (if no commit required, or immediate result)/false (if delay commit)    newobj,oldobj,onsuccess,oncancel,oldrowid
    this.IsDirty = null; //return true/false
    this.GetDatasetRowID = null; //return int
    this.OnCancelEdit = null; //(rowid,obj)
    this.SaveBeforeUpdate = false;
    this.Init();
  }
  XEditableGrid.prototype.CellEnter = function (obj, e) {
    this.DebugLog('Enter Cell ' + $(obj).data('id'));
    this.CurrentCell = obj;
    if (this.OnCellEnter) this.OnCellEnter(obj, e);
  }

  XEditableGrid.prototype.CellLeave = function (oldobj, newobj, e) {
    this.DebugLog('Leave Cell ' + $(oldobj).data('id'));
    if (this.OnCellLeave) this.OnCellLeave(obj, e);
  }

  XEditableGrid.prototype.RowEnter = function (rowid) {
    this.DebugLog('Enter Row ' + rowid);
    if (this.OnRowEnter) this.OnRowEnter(rowid);
  }

  XEditableGrid.prototype.RowLeave = function (rowid) {
    this.DebugLog('Leave Row ' + rowid);
    if (this.OnRowLeave) this.OnRowLeave(rowid);
  }

  XEditableGrid.prototype.GridEnter = function () {
    this.DebugLog('Enter Grid');
    if (this.OnGridEnter) this.OnGridEnter();
  }

  XEditableGrid.prototype.GridLeave = function (oldobj) {
    this.DebugLog('Leave Grid');
    this.CurrentCell = undefined;
    if (this.OnGridLeave) this.OnGridLeave(oldobj);
  }

  XEditableGrid.prototype.CellChange = function (oldobj, newobj, e) {
    var oldrowid = -1;
    var newrowid = -1;
    if (oldobj) {
      oldrowid = jsh.XExt.XModel.GetRowID(this.modelid, oldobj);
      this.CellLeave(oldobj, newobj, e);
    }
    if (newobj) newrowid = jsh.XExt.XModel.GetRowID(this.modelid, newobj);
    if (oldrowid != newrowid) {
      if (oldobj) this.RowLeave(oldrowid);
      if (newobj) {
        if (!oldobj) this.GridEnter();
        this.RowEnter(newrowid);
      }
      else {
        this.GridLeave(oldobj);
      }
    }
    if (newobj) {
      this.CellEnter(newobj, e);
    }
  }

  XEditableGrid.prototype.Init = function () {
    //Global Focus Change
    var _this = this;
    jsh.addFocusHandler(_this.DialogContainer, function (newobj) {
      if(newobj && newobj.tagName && (newobj.tagName.toUpperCase()=='BODY')) newobj = null;
      if (jsh.xLoader.IsLoading) { return; }
      var newrowid = -1;
      var oldrowid = -1;
      var oldobj = _this.CurrentCell;
      if (!oldobj) return; //Return if user was not previously in grid
      if ($.datepicker && $.datepicker._datepickerShowing) {
        if (newobj == $('body')[0]) return;
        else if (jsh.$root('.ui-datepicker').has(newobj).length) return;
      }
      if (newobj) newrowid = jsh.XExt.XModel.GetRowID(_this.modelid, newobj);
      if (newrowid >= 0) return; //Return if current control is in grid
      _this.DebugLog('FocusHandler Triggered');
      _this.CellLeaving(oldobj, newobj, undefined, function () {
        //Success
        _this.CellChange(_this.CurrentCell);
      });
    });
  }

  XEditableGrid.prototype.DebugLog = function (obj) {
    if (jsh && jsh._debug) console.log(obj); // eslint-disable-line no-console
  }

  XEditableGrid.prototype.ControlEnter = function (obj, e, onComplete) {
    var _this = this;
    if (this.CurrentCell == obj){ if(onComplete) onComplete(); return; }
    if (this.ErrorClass) if ($(obj).hasClass(this.ErrorClass)) { this.CurrentCell = obj; if(onComplete) onComplete();  return; }
    
    //Reset old value
    var immediate_result = this.ControlLeaving(obj, e, function (_immediate_result) {
      //On success
      _this.CellChange(_this.CurrentCell, obj, e);
      if(onComplete) onComplete();
      if (!_immediate_result) {
      }
    }, function (_immediate_result) {
      //On failure
      if (_immediate_result) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    if (!immediate_result) {
      //Do not change value until database execution complete
      e.preventDefault();
      e.stopPropagation();
      window.setTimeout(function () { $(obj).blur(); }, 1);
    }
    return;
  }

  XEditableGrid.prototype.CheckboxUpdate = function (obj, e) {
    var _this = this;
    var obj_changed = (this.CurrentCell != obj);
    //if(!obj_changed) return;
    if (this.ErrorClass) if ($(obj).hasClass(this.ErrorClass)) { this.CurrentCell = obj; return; }
    var ischecked = obj.checked;
    obj.checked = !ischecked;
    //Do not change checkbox until database execution complete
    $(obj).prop('disabled', true);
    
    var immediate_result = this.ControlLeaving(obj, e, function () {
      //On success
      _this.CellChange(_this.CurrentCell, obj, e);
      $(obj).prop('disabled', false);
      obj.checked = ischecked;
      $(obj).focus();
      _this.ControlUpdate(obj, e);
      if (true && (_this.CommitLevel == 'cell')) { _this.ControlLeaving(obj, e); }
    }, function (_immediate_result) {
      //On failure
      $(obj).prop('disabled', false);
      if (_immediate_result) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    
    if (!immediate_result) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
  //----------------
  //OnControlLeaving
  //----------------
  //Return true if immediate result
  //Return false if needs to wait
  XEditableGrid.prototype.ControlLeaving = function (newobj, e, onsuccess, oncancel) {
    var _this = this;
    var rslt = this.CellLeaving(this.CurrentCell, newobj, e, onsuccess, oncancel);
    if (rslt === true) return true;
    else if (rslt === false) return true;
    return false;
  }
  XEditableGrid.prototype.ControlUpdate = function (obj, e) {
    this.DebugLog('Update ' + $(obj).data('id'));
    if (this.OnControlUpdate) this.OnControlUpdate(obj, e);
  }
  XEditableGrid.prototype.ControlKeyDown = function (obj, e) {
    if (e.keyCode == 27) { //Escape key pressed
      //Get current Rowid
      var rowid = -1;
      var obj = this.CurrentCell;
      if (obj) rowid = jsh.XExt.XModel.GetRowID(this.modelid, obj);
      if (rowid < 0) return;
      if (this.OnCancelEdit) this.OnCancelEdit(rowid, obj);
    }
  }

  XEditableGrid.prototype.CellLeaving = function (oldobj, newobj, e, onsuccess, oncancel) {
    if(!onsuccess) onsuccess = function(){};
    var oldrowid = -1;
    var newrowid = -1;
    if (oldobj) oldrowid = jsh.XExt.XModel.GetRowID(this.modelid, oldobj);
    if (newobj) newrowid = jsh.XExt.XModel.GetRowID(this.modelid, newobj);

    var rowchange = (oldrowid != newrowid);

    if(rowchange){
      //Changing from outside of grid into inserted row
      if((oldrowid==-1) && (newrowid >= 0)){
        if(newrowid === this.GetDatasetRowID()){
          onsuccess();
          return true;
        }
      }
    }
    
    if ((this.ValidationLevel == 'cell') || (this.CommitLevel == 'cell')) {
      //Validate Cell, if applicable
      if (this.OnValidating && !this.OnValidating(oldrowid, oldobj)) {
        if (oncancel) oncancel(true);
        return true;
      }
    }
    else if (rowchange && ((this.ValidationLevel == 'row') || (this.CommitLevel == 'row'))) {
      //Validate Row, if applicable
      if (this.OnValidating && !this.OnValidating(oldrowid, oldobj)) {
        if (oncancel) oncancel(true);
        return true;
      }
    }

    
    if(this.SaveBeforeUpdate && ((this.CommitLevel == 'row') || (this.CommitLevel == 'cell')) && !oldobj && rowchange && (!this.IsDirty || !this.IsDirty())){
      if (jsh.XPage.GetChanges().length > 0) {
        jsh.XExt.Alert('Please save all changes before updating the grid.',function(){
          $(document.activeElement).blur();
        });
        if(oncancel) oncancel(true);
        return true;
      }
    }
    
    //Commit Cell/Row
    if (this.IsDirty && this.IsDirty() && this.OnCommit && (
      (this.CommitLevel == 'cell') || 
      ((this.CommitLevel == 'cell') && ((newrowid>=0) && newobj && $(newobj).is(':checkbox'))) || 
      (rowchange && (this.CommitLevel == 'row'))
      )) {
      if (newobj){ jsh.queuedInputAction = new jsh.XExt.XInputAction(newobj); }
      else if (jsh.queuedInputAction && !jsh.queuedInputAction.IsExpired()) { }
      else jsh.queuedInputAction = null;
      
      jsh.ignorefocusHandler = true;
      window.setTimeout(function () {
        $(document.activeElement).blur();
        $(oldobj).focus();
        window.setTimeout(function () {
          jsh.ignorefocusHandler = false;
          if ($(oldobj).data('datepicker')) $(oldobj).datepicker('hide');
        }, 1);
      }, 1);
      
      var onsuccess_override = function () {
        onsuccess(false);
        if (!newobj) $(document.activeElement).blur();
        else if (jsh.queuedInputAction){
          if(!jsh.queuedInputAction.IsExpired()){
            //If the previous click was squashed
            //If the click was squashed by the loading animation
            if(jsh.lastSquashedActionTime && (jsh.lastSquashedActionTime > jsh.queuedInputAction.tstamp)){
              jsh.queuedInputAction.Exec();
            }
            else {
              var jobj = $(jsh.queuedInputAction.obj);
              if(jobj.is('input,select,textarea') || jobj.hasClass('xform_ctrl')){
                jsh.queuedInputAction.Exec();
              }
            }
          }
          jsh.queuedInputAction = null;
        }
      }
      
      if (!this.OnCommit(oldrowid, oldobj, onsuccess_override, oncancel)) return false;
    }
    
    onsuccess();
    return true;
  }

  XEditableGrid.prototype.IsContainerActive = function () {
    return (this.DialogContainer == jsh.getTopDialogContainer());
  }

  //obj must be a DOM element - not a jQuery object
  //Leave e to null if not calling from a focus event handler
  XEditableGrid.prototype.SetFocus = function (obj, e, onComplete) {
    if(!this.IsContainerActive()) return;
    var containerobj = obj;
    if (!$(obj).hasClass('editable')){
      containerobj = null;
      if($(obj).hasClass('xtag_focusable')){
        containerobj = $(obj).closest('.xtagbox').next()[0];
      }
      else {
        var parentctrl = $(obj).closest('.xform_ctrl');
        if(parentctrl.length && parentctrl.hasClass('editable')){
          containerobj = parentctrl[0];
        }
      }
      if(!containerobj) return;
    }
    if (obj instanceof jsh.$) throw new Error('SetFocus obj must not be a jquery object');
    return this.ControlEnter(containerobj, e, function(){
      if (!e && document.hasFocus && document.hasFocus()) $(obj).focus();
      if(onComplete) onComplete();
    });
  }

  XEditableGrid.prototype.BindRow = function (jobj, datarow) {
    var _this = this;
    var modelid = _this.modelid;
    var xmodel = (modelid? jsh.XModels[modelid] : null);
    var xfields = (xmodel ? xmodel.fields : []);

    jobj.find('.xelem' + xmodel.class).each(function(){
      //Ignore hidden fields
      if((this.nodeName.toLowerCase()=='input')&&(this.type.toLowerCase()=='hidden')) return;
      var jobj = $(this);
      var classList = this.classList||[];
      if(!_.includes(classList,'checkbox')){
        if(_.includes(classList, 'editable')) jobj.keyup(function (e) { return _this.ControlUpdate(this, e); });
        jobj.focus(function (e) { return _this.SetFocus(this, e); });
      }
      jobj.change(function (e) { if (!$(this).hasClass('editable')) return; return _this.ControlUpdate(this, e); });
      if(_.includes(classList,'xtagbox_base')){
        jobj.on('input keyup', function (e) { if (!$(this).hasClass('editable')) return; return _this.ControlUpdate(this, e); });
        //jobj.prev().find('input').focus(function (e) { return _this.SetFocus(this, e); });
        jsh.XExt.TagBox_Focus(jobj.prev(), function(e){ return _this.SetFocus(this, e); });
      }
      if(_.includes(classList, 'editable')) if(_.includes(classList,'checkbox')) jobj.click(function (e) { return _this.CheckboxUpdate(this, e); });
      if(_.includes(classList,'datepicker') && _.includes(classList,'editable')){
        var ctrl = this;
        var dateformat = jsh.DEFAULT_DATEFORMAT;
        var fname = $(this).data('id');
        var xfield = xfields[fname];
        if (xfield && xfield.controlparams && xfield.controlparams.dateformat) dateformat = xfield.controlparams.dateformat;
        $(this).datepicker({
          changeMonth: true, changeYear: true, dateFormat: dateformat, duration: '', showAnim: '', onSelect: function () {
            jsh.ignorefocusHandler = true;
            window.setTimeout(function () {
              window.setTimeout(function () { $(ctrl).next('.datepicker_handle').focus(); jsh.ignorefocusHandler = false; _this.ControlUpdate(ctrl); }, 1);
            }, 1);
          }
        });
      }
      /*
      //TSV Paste
      jobj.on('paste', function(e){
        var str_data = ((event.clipboardData || window.clipboardData).getData('text')||'').toString();
        var check_tsv = false;
        if(str_data){
          if(str_data.indexOf('\t')>=0) check_tsv = true;
          else if((str_data.indexOf('\n')>=0) && !jobj.is('textarea,.xtextzoom')) check_tsv = true;
        }
        if(check_tsv){
          var tsv_data = undefined;
          try{
            var tsv_data = $.csv.toArrays(str_data, { separator: '\t' });
          }
          catch(ex){ }
          if(tsv_data){
            e.preventDefault();
            e.stopPropagation();
          }
        }
      });
      */
    });
    jobj.find('.xelem' + xmodel.class + ', .xlookup, .xtextzoom').keydown(function (e) { return _this.ControlKeyDown(this, e) })
    jobj.find('.xlookup,.xtextzoom').focus(function (e) { var ctrl = $(this).prev()[0]; return _this.SetFocus(ctrl, e); });
    if(datarow && datarow._is_insert){
      jobj.find('.xelem' + xmodel.class).each(function(){ 
        var jobj = $(this);
        if (!jobj.hasClass('editable')) return;
        jobj.addClass('updated');
        if(jobj.parent().hasClass('xform_checkbox_container')) jobj.parent().addClass('updated');
        if(jobj.hasClass('xtagbox_base')) jobj.prev().addClass('updated');
      });
    }
  }

  return XEditableGrid;
}