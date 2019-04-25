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

var DB = require('jsharmony-db');
var Helper = require('./lib/Helper.js');
var _ = require('lodash');
var AppSrvRpt = require('./AppSrvRpt.js');
var AppSrvModel = require('./AppSrvModel.js');

function AppSrv(_jsh) {
  var _this = this;
  this.jsh = _jsh;
  this.DB = DB;
  this.rptsrv = new AppSrvRpt(this);
  this.JobProc = null;
  this.modelsrv = new AppSrvModel(this);
  this.QueueSubscriptions = []; // { id: "QUEUEID", req: req, res: res }
}
AppSrv.prototype.SQL_TERMINATORS = "(),.+-*/%<>=&|!@$?:~#; \t\r\n\f^`[]{}\\|'\"";

/*********************
GET OPERATION / SELECT
*********************/
AppSrv.prototype.getModel = function (req, res, fullmodelid, noexecute, Q, P) {
  if (!this.jsh.hasModel(req, fullmodelid)) throw new Error("Error: Model " + fullmodelid + " not found in collection.");
  var model = this.jsh.getModel(req, fullmodelid);
  if (model.unbound && !model._sysconfig.unbound_meta) { Helper.GenError(req, res, -11, 'Cannot run database queries on unbound models'); return; }
  if (typeof Q == 'undefined') Q = req.query;
  if (typeof P == 'undefined') P = req.body;
  var dbtasks = {};
  if (model.layout == 'grid') dbtasks = this.getModelRecordset(req, res, fullmodelid, Q, P);
  else if (model.layout == 'form') dbtasks = this.getModelForm(req, res, fullmodelid, Q, P, false);
  else if (model.layout == 'form-m') dbtasks = this.getModelForm(req, res, fullmodelid, Q, P, true);
  else if (model.layout == 'multisel') dbtasks = this.getModelMultisel(req, res, fullmodelid, Q, P);
  else if ((model.layout == 'exec')||(model.layout == 'report')) dbtasks = this.getModelExec(req, res, fullmodelid, Q, P);
  else throw new Error('Model ' + fullmodelid + ' operation not supported');
  
  //	if(_.isUndefined(dbtasks)) dbtasks = {};
  if (_.isUndefined(dbtasks)) return;
  if ((typeof noexecute != 'undefined') && noexecute) return dbtasks;
  this.ExecTasks(req, res, dbtasks, false);
}

/*********************
PUT OPERATION / INSERT
*********************/
AppSrv.prototype.putModel = function (req, res, fullmodelid, noexecute, Q, P, onComplete) {
  if (!this.jsh.hasModel(req, fullmodelid)) throw new Error("Error: Model " + fullmodelid + " not found in collection.");
  var model = this.jsh.getModel(req, fullmodelid);
  if (model.unbound) { Helper.GenError(req, res, -11, 'Cannot run database queries on unbound models'); return; }
  var _this = this;
  if (typeof Q == 'undefined') Q = req.query;
  if (typeof P == 'undefined') P = req.body;
  if (typeof onComplete == 'undefined') onComplete = function () { };
  
  var fdone = function (err, dbtasks) {
    if (err != null) return onComplete(err, null);
    //if (_.isUndefined(dbtasks)) dbtasks = {};
    if (_.isUndefined(dbtasks)) { return onComplete(null, undefined); /* Some error has been returned from execution */ }
    if ((typeof noexecute != 'undefined') && noexecute) return onComplete(null, dbtasks);
    //If noexecute set to false, just execute the result and ignore onComplete
    _this.ExecTasks(req, res, dbtasks, false, onComplete);
  }
  
  if (model.layout == 'form') this.putModelForm(req, res, fullmodelid, Q, P, fdone);
  else if (model.layout == 'form-m') this.putModelForm(req, res, fullmodelid, Q, P, fdone);
  else if ((model.layout == 'grid') && (model.commitlevel) && (model.commitlevel != 'none')) this.putModelForm(req, res, fullmodelid, Q, P, fdone);
  else throw new Error('Model ' + fullmodelid + ' operation not supported');
}

