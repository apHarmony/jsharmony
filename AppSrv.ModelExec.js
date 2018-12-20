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
  var model = this.jsh.getModel(req, fullmodelid);
  if (!Helper.HasModelAccess(req, model, 'B')) { Helper.GenError(req, res, -11, 'Invalid Model Access for '+fullmodelid); return; }
  var _this = this;
  var fieldlist = this.getFieldNames(req, model.fields, 'B');
  var filelist = this.getFileFieldNames(req, model.fields, 'B');
  var keylist = this.getKeyNames(model.fields);
  var crumbfieldlist = this.getFieldNames(req, model.fields, 'C');
  
  if (!_this.ParamCheck('Q', Q, _.union(_.map(crumbfieldlist, function (field) { return '|' + field; })), false)) {
    Helper.GenError(req, res, -4, 'Invalid Parameters'); return;
  }
  if (!_this.ParamCheck('P', P, [])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  
  var nokey = (('nokey' in model) && (model.nokey));
  
  //Return applicable drop-down lists
  var verrors = {};
  var dbtasks = {};
  //Default Values
  if(_this.addDefaultTasks(req, res, model, Q, dbtasks)===false) return;
  //Title
  if(_this.addTitleTasks(req, res, model, Q, dbtasks, 'B')===false) return;
  //Breadcrumbs
  if(_this.addBreadcrumbTasks(req, res, model, Q, dbtasks, 'B')===false) return;
  //LOV
  if(_this.addLOVTasks(req, res, model, Q, dbtasks)===false) return;
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  return dbtasks;
}

exports.postModelExec = function (req, res, fullmodelid, Q, P, onComplete) {
  var _this = this;
  if (!this.jsh.hasModel(req, fullmodelid)) throw new Error("Error: Model " + fullmodelid + " not found in collection.");
  var model = this.jsh.getModel(req, fullmodelid);
  if (!Helper.HasModelAccess(req, model, 'U')) { Helper.GenError(req, res, -11, 'Invalid Model Access for '+fullmodelid); return; }
  var db = _this.jsh.getModelDB(req, fullmodelid);
  
  var fieldlist = this.getFieldNames(req, model.fields, 'U');
  
  var Pcheck = _.map(fieldlist, function (field) { return '&' + field; });
  if (!_this.ParamCheck('Q', Q, [])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  if (!_this.ParamCheck('P', P, Pcheck)) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  
  if (!('sqlexec' in model)) throw new Error("Error: Model " + fullmodelid + " missing sqlexec.");
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
  
  var sql = db.sql.postModelExec(_this.jsh, model, param_datalocks, datalockqueries);
  
  var dbtasks = {};
  dbtasks[fullmodelid] = function (dbtrans, callback, transtbl) {
    sql_params = _this.ApplyTransTblEscapedParameters(sql_params, transtbl);
    var dbfunc = db.Recordset;
    if (model.sqltype && (model.sqltype == 'multirecordset')) dbfunc = db.MultiRecordset;
    dbfunc.call(db, req._DBContext, sql, sql_ptypes, sql_params, dbtrans, function (err, rslt, stats) {
      if (err != null) { err.model = model; err.sql = sql; }
      if (stats) stats.model = model;
      callback(err, rslt, stats);
    });
  };
  return onComplete(null, dbtasks);
}

return module.exports;