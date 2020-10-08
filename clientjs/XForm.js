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
var async = require('async');

exports = module.exports = function(jsh){

  function XForm(options){
    if(_.isString(options)) options = { url: options };
    options = _.extend({
      url: '',
      TemplateID: '',
      PlaceholderID: '',
      modelid: '',
      API: undefined,
    }, options);
    if(!options.modelid && options.url) options.modelid = options.url;
    if(!options.url && options.modelid) options.url = options.modelid;

    this._this = this;
    this.url = options.url;
    this.modelid = options.modelid;
    this.TemplateID = options.TemplateID;
    this.PlaceholderID = options.PlaceholderID;
    this.DataType = Object;
    this.Data = new this.DataType();
    this.DataSet = null;
    this.DeleteSet = [];
    this.GetSelectParams = function(){ return this.GetKeys(); };
    this.GetReselectParams = function(){ return this.GetSelectParams(); };
    this.GetUpdateParams = function(){ return this.GetFieldParams('U'); };
    this.GetInsertParams = function(){ return this.GetFieldParams('I'); };
    this.GetDeleteParams = function(){ return this.GetKeys(); };
    this.GetKeys = function(){ return {}; }
    this.async = true;
    this.Index = 0;
    this.xData = null;
    this.IsDirty = false;
    this.DBTaskRows = {};
    this.OnBeforeRender = null;
    this.OnAfterRender = null;
    this.OnDBError = null;
    this.Prop = {};
    this.API = (options.API ? options.API : new jsh.XAPI.Form.jsHarmony(this.modelid));
  }

  XForm.prototype.Render = function(options){
    options = _.extend({ resetValidation: true }, options);
    if(!this.Data) return;
    if(options.resetValidation) this.ResetValidation();

    if (this.OnBeforeRender) this.OnBeforeRender();
    if(this.Data.OnRender){
      this.Data.OnRender.apply(this.Data, arguments);
    }
    else if(this.TemplateID){
      var ejssource = jsh.$root(this.TemplateID).html();
      jsh.$root(this.PlaceholderID).html(jsh.XExt.renderEJS(ejssource, undefined, {
        data:this.Data
      }));
    }
    if (this.OnAfterRender) this.OnAfterRender();
  };
  XForm.prototype.GetValues = function(perm){
    if(!this.Data) return;
    this.Data.GetValues(perm||'IUD');
  };
  XForm.prototype.HasUpdates = function (){
    if (this.IsDirty) return true;
    if(_.isArray(this.DataSet)){
      if(this.DeleteSet.length > 0) return true;
      if(this.Count() == 0) return false;
      //If current num rows == 0
      if(this.Data._is_insert) return true;
      for(var i= 0; i< this.DataSet.length; i++){
        if(this.DataSet[i]._is_insert) return true;
      }
    }
    if(!this.Data) return false;
    return this.Data.HasUpdates(this.PlaceholderID);
  };
  XForm.prototype.Validate = function(perms,obj){
    obj = obj || (this.Index>=0?this.Data:undefined);
    if(!obj) return true;
    var validator;
    if(this.Data && this.Data.xvalidate) validator = this.Data.xvalidate;
    else if(obj.xvalidate) validator = obj.xvalidate;
    else return true;
    var parentobj = undefined;
    if (this.xData) parentobj = this.Data._jrow;
    return validator.ValidateControls(perms,obj,'',parentobj);
  }
  XForm.prototype.ResetValidation = function(obj){
    obj = obj || (this.Index>=0?this.Data:undefined);
    if(!obj) return;
    if(!obj.xvalidate) return;
    return obj.xvalidate.ResetValidation();
  }
  XForm.prototype.RecheckDirty = function () {
    var rsltDirty = false;
    if (this.DeleteSet.length > 0) rsltDirty = true;
    if (_.isArray(this.DataSet)) {
      for (var i = 0; i < this.DataSet.length; i++) {
        if(this.DataSet[i]._is_dirty) rsltDirty = true;
        if(this.DataSet[i]._is_insert) rsltDirty = true;
      }
      if(this.Data._is_dirty) rsltDirty = true;
      if(this.Data._is_insert) rsltDirty = true;
    }
    this.IsDirty = rsltDirty;
  }
  XForm.prototype.ResetDirty = function () {
    if (_.isArray(this.DataSet)) {
      this.DeleteSet = [];
      for (var i = 0; i < this.DataSet.length; i++) {
        this.DataSet[i]._is_dirty = false;
        this.DataSet[i]._is_insert = false;
        this.DataSet[i]._orig = null;
      }
    }
    if(this.Data){
      this.Data._is_dirty = false;
      this.Data._is_insert = false;
      this.Data._orig = null;
    }
    if (this.xData) {
      jsh.$root(this.xData.PlaceholderID).find('.xform_ctrl.updated').removeClass('updated');
    }
    this.IsDirty = false;
  }
  XForm.prototype.Count = function(){
    if(!_.isArray(this.DataSet)) return 1;
    return this.DataSet.length;
  }
  XForm.prototype.NavNext = function(){
    if(this.Count() == 0) return;
    if(this.Index == (this.Count()-1)) return;
    this.NavTo(this.Index+1);
  }
  XForm.prototype.NavPrev = function(){
    if(this.Count() == 0) return;
    if(this.Index == 0) return;
    this.NavTo(this.Index-1);
  }
  XForm.prototype.NavFirst = function(){
    if(this.Count() == 0) return;
    if(this.Index == 0) return;
    this.NavTo(0);
  }
  XForm.prototype.NavLast = function(){
    if(this.Count() == 0) return;
    if(this.Index == (this.Count()-1)) return;
    this.NavTo(this.Count()-1);
  }
  XForm.prototype.SetIndex = function (_index, saveold, jrow) {
    if (typeof saveold == 'undefined') saveold = true;
    if (_index > this.Count()) { jsh.XExt.Alert('Cannot navigate - Index greater than size of collection'); return false; }
    else if (_index < 0) { jsh.XExt.Alert('Cannot navigate - Index less than zero'); return false; }
    delete this.Data.LOVs;
    delete this.Data.defaults;
    delete this.Data.bcrumbs;
    delete this.Data.title;
    if (saveold) {
      if (!this.CommitRow()) return false;
    }
    this.Index = _index;
    this.Data = _.extend(this.Data, this.DataSet[this.Index]);
    this.Data._LOVs = this.LOVs;
    this.Data._defaults = this.defaults;
    this.Data._bcrumbs = this.bcrumbs;
    this.Data._title = this.title;
    if (this.xData) {
      if(jrow) this.Data._jrow = jrow;
      else this.Data._jrow = jsh.$root(this.xData.PlaceholderID).find("tr[data-id='" + this.Index + "']");
    }
    return true;
  }
  XForm.prototype.NavTo = function (_index, saveold, onComplete){
    if (!this.SetIndex(_index, saveold)) return;
    this.Render();
    if(onComplete) onComplete();
  }
  XForm.prototype.NavAdd = function(){
    if(!this.Data.Commit()) return;
    this.NewRow();
    if(this.Index==-1){ this.NavTo(0,false); }
    else this.NavLast();
  }
  XForm.prototype.NavDelete = function(){
    if(this.Count() == 0) return;
    this.DataSet[this.Index] = _.extend(this.DataSet[this.Index],this.Data);
    if(!this.Data._is_insert) this.DeleteSet.push(this.DataSet[this.Index]);
    this.DataSet.splice(this.Index,1);
    if(this.Count() == 0){
      this.Index = -1;
      this.Render();
    }
    else{
      if(this.Index >= this.Count()) this.Index--;
      this.NavTo(this.Index,false);
    }
  }
  XForm.prototype.NewRow = function (){
    var rslt = new this.DataType();
    rslt._is_insert = true;
    rslt._is_dirty = true;
    rslt = this.ApplyDefaults(rslt);
    this.ApplyUnboundDefaults(rslt);
    this.DataSet.push(rslt);
    this.IsDirty = true;
    return rslt;
  }
  XForm.prototype.Select = function(onComplete, onFailure){
    var _this = this;

    this.qExecute(this.PrepExecute('get', this.url, this.GetSelectParams(), {}, function (rslt){
      _this.DataSet = null;
      //Load LOVs
      for(var tbl in rslt){
        if(tbl.indexOf('_LOV_')==0){
          if(!('_LOVs' in _this.Data)) _this.Data._LOVs = {};
          _this.Data._LOVs[tbl.substring(5)] = rslt[tbl];
        }
      }
      if ('_defaults' in rslt) { _this.Data['_defaults'] = rslt['_defaults']; }
      if ('_bcrumbs' in rslt) { _this.Data['_bcrumbs'] = rslt['_bcrumbs']; }
      if ('_title' in rslt) { _this.Data['_title'] = rslt['_title']; }
      _this.LOVs = _this.Data._LOVs;
      _this.defaults = _this.Data._defaults;
      _this.bcrumbs = _this.Data._bcrumbs;
      _this.title = _this.Data._title;
      var xmodel = _this.GetModel();
      //Load Data
      if(_this.modelid in rslt){
        if(_.isArray(rslt[_this.modelid])){
          _this.DataSet = rslt[_this.modelid];
          for (var i = 0; i < _this.DataSet.length; i++) {
            _this.DataSet[i]['_is_insert'] = false;
            _this.DataSet[i]['_is_dirty'] = false;
            _this.DataSet[i]['_is_deleted'] = false;
            _this.DataSet[i]['_orig'] = null;
            _this.ApplyUnboundDefaults(_this.DataSet[i]);
          }
          _this.DeleteSet = [];
          _this.ResetDirty();
          if(_this.DataSet.length == 0){
            _this.Index = -1;
            _this.Render();
          }
          else{
            _this.Index = 0;
            _this.NavTo(0,false);
          }
        }
        else {
          _this.Data = _.extend(_this.Data,rslt[_this.modelid]);
          _this.Data._is_insert = false;
          _this.Data._is_dirty = false;
          _this.Data._is_deleted = false;
          _this.Data._orig = null;
          _this.ApplyUnboundDefaults(_this.Data);
        }
      }
      else {
        _this.ApplyDefaults(_this.Data);
        _this.ApplyUnboundDefaults(_this.Data);
      }
      //NavTo already calls render
      if (_this.DataSet == null) _this.Render();
      if(onComplete) onComplete(rslt);
    }, onFailure));
  }
  XForm.prototype.Reset = function(){
    var _this = this;
    if(_this.Data && _this.Data.Fields){
      for(var fname in _this.Data.Fields) _this.Data[fname] = '';
    }
    _this.ApplyDefaults(_this.Data);
    _this.ApplyUnboundDefaults(_this.Data);
    _this.Render();
  }
  XForm.prototype.ResetDataset = function(){
    if(this.Data){
      if(this.Data._orig) this.Data = _.extend(this.Data, this.Data._orig);
      this.Data._orig = null;
      this.Data._is_dirty = false;
    }
    if(this.DataSet){
      for(var i=0;i<this.DataSet.length;i++){
        var row = this.DataSet[i];
        if(row._orig) row = _.extend(row, row._orig);
        row._orig = null;
        row._is_dirty = false;
        row._is_deleted = false;
        if(row._is_insert){
          this.DataSet.splice(i,1);
          i--;
        }
      }
    }
    this.DeleteSet = [];
  }
  XForm.prototype.ApplyDefaults = function(data){
    var _this = this;
    var xmodel = _this.GetModel();
    var modelid = undefined;
    if(xmodel) modelid = xmodel.id;
    var rslt = data;
    if(rslt._is_insert||(xmodel && ((xmodel.layout=='exec')||(xmodel.layout=='report')))){
      _.each(_this.defaults, function (val, fieldname){
        if(rslt[fieldname]) return; //If field is set via GET, do not overwrite
        if(fieldname in rslt){
          if(val && val.toString().indexOf('js:')==0){
            var js = val.substr(3);
            //Evaluate JS
            var evalparams = { data: data };
            if(_this.modelid in jsh.App) evalparams.modelid = _this.modelid;
            val = jsh.XExt.JSEval(js,this,evalparams);
          }
          rslt[fieldname] = val;
        }
      });
      _.each(_this.DataType.prototype.Fields, function(field){
        if(!field.name || field.unbound) return;
        if(jsh._GET && (field.name in jsh._GET) && jsh.XExt.isFieldTopmost(modelid, field.name)) data[field.name] = jsh._GET[field.name];
        else if(_this.defaults && (field.name in _this.defaults)){ }
        else if(field.hasDefault()){
          data[field.name] = jsh.XFormat.Decode(field.format, field.getDefault(data));
        }
      });
    }
    return rslt;
  }
  XForm.prototype.GetModel = function(){
    var _this = this;
    if(!jsh) return;
    if(!_this.modelid) return;
    return jsh.XModels[_this.modelid];
  }
  XForm.prototype.ApplyUnboundDefaults = function(data){
    var _this = this;
    var xmodel = _this.GetModel();
    if(!xmodel) return;
    var ignore_fields = xmodel.loadUnboundFields(data)||[];
    if(!_this.defaults || !_this.DataType || !_this.DataType.prototype || !_this.DataType.prototype.Fields) return;
    _.each(_this.DataType.prototype.Fields, function(field){
      if(!field.name || !field.unbound) return;
      if(_.includes(ignore_fields,field.name)) return;
      if(jsh._GET && (field.name in jsh._GET)) data[field.name] = jsh._GET[field.name];
      else if(field.name in _this.defaults){
        data[field.name] = _this.defaults[field.name];
      }
      else if(field.hasDefault()){
        data[field.name] = jsh.XFormat.Decode(field.format, field.getDefault(data));
      }
    });
  }
  XForm.prototype.PrepExecute = function(_method,_model,_query,_post,onComplete,onFail){
    var rslt = { 
      'method':_method,
      'model':_model,
      'query':_query,
      'post':_post,
      'onComplete':onComplete
    };
    if (typeof onFail != 'undefined') rslt.onFail = onFail;
    if(_method=='get'){
      rslt.post = _query;
      rslt.query = {};
    }
    return rslt;
  }
  XForm.prototype.CommitRow = function (){
    if (!this.Data.Commit()) return false;
    this.DataSet[this.Index] = _.extend(this.DataSet[this.Index], this.Data);
    if (this.Data._is_dirty){ this.IsDirty = true; }
    return true;
  }
  XForm.prototype.PrepSaveDataSet = function(ignorecommit){
    if(!ignorecommit && !this.CommitRow()) return;
    
    var dbtasks = [];
    this.DBTaskRows = {};
    var curdata = this.Data;
    this.Data = new this.DataType();
    
    for(var i = 0; i < this.DeleteSet.length; i++){
      this.Data = _.extend(this.Data,this.DeleteSet[i]);
      dbtasks.push(this.PrepDelete());
      this.DBTaskRows['delete_' + dbtasks.length] = i;
    }
    
    for(var i = 0; i < this.DataSet.length; i++){
      this.Data = _.extend(this.Data, this.DataSet[i]);
      if (this.Data._is_deleted) continue;
      if (this.DataSet[i] in this.DeleteSet) continue;
      if (this.Data._is_insert) {
        dbtasks.push(this.PrepInsert());
        this.DBTaskRows['insert_' + dbtasks.length] = i;
      }
      else {
        if (this.xData && !this.Data._is_dirty) continue;
        dbtasks.push(this.PrepUpdate());
        this.DBTaskRows['update_' + dbtasks.length] = i;
      }
    }
    
    this.Data = curdata;
    return dbtasks;
  }
  XForm.prototype.PrepUpdate = function(onComplete,onFail){ 
    return this.PrepExecute('post',this.url,this.GetKeys(),this.GetUpdateParams(),onComplete,onFail); 
  }
  XForm.prototype.Update = function(onComplete,onFail){ this.qExecute(this.PrepUpdate(onComplete,onFail)); }
  XForm.prototype.PrepInsert = function(onComplete,onFail){ 
    return this.PrepExecute('put',this.url,{},this.GetInsertParams(),onComplete,onFail); 
  }
  XForm.prototype.Insert = function(onComplete,onFail){ this.qExecute(this.PrepInsert(onComplete,onFail)); }
  XForm.prototype.PrepDelete = function(onComplete,onFail){ 
    return this.PrepExecute('delete',this.url,this.GetDeleteParams(),{},onComplete,onFail); 
  }
  XForm.prototype.Delete = function(onComplete,onFail){ this.qExecute(this.PrepDelete(onComplete,onFail)); }
  XForm.prototype.Execute = function(onComplete,onFail){ 
    this.qExecute(this.PrepExecute('get',this.url,this.Data,{},onComplete,onFail)); 
  }
  XForm.prototype.ExecuteTrans = function (DBTasks, onComplete, onFail) {
    var execdata = [];
    for (var i = 0; i < DBTasks.length; i++) {
      var dbtask = DBTasks[i];
      execdata.push({
        method: dbtask.method,
        model: dbtask.model,
        query: $.param(dbtask.query),
        post: $.param(dbtask.post)
      });
    }
    var final_onComplete = function (rslt) {
      for (var i = 0; i < DBTasks.length; i++) {
        var dbtask = DBTasks[i];
        if (dbtask.onComplete) dbtask.onComplete(rslt);
      }
      if (onComplete) onComplete(rslt);
    }
    var execparams = {
      'method': 'post',
      'model': '_transaction',
      'query': {},
      'post': $.param({ data: JSON.stringify(execdata) }),
      'onComplete': final_onComplete
    };
    if (onFail) execparams.onFail = onFail;
    this.qExecute(execparams);
  }
  XForm.prototype.qExecute = function (ExecParams) {
    var _this = this;
    if(ExecParams.model){
      if(ExecParams.model[0] == '/') ExecParams.url = ExecParams.model;
      else if(ExecParams.model.indexOf('http://')==0) ExecParams.url = ExecParams.model;
      else if(ExecParams.model.indexOf('https://')==0) ExecParams.url = ExecParams.model;
    }

    if(!ExecParams.url){
      if(!ExecParams.model) ExecParams.model = this.modelid;
    }
    ExecParams.async = this.async;
    this.API.Execute(ExecParams, function(errdata, rslt){
      if(errdata){
        //Error
        var errtxt = errdata.toString();
        if(errdata.responseText) errtxt = errdata.responseText;

        var jerrdata = {};
        try { jerrdata = JSON.parse(errtxt); }
        catch(ex){ }
        if ((jerrdata instanceof Object) && ('_error' in jerrdata)) {
          if (jsh.DefaultErrorHandler(jerrdata._error.Number, jerrdata._error.Message)) { }
          else if (!(_this.HandleError(jerrdata._error,jerrdata._stats,ExecParams,errdata))) { }
          else if ((jerrdata._error.Number == -9) || (jerrdata._error.Number == -5)) { jsh.XExt.Alert(jerrdata._error.Message); }
          if (('onFail' in ExecParams) && ExecParams.onFail(jerrdata._error)) { }
          else { jsh.XExt.Alert('Error #' + jerrdata._error.Number + ': ' + jerrdata._error.Message); }
          return;
        }
        if (('onFail' in ExecParams) && (ExecParams.onFail(errdata))){ }
        else if(('readyState' in errdata) && (errdata.readyState === 0)){ jsh.XExt.Alert('A network error has occurred'); }
        else if(('status' in errdata) && (errdata.status == '404')){ jsh.XExt.Alert('(404) The requested page was not found.'); }
        else if(jsh._debug){ jsh.XExt.Alert('An error has occurred: ' + errtxt); }
        else jsh.XExt.Alert('An error has occurred.  If the problem continues, please contact the system administrator for assistance.');
      }
      else {
        //Success
        if ((rslt instanceof Object) && ('_error' in rslt)) {
          if(jsh.DefaultErrorHandler(rslt._error.Number,rslt._error.Message)) { }
          else if(!(_this.HandleError(rslt._error,rslt._stats,ExecParams, rslt))) { }
          else if((rslt._error.Number == -9) || (rslt._error.Number == -5)){ jsh.XExt.Alert(rslt._error.Message); }
          if (('onFail' in ExecParams) && ExecParams.onFail(rslt._error)) { }
          else { jsh.XExt.Alert('Error #' + rslt._error.Number + ': ' + rslt._error.Message); }
          return;
        }
        if ((rslt instanceof Object) && ('_stats' in rslt)) {
          _this.OnDBStats(rslt._stats);
        }
        if((ExecParams.method != 'get') && (rslt instanceof Object) && ('_success' in rslt)){
          _this.OnSuccess(rslt);
          if(ExecParams.onComplete) ExecParams.onComplete(rslt);
        }
        else if((ExecParams.method == 'get') && (rslt instanceof Object)){
          _this.OnSuccess(rslt);
          if(ExecParams.onComplete) ExecParams.onComplete(rslt);
        }
        else {
          _this.OnUndefined(rslt);
          if ('onFail' in ExecParams) ExecParams.onFail(rslt);
        }
      }
    });
  }
  XForm.prototype.OnDBStats = function(dbstats){
    var _this = this;
    var rslt = true;
    if(dbstats){
      if(('warnings' in dbstats) && _.isArray(dbstats.warnings)) dbstats = [dbstats]
      else if(('notices' in dbstats) && _.isArray(dbstats.notices)) dbstats = [dbstats]
      _.each(dbstats, function(stats){
        _.each(stats.warnings, function(warning){ rslt = rslt && _this.OnDBMessage(warning); });
        _.each(stats.notices, function(notice){ rslt = rslt && _this.OnDBMessage(notice); });
      });
    }
    return rslt;
  }
  XForm.prototype.OnDBMessage = function (exception){
    if(exception && exception.Message) exception = exception.Message;
    exception = (exception||'').toString();
    var xmodel = this.GetModel();
    if(xmodel) exception = jsh.XExt.renderEJS(exception, xmodel.id);
    if (jsh.XExt.beginsWith(exception, "Execute Form - ")) {
      var dbaction = exception.substr(("Execute Form - ").length);
      var dbmessage = dbaction.substr(0, dbaction.indexOf('//')).trim();
      var url = dbaction.substr(dbaction.indexOf('//')+2);
      if (url.indexOf(' - ') >= 0) url = url.substr(0, url.indexOf(' - '));
      var modelid = url.trim();
      var params = {};
      if (url.indexOf('?') >= 0) {
        modelid = url.substr(0, url.indexOf('?'));
        params = jsh.XExt.parseGET(url.substr(url.indexOf('?')));
      }
      if (!dbmessage) dbmessage = 'Opening form';
      jsh.XExt.Alert(dbmessage,undefined, {
        onAcceptImmediate: function () {
          jsh.XExt.popupForm(modelid, undefined, params);
        }
      });
      return false;
    }
    else if(jsh.XExt.beginsWith(exception, "Application Error - ")){
      jsh.XExt.Alert(exception);
      return false;
    }
    else if(jsh.XExt.beginsWith(exception, "Application Warning - ")){
      jsh.XExt.Alert(exception);
      return false;
    }
    return true;
  };
  XForm.prototype.HandleError = function (error, stats, execParams, data){
    if(this.OnDBMessage(error)===false) return false;

    if(this.OnDBError && (this.OnDBError(error, stats, execParams, data)===false)) return false;

    if(!this.Data) return true;
    
    if(this.Data.OnDBError){
      if(this.Data.OnDBError(error, stats, execParams, data)===false) return false;
    }

    return true;
  };
  XForm.prototype.OnSuccess = function(rslt){
    if(!this.Data) return true;
    
    if(this.Data.OnSuccess){
      this.Data.OnSuccess(rslt);
    }
  };
  XForm.prototype.OnUndefined = function(data){
    if(this.Data && (this.Data.OnUndefined)) this.Data.OnUndefined(data);
    else jsh.XExt.Alert("Undefined: " + JSON.stringify(data));
  }
  XForm.prototype.GetFieldParams = function(action){
    var _this = this;
    var rslt = {};
    var xmodel = _this.GetModel();
    _.each(_this.Data.Fields,function(field){
      if (!jsh.XExt.hasAction(field.actions, action)) return;
      if (field.unbound) return;
      if((typeof _this.Data[field.name] == 'undefined') && xmodel && xmodel.bindings && (field.name in xmodel.bindings)){
        rslt[field.name] = '%%%'+field.name+'%%%';
      }
      else {
        if (('control' in field) && (field.control == 'file_upload')) {
          var fval = _this.Data[field.name];
          if (_.isString(fval)) {
            if (fval != '') fval = '_temp/' + fval;
            rslt[field.name] = fval;
          }
        }
        else rslt[field.name] = _this.Data[field.name];
      }
    });
    return rslt;
  }

  XForm.prototype.XExecute = function(url,d,onComplete,onFail){
    var xform = new XForm(url);
    xform.Data = d;
    xform.Execute(onComplete,onFail);
  }

  XForm.prototype.XExecuteBlock = function(url,d,onComplete,onFail){
    var xform = new XForm(url);
    xform.Data = d;
    xform.async = false;
    xform.Execute(onComplete,onFail);
  }

  XForm.prototype.XExecutePost = function (url, d, onComplete, onFail, options){
    if(!options) options = {};
    var xform = new XForm(url);
    if(options.OnDBError) xform.Data.OnDBError = options.OnDBError;
    xform.qExecute(xform.PrepExecute('post', xform.url, {}, d, onComplete, onFail)); 
  }

  XForm.prototype.reqGet = function (url, q, d, onComplete, onFail, options){
    if(!options) options = {};
    var xform = new XForm(url);
    if(options.OnDBError) xform.Data.OnDBError = options.OnDBError;
    xform.qExecute(xform.PrepExecute('get', xform.url, q, d, onComplete, onFail)); 
  }

  XForm.prototype.reqPost = function (url, q, d, onComplete, onFail, options){
    if(!options) options = {};
    var xform = new XForm(url);
    if(options.OnDBError) xform.Data.OnDBError = options.OnDBError;
    xform.qExecute(xform.PrepExecute('post', xform.url, q, d, onComplete, onFail)); 
  }

  XForm.prototype.reqPut = function (url, q, d, onComplete, onFail, options){
    if(!options) options = {};
    var xform = new XForm(url);
    if(options.OnDBError) xform.Data.OnDBError = options.OnDBError;
    xform.qExecute(xform.PrepExecute('put', xform.url, q, d, onComplete, onFail)); 
  }

  XForm.prototype.reqDelete = function (url, q, d, onComplete, onFail, options){
    if(!options) options = {};
    var xform = new XForm(url);
    if(options.OnDBError) xform.Data.OnDBError = options.OnDBError;
    xform.qExecute(xform.PrepExecute('delete', xform.url, q, d, onComplete, onFail)); 
  }

  XForm.Post = XForm.prototype.reqPost;
  XForm.Put = XForm.prototype.reqPut;
  XForm.Delete = XForm.prototype.reqDelete;
  XForm.Get = XForm.prototype.reqGet;
  XForm.RequestSync = XForm.prototype.XExecuteBlock;

  return XForm;
}