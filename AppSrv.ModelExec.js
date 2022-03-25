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

var Helper = require('./lib/Helper.js');
var _ = require('lodash');

module.exports = exports = {};

exports.getModelExec = function (req, res, fullmodelid, Q, P, form_m) {
  var _this = this;
  var model = this.jsh.getModel(req, fullmodelid);
  if (!Helper.hasModelAction(req, model, 'B')) { Helper.GenError(req, res, -11, _this._tP('Invalid Model Access for @fullmodelid', { fullmodelid })); return; }
  var crumbfieldlist = this.getFieldNames(req, model.fields, 'C');
  
  if (!_this.ParamCheck('Q', Q, _.union(_.map(crumbfieldlist, function (field) { return '|' + field; }), ['|_action']), false)) {
    Helper.GenError(req, res, -4, 'Invalid Parameters'); return;
  }
  if (!_this.ParamCheck('P', P, [])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  
  var is_browse = (('_action' in Q) && (Q['_action'] == 'browse'));
  
  //Return applicable drop-down lists
  var verrors = {};
  var dbtasks = {};
  var targetperm = (is_browse ? 'B' : 'BU');
  //Default Values
  if(_this.addDefaultTasks(req, res, model, Q, dbtasks)===false) return;
  //Title
  if(_this.addTitleTasks(req, res, model, Q, dbtasks, targetperm)===false) return;
  //Breadcrumbs
  if(_this.addBreadcrumbTasks(req, res, model, Q, dbtasks, targetperm)===false) return;
  //LOV
  if(_this.addLOVTasks(req, res, model, Q, dbtasks)===false) return;
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  return dbtasks;
};

exports.postModelExec = function (req, res, fullmodelid, Q, P, onComplete) {
  var _this = this;
  var jsh = this.jsh;
  if (!jsh.hasModel(req, fullmodelid)) throw new Error('Error: Model ' + fullmodelid + ' not found in collection.');
  var model = jsh.getModel(req, fullmodelid);
  if (!Helper.hasModelAction(req, model, 'U')) { Helper.GenError(req, res, -11, _this._tP('Invalid Model Access for @fullmodelid', { fullmodelid })); return; }
  var db = jsh.getModelDB(req, fullmodelid);
  
  var fieldlist = this.getFieldNames(req, model.fields, 'U');
  
  var Pcheck = _.map(fieldlist, function (field) { return '&' + field; });
  if (!_this.ParamCheck('Q', Q, [])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  if (!_this.ParamCheck('P', P, Pcheck)) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  
  if (!('sqlexec' in model)) throw new Error('Error: Model ' + fullmodelid + ' missing sqlexec.');
  var sql_ptypes = [];
  var sql_params = {};
  var verrors = {};
  var param_datalocks = [];
  var datalockqueries = [];
  
  //Add fields from post
  var fields = _this.getFieldsByName(model.fields, fieldlist);
  _.each(fields, function (field) {
    var fname = field.name;
    if (fname in P) {
      var dbtype = _this.getDBType(field);
      sql_ptypes.push(dbtype);
      sql_params[fname] = _this.DeformatParam(field, P[fname], verrors);
      //Add PreCheck for any datalock fields
      if ('datalock' in field) {
        _this.getDataLockSQL(req, model, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery, dfield) {
          if (dfield != field) return false;
          param_datalocks.push({ pname: fname, datalockquery: datalockquery, field: dfield });
          return true;
        });
      }
    }
    else throw new Error('Missing parameter ' + fname);
  });
  
  //Add DataLock parameters to SQL
  _this.getDataLockSQL(req, model, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery) { datalockqueries.push(datalockquery); });
  
  verrors = _.merge(verrors, model.xvalidate.Validate('UK', sql_params));
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  
  var sql = db.sql.postModelExec(jsh, model, param_datalocks, datalockqueries);
  
  var dbtasks = {};
  var sql_rslt = null;
  dbtasks[fullmodelid] = function (dbtrans, callback, transtbl) {
    sql_params = _this.ApplyTransTblEscapedParameters(sql_params, transtbl);
    var dbfunc = db.Recordset;
    if (model.sqltype && (model.sqltype == 'multirecordset')) dbfunc = db.MultiRecordset;
    dbfunc.call(db, req._DBContext, sql, sql_ptypes, sql_params, dbtrans, function (err, rslt, stats) {
      if (err != null) { err.model = model; err.sql = sql; }
      if (stats) stats.model = model;
      if(model.onsqlupdated) sql_rslt = rslt;
      callback(err, rslt, stats);
    });
  };
  if(model.onsqlupdated) dbtasks['_ONSQLUPDATED_POSTPROCESS'] = function (callback, rslt) {
    model.onsqlupdated(callback, req, res, sql_params, sql_rslt, require, jsh, model.id);
  };
  return onComplete(null, dbtasks);
};

return module.exports;