/**********************
POST OPERATION / UPDATE
**********************/
AppSrv.prototype.postModel = function (req, res, fullmodelid, noexecute, Q, P, onComplete) {
  if (!this.jsh.hasModel(req, fullmodelid)) throw new Error("Error: Model " + fullmodelid + " not found in collection.");
  var model = this.jsh.getModel(req, fullmodelid);
  if (model.unbound) { Helper.GenError(req, res, -11, 'Cannot run database queries on unbound models'); return; }
  var _this = this;
  if (typeof Q == 'undefined') Q = req.query;
  if (typeof P == 'undefined') P = req.body;
  if (typeof onComplete == 'undefined') onComplete = function () { };
  
  var fdone = function (err, dbtasks) {
    if (err != null) return onComplete(err, null);
    //if (_.isUndefined(dbtasks)) dbtasks = {};
    if (_.isUndefined(dbtasks)) { return onComplete(null, undefined); /* Some error has been returned from execution */ }
    if ((typeof noexecute != 'undefined') && noexecute) return onComplete(null, dbtasks);
    _this.ExecTasks(req, res, dbtasks, false, onComplete);
  }
  
  if (model.layout == 'form') _this.postModelForm(req, res, fullmodelid, Q, P, fdone);
  else if (model.layout == 'form-m') this.postModelForm(req, res, fullmodelid, Q, P, fdone);
  else if ((model.layout == 'grid') && (model.commitlevel) && (model.commitlevel != 'none')) this.postModelForm(req, res, fullmodelid, Q, P, fdone);
  else if (model.layout == 'multisel') this.postModelMultisel(req, res, fullmodelid, Q, P, fdone);
  else if (model.layout == 'exec') this.postModelExec(req, res, fullmodelid, Q, P, fdone);
  else throw new Error('Model ' + fullmodelid + ' operation not supported');
}

/************************
DELETE OPERATION / DELETE
************************/
AppSrv.prototype.deleteModel = function (req, res, fullmodelid, noexecute, Q, P, onComplete) {
  if (!this.jsh.hasModel(req, fullmodelid)) throw new Error("Error: Model " + fullmodelid + " not found in collection.");
  var model = this.jsh.getModel(req, fullmodelid);
  if (model.unbound) { Helper.GenError(req, res, -11, 'Cannot run database queries on unbound models'); return; }
  var _this = this;
  if (typeof Q == 'undefined') Q = req.query;
  if (typeof P == 'undefined') P = req.body;
  if (typeof onComplete == 'undefined') onComplete = function () { };
  
  var fdone = function (err, dbtasks) {
    if (err != null) return onComplete(err, null);
    //if (_.isUndefined(dbtasks)) dbtasks = {};
    if (_.isUndefined(dbtasks)) { return onComplete(null, undefined); /* Some error has been returned from execution */ }
    if ((typeof noexecute != 'undefined') && noexecute) return onComplete(null, dbtasks);
    _this.ExecTasks(req, res, dbtasks, false, onComplete);
  }
  
  if (model.layout == 'form') dbtasks = this.deleteModelForm(req, res, fullmodelid, Q, P, fdone);
  else if (model.layout == 'form-m') dbtasks = this.deleteModelForm(req, res, fullmodelid, Q, P, fdone);
  else if ((model.layout == 'grid') && (model.commitlevel) && (model.commitlevel != 'none')) this.deleteModelForm(req, res, fullmodelid, Q, P, fdone);
  else throw new Error('Model ' + fullmodelid + ' operation not supported');
}

/***************
HELPER FUNCTIONS
****************/
AppSrv.prototype.ParamCheck = function(desc, col, params, show_errors){
  var log = this.jsh.Log;
  if(!show_errors && (typeof show_errors !== 'undefined')) log = false;
  return Helper.ParamCheck(desc, col, params, log);
}
AppSrv.prototype = _.extend(AppSrv.prototype, require('./AppSrv.ModelGrid.js'));
AppSrv.prototype = _.extend(AppSrv.prototype, require('./AppSrv.ModelForm.js'));
AppSrv.prototype = _.extend(AppSrv.prototype, require('./AppSrv.ModelMultisel.js'));
AppSrv.prototype = _.extend(AppSrv.prototype, require('./AppSrv.ModelExec.js'));
AppSrv.prototype = _.extend(AppSrv.prototype, require('./AppSrv.ModelMetadata.js'));
AppSrv.prototype = _.extend(AppSrv.prototype, require('./AppSrv.Report.js'));
AppSrv.prototype = _.extend(AppSrv.prototype, require('./AppSrv.File.js'));
AppSrv.prototype = _.extend(AppSrv.prototype, require('./AppSrv.Queue.js'));
AppSrv.prototype = _.extend(AppSrv.prototype, require('./AppSrv.DB.js'));
AppSrv.prototype = _.extend(AppSrv.prototype, require('./AppSrv.Helper.js'));
AppSrv.prototype.getSQL = function (model, sqlid, jsh) {
  if(!jsh) jsh = this.jsh;

  //Set driver name
  var db = undefined;
  if(model && model.db) db = jsh.DB[model.db];
  else db = jsh.DB['default'];

  return DB.ParseSQLBase(sqlid, jsh, db.SQLExt);
}

module.exports = AppSrv;