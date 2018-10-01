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
var ejsext = require('./lib/ejsext.js');

module.exports = exports = {};

exports.getTabCode = function (req, res, modelid, onComplete) {
  if (!this.jsh.hasModel(req, modelid)) throw new Error("Error: Model " + modelid + " not found in collection.");
  var model = this.jsh.getModel(req, modelid);
  if (!(model.tabcode)) throw new Error("Error: Tabcode required for " + modelid + " tabcode lookup.");
  var Q = req.query;
  if (!Helper.HasModelAccess(req, model, 'B')) { Helper.GenError(req, res, -11, 'Invalid Model Access for '+modelid); return; }
  var _this = this;
  var keylist = this.getKeyNames(model.fields);
  var tabcodelist = [model.tabcode];
  var db = _this.jsh.getModelDB(req, modelid);
  
  if (req.query.action == 'add') { return onComplete(); }
  else if (req.query.action != 'edit') { Helper.GenError(req, res, -9, 'Action not supported'); return; }
  
  for (var i = 0; i < keylist.length; i++) {
    var k = keylist[i];
    if (!(k in Q)) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  }
  
  var sql_ptypes = [];
  var sql_params = {};
  var verrors = {};
  var datalockqueries = [];
  var selectfields = this.getFieldsByName(model.fields, tabcodelist);
  
  var keys = this.getKeys(model.fields);
  for (var i = 0; i < keys.length; i++) {
    var field = keys[i];
    var fname = field.name;
    if (fname in Q) {
      var dbtype = _this.getDBType(field);
      sql_ptypes.push(dbtype);
      sql_params[fname] = _this.DeformatParam(field, Q[fname], verrors);
    }
    else { _this.jsh.Log.warning('Missing parameter ' + fname); Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  }
  this.getDataLockSQL(req, model, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery) { datalockqueries.push(datalockquery); }, null, modelid);
  verrors = _.merge(verrors, model.xvalidate.Validate('K', sql_params));
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  
  var sql = db.sql.getTabCode(_this.jsh, model, selectfields, keys, datalockqueries);
  
  this.ExecScalar(req._DBContext, sql, sql_ptypes, sql_params, function (err, rslt) {
    if (err) { _this.jsh.Log.error(err); Helper.GenError(req, res, -99999, "An unexpected error has occurred"); return; }
    if (rslt && rslt[0]) {
      return onComplete(rslt[0]);
    }
    else { Helper.GenError(req, res, -1, "Record not found"); return; }
  }, undefined, db);
}

exports.addTitleTasks = function (req, res, model, Q, dbtasks, targetperm) {
  var title = undefined;

  var sql = '';
  var fieldlist = [];
  var nodatalock = null;
  var db = this.jsh.getModelDB(req, model.id);
  if (typeof model.title !== 'undefined'){
    if(_.isString(model.title)) title = model.title;
    else if(model.title.add && Helper.access(targetperm,'I')){
      if(_.isString(model.title.add)) title = model.title.add;
      else if(model.title.add.sql){ sql = model.title.add.sql; fieldlist = model.title.add.sql_params; nodatalock = model.title.add.nodatalock; }
    }
    else if(model.title.edit && Helper.access(targetperm,'BU')){
      if(_.isString(model.title.edit)) title = model.title.edit;
      else if(model.title.edit.sql){ sql = model.title.edit.sql; fieldlist = model.title.edit.sql_params; nodatalock = model.title.edit.nodatalock; }
    }
    else if(model.title.sql){ sql = model.title.sql; fieldlist = model.title.sql_params; nodatalock = model.title.nodatalock; }
  }
  if(!sql){ 
    if(title) title = Helper.ResolveParams(req, title);
    dbtasks['_title'] = function(dbtrans, callback, transtbl){ return callback(null, title); }
    return;
  }

  var _this = this;
  var fields = this.getFieldsByName(model.fields, fieldlist);
  var sql_ptypes = [];
  var sql_params = {};
  var verrors = {};
  var datalockqueries = [];

  for (var i = 0; i < fields.length; i++) {
    var field = fields[i];
    var fname = field.name;
    if (fname in Q){
      var dbtype = _this.getDBType(field);
      sql_ptypes.push(dbtype);
      sql_params[fname] = _this.DeformatParam(field, Q[fname], verrors);
    }
  }

  //Add DataLock parameters to SQL 
  this.getDataLockSQL(req, model, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery, dfield) { 
    if(Helper.access(targetperm,'I') && dfield.key) return false;
    datalockqueries.push(datalockquery);
  }, nodatalock, model.id);
  verrors = _.merge(verrors, model.xvalidate.Validate('*', sql_params, undefined, undefined, undefined, { ignoreUndefined: true }));
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return false; }
  
  var sql = db.sql.getTitle(_this.jsh, model, sql, datalockqueries);

  //Add parameters from querystring
  _this.ApplyQueryParameters(Q, sql, sql_ptypes, sql_params, model);
  
  dbtasks['_title'] = function (dbtrans, callback, transtbl) {
    _this.ApplyTransTblChainedParameters(transtbl, sql, sql_ptypes, sql_params, model.fields);
    db.Scalar(req._DBContext, sql, sql_ptypes, sql_params, dbtrans, function (err, title) {
      if (err) { _this.jsh.Log.error(err); Helper.GenError(req, res, -99999, "An unexpected error has occurred"); return; }
      if(title) title = Helper.ResolveParams(req, title);
      return callback(null, title);
    });
  }
}

