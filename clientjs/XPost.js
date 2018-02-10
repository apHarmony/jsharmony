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

function XPost(_q,_TemplateID,_PlaceholderID){
	this._this = this;
	this.q = _q;
	this.TemplateID = _TemplateID;
	this.PlaceholderID = _PlaceholderID;
	this.DataType = Object;
	this.Data = new this.DataType();
	this.DataSet = null;
	this.DeleteSet = [];
	this.GetSelectParams = function(){ return this.GetKeys(); };
	this.GetReselectParams = function(){ return this.GetKeys(); };
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
}
XPost.prototype.Render = function(){
	if(!this.Data) return;
  this.ResetValidation();

  if (this.OnBeforeRender) this.OnBeforeRender();
	if(this.Data.OnRender)
		this.Data.OnRender.apply(this.Data,arguments);
  else if(this.TemplateID){
		var ejssource = $(this.TemplateID).html();
		ejssource = ejssource.replace(/<#/g,'<%').replace(/#>/g,'%>')
	  $(this.PlaceholderID).html(ejs.render(ejssource,{data:this.Data,xejs:XExt.xejs}));
  }
  if (this.OnAfterRender) this.OnAfterRender();
};
XPost.prototype.GetValues = function(){
	if(!this.Data) return;
  this.Data.GetValues(this.PlaceholderID);
};
XPost.prototype.HasUpdates = function (){
  if (this.IsDirty) return true;
	if(_.isArray(this.DataSet)){
		if(this.DeleteSet.length > 0) return true;
		if(this.Count() == 0) return false;
		//If current num rows == 0
		if(this.Data._is_new) return true;
		for(var i= 0; i< this.DataSet.length; i++){
			if(this.DataSet[i]._is_new) return true;
		}
	}
	if(!this.Data) return false;
	return this.Data.HasUpdates(this.PlaceholderID);
};
XPost.prototype.Validate = function(perms,obj){
	obj = obj || this.Data;
	if(!obj) return;
	var validator;
	if(this.Data && this.Data.xvalidate) validator = this.Data.xvalidate;
	else if(obj.xvalidate) validator = obj.xvalidate;
  else return;
  var parentobj = undefined;
  if (this.xData) parentobj = this.Data._jrow;
	return validator.ValidateControls(perms,obj,'',parentobj);
}
XPost.prototype.ResetValidation = function(obj){
	obj = obj || this.Data;
	if(!obj) return;
	if(!obj.xvalidate) return;
	return obj.xvalidate.ResetValidation();
}
XPost.prototype.RecheckDirty = function () {
  var rsltDirty = false;
  if (this.DeleteSet.length > 0) rsltDirty = true;
  if (_.isArray(this.DataSet)) {
    for (var i = 0; i < this.DataSet.length; i++) {
      if(this.DataSet[i]._is_dirty) rsltDirty = true;
      if(this.DataSet[i]._is_new) rsltDirty = true;
    }
    if(this.Data._is_dirty) rsltDirty = true;
    if(this.Data._is_new) rsltDirty = true;
  }
  this.IsDirty = rsltDirty;
}
XPost.prototype.ResetDirty = function () {
  if (_.isArray(this.DataSet)) {
    this.DeleteSet = [];
    for (var i = 0; i < this.DataSet.length; i++) {
      this.DataSet[i]._is_dirty = false;
      this.DataSet[i]._is_new = false;
      this.DataSet[i]._orig = null;
    }
    this.Data._is_dirty = false;
    this.Data._is_new = false;
    this.Data._orig = null;
  }
  if (this.xData) {
    $(this.xData.PlaceholderID).find('.xform_ctrl.updated').removeClass('updated');
  }
  this.IsDirty = false;
}
XPost.prototype.Count = function(){
	if(!_.isArray(this.DataSet)) return 1;
	return this.DataSet.length;
}
XPost.prototype.NavNext = function(){
	if(this.Count() == 0) return;
	if(this.Index == (this.Count()-1)) return;
	this.NavTo(this.Index+1);
}
XPost.prototype.NavPrev = function(){
	if(this.Count() == 0) return;
	if(this.Index == 0) return;
	this.NavTo(this.Index-1);
}
XPost.prototype.NavFirst = function(){
	if(this.Count() == 0) return;
	if(this.Index == 0) return;
	this.NavTo(0);
}
XPost.prototype.NavLast = function(){
	if(this.Count() == 0) return;
	if(this.Index == (this.Count()-1)) return;
	this.NavTo(this.Count()-1);
}
XPost.prototype.SetIndex = function (_index, saveold) {
  if (typeof saveold == 'undefined') saveold = true;
  if (_index > this.Count()) { XExt.Alert('Cannot navigate - Index greater than size of collection'); return false; }
  else if (_index < 0) { XExt.Alert('Cannot navigate - Index less than zero'); return false; }
  delete this.Data._LOVs;
  delete this.Data._defaults;
  delete this.Data._bcrumbs;
  if (saveold) {
    if (!this.CommitRow()) return false;
  }
  this.Index = _index;
  this.Data = _.extend(this.Data, this.DataSet[this.Index]);
  this.Data._LOVs = this._LOVs;
  this.Data._defaults = this._defaults;
  this.Data._bcrumbs = this._bcrumbs;
  if (this.xData) {
    this.Data._jrow = $(this.xData.PlaceholderID).find("tr[data-id='" + this.Index + "']");
  }
  return true;
}
XPost.prototype.NavTo = function (_index, saveold){
  if (!this.SetIndex(_index, saveold)) return;
	this.Render();
}
XPost.prototype.NavAdd = function(){
  if(!this.Data.Commit()) return;
	this.NewRow();
	if(this.Index==-1){ this.NavTo(0,false); }
  else this.NavLast();
}
XPost.prototype.NavDelete = function(){
	if(this.Count() == 0) return;
	this.DataSet[this.Index] = _.extend(this.DataSet[this.Index],this.Data);
	if(!this.Data._is_new) this.DeleteSet.push(this.DataSet[this.Index]);
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
XPost.prototype.NewRow = function (){
  var rslt = this.ApplyDefaults(new this.DataType());
  this.DataSet.push(rslt);
  this.IsDirty = true;
  return rslt;
}
XPost.prototype.Select = function(onComplete){
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
		_this._LOVs = _this.Data._LOVs;
    _this._defaults = _this.Data._defaults;
    _this._bcrumbs = _this.Data._bcrumbs;
		//Load Data
		if(_this.q in rslt){
			if(_.isArray(rslt[_this.q])){
				_this.DataSet = rslt[_this.q];
        for (var i = 0; i < _this.DataSet.length; i++) {
          _this.DataSet[i]['_is_new'] = false;
          _this.DataSet[i]['_is_dirty'] = false;
          _this.DataSet[i]['_is_deleted'] = false;
          _this.DataSet[i]['_orig'] = null;
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
        _this.Data._is_new = false;
        _this.Data._is_dirty = false;
        _this.Data._is_deleted = false;
        _this.Data._orig = null;
			}
		}
		else if(_this.Data._is_new) _this.Data = _this.ApplyDefaults(_this.Data);
		//NavTo already calls render
    if (_this.DataSet == null) _this.Render();
		if(onComplete) onComplete(rslt);
	}));
}
XPost.prototype.ApplyDefaults = function(data){
	var rslt = data;
  if(rslt._is_new && ('_defaults' in this)){
    _.each(this._defaults, function (val, fieldname){
			if(fieldname in rslt){
				if(val.indexOf('js:')==0){
					var js = val.substr(3);
					//Evaluate JS
					val = eval(js);
				}
        rslt[fieldname] = val;
			}
		});
  }
	return rslt;
}
XPost.prototype.PrepExecute = function(_method,_model,_query,_post,onComplete,onFail){
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
XPost.prototype.CommitRow = function (){
  if (!this.Data.Commit()) return false;
  this.DataSet[this.Index] = _.extend(this.DataSet[this.Index], this.Data);
  if (this.Data._is_dirty) this.IsDirty = true;
  return true;
}
XPost.prototype.PrepSaveDataSet = function(ignorecommit){
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
    if (this.Data._is_new) {
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
XPost.prototype.PrepUpdate = function(onComplete,onFail){ 
  return this.PrepExecute('post',this.q,this.GetKeys(),this.GetUpdateParams(),onComplete,onFail); 
}
XPost.prototype.Update = function(onComplete,onFail){ this.qExecute(this.PrepUpdate(onComplete,onFail)); }
XPost.prototype.PrepInsert = function(onComplete,onFail){ 
  return this.PrepExecute('put',this.q,{},this.GetInsertParams(),onComplete,onFail); 
}
XPost.prototype.Insert = function(onComplete,onFail){ this.qExecute(this.PrepInsert(onComplete,onFail)); }
XPost.prototype.PrepDelete = function(onComplete,onFail){ 
  return this.PrepExecute('delete',this.q,this.GetDeleteParams(),{},onComplete,onFail); 
}
XPost.prototype.Delete = function(onComplete,onFail){ this.qExecute(this.PrepDelete(onComplete,onFail)); }
XPost.prototype.Execute = function(onComplete,onFail){ 
  this.qExecute(this.PrepExecute('get',this.q,this.Data,{},onComplete,onFail)); 
}
XPost.prototype.ExecuteTrans = function (DBTasks, onComplete, onFail) {
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
XPost.prototype.qExecute = function (ExecParams) {
  ExecParams.url = global._BASEURL + '_d/' + ExecParams.model + '/';
  this.qExecuteBase(ExecParams);
}
XPost.prototype.qExecuteBase = function(ExecParams){
	var _this = this;
  var url = ExecParams.url;
	if(!_.isEmpty(ExecParams.query)) url += '?'+$.param(ExecParams.query);
  global.xLoader.StartLoading(_this);
	$.ajax({
		type:ExecParams.method.toUpperCase(),
    url: url,
		data: ExecParams.post,
		async: _this.async,
		dataType: 'json',
		success:function(data){
      global.xLoader.StopLoading(_this);
      if ((data instanceof Object) && ('_error' in data)) {
				if(DefaultErrorHandler(data._error.Number,data._error.Message)) { }
				else if(!(_this.OnDBError(data._error))) { }
				else if((data._error.Number == -9) || (data._error.Number == -5)){ XExt.Alert(data._error.Message); }
        else { XExt.Alert('Error #' + data._error.Number + ': ' + data._error.Message); }
        if ('onFail' in ExecParams) ExecParams.onFail(data._error);
				return;
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
      global.xLoader.StopLoading(_this);
      var jdata = data.responseJSON;
      if ((jdata instanceof Object) && ('_error' in jdata)) {
        if (DefaultErrorHandler(jdata._error.Number, jdata._error.Message)) { }
        else if (!(_this.OnDBError(jdata._error))) { }
        else if ((jdata._error.Number == -9) || (jdata._error.Number == -5)) { XExt.Alert(jdata._error.Message); }
        else { XExt.Alert('Error #' + jdata._error.Number + ': ' + jdata._error.Message); }
        if ('onFail' in ExecParams) ExecParams.onFail(jdata._error);
        return;
      }
      if (('onFail' in ExecParams) && (ExecParams.onFail(data))){ }
      else if(('status' in data) && (data.status == '404')){ XExt.Alert('(404) The requested page was not found.'); }
			else if(_debug) XExt.Alert('An error has occurred: ' + data.responseText);
      else XExt.Alert('An error has occurred.  If the problem continues, please contact the system administrator for assistance.');
		}
	});
};
XPost.prototype.OnDBError = function (error){
  if (error && error.Message && XExt.beginsWith(error.Message, "Execute Form - ")) {
    var dbaction = error.Message.substr(("Execute Form - ").length);
    var dbmessage = dbaction.substr(0, dbaction.indexOf('//')).trim();
    var url = dbaction.substr(dbaction.indexOf('//')+2);
    if (url.indexOf(' - ') >= 0) url = url.substr(0, url.indexOf(' - '));
    var modelid = url.trim();
    var params = {};
    if (url.indexOf('?') >= 0) {
      modelid = url.substr(0, url.indexOf('?'));
      params = XExt.parseGET(url.substr(url.indexOf('?')));
    }
    if (!dbmessage) dbmessage = 'Save operation did not complete.  Press OK to view details.';
    XExt.Alert(dbmessage,undefined, {
      onAcceptImmediate: function () {
        XExt.popupForm(modelid, undefined, params);
      }
    });
    return false;
  }

	if(!this.Data) return true;
	
	if(this.Data.OnDBError){
		if(this.Data.OnDBError(error)===false) return false;
		return true;
	}
  else 
	  return true;
};
XPost.prototype.OnSuccess = function(rslt){
	if(!this.Data) return true;
	
	if(this.Data.OnSuccess){
		this.Data.OnSuccess(rslt);
	}
};
XPost.prototype.OnUndefined = function(data){
	if(this.Data && (this.Data.OnUndefined)) this.Data.OnUndefined(data);
	else XExt.Alert("Undefined: " + JSON.stringify(data));
}
XPost.prototype.GetFieldParams = function(action){
	var _this = this;
  var rslt = {};
	_.each(_this.Data.Fields,function(field){
    if (!XExt.HasAccess(field.actions, action)) return;
		if((typeof _this.Data[field.name] == 'undefined') && _.includes(XForms[_this.q]._bindings,field.name)){
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

XPost.prototype.XExecute = function(q,d,onComplete,onFail){
	var xpost = new XPost(q,'','');
	xpost.Data = d;
	xpost.Execute(onComplete,onFail);
}

XPost.prototype.XExecuteBlock = function(q,d,onComplete,onFail){
	var xpost = new XPost(q,'','');
	xpost.Data = d;
	xpost.async = false;
	xpost.Execute(onComplete,onFail);
}

XPost.prototype.XExecutePost = function (q, d, onComplete, onFail, options){
  if(!options) options = {};
  var xpost = new XPost(q, '', '');
  if(options.OnDBError) xpost.Data.OnDBError = options.OnDBError;
  xpost.qExecute(xpost.PrepExecute('post', xpost.q, {}, d, onComplete, onFail)); 
}

module.exports = XPost;