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

  function XForm(_q,_TemplateID,_PlaceholderID){
    this._this = this;
    this.q = _q;
    this.TemplateID = _TemplateID;
    this.PlaceholderID = _PlaceholderID;
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
    this.Prop = {};
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
    var rslt = this.ApplyDefaults(new this.DataType());
    this.ApplyUnboundDefaults(rslt);
    this.DataSet.push(rslt);
    this.IsDirty = true;
    return rslt;
  }
  XForm.prototype.Select = function(onComplete, onFailure){
    var _this = this;

    this.qExecute(this.PrepExecute('get', this.q, this.GetSelectParams(), {}, function (rslt){
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
      if(_this.q in rslt){
        if(_.isArray(rslt[_this.q])){
          _this.DataSet = rslt[_this.q];
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
          _this.Data = _.extend(_this.Data,rslt[_this.q]);
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
  XForm.prototype.ApplyDefaults = function(data){
    var _this = this;
    var xmodel = _this.GetModel();
    var rslt = data;
    if(rslt._is_insert||(xmodel && ((xmodel.layout=='exec')||(xmodel.layout=='report')))){
      _.each(_this.defaults, function (val, fieldname){
        if(rslt[fieldname]) return; //If field is set via GET, do not overwrite
        if(fieldname in rslt){
          if(val && val.toString().indexOf('js:')==0){
            var js = val.substr(3);
            //Evaluate JS
            var evalparams = { data: data };
            if(_this.q in jsh.App) evalparams.modelid = _this.q;
            val = jsh.XExt.JSEval(js,this,evalparams);
          }
          rslt[fieldname] = val;
        }
      });
      _.each(_this.DataType.prototype.Fields, function(field){
        if(!field.name || field.unbound) return;
        if(jsh._GET && (field.name in jsh._GET)) data[field.name] = jsh._GET[field.name];
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
    if(!_this.q) return;
    return jsh.XModels[_this.q];
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
    return this.PrepExecute('post',this.q,this.GetKeys(),this.GetUpdateParams(),onComplete,onFail); 
  }
  XForm.prototype.Update = function(onComplete,onFail){ this.qExecute(this.PrepUpdate(onComplete,onFail)); }
  XForm.prototype.PrepInsert = function(onComplete,onFail){ 
    return this.PrepExecute('put',this.q,{},this.GetInsertParams(),onComplete,onFail); 
  }
  XForm.prototype.Insert = function(onComplete,onFail){ this.qExecute(this.PrepInsert(onComplete,onFail)); }
  XForm.prototype.PrepDelete = function(onComplete,onFail){ 
    return this.PrepExecute('delete',this.q,this.GetDeleteParams(),{},onComplete,onFail); 
  }
  XForm.prototype.Delete = function(onComplete,onFail){ this.qExecute(this.PrepDelete(onComplete,onFail)); }
  XForm.prototype.Execute = function(onComplete,onFail){ 
    this.qExecute(this.PrepExecute('get',this.q,this.Data,{},onComplete,onFail)); 
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
    ExecParams.url = jsh._BASEURL + '_d/' + ExecParams.model;
    if((ExecParams.model.indexOf('?')<=0) && (ExecParams.url[ExecParams.url.length-1] != '/')) ExecParams.url += '/';
    this.qExecuteBase(ExecParams);
  }
  XForm.prototype.qExecuteBase = function(ExecParams){
    var _this = this;
    var url = ExecParams.url;
    if(!_.isEmpty(ExecParams.query)) url += '?'+$.param(ExecParams.query);
    var loader = jsh.xLoader;
    if(loader) loader.StartLoading(_this);
    $.ajax({
      type:ExecParams.method.toUpperCase(),
      cache: false,
      url: url,
      data: ExecParams.post,
      async: _this.async,
      dataType: 'json',
      xhrFields: {
        withCredentials: true
      },
      success:function(data){
        if(loader) loader.StopLoading(_this);
        if ((data instanceof Object) && ('_error' in data)) {
          if(jsh.DefaultErrorHandler(data._error.Number,data._error.Message)) { }
          else if(!(_this.OnDBError(data._error,data._stats,ExecParams, data))) { }
          else if((data._error.Number == -9) || (data._error.Number == -5)){ jsh.XExt.Alert(data._error.Message); }
          else { jsh.XExt.Alert('Error #' + data._error.Number + ': ' + data._error.Message); }
          if ('onFail' in ExecParams) ExecParams.onFail(data._error);
          return;
        }
        if ((data instanceof Object) && ('_stats' in data)) {
          _this.OnDBStats(data._stats);
        }
        if((ExecParams.method != 'get') && (data instanceof Object) && ('_success' in data)){
          _this.OnSuccess(data);
          if(ExecParams.onComplete) ExecParams.onComplete(data);
        }
        else if((ExecParams.method == 'get') && (data instanceof Object)){
          _this.OnSuccess(data);
          if(ExecParams.onComplete) ExecParams.onComplete(data);
        }
        else {
          _this.OnUndefined(data);
          if ('onFail' in ExecParams) ExecParams.onFail(data);
        }
      },
      error:function(data){
        if(loader) loader.StopLoading(_this);
        var jdata = data.responseJSON;
        if ((jdata instanceof Object) && ('_error' in jdata)) {
          if (jsh.DefaultErrorHandler(jdata._error.Number, jdata._error.Message)) { }
          else if (!(_this.OnDBError(jdata._error,jdata._stats,ExecParams,data))) { }
          else if ((jdata._error.Number == -9) || (jdata._error.Number == -5)) { jsh.XExt.Alert(jdata._error.Message); }
          else { jsh.XExt.Alert('Error #' + jdata._error.Number + ': ' + jdata._error.Message); }
          if ('onFail' in ExecParams) ExecParams.onFail(jdata._error);
          return;
        }
        if (('onFail' in ExecParams) && (ExecParams.onFail(data))){ }
        else if(('status' in data) && (data.status == '404')){ jsh.XExt.Alert('(404) The requested page was not found.'); }
        else if(jsh._debug) jsh.XExt.Alert('An error has occurred: ' + data.responseText);
        else jsh.XExt.Alert('An error has occurred.  If the problem continues, please contact the system administrator for assistance.');
      }
    });
  };
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
  XForm.prototype.OnDBError = function (error, stats, execParams, data){
    if(this.OnDBMessage(error)===false) return false;

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

  XForm.prototype.XExecute = function(q,d,onComplete,onFail){
    var xform = new XForm(q,'','');
    xform.Data = d;
    xform.Execute(onComplete,onFail);
  }

  XForm.prototype.XExecuteBlock = function(q,d,onComplete,onFail){
    var xform = new XForm(q,'','');
    xform.Data = d;
    xform.async = false;
    xform.Execute(onComplete,onFail);
  }

  XForm.prototype.XExecutePost = function (q, d, onComplete, onFail, options){
    if(!options) options = {};
    var xform = new XForm(q, '', '');
    if(options.OnDBError) xform.Data.OnDBError = options.OnDBError;
    xform.qExecute(xform.PrepExecute('post', xform.q, {}, d, onComplete, onFail)); 
  }

  XForm.prototype.reqGet = function (url, q, d, onComplete, onFail, options){
    if(!options) options = {};
    var xform = new XForm(url, '', '');
    if(options.OnDBError) xform.Data.OnDBError = options.OnDBError;
    xform.qExecute(xform.PrepExecute('get', xform.q, q, d, onComplete, onFail)); 
  }

  XForm.prototype.reqPost = function (url, q, d, onComplete, onFail, options){
    if(!options) options = {};
    var xform = new XForm(url, '', '');
    if(options.OnDBError) xform.Data.OnDBError = options.OnDBError;
    xform.qExecute(xform.PrepExecute('post', xform.q, q, d, onComplete, onFail)); 
  }

  XForm.prototype.reqPut = function (url, q, d, onComplete, onFail, options){
    if(!options) options = {};
    var xform = new XForm(url, '', '');
    if(options.OnDBError) xform.Data.OnDBError = options.OnDBError;
    xform.qExecute(xform.PrepExecute('put', xform.q, q, d, onComplete, onFail)); 
  }

  XForm.prototype.reqDelete = function (url, q, d, onComplete, onFail, options){
    if(!options) options = {};
    var xform = new XForm(url, '', '');
    if(options.OnDBError) xform.Data.OnDBError = options.OnDBError;
    xform.qExecute(xform.PrepExecute('delete', xform.q, q, d, onComplete, onFail)); 
  }

  XForm.Post = XForm.prototype.reqPost;
  XForm.Put = XForm.prototype.reqPut;
  XForm.Delete = XForm.prototype.reqDelete;
  XForm.Get = XForm.prototype.reqGet;
  XForm.RequestSync = XForm.prototype.XExecuteBlock;

  return XForm;
}