exports.getTitle = function (req, res, modelid, targetperm, onComplete) {
  if (!this.jsh.hasModel(req, modelid)) throw new Error("Error: Model " + modelid + " not found in collection.");
  var model = this.jsh.getModel(req, modelid);
  if (!Helper.HasModelAccess(req, model, targetperm)) { Helper.GenError(req, res, -11, 'Invalid Model Access for '+modelid); return; }

  var dbtasks = {};
  if(this.addTitleTasks(req, res, model, req.query, dbtasks, targetperm)===false) return;
  dbtasks['_title'](undefined, onComplete, null);
}

exports.addDefaultTasks = function (req, res, model, Q, dbtasks) {
  var _this = this;
  var _defaults = {};
  var db = _this.jsh.getModelDB(req, model.id);
  
  //Prepare Default Values Query
  var dflt_ptypes = [];
  var dflt_params = {};
  var dflt_verrors = {};
  var dflt_sql_fields = [];
  
  for (var field_i = 0; field_i < model.fields.length; field_i++) {
    var field = model.fields[field_i];
    if (!field.name) continue;
    if ('default' in field) {
      var dflt = field['default'];
      if (_.isString(dflt)) _defaults[field.name] = field.default;
      else {
        var sql = '';
        if ('sql' in dflt) { sql = dflt.sql; }
        else { Helper.GenError(req, res, -99999, 'Custom Default Value requires SQL'); return false; }
        
        var datalockstr = '';
        var dflt_sql_field_datalockqueries = [];
        var dflt_sql_field_param_datalocks = [];
        _this.getDataLockSQL(req, model, [dflt], dflt_ptypes, dflt_params, dflt_verrors, function (datalockquery) { dflt_sql_field_datalockqueries.push(datalockquery); }, dflt.nodatalock, field.name + "_" + model.id + "_dflt");
        
        //Add lov parameters
        if ('sql_params' in dflt) {
          var dflt_pfields = _this.getFieldsByName(model.fields, dflt.sql_params);
          for (var i = 0; i < dflt_pfields.length; i++) {
            var dflt_pfield = dflt_pfields[i];
            var dflt_pname = dflt_pfield.name;
            if (dflt_pname in dflt_params) continue;
            dflt_ptypes.push(_this.getDBType(dflt_pfield));
            dflt_params[dflt_pname] = null;
            if (dflt_pname in Q) {
              dflt_params[dflt_pname] = _this.DeformatParam(dflt_pfield, Q[dflt_pname], dflt_verrors);
              _this.getDataLockSQL(req, model, model.fields, dflt_ptypes, dflt_params, dflt_verrors, function (datalockquery, dfield) {
                if (dfield != dflt_pfield) return false;
                dflt_sql_field_param_datalocks.push({ pname: dflt_pname, datalockquery: datalockquery, field: dfield });
                return true;
              }, undefined, field.name + "_" + model.id + "_dflt_key");
              dflt_verrors = _.merge(dflt_verrors, model.xvalidate.Validate('*', dflt_params, dflt_pname));
            }
          }
        }
        if (!_.isEmpty(dflt_verrors)) { Helper.GenError(req, res, -2, dflt_verrors[''].join('\n')); return false; }
        
        dflt_sql_fields.push({ name: field.name, field: field, sql: sql, datalockqueries: dflt_sql_field_datalockqueries, param_datalocks: dflt_sql_field_param_datalocks });
      }
    }
    else if(field.name in Q){
      _defaults[field.name] = Q[field.name];
    }
  }
  
  var dflt_sql = db.sql.getDefaultTasks(_this.jsh, dflt_sql_fields);

  //Add parameters from querystring
  _this.ApplyQueryParameters(Q, dflt_sql, dflt_ptypes, dflt_params, model);
  
  //Execute Query
  dbtasks['_defaults'] = function (dbtrans, callback, transtbl) {
    _this.ApplyTransTblChainedParameters(transtbl, dflt_sql, dflt_ptypes, dflt_params, model.fields);
    if (dflt_sql) {
      db.Row(req._DBContext, dflt_sql, dflt_ptypes, dflt_params, dbtrans, function (err, rslt) {
        if (err == null) {
          for (var f in rslt) {
            if (rslt[f] == null) _defaults[f] = '';
            else _defaults[f] = rslt[f].toString();
          }
        }
        callback(err, _defaults);
      });
    }
    else callback(null, _defaults);
  };
}

