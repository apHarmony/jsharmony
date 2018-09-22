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

exports = module.exports = function(jsh){

  function XGrid(_modelid, _CommitLevel, _ValidationLevel) {
    this.modelid = _modelid;
    this.ErrorClass = 'xinputerror';
    this.CommitLevel = _CommitLevel;
    this.ValidationLevel = _ValidationLevel;
    this.CurrentCell = null;
    this.Debug = false;
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
    this.OnCancelEdit = null; //(rowid,obj)
    this.SaveBeforeUpdate = false;
    this.Init();
  }
  XGrid.prototype.CellEnter = function (obj, e) {
    this.DebugLog('Enter Cell ' + $(obj).data('id'));
    this.CurrentCell = obj;
    if (this.OnCellEnter) this.OnCellEnter(obj, e);
  }

  XGrid.prototype.CellLeave = function (oldobj, newobj, e) {
    this.DebugLog('Leave Cell ' + $(oldobj).data('id'));
    if (this.OnCellLeave) this.OnCellLeave(obj, e);
  }

  XGrid.prototype.RowEnter = function (rowid) {
    this.DebugLog('Enter Row ' + rowid);
    if (this.OnRowEnter) this.OnRowEnter(rowid);
  }

  XGrid.prototype.RowLeave = function (rowid) {
    this.DebugLog('Leave Row ' + rowid);
    if (this.OnRowLeave) this.OnRowLeave(rowid);
  }

  XGrid.prototype.GridEnter = function () {
    this.DebugLog('Enter Grid');
    if (this.OnGridEnter) this.OnGridEnter();
  }

  XGrid.prototype.GridLeave = function (oldobj) {
    this.DebugLog('Leave Grid');
    this.CurrentCell = undefined;
    if (this.OnGridLeave) this.OnGridLeave(oldobj);
  }

  XGrid.prototype.CellChange = function (oldobj, newobj, e) {
    var oldrowid = -1;
    var newrowid = -1;
    if (oldobj) {
      oldrowid = jsh.XExt.XForm.GetRowID(this.modelid, oldobj);
      this.CellLeave(oldobj, newobj, e);
    }
    if (newobj) newrowid = jsh.XExt.XForm.GetRowID(this.modelid, newobj);
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

  XGrid.prototype.Init = function () {
    //Global Focus Change
    var _this = this;
    jsh.focusHandler.push(function (newobj) {
      if (jsh.xLoader.IsLoading) { return; }
      var newrowid = -1;
      var oldrowid = -1;
      var oldobj = _this.CurrentCell;
      if (!oldobj) return; //Return if user was not previously in grid
      if ($.datepicker && $.datepicker._datepickerShowing) {
        if (newobj == $('body')[0]) return;
        else if ($('.ui-datepicker').has(newobj).length) return;
      }
      if (newobj) newrowid = jsh.XExt.XForm.GetRowID(_this.modelid, newobj);
      if (newrowid >= 0) return; //Return if current control is in grid
      _this.DebugLog('FocusHandler Triggered');
      _this.CellLeaving(oldobj, undefined, undefined, function () {
        //Success
        _this.CellChange(_this.CurrentCell);
      });
    });
  }

  XGrid.prototype.DebugLog = function (obj) {
    if (this.Debug) console.log(obj);
  }

  XGrid.prototype.ControlEnter = function (obj, e) {
    var _this = this;
    if (this.CurrentCell == obj) return;
    if (this.ErrorClass) if ($(obj).hasClass(this.ErrorClass)) { this.CurrentCell = obj; return; }
    
    //Reset old value
    var immediate_result = this.ControlLeaving(obj, e, function (_immediate_result) {
      //On success
      _this.CellChange(_this.CurrentCell, obj, e);
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

  XGrid.prototype.CheckboxUpdate = function (obj, e) {
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
  XGrid.prototype.ControlLeaving = function (obj, e, onsuccess, oncancel) {
    var _this = this;
    var rslt = this.CellLeaving(this.CurrentCell, obj, e, onsuccess, oncancel);
    if (rslt === true) return true;
    else if (rslt === false) return true;
    return false;
  }
  XGrid.prototype.ControlUpdate = function (obj, e) {
    this.DebugLog('Update ' + $(obj).data('id'));
    if (this.OnControlUpdate) this.OnControlUpdate(obj, e);
  }
  XGrid.prototype.ControlKeyDown = function (obj, e) {
    if (e.keyCode == 27) { //Escape key pressed
      //Get current Rowid
      var rowid = -1;
      var obj = this.CurrentCell;
      if (obj) rowid = jsh.XExt.XForm.GetRowID(this.modelid, obj);
      if (rowid < 0) return;
      if (this.OnCancelEdit) this.OnCancelEdit(rowid, obj);
    }
  }

  XGrid.prototype.CellLeaving = function (oldobj, newobj, e, onsuccess, oncancel) {
    var oldrowid = -1;
    var newrowid = -1;
    if (oldobj) oldrowid = jsh.XExt.XForm.GetRowID(this.modelid, oldobj);
    if (newobj) newrowid = jsh.XExt.XForm.GetRowID(this.modelid, newobj);

    var rowchange = (oldrowid != newrowid);
    
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
      if (jsh.XForm_GetChanges().length > 0) {
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
      ((this.CommitLevel == 'cell') && (newobj && $(newobj).is(':checkbox'))) || 
      (rowchange && (this.CommitLevel == 'row'))
  )) {
      
      if (newobj) jsh.qInputAction = new jsh.XExt.XInputAction(newobj);
      else if (jsh.qInputAction && !(jsh.qInputAction.IsExpired())) { }
      else jsh.qInputAction = null;
      
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
        if (onsuccess) onsuccess(false);
        if (jsh.qInputAction) jsh.qInputAction.Exec();
      }
      
      if (!this.OnCommit(oldrowid, oldobj, onsuccess_override, oncancel)) return false;
    }
    
    if (onsuccess) onsuccess();
    return true;
  }

  XGrid.prototype.BindRow = function (jobj) {
    var _this = this;
    var modelid = _this.modelid;
    var xform = (modelid ? jsh.App['XForm'+modelid] : null);
    var xfields = (xform ? xform.prototype.Fields : []);
    jobj.find('.xelem' + this.modelid).not('.xelem' + this.modelid + '.checkbox').keyup(function (e) { if (!$(this).hasClass('editable')) return; return _this.ControlUpdate(this, e); });
    jobj.find('.xelem' + this.modelid).change(function (e) { if (!$(this).hasClass('editable')) return; return _this.ControlUpdate(this, e); });
    jobj.find('.xelem' + this.modelid + '.checkbox').click(function (e) { if (!$(this).hasClass('editable')) return; return _this.CheckboxUpdate(this, e); });
    jobj.find('.xelem' + this.modelid + '.datepicker').each(function () {
      if (!$(this).hasClass('editable')) return;
      var ctrl = this;
      var dateformat = jsh.DEFAULT_DATEFORMAT;
      var fname = $(this).data('id');
      var xfield = xfields[fname];
      if (xfield && xfield.controlparams) dateformat = xfield.controlparams.dateformat;
      $(this).datepicker({
        changeMonth: true, changeYear: true, dateFormat: dateformat, duration: '', showAnim: '', onSelect: function () {
          jsh.ignorefocusHandler = true;
          window.setTimeout(function () {
            window.setTimeout(function () { jsh.ignorefocusHandler = false; _this.ControlUpdate(ctrl); }, 1);
          }, 1);
        }
      });
    });
    jobj.find('.xelem' + this.modelid).not('.xelem' + this.modelid + '.checkbox').focus(function (e) { if (jsh.xDialog.length) return; if (!$(this).hasClass('editable')) return; return _this.ControlEnter(this, e); });
    jobj.find('.xelem' + this.modelid + ', .xlookup, .xtextzoom').keydown(function (e) { return _this.ControlKeyDown(this, e) })
    jobj.find('.xlookup,.xtextzoom').focus(function (e) { var ctrl = $(this).prev()[0]; if (jsh.xDialog.length) return; if (!$(ctrl).hasClass('editable')) return; return _this.ControlEnter(ctrl, e); });
  }

  return XGrid;
}