exports.addBreadcrumbTasks = function (req, res, model, Q, dbtasks) {
  var _this = this;
  var _defaults = {};
  var verrors = {};
  var db = _this.jsh.getModelDB(req, model.id);
  
  if (!('breadcrumbs' in model) || !('sql' in model.breadcrumbs)) return;
  
  var bcrumb_ptypes = [];
  var bcrumb_params = {};
  var datalockqueries = [];
  var bcrumb_sql_fieldlist = [];
  var bcrumb_fields = this.getFields(req, model.fields, 'KC');
  for (var i = 0; i < bcrumb_fields.length; i++) {
    var field = bcrumb_fields[i];
    var fname = field.name;
    bcrumb_ptypes.push(_this.getDBType(field));
    bcrumb_params[fname] = null;
    if (fname in Q) {
      bcrumb_params[fname] = _this.DeformatParam(field, Q[fname], verrors);
      _this.getDataLockSQL(req, model, model.fields, bcrumb_ptypes, bcrumb_params, verrors, function (datalockquery, dfield) {
        if (dfield != field) return false;
        datalockqueries.push(datalockquery);
        if (bcrumb_sql_fieldlist.indexOf(fname) < 0) bcrumb_sql_fieldlist.push(fname);
        return true;
      });
      verrors = _.merge(verrors, model.xvalidate.Validate('*', bcrumb_params, fname));
    }
  }
  var bcrumb_sql_fields = _this.getFieldsByName(model.fields, bcrumb_sql_fieldlist);
  var bcrumb_sql = db.sql.getBreadcrumbTasks(_this.jsh, model, datalockqueries, bcrumb_sql_fields);
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return false; }
  dbtasks['_bcrumbs'] = function (dbtrans, callback) {
    db.Row(req._DBContext, bcrumb_sql, bcrumb_ptypes, bcrumb_params, dbtrans, function (err, rslt) {
      if ((err == null) && (rslt == null)) err = Helper.NewError('Breadcrumbs not found', -14);
      if (err != null) { err.model = model; err.sql = bcrumb_sql; }
      callback(err, rslt);
    });
  };
}

exports.addLOVTasks = function (req, res, model, Q, dbtasks, options) {
  options = _.extend({ action: '' }, options);
  var _this = this;
  var jsh = _this.jsh;
  var modeldb = _this.jsh.getModelDB(req, model.id);
  var fatalError = false;
  //Use function loop so that dbtasks works for multiple LOVs
  _.each(model.fields, function (field) {
    if(fatalError) return;
    if ('lov' in field) {
      var lov = field['lov'];
      var lov_ptypes = [];
      var lov_params = {};
      var lov_verrors = {};
      var datalockqueries = [];
      var param_datalocks = [];
      var truncate_lov = false;
      var no_lov_required = false;
      var can_optimize = false;
      var codeval = null;
      var lovdb = modeldb;

      if(lov && lov.db){
        lovdb = jsh.getDB(lov.db);
      }

      //If form and access="B", do not get the full LOV
      var tgtaccess = ejsext.getaccess(req, model, field.actions, options.action);
      if(!field.lov.always_get_full_lov){
        if((model.layout=='form')||(model.layout=='form-m')){
          if(Helper.access(tgtaccess, 'U')){
            if(field.readonly) no_lov_required = true;
          }
          else if(Helper.access(tgtaccess, 'I')){
            if(field.name in req.query){
              if(!field.always_editable_on_insert){
                codeval = req.query[field.name];
                if(codeval) truncate_lov = true;
              }
            }
          }
          else no_lov_required = true;
        }
        else if(model.layout=='grid'){
          if(!Helper.access(tgtaccess, 'IU')) no_lov_required = true;
        }
        else if(model.layout=='exec'){
          if(field.name in req.query){
            if(!field.always_editable_on_insert){
              codeval = req.query[field.name];
              if(codeval) truncate_lov = true;
            }
          }
        }
      }

      can_optimize = (no_lov_required || truncate_lov);

      if(no_lov_required){
        //If sqlselect is enabled, or if it is a UCOD/UCOD2/GCOD/GCOD2, return
        if(('sql' in lov) || ('sql2' in lov) || ('sqlmp' in lov)){
          if(lov.sqlselect) return;
        }
        else return;
      }

      if (('sql' in lov) || ('sql2' in lov) || ('sqlmp' in lov)) {
        _this.getDataLockSQL(req, model, [lov], lov_ptypes, lov_params, lov_verrors, function (datalockquery) { datalockqueries.push(datalockquery); }, lov.nodatalock, field.name + "_" + model.id + "_lov");
        //Add lov parameters
        if ('sql_params' in lov) {
          var lov_pfields = _this.getFieldsByName(model.fields, lov.sql_params);
          for (var i = 0; i < lov_pfields.length; i++) {
            var lov_pfield = lov_pfields[i];
            var lov_pname = lov_pfield.name;
            lov_ptypes.push(_this.getDBType(lov_pfield));
            lov_params[lov_pname] = null;
            if (lov_pname in Q) {
              lov_params[lov_pname] = _this.DeformatParam(lov_pfield, Q[lov_pname], lov_verrors);
              _this.getDataLockSQL(req, model, model.fields, lov_ptypes, lov_params, lov_verrors, function (datalockquery, dfield) {
                if (dfield != lov_pfield) return false;
                param_datalocks.push({ pname: lov_pname, datalockquery: datalockquery, field: dfield });
                return true;
              }, undefined, field.name + "_" + model.id + "_lov_key");
              lov_verrors = _.merge(lov_verrors, model.xvalidate.Validate('*', lov_params, lov_pname));
            }
          }
        }
      }
      if(truncate_lov){
        codevalpname = '__' + _this.jsh.map.codeval;
        if(codevalpname in lov_params) { Helper.GenError(req, res, -4, 'Invalid existing parameter in LOV SQL expression: _codeval'); fatalError = true; return; }
        lov_ptypes.push(_this.getDBType(field));
        lov_params[codevalpname] = _this.DeformatParam(field, codeval, lov_verrors);
      }
      if (!_.isEmpty(lov_verrors)) { Helper.GenError(req, res, -2, lov_verrors[''].join('\n')); fatalError = true; return; }
      var sql = lovdb.sql.getLOV(_this.jsh, field.name, lov, datalockqueries, param_datalocks, { truncate_lov: truncate_lov });

      //Add parameters from querystring
      _this.ApplyQueryParameters(Q, sql, lov_ptypes, lov_params, model);

      dbtasks['_LOV_' + field.name] = function (dbtrans, callback, transtbl) {
        _this.ApplyTransTblChainedParameters(transtbl, sql, lov_ptypes, lov_params, model.fields);
        lovdb.Recordset(req._DBContext, sql, lov_ptypes, lov_params, dbtrans, function (err, rslt) {
          if (err == null) {
            //Generate warning if the LOV options are too long, and sqlselect is not defined for the field
            if(can_optimize && (rslt.length > 1000)){
              jsh.Log.warning(model.id + ' > ' + field.name + ': More than 1000 results returned for LOV query.  Please consider implementing lov.sqlselect to improve performance.');
            }
            if (('showcode' in lov) && lov.showcode) {
              for (var i = 0; i < rslt.length; i++) {
                rslt[i][jsh.map.codetxt] = rslt[i][jsh.map.codeval];
              }
            }
            if ('blank' in lov) {
              var newlov = {};
              newlov[jsh.map.codeval] = '';
              newlov[jsh.map.codetxt] = (lov.blank == 1 ? 'Please Select...' : lov.blank);
              rslt.unshift(newlov);
            }
          }
          callback(err, rslt);
        });
      };
    }
  });
  if(fatalError) return false;
}

return module.exports;