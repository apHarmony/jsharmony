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
var async = require('async');
var XValidate = require('jsharmony-validate');
var path = require('path');
var multiparty = require('multiparty');
var HelperFS = require('./lib/HelperFS.js');
var crypto = require('crypto');
var AppSrvRpt = require('./AppSrvRpt.js');
var AppSrvModel = require('./AppSrvModel.js');
var fs = require('fs');
var csv = require('csv');
var moment = require('moment');
var ejsext = require('./lib/ejsext.js');
var imagick = require('gm').subClass({ imageMagick: true });

function AppSrv(_jsh) {
  var _this = this;
  this.jsh = _jsh;
  this.DB = DB;
  this.db = new DB();
  this.db.parseSQL = function (sql) { return _this.getSQL(sql); };
  this.rptsrv = new AppSrvRpt(this);
  this.jobproc = null;
  this.modelsrv = new AppSrvModel(this);
  this.QueueSubscriptions = []; // { id: "xxx", req: req, res: res }
}

/*********************
GET OPERATION / SELECT
*********************/
AppSrv.prototype.getModel = function (req, res, modelid, noexecute, Q, P) {
  if (!this.jsh.hasModel(req, modelid)) throw new Error("Error: Model " + modelid + " not found in collection.");
  var model = this.jsh.getModel(req, modelid);
  if (model.unbound) { Helper.GenError(req, res, -11, 'Cannot run database queries on unbound models'); return; }
  if (typeof Q == 'undefined') Q = req.query;
  if (typeof P == 'undefined') P = req.body;
  var dbtasks = {};
  if (model.layout == 'grid') dbtasks = this.getModelRecordset(req, res, modelid, Q, P);
  else if (model.layout == 'form') dbtasks = this.getModelForm(req, res, modelid, Q, P, false);
  else if (model.layout == 'form-m') dbtasks = this.getModelForm(req, res, modelid, Q, P, true);
  else if (model.layout == 'multisel') dbtasks = this.getModelMultisel(req, res, modelid, Q, P);
  else if (model.layout == 'exec') dbtasks = this.getModelExec(req, res, modelid, Q, P);
  else throw new Error('Model ' + modelid + ' operation not supported');
  
  //	if(_.isUndefined(dbtasks)) dbtasks = {};
  if (_.isUndefined(dbtasks)) return;
  if ((typeof noexecute != 'undefined') && noexecute) return dbtasks;
  this.ExecTasks(req, res, dbtasks, (model.layout == 'form'));
}

AppSrv.prototype.getModelRecordset = function (req, res, modelid, Q, P, rowlimit, options) {
  if (!options) options = {};
  var model = this.jsh.getModel(req, modelid);
  if (!Helper.HasModelAccess(req, model, 'B')) { Helper.GenError(req, res, -11, 'Invalid Model Access'); return; }
  var _this = this;
  var fieldlist = this.getFieldNames(req, model.fields, 'B');
  var searchlist = this.getFieldNames(req, model.fields, 'BS', function(field){ if(field.disable_search){ return false; } return true; });
  var keylist = this.getKeyNames(model.fields);
  var allfieldslist = _.union(keylist, fieldlist);
  var availablesortfieldslist = this.getFieldNames(req, model.fields, 'BFK');
  var filterlist = this.getFieldNames(req, model.fields, 'F');
  filterlist = _.union(keylist, filterlist);
  var encryptedfields = this.getEncryptedFields(req, model.fields, 'B');
  if (encryptedfields.length > 0) throw new Error('Encrypted fields not supported on GRID');
  var encryptedfields = this.getEncryptedFields(req, model.fields, 'S');
  if ((encryptedfields.length > 0) && !(req.secure)) { Helper.GenError(req, res, -51, 'Encrypted fields require HTTPS connection'); return; }
  if ('d' in Q) P = JSON.parse(Q.d);
  
  if (!_this.ParamCheck('Q', Q, ['|rowstart', '|rowcount', '|sort', '|search', '|searchjson', '|d', '|meta', '|getcount'])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  if (!_this.ParamCheck('P', P, _.map(_.union(filterlist, ['_action']), function (filter) { return '|' + filter; }))) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }

  var getcount = ((('rowcount' in Q) && (Q.rowcount == -1)) || (('getcount' in Q) && (Q['getcount'] != '')));
  var is_new = (('_action' in P) && (P['_action'] == 'add'));
  delete P['_action'];
  
  var sql_ptypes = [];
  var sql_params = {};
  var verrors = {};
  var filterfields = this.getFieldsByName(model.fields, filterlist);
  var allfields = this.getFieldsByName(model.fields, allfieldslist);
  var sql_filterfields = [];
  _.each(filterfields, function (field) { if (field.name in P) { sql_filterfields.push(field); } });
  var sortfields = [];
  var searchfields = [];
  var datalockqueries = [];
  
  //Merge sort parameters with parameters from querystring
  var dsort = new Array();
  if (('sort' in Q) && (Q['sort'] != '')) dsort = JSON.parse(Q['sort']);
  else if ('sort' in model) dsort = model['sort'];
  
  //Check against allfieldslist
  var unsortedkeys = keylist.slice();
  _.each(dsort, function (val) {
    if (!_.isString(val)) throw new Error('Invalid sort string');
    if (val.length < 2) throw new Error('Invalid sort string');
    var sortfield = val.substring(1);
    var sortdir = val[0];
    if (sortdir == 'v') sortdir = 'desc';
    else if (sortdir == '^') sortdir = 'asc';
    else throw new Error('Invalid sort string');
    if (!_.includes(availablesortfieldslist, sortfield)) throw new Error('Invalid sort field ' + sortfield);
    
    var field = AppSrv.prototype.getFieldByName(model.fields, sortfield);
    sortfields.push({ 'field': sortfield, 'dir': sortdir, 'sql': (field.sql_sort || '') });
    
    if (_.includes(unsortedkeys, sortfield)) unsortedkeys = _.without(unsortedkeys, sortfield);
  });
  if (unsortedkeys.length > 0) _.each(unsortedkeys, function (keyname) {
    sortfields.push({ 'field': keyname, 'dir': 'asc', 'sql': '' });
  });
  
  //Set filter parameters
  if (('searchjson' in Q) && (Q.searchjson != '')) {
    var search_items = JSON.parse(Q.searchjson);
    var search_join = 'and';
    if (_.isArray(search_items) && (search_items.length > 0)) {
      for (var i = 0; i < search_items.length; i++) {
        var search_column = search_items[i].Column;
        var search_value = search_items[i].Value;
        var search_comparison = 'contains';
        if ('Comparison' in search_items[i]) search_comparison = search_items[i].Comparison;
        if ('Join' in search_items[i]) search_join = search_items[i].Join;
        if (typeof search_column == 'undefined') continue;
        if (typeof search_value == 'undefined') continue;
        if (!(_.includes(['>', '<', '>=', '<=', '=', '<>', 'contains', 'notcontains', 'beginswith', 'endswith', 'null', 'notnull', 'soundslike'], search_comparison))) continue;
        if ((search_join != 'and') && (search_join != 'or')) continue;
        search_value = search_value.toString().trim();
        if ((search_value == '') && (search_comparison != 'null') && (search_comparison != 'notnull')) continue;
        search_column = search_column.toString();
        if (search_column != 'ALL') {
          var found_col = false;
          _.each(searchlist, function (searchlistcol) {
            if (search_column == searchlistcol) { search_column = searchlistcol; found_col = true; }
          });
          if (!found_col) throw new Error('Invalid search field ' + search_column);
        }
        //Process search item
        if (search_column == 'ALL') {
          if (searchlist.length == 0) continue;
          var searchall = [];
          var firstSearchItem = true;
          var searchlistfields = this.getFieldsByName(model.fields, searchlist);
          _.each(searchlistfields, function (field) {
            if(field.disable_search_all) return;
            var searchtermsql = _this.addSearchTerm(field, i, search_value, search_comparison, sql_ptypes, sql_params, verrors);
            if (searchtermsql) {
              if (searchall.length) searchall.push('or');
              searchall.push(searchtermsql);
            }
          });
          if (searchall.length) {
            if (searchfields.length) searchfields.push(search_join);
            searchfields.push(searchall);
          }
        }
        else {
          var field = this.getFieldByName(model.fields, search_column);
          var searchtermsql = this.addSearchTerm(field, i, search_value, search_comparison, sql_ptypes, sql_params, verrors);
          if (searchtermsql) {
            if (searchfields.length) searchfields.push(search_join);
            searchfields.push(searchtermsql);
          }
        }
      }
    }
  }
  
  if (model.grid_require_filter && !searchfields.length) searchfields.push('1=0');
  
  //Apply rowstart
  var rowstart = 0;
  if ('rowstart' in Q) rowstart = parseInt(Q['rowstart']);
  if (rowstart <= 0) rowstart = 0;
  
  //Apply rowcount
  if (typeof rowlimit == 'undefined') {
    if ('rowlimit' in model) rowlimit = model.rowlimit;
    else rowlimit = global.default_rowlimit;
  }
  var rowcount = rowlimit;
  if ('rowcount' in Q) {
    rowcount = parseInt(Q['rowcount']);
    if (rowcount <= 0) rowcount = rowlimit;
    if (rowcount > rowlimit) rowcount = rowlimit;
  }
  
  var keys = filterfields;
  for (var i = 0; i < keys.length; i++) {
    var field = keys[i];
    var fname = field.name;
    if (fname in P) {
      var dbtype = AppSrv.prototype.getDBType(field);
      sql_ptypes.push(dbtype);
      sql_params[fname] = _this.DeformatParam(field, P[fname], verrors);
    }
  }
  //Add DataLock parameters to SQL 
  this.getDataLockSQL(req, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery) { datalockqueries.push(datalockquery); }, null, modelid);
  verrors = _.merge(verrors, model.xvalidate.Validate('F', sql_params));
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  
  var dbsql = _this.db.sql.getModelRecordset(_this.jsh, model, sql_filterfields, allfields, sortfields, searchfields, datalockqueries, rowstart, rowcount + 1);
  
  //Add dynamic parameters from query string
  var dbtasks = {};
  var dbtaskname = modelid;
  if (!is_new) {
    dbtasks[dbtaskname] = function (dbtans, callback) {
      _this.db.Recordset(req._DBContext, dbsql.sql, sql_ptypes, sql_params, dbtans, function (err, rslt) {
        if (err != null) { err.model = model; err.sql = dbsql.sql; }
        else {
          if ((rslt != null) && (rslt.length > rowcount)) {
            rslt.pop();
            rslt.push({ '_eof': false });
          }
          else rslt.push({ '_eof': true });
        }
        callback(err, rslt);
      });
    };
  }
  else {
    dbtasks[modelid] = function (dbtrans, callback) {
      var rslt = [];
      callback(null, rslt);
    };
  }
  
  if ('getcount' in Q) {
    dbtasks['_count_' + dbtaskname] = function (dbtrans, callback) {
      _this.db.Row(req._DBContext, dbsql.rowcount_sql, sql_ptypes, sql_params, dbtrans, function (err, rslt) {
        if ((err == null) && (rslt == null)) err = Helper.NewError('Count not found', -14);
        if (err != null) { err.model = model; err.sql = dbsql.rowcount_sql; }
        callback(err, rslt);
      });
    };
  }
  if (('meta' in Q) && (Q['meta'] != '')) {
    _this.addDefaultTasks(req, res, model, P, dbtasks);
    _this.addLOVTasks(req, res, model, P, dbtasks);
    _this.addBreadcrumbTasks(req, res, model, P, dbtasks);
  }
  return dbtasks;
}

AppSrv.prototype.getModelForm = function (req, res, modelid, Q, P, form_m) {
  var model = this.jsh.getModel(req, modelid);
  if (!Helper.HasModelAccess(req, model, 'B')) { Helper.GenError(req, res, -11, 'Invalid Model Access'); return; }
  if (model.unbound) { Helper.GenError(req, res, -11, 'Cannot run database queries on unbound models'); return; }
  var _this = this;
  var fieldlist = this.getFieldNames(req, model.fields, 'B');
  var filelist = this.getFileFieldNames(req, model.fields, 'B');
  var keylist = this.getKeyNames(model.fields);
  var filterlist = this.getFieldNames(req, model.fields, 'F');
  var crumbfieldlist = this.getFieldNames(req, model.fields, 'C');
  var allfieldslist = _.union(keylist, fieldlist);
  var encryptedfields = this.getEncryptedFields(req, model.fields, 'B');
  var lovkeylist = this.getFieldNamesWithProp(model.fields, 'lovkey');
  if ((encryptedfields.length > 0) && !(req.secure)) { Helper.GenError(req, res, -51, 'Encrypted fields require HTTPS connection'); return; }
  

  var is_new;
  var selecttype = 'single';
  if (typeof form_m == 'undefined') form_m = false;
  if (form_m) {
    is_new = (('_action' in Q) && (Q['_action'] == 'add'));
    //Check if multiple or single and validate parameters
    if (_this.ParamCheck('Q', Q, _.map(keylist, function (key) { return '&' + key; }), false)) { /* Default */ }
    else if (_this.ParamCheck('Q', Q, _.union(_.map(filterlist, function (field) { return '|' + field; }), ['|_action']), false)) {
      selecttype = 'multiple';
    }
    else { 
      //Display missing keys
      _this.ParamCheck('Q', Q, _.map(keylist, function (key) { return '&' + key; }), true);
      Helper.GenError(req, res, -4, 'Invalid Parameters');
      return; 
    }
  }
  else {
    is_new = (_.isEmpty(Q));
    if (!_this.ParamCheck('Q', Q, _.map(keylist, function (key) { return '|' + key; }), false)) {
      is_new = true;
      if (!_this.ParamCheck('Q', Q, _.union(_.map(_.union(crumbfieldlist, lovkeylist), function (field) { return '|' + field; })), true)) {
        Helper.GenError(req, res, -4, 'Invalid Parameters'); return;
      }
    }
  }
  if (!_this.ParamCheck('P', P, [])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  
  var nokey = (('nokey' in model) && (model.nokey));
  if (nokey) is_new = false;
  
  var sql_ptypes = [];
  var sql_params = {};
  var verrors = {};
  var allfields = this.getFieldsByName(model.fields, allfieldslist);
  var sql_filterkeys = [];
  var datalockqueries = [];
  var sortfields = [];
  
  //Add Keys to where
  if (!nokey) {
    if ((selecttype == 'single')) _.each(keylist, function (val) { sql_filterkeys.push(val); });
    else if (selecttype == 'multiple') _.each(filterlist, function (val) { if (val in Q) sql_filterkeys.push(val); });
  }
  var sql_filterfields = this.getFieldsByName(model.fields, sql_filterkeys);
  
  //Add DataLock parameters to SQL 
  this.getDataLockSQL(req, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery) { datalockqueries.push(datalockquery); }, null, modelid);
  
  if (selecttype == 'multiple') {
    var dsort = new Array();
    if ('sort' in model) dsort = model['sort'];
    var unsortedkeys = keylist.slice();
    _.each(dsort, function (val) {
      if (!_.isString(val)) throw new Error('Invalid sort string');
      if (val.length < 2) throw new Error('Invalid sort string');
      var sortfield = val.substring(1);
      var sortdir = val[0];
      if (sortdir == 'v') sortdir = 'desc';
      else if (sortdir == '^') sortdir = 'asc';
      else throw new Error('Invalid sort string');
      if (!_.includes(allfieldslist, sortfield)) throw new Error('Invalid sort field ' + sortfield);
      
      var field = AppSrv.prototype.getFieldByName(model.fields, sortfield);
      sortfields.push({ 'field': sortfield, 'dir': sortdir, 'sql': (field.sql_sort || '') });
      
      if (_.includes(unsortedkeys, sortfield)) unsortedkeys = _.without(unsortedkeys, sortfield);
    });
    if (unsortedkeys.length > 0) _.each(unsortedkeys, function (keyname) {
      sortfields.push({ 'field': keyname, 'dir': 'asc', 'sql': '' });
    });
  }
  
  var keys = [];
  if (is_new && !Helper.HasModelAccess(req, model, 'I')) { Helper.GenError(req, res, -11, 'Invalid Model Access - ' + model.id + ' Insert'); return; }
  if (!is_new && !nokey) {
    //Add dynamic parameters from query string	
    if (selecttype == 'single') keys = this.getKeys(model.fields);
    else if (selecttype == 'multiple') keys = this.getFields(req, model.fields, 'F');
    for (var i = 0; i < keys.length; i++) {
      var field = keys[i];
      var fname = field.name;
      if (fname in Q) {
        var dbtype = AppSrv.prototype.getDBType(field);
        sql_ptypes.push(dbtype);
        sql_params[fname] = _this.DeformatParam(field, Q[fname], verrors);
      }
      else if (selecttype == 'single') { global.log('Missing parameter ' + fname); Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
    }
    
    verrors = _.merge(verrors, model.xvalidate.Validate('KF', sql_params));
    if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  }
  
  var sql = _this.db.sql.getModelForm(_this.jsh, model, selecttype, allfields, sql_filterfields, datalockqueries, sortfields);
  
  //Return applicable drop-down lists
  var dbtasks = {};
  if (!is_new) dbtasks[modelid] = function (dbtrans, callback) {
    var dbfunc = _this.db.Row;
    if (selecttype == 'multiple') dbfunc = _this.db.Recordset;
    dbfunc.call(_this.db, req._DBContext, sql, sql_ptypes, sql_params, dbtrans, function (err, rslt) {
      if ((err == null) && (rslt == null)) err = Helper.NewError('Record not found', -1);
      if (err != null) { err.model = model; err.sql = sql; }
      else {
        if ((rslt != null) && (selecttype == 'single') && (keylist.length == 1)) {
          var keyval = sql_params[keylist[0]];
          //Verify files exist on disk
          if (filelist.length > 0) {
            //For each file
            var filerslt = {};
            async.each(filelist, function (file, filecallback) {
              var filefield = _this.getFieldByName(model.fields, file);
              var fpath = global.datadir + filefield.controlparams.data_folder + '/' + file + '_' + keyval;
              HelperFS.exists(fpath, function (exists) {
                filerslt[file] = exists;
                filecallback(null);
              });
            }, function (err) {
              if (err != null) return callback(Helper.NewError('Error performing file operation', -99999));
              _.merge(rslt, filerslt);
              callback(null, rslt);
            });
            return;
          }
          //Decrypt Encrypted fields
          if (encryptedfields.length > 0) {
            if (keys.length != 1) throw new Error('Encryption requires one key');
            _.each(encryptedfields, function (field) {
              var encval = rslt[field.name];
              if (encval == null) return;
              if (field.type == 'encascii') {
                if (!(field.password in _this.jsh.Config.passwords)) throw new Error('Encryption password not defined.');
                var decipher = crypto.createDecipher('aes128', keyval + _this.jsh.Config.passwords[field.password]);
                decipher.update(encval);
                rslt[field.name] = decipher.final().toString('ascii');
              }
            });
          }
        }
        else if ((rslt != null) && (selecttype == 'multiple')) {
          if (filelist.length > 0) { throw new Error('Files not supported on FORM-M'); }
          if (encryptedfields.length > 0) { throw new Error('Encryption not supported on FORM-M'); }
        }
      }
      callback(err, rslt);
    });
  }
  else if (is_new && (selecttype == 'multiple')) {
    dbtasks[modelid] = function (dbtrans, callback) {
      var rslt = [];
      callback(null, rslt);
    };
  }
  //Default Values
  if (is_new || (selecttype == 'multiple')) {
    _this.addDefaultTasks(req, res, model, Q, dbtasks);
  }
  //Breadcrumbs
  _this.addBreadcrumbTasks(req, res, model, Q, dbtasks);
  //LOV
  _this.addLOVTasks(req, res, model, Q, dbtasks);
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  return dbtasks;
}

AppSrv.prototype.getModelMultisel = function (req, res, modelid, Q, P) {
  var model = this.jsh.getModel(req, modelid);
  if (!Helper.HasModelAccess(req, model, 'B')) { Helper.GenError(req, res, -11, 'Invalid Model Access'); return; }
  var _this = this;
  var fieldlist = this.getFieldNames(req, model.fields, 'B');
  var keylist = this.getKeyNames(model.fields);
  var filterlist = this.getFieldNames(req, model.fields, 'F');
  var lovkeylist = this.getFieldNamesWithProp(model.fields, 'lovkey');
  var lovfield = null;
  _.each(model.fields, function (field) {
    if ('lov' in field) {
      if (lovfield == null) lovfield = field;
      else throw new Error('Invalid Multisel - Can only have one LOV field.');
    }
  });
  if (lovfield == null) throw new Error('Invalid Multisel - No LOV field.');
  var allfieldslist = _.union([lovfield.name], fieldlist);
  var allfields = this.getFieldsByName(model.fields, allfieldslist);
  
  var is_new = true;
  if (_this.ParamCheck('Q', Q, _.map(filterlist, function (filter) { return '&' + filter; }), false)) { is_new = false; }
  else if (_this.ParamCheck('Q', Q, _.map(lovkeylist, function (lovkey) { return '|' + lovkey; }), false)) { /* OK */ }
  else { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  if (!_this.ParamCheck('P', P, [])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  
  var sql_ptypes = [];
  var sql_params = {};
  var verrors = {};
  var datalockqueries = [];
  var lov_datalockqueries = [];
  var param_datalocks = [];
  var sql_filterkeys = [];
  
  if (!is_new) _.each(filterlist, function (val) { sql_filterkeys.push(val); });
  var sql_filterfields = this.getFieldsByName(model.fields, sql_filterkeys);
  
  //Add DataLock parameters to SQL 
  this.getDataLockSQL(req, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery, dfield) {
    if ('lovkey' in dfield) return false; //DATALOCK validation handled  below in prefix
    datalockqueries.push(datalockquery);
    return true;
  }, null, modelid);
  
  var lov = lovfield.lov;
  if ('sql' in lov) {
    var datalockstr = '';
    _this.getDataLockSQL(req, [lov], sql_ptypes, sql_params, verrors, function (datalockquery) {
      lov_datalockqueries.push(datalockquery);
    }, null, modelid + '_lov');
    
    //Add LOV parameters
    if ('sql_params' in lov) {
      var lov_pfields = _this.getFieldsByName(model.fields, lov.sql_params);
      for (var i = 0; i < lov_pfields.length; i++) {
        var lov_pfield = lov_pfields[i];
        var lov_pname = lov_pfield.name;
        if (!(lov_pname in Q)) {
          sql_ptypes.push(AppSrv.prototype.getDBType(lov_pfield));
          sql_params[lov_pname] = null;
        }
      }
      //verrors = _.merge(verrors, model.xvalidate.Validate('KF', lov_params));
    }
  }
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  
  //Add dynamic parameters from query string	
  var keys = [];
  if (is_new) keys = this.getFieldsByName(model.fields, lovkeylist);
  else keys = this.getFieldsByName(model.fields, filterlist);
  for (var i = 0; i < keys.length; i++) {
    var field = keys[i];
    var fname = field.name;
    if (fname in Q) {
      var dbtype = AppSrv.prototype.getDBType(field);
      sql_ptypes.push(dbtype);
      sql_params[fname] = _this.DeformatParam(field, Q[fname], verrors);
      _this.getDataLockSQL(req, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery, dfield) {
        if (dfield != field) return false;
        param_datalocks.push({ pname: fname, datalockquery: datalockquery, field: dfield });
        return true;
      }, null, modelid + "_key");
    }
    else { if (is_new) continue; global.log('Missing parameter ' + fname); Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  }
  
  verrors = _.merge(verrors, model.xvalidate.Validate('KF', sql_params));
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  
  var sql = _this.db.sql.getModelMultisel(_this.jsh, model, lovfield, allfields, sql_filterfields, datalockqueries, lov_datalockqueries, param_datalocks);
  
  var dbtasks = {};
  dbtasks[modelid] = function (dbtrans, callback) {
    _this.db.Recordset(req._DBContext, sql, sql_ptypes, sql_params, dbtrans, function (err, rslt) {
      if ((err == null) && (rslt == null)) err = Helper.NewError('Record not found', -1);
      if (err != null) { err.model = model; err.sql = sql; }
      callback(err, rslt);
    });
  }
  return dbtasks;
};

AppSrv.prototype.getModelExec = function (req, res, modelid, Q, P, form_m) {
  var model = this.jsh.getModel(req, modelid);
  if (!Helper.HasModelAccess(req, model, 'B')) { Helper.GenError(req, res, -11, 'Invalid Model Access'); return; }
  var _this = this;
  var fieldlist = this.getFieldNames(req, model.fields, 'B');
  var filelist = this.getFileFieldNames(req, model.fields, 'B');
  var keylist = this.getKeyNames(model.fields);
  var filterlist = this.getFieldNames(req, model.fields, 'F');
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
  _this.addDefaultTasks(req, res, model, Q, dbtasks);
  //Breadcrumbs
  _this.addBreadcrumbTasks(req, res, model, Q, dbtasks);
  //LOV
  _this.addLOVTasks(req, res, model, Q, dbtasks);
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  return dbtasks;
}

AppSrv.prototype.getTabCode = function (req, res, modelid, onComplete) {
  if (!this.jsh.hasModel(req, modelid)) throw new Error("Error: Model " + modelid + " not found in collection.");
  var model = this.jsh.getModel(req, modelid);
  if (!(model.tabcode)) throw new Error("Error: Tabcode required for " + modelid + " tabcode lookup.");
  var Q = req.query;
  if (!Helper.HasModelAccess(req, model, 'B')) { Helper.GenError(req, res, -11, 'Invalid Model Access'); return; }
  var _this = this;
  var keylist = this.getKeyNames(model.fields);
  var tabcodelist = [model.tabcode];
  
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
  
  this.getDataLockSQL(req, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery) { datalockqueries.push(datalockquery); }, null, modelid);
  
  var keys = this.getKeys(model.fields);
  for (var i = 0; i < keys.length; i++) {
    var field = keys[i];
    var fname = field.name;
    if (fname in Q) {
      var dbtype = AppSrv.prototype.getDBType(field);
      sql_ptypes.push(dbtype);
      sql_params[fname] = _this.DeformatParam(field, Q[fname], verrors);
    }
    else { global.log('Missing parameter ' + fname); Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  }
  verrors = _.merge(verrors, model.xvalidate.Validate('K', sql_params));
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  
  var sql = _this.db.sql.getTabCode(_this.jsh, model, selectfields, keys, datalockqueries);
  
  this.ExecScalar(req._DBContext, sql, sql_ptypes, sql_params, function (err, rslt) {
    if (err) { global.log(err); Helper.GenError(req, res, -99999, "An unexpected error has occurred"); return; }
    if (rslt && rslt[0]) {
      req._tabcode = rslt[0];
      return onComplete();
    }
    else { Helper.GenError(req, res, -1, "Record not found"); return; }
  });
}

/*********************
PUT OPERATION / INSERT
*********************/
AppSrv.prototype.putModel = function (req, res, modelid, noexecute, Q, P, onComplete) {
  if (!this.jsh.hasModel(req, modelid)) throw new Error("Error: Model " + modelid + " not found in collection.");
  var model = this.jsh.getModel(req, modelid);
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
  
  if (model.layout == 'form') this.putModelForm(req, res, modelid, Q, P, fdone);
  else if (model.layout == 'form-m') this.putModelForm(req, res, modelid, Q, P, fdone);
  else if ((model.layout == 'grid') && (model.commitlevel) && (model.commitlevel != 'none')) this.putModelForm(req, res, modelid, Q, P, fdone);
  else throw new Error('Model ' + modelid + ' operation not supported');
}

AppSrv.prototype.putModelForm = function (req, res, modelid, Q, P, onComplete) {
  var _this = this;
  var model = this.jsh.getModel(req, modelid);
  if (!Helper.HasModelAccess(req, model, 'I')) { Helper.GenError(req, res, -11, 'Invalid Model Access'); return; }
  var fieldlist = this.getFieldNames(req, model.fields, 'I');
  var filelist = this.getFileFieldNames(req, model.fields, 'I');
  var encryptedfields = this.getEncryptedFields(req, model.fields, 'I');
  if ((encryptedfields.length > 0) && !(req.secure)) { Helper.GenError(req, res, -51, 'Encrypted fields require HTTPS connection'); return; }
  
  var Pcheck = _.map(fieldlist, function (field) { return '&' + field; });
  Pcheck = Pcheck.concat(_.map(filelist, function (file) { return '|' + file; }));
  if (!_this.ParamCheck('Q', Q, [])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  if (!_this.ParamCheck('P', P, Pcheck)) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  
  //Add to P
  //Add to fieldlist
  //Add extra parameters to sql
  //getFieldsByName
  var sql_ptypes = [];
  var sql_params = {};
  var sql_extfields = [];
  var sql_extvalues = [];
  var verrors = {};
  var param_datalocks = [];
  var vfiles = {};
  var fileops = [];
  var enc_sql_ptypes = [];
  var enc_sql_params = {};
  var enc_datalockqueries = [];
  var hashfields = {};
  async.eachSeries(filelist, _this.ProcessFileParams.bind(_this, req, res, model, P, fieldlist, sql_extfields, sql_extvalues, fileops, vfiles), function (err) {
    if (err != null) return;
    
    //Remove any encrypted fields from the initial update
    _.each(encryptedfields, function (field) {
      _.remove(fieldlist, function (val) { return val == field.name; });
      if (field.type == 'encascii') {
        if ('hash' in field) {
          var hashfield = _.find(model.fields, function (xfield) { return xfield.name == field.hash; });
          if (typeof hashfield == 'undefined') throw new Error('Field ' + field.name + ' hash is not defined.');
          hashfields[field.name] = hashfield;
        }
      }
    });
    
    var keys = _this.getKeys(model.fields);
    
    //Set up Encryption SQL and Parameters
    if (encryptedfields.length > 0) {
      //Add dynamic keys to parameters
      _.each(keys, function (key) {
        var dbtype = AppSrv.prototype.getDBType(key);
        enc_sql_ptypes.push(dbtype);
        enc_sql_params[key.name] = '%%%' + key.name + '%%%';
      });
      //Add Encryption SQL Parameters
      _.each(encryptedfields, function (field) {
        enc_sql_ptypes.push(AppSrv.prototype.getDBType(field));
        var fname = field.name;
        if (fname in P) {
          enc_sql_params[fname] = _this.DeformatParam(field, P[fname], verrors);
          if ('hash' in field) {
            enc_sql_ptypes.push(AppSrv.prototype.getDBType(hashfields[field.name]));
            enc_sql_params[hashfields[field.name].name] = null;
          }
        }
        else throw new Error('Missing parameter ' + fname);
      });
      //Add DataLock parameters to Encryption SQL 
      _this.getDataLockSQL(req, model.fields, enc_sql_ptypes, enc_sql_params, verrors, function (datalockquery) { enc_datalockqueries.push(datalockquery); });
    }
    
    var subs = [];
    //Add fields from post
    var fields = _this.getFieldsByName(model.fields, fieldlist);
    if (fields.length == 0) return onComplete(null, {});
    _.each(fields, function (field) {
      var fname = field.name;
      if (fname in P) {
        var dbtype = AppSrv.prototype.getDBType(field);
        sql_ptypes.push(dbtype);
        if (P[fname] == '%%%' + fname + '%%%') { subs.push(fname); P[fname] = ''; }
        sql_params[fname] = _this.DeformatParam(field, P[fname], verrors);
        //Add PreCheck, if type='F'
        if (Helper.access(field.access, 'F')) {
          _this.getDataLockSQL(req, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery, dfield) {
            if (dfield != field) return false;
            param_datalocks.push({ pname: fname, datalockquery: datalockquery, field: dfield });
            return true;
          },undefined,model.id + ': '+fname);
        }
      }
      else throw new Error('Missing parameter ' + fname);
    });
    
    verrors = _.merge(verrors, model.xvalidate.Validate('I', _.merge(vfiles, enc_sql_params, sql_params)));
    if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
    
    var dbsql = _this.db.sql.putModelForm(_this.jsh, model, fields, keys, sql_extfields, sql_extvalues, encryptedfields, hashfields, enc_datalockqueries, param_datalocks);
    
    _.each(subs, function (fname) { sql_params[fname] = '%%%' + fname + '%%%'; });
    var dbtasks = {};
    dbtasks[modelid] = function (dbtrans, callback, transtbl) {
      sql_params = ApplyTransTbl(sql_params, transtbl);
      _this.db.Row(req._DBContext, dbsql.sql, sql_ptypes, sql_params, dbtrans, function (err, rslt) {
        if ((err == null) && (rslt != null) && (_this.jsh.map.rowcount in rslt) && (rslt[_this.jsh.map.rowcount] == 0)) err = Helper.NewError('No records affected', -3);
        if (err != null) { err.model = model; err.sql = dbsql.sql; }
        else if (fileops.length > 0) {
          //Move files, if applicable
          var keyval = '';
          if (keys.length == 1) keyval = rslt[keys[0].name];
          else throw new Error('File uploads require one key');
          return _this.ProcessFileOperations(keyval, fileops, rslt, callback);
        }
        callback(err, rslt);
      });
    };
    if (encryptedfields.length > 0) {
      if (keys.length != 1) throw new Error('Encryption requires one key');
      dbtasks['enc_' + modelid] = function (dbtrans, callback, transtbl) {
        if (typeof dbtrans == 'undefined') return callback(Helper.NewError('Encryption must be executed within a transaction', -50), null);
        enc_sql_params = ApplyTransTbl(enc_sql_params, transtbl);
        var keyval = transtbl[keys[0].name];
        //Encrypt Data
        _.each(encryptedfields, function (field) {
          var clearval = enc_sql_params[field.name];
          if (field.type == 'encascii') {
            if (clearval.length == 0) {
              enc_sql_params[field.name] = null;
              if ('hash' in field) { enc_sql_params[hashfields[field.name].name] = null; }
            }
            else {
              if (!(field.password in _this.jsh.Config.passwords)) throw new Error('Encryption password not defined.');
              var cipher = crypto.createCipher('aes128', keyval + _this.jsh.Config.passwords[field.password]);
              cipher.update(clearval, 'ascii');
              enc_sql_params[field.name] = cipher.final();
              if ('hash' in field) {
                var hashfield = hashfields[field.name];
                if (!(hashfield.salt in _this.jsh.Config.salts)) throw new Error('Hash salt not defined.');
                enc_sql_params[hashfield.name] = crypto.createHash('sha1').update(clearval + _this.jsh.Config.salts[hashfield.salt]).digest();
              }
            }
          }
        });
        _this.db.Row(req._DBContext, dbsql.enc_sql, enc_sql_ptypes, enc_sql_params, dbtrans, function (err, rslt) {
          if ((err == null) && (rslt != null) && (_this.jsh.map.rowcount in rslt) && (rslt[_this.jsh.map.rowcount] == 0)) err = Helper.NewError('No records affected', -3);
          if (err != null) { err.model = model; err.sql = dbsql.enc_sql; }
          callback(err, rslt);
        });
      };
    }
    if (fileops.length > 0) dbtasks['_POSTPROCESS'] = function (callback) {
      _this.ProcessFileOperationsDone(fileops, callback);
    }
    return onComplete(null, dbtasks);
  });
}

/**********************
POST OPERATION / UPDATE
**********************/
AppSrv.prototype.postModel = function (req, res, modelid, noexecute, Q, P, onComplete) {
  if (!this.jsh.hasModel(req, modelid)) throw new Error("Error: Model " + modelid + " not found in collection.");
  var model = this.jsh.getModel(req, modelid);
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
  
  if (model.layout == 'form') setTimeout(function(){ _this.postModelForm(req, res, modelid, Q, P, fdone);},2000);
  else if (model.layout == 'form-m') this.postModelForm(req, res, modelid, Q, P, fdone);
  else if ((model.layout == 'grid') && (model.commitlevel) && (model.commitlevel != 'none')) this.postModelForm(req, res, modelid, Q, P, fdone);
  else if (model.layout == 'multisel') this.postModelMultisel(req, res, modelid, Q, P, fdone);
  else if (model.layout == 'exec') this.postModelExec(req, res, modelid, Q, P, fdone);
  else throw new Error('Model ' + modelid + ' operation not supported');
}

AppSrv.prototype.postModelForm = function (req, res, modelid, Q, P, onComplete) {
  var _this = this;
  if (!this.jsh.hasModel(req, modelid)) throw new Error("Error: Model " + modelid + " not found in collection.");
  var model = this.jsh.getModel(req, modelid);
  if (!Helper.HasModelAccess(req, model, 'U')) { Helper.GenError(req, res, -11, 'Invalid Model Access'); return; }
  
  var fieldlist = this.getFieldNames(req, model.fields, 'U');
  var keylist = this.getKeyNames(model.fields);
  var filelist = this.getFileFieldNames(req, model.fields, 'U');
  var encryptedfields = this.getEncryptedFields(req, model.fields, 'U');
  if ((encryptedfields.length > 0) && !(req.secure)) { Helper.GenError(req, res, -51, 'Encrypted fields require HTTPS connection'); return; }
  
  var Pcheck = _.map(fieldlist, function (field) { return '&' + field; });
  Pcheck = Pcheck.concat(_.map(filelist, function (file) { return '|' + file; }));
  if (!_this.ParamCheck('Q', Q, _.map(keylist, function (key) { return '&' + key; }))) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  if (!_this.ParamCheck('P', P, Pcheck)) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  
  var sql_ptypes = [];
  var sql_params = {};
  var sql_extfields = [];
  var sql_extvalues = [];
  var verrors = {};
  var vfiles = {};
  var vignorefiles = [];
  var fileops = [];
  var hashfields = {};
  var datalockqueries = [];
  var param_datalocks = [];
  
  async.eachSeries(filelist, _this.ProcessFileParams.bind(_this, req, res, model, P, fieldlist, sql_extfields, sql_extvalues, fileops, vfiles), function (err) {
    if (err != null) return;
    _.each(filelist, function (file) { if (!(file in P)) vignorefiles.push('_obj.' + file); });
    
    _.each(encryptedfields, function (field) {
      if (field.type == 'encascii') {
        if ('hash' in field) {
          var hashfield = _.find(model.fields, function (xfield) { return xfield.name == field.hash; });
          if (typeof hashfield == 'undefined') throw new Error('Field ' + field.name + ' hash is not defined.');
          hashfields[field.name] = hashfield;
        }
      }
    });
    
    //Add key from query string	
    var keys = _this.getKeys(model.fields);
    _.each(keys, function (field) {
      var fname = field.name;
      if (fname in Q) {
        var dbtype = AppSrv.prototype.getDBType(field);
        sql_ptypes.push(dbtype);
        sql_params[fname] = _this.DeformatParam(field, Q[fname], verrors);
      }
      else throw new Error('Missing parameter ' + fname);
    });
    
    //Add fields from post	
    var fields = _this.getFieldsByName(model.fields, fieldlist);
    if (fields.length == 0) return onComplete(null, {});
    _.each(fields, function (field) {
      var fname = field.name;
      if(field.sqlupdate==='') return;
      if (fname in P) {
        var dbtype = AppSrv.prototype.getDBType(field);
        sql_ptypes.push(dbtype);
        sql_params[fname] = _this.DeformatParam(field, P[fname], verrors);
        //Add PreCheck, if type='F'
        if (Helper.access(field.access, 'F')) {
          _this.getDataLockSQL(req, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery, dfield) {
            if (dfield != field) return false;
            param_datalocks.push({ pname: fname, datalockquery: datalockquery, field: dfield });
            return true;
          });
        }
      }
      else throw new Error('Missing parameter ' + fname);
    });
    
    //Add DataLock parameters to SQL 
    _this.getDataLockSQL(req, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery) { datalockqueries.push(datalockquery); });
    
    verrors = _.merge(verrors, model.xvalidate.Validate('UK', _.merge(vfiles, sql_params), '', vignorefiles, req._roles));
    if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
    
    if (encryptedfields.length > 0) {
      //Add encrypted field
      var keyval = '';
      if (keys.length == 1) keyval = sql_params[keys[0].name];
      else throw new Error('File uploads require one key');
      _.each(encryptedfields, function (field) {
        var clearval = sql_params[field.name];
        if (clearval.length == 0) {
          sql_params[field.name] = null;
          if ('hash' in field) {
            var hashfield = hashfields[field.name];
            sql_ptypes.push(AppSrv.prototype.getDBType(hashfield));
            sql_params[hashfield.name] = null;
          }
        }
        else {
          if (field.type == 'encascii') {
            if (!(field.password in _this.jsh.Config.passwords)) throw new Error('Encryption password not defined.');
            var cipher = crypto.createCipher('aes128', keyval + _this.jsh.Config.passwords[field.password]);
            cipher.update(clearval, 'ascii');
            sql_params[field.name] = cipher.final();
            if ('hash' in field) {
              var hashfield = hashfields[field.name];
              if (!(hashfield.salt in _this.jsh.Config.salts)) throw new Error('Hash salt not defined.');
              sql_ptypes.push(AppSrv.prototype.getDBType(hashfield));
              sql_params[hashfield.name] = crypto.createHash('sha1').update(clearval + _this.jsh.Config.salts[hashfield.salt]).digest();;
            }
          }
        }
      });
    }
    
    var sql = _this.db.sql.postModelForm(_this.jsh, model, fields, keys, sql_extfields, sql_extvalues, hashfields, param_datalocks, datalockqueries);
    
    var dbtasks = {};
    dbtasks[modelid] = function (dbtrans, callback, transtbl) {
      sql_params = ApplyTransTbl(sql_params, transtbl);
      _this.db.Row(req._DBContext, sql, sql_ptypes, sql_params, dbtrans, function (err, rslt) {
        if ((err == null) && (rslt != null) && (_this.jsh.map.rowcount in rslt) && (rslt[_this.jsh.map.rowcount] == 0)) err = Helper.NewError('No records affected', -3);
        if (err != null) { err.model = model; err.sql = sql; }
        else if (fileops.length > 0) {
          //Set keyval and move files, if applicable
          var keyval = '';
          if (keys.length == 1) keyval = sql_params[keys[0].name];
          else throw new Error('File uploads require one key');
          return _this.ProcessFileOperations(keyval, fileops, rslt, callback);
        }
        callback(err, rslt);
      });
    };
    if (fileops.length > 0) dbtasks['_POSTPROCESS'] = function (callback) {
      _this.ProcessFileOperationsDone(fileops, callback);
    }
    return onComplete(null, dbtasks);
  });
}

AppSrv.prototype.postModelMultisel = function (req, res, modelid, Q, P, onComplete) {
  if (!this.jsh.hasModel(req, modelid)) throw new Error("Error: Model " + modelid + " not found in collection.");
  var _this = this;
  var model = this.jsh.getModel(req, modelid);
  if (!Helper.HasModelAccess(req, model, 'U')) { Helper.GenError(req, res, -11, 'Invalid Model Access'); return; }
  
  var lovfield = null;
  _.each(model.fields, function (field) {
    if ('lov' in field) {
      if (lovfield == null) lovfield = field;
      else throw new Error('Invalid Multisel - Can only have one LOV field.');
    }
  });
  if (lovfield == null) throw new Error('Invalid Multisel - No LOV field.');
  var filterlist = _this.getFieldNames(req, model.fields, 'F');
  var filterfields = this.getFieldsByName(model.fields, filterlist);
  
  if (!_this.ParamCheck('Q', Q, _.map(filterlist, function (filter) { return '&' + filter; }))) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  if (!_this.ParamCheck('P', P, ['&' + lovfield.name])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  
  var lovvals = JSON.parse(P[lovfield.name]);
  if (!_.isArray(lovvals)) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  for (var i = 0; i < lovvals.length; i++) {
    if (!_.isString(lovvals[i])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
    lovvals[i] = lovvals[i].toString();
  }
  
  var sql_ptypes = [];
  var sql_params = {};
  var verrors = {};
  var param_datalocks = [];
  var datalockqueries = [];
  var lov_datalockqueries = [];
  
  var subs = [];
  //Add key from query string	
  for (var i = 0; i < lovvals.length; i++) {
    var lovval = lovvals[i];
    var fname = 'multisel' + i;
    var dbtype = AppSrv.prototype.getDBType(lovfield);
    sql_ptypes.push(dbtype);
    sql_params[fname] = _this.DeformatParam(lovfield, lovval, verrors);
  }
  
  //Add filter fields
  var fields = _this.getFields(req, model.fields, 'F');
  if (fields.length == 0) return onComplete(null, {});
  _.each(fields, function (field) {
    var fname = field.name;
    if (fname in Q) {
      var dbtype = AppSrv.prototype.getDBType(field);
      sql_ptypes.push(dbtype);
      if (Q[fname] == '%%%' + fname + '%%%') { subs.push(fname); Q[fname] = ''; }
      sql_params[fname] = _this.DeformatParam(field, Q[fname], verrors);
      //Add PreCheck, if type='F'
      _this.getDataLockSQL(req, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery, dfield) {
        if (dfield != field) return false;
        param_datalocks.push({ pname: fname, datalockquery: datalockquery, field: dfield });
        return true;
      });
    }
    else throw new Error('Missing parameter ' + fname);
  });
  
  //Add DataLock parameters to SQL 
  var datalockstr = '';
  _this.getDataLockSQL(req, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery, dfield) {
    if ('lovkey' in dfield) return false; //DATALOCK lovkey validation not necessary here, this only checks existing data
    datalockqueries.push(datalockquery);
    return true;
  });
  
  var lov = lovfield.lov;
  if ('sql' in lov) {
    _this.getDataLockSQL(req, [lov], sql_ptypes, sql_params, verrors, function (datalockquery) { lov_datalockqueries.push(datalockquery); });
    
    if ('sql_params' in lov) {
      var lov_pfields = _this.getFieldsByName(model.fields, lov.sql_params);
      for (var i = 0; i < lov_pfields.length; i++) {
        var lov_pfield = lov_pfields[i];
        var lov_pname = lov_pfield.name;
        if (!(lov_pname in Q)) {
          sql_ptypes.push(AppSrv.prototype.getDBType(lov_pfield));
          sql_params[lov_pname] = null;
        }
      }
    }
  }
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  
  verrors = _.merge(verrors, model.xvalidate.Validate('KF', sql_params));
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  _.each(subs, function (fname) { sql_params[fname] = '%%%' + fname + '%%%'; });
  
  var sql = _this.db.sql.postModelMultisel(_this.jsh, model, lovfield, lovvals, filterfields, param_datalocks, datalockqueries, lov_datalockqueries);
  
  var dbtasks = {};
  dbtasks[modelid] = function (dbtrans, callback, transtbl) {
    sql_params = ApplyTransTbl(sql_params, transtbl);
    _this.db.Row(req._DBContext, sql, sql_ptypes, sql_params, dbtrans, function (err, rslt) {
      if (err != null) { err.model = model; err.sql = sql; }
      callback(err, rslt);
    });
  };
  return onComplete(null, dbtasks);
}

AppSrv.prototype.postModelExec = function (req, res, modelid, Q, P, onComplete) {
  var _this = this;
  if (!this.jsh.hasModel(req, modelid)) throw new Error("Error: Model " + modelid + " not found in collection.");
  var model = this.jsh.getModel(req, modelid);
  if (!Helper.HasModelAccess(req, model, 'U')) { Helper.GenError(req, res, -11, 'Invalid Model Access'); return; }
  
  var fieldlist = this.getFieldNames(req, model.fields, 'U');
  
  var Pcheck = _.map(fieldlist, function (field) { return '&' + field; });
  if (!_this.ParamCheck('Q', Q, [])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  if (!_this.ParamCheck('P', P, Pcheck)) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  
  if (!('sqlexec' in model)) throw new Error("Error: Model " + modelid + " missing sqlexec.");
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
      var dbtype = AppSrv.prototype.getDBType(field);
      sql_ptypes.push(dbtype);
      sql_params[fname] = _this.DeformatParam(field, P[fname], verrors);
      //Add PreCheck, if type='F'
      if ('datalock' in field) {
        _this.getDataLockSQL(req, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery, dfield) {
          if (dfield != field) return false;
          param_datalocks.push({ pname: fname, datalockquery: datalockquery, field: dfield });
          return true;
        });
      }
    }
    else throw new Error('Missing parameter ' + fname);
  });
  
  //Add DataLock parameters to SQL 
  _this.getDataLockSQL(req, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery) { datalockqueries.push(datalockquery); });
  
  verrors = _.merge(verrors, model.xvalidate.Validate('UK', sql_params));
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  
  var sql = _this.db.sql.postModelExec(_this.jsh, model, param_datalocks, datalockqueries);
  
  var dbtasks = {};
  dbtasks[modelid] = function (dbtrans, callback, transtbl) {
    sql_params = ApplyTransTbl(sql_params, transtbl);
    var dbfunc = _this.db.Recordset;
    if (model.sqltype && (model.sqltype == 'multirecordset')) dbfunc = _this.db.MultiRecordset;
    dbfunc.call(_this.db, req._DBContext, sql, sql_ptypes, sql_params, dbtrans, function (err, rslt) {
      if (err != null) { err.model = model; err.sql = sql; }
      callback(err, rslt);
    });
  };
  return onComplete(null, dbtasks);
}

/************************
DELETE OPERATION / DELETE
************************/
AppSrv.prototype.deleteModel = function (req, res, modelid, noexecute, Q, P, onComplete) {
  if (!this.jsh.hasModel(req, modelid)) throw new Error("Error: Model " + modelid + " not found in collection.");
  var model = this.jsh.getModel(req, modelid);
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
  
  if (model.layout == 'form') dbtasks = this.deleteModelForm(req, res, modelid, Q, P, fdone);
  else if (model.layout == 'form-m') dbtasks = this.deleteModelForm(req, res, modelid, Q, P, fdone);
  else if ((model.layout == 'grid') && (model.commitlevel) && (model.commitlevel != 'none')) this.deleteModelForm(req, res, modelid, Q, P, fdone);
  else throw new Error('Model ' + modelid + ' operation not supported');
}

AppSrv.prototype.deleteModelForm = function (req, res, modelid, Q, P, onComplete) {
  if (!this.jsh.hasModel(req, modelid)) throw new Error("Error: Model " + modelid + " not found in collection.");
  var _this = this;
  var model = this.jsh.getModel(req, modelid);
  if (!Helper.HasModelAccess(req, model, 'D')) { Helper.GenError(req, res, -11, 'Invalid Model Access'); return; }
  var keylist = this.getKeyNames(model.fields);
  var fieldlist = this.getFieldNames(req, model.fields, 'D');
  var filelist = this.getFileFieldNames(req, model.fields, '*');
  
  var Qcheck = _.map(keylist, function (key) { return '&' + key; });
  Qcheck = Qcheck.concat(_.map(fieldlist, function (field) { return '|' + field; }));

  if (!_this.ParamCheck('Q', Q, Qcheck)) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  if (!_this.ParamCheck('P', P, [])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  
  var sql_ptypes = [];
  var sql_params = {};
  var verrors = {};
  var datalockqueries = [];
  var keys = _this.getKeys(model.fields);
  
  _.each(keys, function (field) {
    var fname = field.name;
    if (fname in Q) {
      var dbtype = AppSrv.prototype.getDBType(field);
      sql_ptypes.push(dbtype);
      sql_params[fname] = _this.DeformatParam(field, Q[fname], verrors);
    }
    else throw new Error('Missing parameter ' + fname);
  });
  
  //Add DataLock parameters to SQL 
  _this.getDataLockSQL(req, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery) { datalockqueries.push(datalockquery); });
  
  verrors = _.merge(verrors, model.xvalidate.Validate('K', sql_params));
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  
  var sql = _this.db.sql.deleteModelForm(_this.jsh, model, keys, datalockqueries);
  
  var dbtasks = {};
  dbtasks[modelid] = function (dbtrans, callback) {
    _this.db.Row(req._DBContext, sql, sql_ptypes, sql_params, dbtrans, function (err, rslt) {
      if ((err == null) && (rslt != null) && (_this.jsh.map.rowcount in rslt) && (rslt[_this.jsh.map.rowcount] == 0)) err = Helper.NewError('No records affected', -3);
      if (err != null) { err.model = model; err.sql = sql; }
      callback(err, rslt);
    });
  };
  //Add post-processing task to delete any files
  if (filelist.length > 0) {
    if (keys.length == 1) keyval = sql_params[keys[0].name];
    else throw new Error('File uploads require one key');
    if ((typeof keyval == 'undefined') || !keyval) return callback(Helper.NewError('Invalid file key', -13), null);
    
    var fileops = [];
    _.each(filelist, function (file) {
      var filefield = _this.getFieldByName(model.fields, file);
      //Delete file in post-processing
      fileops.push({ op: 'move', src: global.datadir + filefield.controlparams.data_folder + '/' + file + '_' + keyval, dst: '' });
      //Delete thumbnails in post-processing
      if (filefield.controlparams.thumbnails) for (var tname in filefield.controlparams.thumbnails) {
        fileops.push({ op: 'move', src: global.datadir + filefield.controlparams.data_folder + '/' + tname + '_' + keyval, dst: '' });
      }
    });
    dbtasks['_POSTPROCESS'] = function (callback) {
      _this.ProcessFileOperationsDone(fileops, callback);
    }
  }
  return onComplete(null, dbtasks);
}

/********
 REPORTS
********/
AppSrv.prototype.getReport = function (req, res, modelid, Q, P, callback) {
  if (!this.jsh.hasModel(req, modelid)) throw new Error("Error: Report " + modelid + " not found in collection.");
  var _this = this;
  if (typeof Q == 'undefined') Q = req.query;
  if (typeof P == 'undefined') P = req.body;
  if (typeof callback == 'undefined') callback = function (err, tmppath, dispose) {
    /* Report Done */ 
    HelperFS.getFileStats(req, res, tmppath, function (err, stat) {
      if (err != null) return dispose();
      var fsize = stat.size;
      //Get MIME type
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': stat.size,
        'Content-Disposition': 'filename = ' + encodeURIComponent(modelid + '.pdf')
      });
      var rs = fs.createReadStream(tmppath);
      rs.pipe(res).on('finish', function () { dispose(); });
    });
  }
  
  this.rptsrv.queueReport(req, res, modelid, Q, P, {}, callback);
}
AppSrv.prototype.getReportHTML = function (req, res, modelid, Q, P, callback) {
  if (!this.jsh.hasModel(req, modelid)) throw new Error("Error: Report " + modelid + " not found in collection.");
  var _this = this;
  if (typeof Q == 'undefined') Q = req.query;
  if (typeof P == 'undefined') P = req.body;
  if (typeof callback == 'undefined') callback = function (err, rptcontent) {
    /* Report Done */ 
    if(!rptcontent.body && !rptcontent.header && !rptcontent.footer) return res.end();
    var rslt = rptcontent.body;
    //Add Border
    var idx = rslt.indexOf('</head');
    if(idx < 0) idx = 0;
    rslt = rslt.substr(0,idx) + '<style type="text/css">body { border:2px solid #ccc; zoom:1 !important; }</style>' + rslt.substr(idx,rslt.length);
    //Add Header
    idx = rslt.indexOf('<body');
    if(idx < 0) idx = 0;
    else idx = rslt.indexOf('>',idx)+1;
    rslt = rslt.substr(0,idx) + rptcontent.header + rslt.substr(idx,rslt.length);
    //Add footer
    idx = rslt.indexOf('</body');
    if(idx < 0) idx = rslt.length;
    rslt = rslt.substr(0,idx) + rptcontent.footer + rslt.substr(idx,rslt.length);


    rslt = rslt.replace(/(file:\/\/[^"'>]*)/gi,function(match,p1){ 
      p1 = p1.replace(global.datadir,'');
      if(Helper.endsWith(p1,'/node_modules/jsharmony/public/js/main.js')) return '/js/main.js';
      if(p1.lastIndexOf('/public/') >= 0) return p1.substr(p1.lastIndexOf('/public/')+7);
      return ''; 
    });
    res.send(rslt);
    res.end();
  }
  
  this.rptsrv.queueReport(req, res, modelid, Q, P, {output:'html'}, callback);
}
AppSrv.prototype.getReportJob = function (req, res, modelid, Q, P, callback) {
  if (!this.jsh.hasModel(req, modelid)) throw new Error("Error: Report " + modelid + " not found in collection.");
  var _this = this;
  if (typeof Q == 'undefined') Q = req.query;
  if (typeof P == 'undefined') P = req.body;
  if (typeof callback == 'undefined') callback = function () { /* Report Done */ };
  
  this.rptsrv.runReportJob(req, res, modelid, Q, P, callback);
}

/******************
 UPLOAD / DOWNLOAD
******************/
AppSrv.prototype.Upload = function (req, res) {
  if (!('_DBContext' in req) || (req._DBContext == '') || (req._DBContext == null)) { return Helper.GenError(req, res, -30, 'Invalid file upload request.'); }
  var temp_folder = global.datadir + 'temp/';
  var public_folder = temp_folder + 'public/';
  var user_folder = temp_folder + req._DBContext + '/';
  var form = new multiparty.Form({ maxFilesSize: global.max_filesize, uploadDir: (public_folder) });
  form.parse(req, function (err, fields, files) {
    //Handle Error
    if (err != null) {
      if (('code' in err) && (err.code == 'ETOOBIG')) { return Helper.GenError(req, res, -31, 'Upload file exceeded maximum file size.'); }
      global.log(err);
      return Helper.GenError(req, res, -30, 'Invalid file upload request.');
    }
    
    var prevtoken = '';
    if ((fields != null) && ('prevtoken' in fields) && (_.isString(fields.prevtoken[0]))) prevtoken = path.basename(fields.prevtoken[0]);
    
    if (files == null) { return Helper.GenError(req, res, -30, 'Invalid file upload request.'); }
    if (!('file' in files)) { return Helper.GenError(req, res, -30, 'Invalid file upload request.'); }
    if (files.file.length != 1) { return Helper.GenError(req, res, -30, 'Invalid file upload request.'); }
    
    var xfile = files.file[0];
    var file_size = xfile.size;
    var file_token = '';
    var file_origname = path.basename(xfile.originalFilename);
    var file_path = xfile.path;
    var file_ext = path.extname(path.basename(file_origname)).toLowerCase(); //Get extension
    if (!_.includes(global.valid_extensions, file_ext)) { return Helper.GenError(req, res, -32, 'File extension is not supported.'); }
    
    async.waterfall([
      async.apply(HelperFS.createFolderIfNotExists, user_folder),
      async.apply(HelperFS.clearFiles, user_folder, global.user_temp_expiration, global.max_user_temp_foldersize),
      async.apply(HelperFS.clearFiles, public_folder, global.public_temp_expiration, -1),
      async.apply(HelperFS.genRandomFileName, user_folder, file_ext),
      function (fname, callback) { file_token = fname; callback(null); },
      function (callback) { HelperFS.rename(file_path, (user_folder + file_token), callback); },
      function (callback) { if (prevtoken != '') { HelperFS.tryUnlink(user_folder + prevtoken, callback); } else callback(null); }
    ], function (err, rslt) {
      //Handle error or return result
      if (err) {
        if (_.isObject(err) && ('number' in err) && (err.number == -36)) return Helper.GenError(req, res, -36, "User exceeded max temp folder size");
        return Helper.GenError(req, res, -99999, "Error occurred during file operation (" + err.toString() + ')');
      }
      else {
        rslt = { '_success': 1, 'FILE_SIZE': file_size, 'FILE_TOKEN': file_token, 'FILE_ORIGNAME': file_origname, 'FILE_EXT': file_ext };
        if (req.jsproxyid) return res.end(Helper.js_proxy(req, rslt));
        else return res.end(JSON.stringify(rslt));
      }
    });
  });
}

AppSrv.prototype.UploadCKEditor = function (req, res) {
  if (!('_DBContext' in req) || (req._DBContext == '') || (req._DBContext == null)) { return Helper.GenError(req, res, -30, 'Invalid file upload request.'); }
  if (!Helper.HasRole(req, 'CMSFILES')) { Helper.GenError(req, res, -15, 'Invalid Access'); return; }
  var temp_folder = global.datadir + 'temp/';
  var public_folder = temp_folder + 'public/';
  var cmsfiles_folder = global.datadir + 'cmsfiles/';
  var form = new multiparty.Form({ maxFilesSize: global.max_filesize, uploadDir: (public_folder) });
  form.parse(req, function (err, fields, files) {
    //Handle Error
    if (err != null) {
      if (('code' in err) && (err.code == 'ETOOBIG')) { return Helper.GenError(req, res, -31, 'Upload file exceeded maximum file size.'); }
      global.log(err);
      return Helper.GenError(req, res, -30, 'Invalid file upload request.');
    }
    if (files == null) { return Helper.GenError(req, res, -30, 'Invalid file upload request.'); }
    if (!('upload' in files)) { return Helper.GenError(req, res, -30, 'Invalid file upload request.'); }
    if (files.upload.length != 1) { return Helper.GenError(req, res, -30, 'Invalid file upload request.'); }
    
    var xfile = files.upload[0];
    var file_size = xfile.size;
    var file_origname = path.basename(xfile.originalFilename);
    var file_path = xfile.path;
    var file_ext = path.extname(path.basename(file_origname)).toLowerCase(); //Get extension
    if (!_.includes(global.valid_extensions, file_ext)) { return Helper.GenError(req, res, -32, 'File extension is not supported.'); }
    
    async.waterfall([
      async.apply(HelperFS.createFolderIfNotExists, cmsfiles_folder),
      async.apply(HelperFS.clearFiles, public_folder, global.public_temp_expiration, -1),
      function (callback) {
        fs.exists(cmsfiles_folder + file_origname, function (exists) {
          if (exists) return callback({ number: -37, message: "File already exists" });
          else return callback(null);
        });
      },
      function (callback) { HelperFS.rename(file_path, (cmsfiles_folder + file_origname), callback); }
    ], function (err, rslt) {
      //Handle error or return result
      if (err) {
        if (_.isObject(err) && ('number' in err) && (err.number == -36)) return Helper.GenError(req, res, -36, "User exceeded max temp folder size");
        else if (_.isObject(err) && ('number' in err) && (err.number == -37)) return res.send("File name already exists on server - cannot overwrite");
        return Helper.GenError(req, res, -99999, "Error occurred during file operation (" + err.toString() + ')');
      }
      else {
        var rslt = "\
          <script type='text/javascript'>\
            var funcNum = " + req.query.CKEditorFuncNum + ";\
            var url = \"" + Helper.getFullURL(req, req.baseurl) + "cmsfiles/" + file_origname + "\";\
            var message = \"Uploaded file successfully\";\
            window.parent.CKEDITOR.tools.callFunction(funcNum, url, message);\
          </script>";
        return res.end(rslt);
      }
    });
  });
}

AppSrv.prototype.ClearUpload = function (req, res) {
  if (!('_DBContext' in req) || (req._DBContext == '') || (req._DBContext == null)) { return Helper.GenError(req, res, -30, 'Invalid file upload request.'); }
  var user_folder = global.datadir + 'temp/' + req._DBContext + '/';
  HelperFS.clearFiles(user_folder, -1, -1, function (err) {
    res.end(JSON.stringify({ '_success': 1 }));
  });
}

AppSrv.prototype.Download = function (req, res, modelid, keyid, fieldid, options) {
  if (!options) options = {};
  if (!('_DBContext' in req) || (req._DBContext == '') || (req._DBContext == null)) { return Helper.GenError(req, res, -10, 'Invalid Login / Not Authenticated'); }
  if (!keyid) return Helper.GenError(req, res, -33, 'Download file not found.');
  if (req.query && (req.query.format=='js')) req.jsproxyid = 'xfiledownloader';
  var _this = this;
  
  var serveFile = function (req, res, fpath, fname, fext) {
    var serveoptions = {};
    if (options.view) serveoptions = { attachment: false, mime_override: fext };
    HelperFS.outputFile(req, res, fpath, fname, function (err) {
      //Only executes upon error
      if (err != null) {
        if (('code' in err) && (err.code == 'ENOENT')) return Helper.GenError(req, res, -33, 'Download file not found.');
        return Helper.GenError(req, res, -99999, "Error occurred during file operation (" + err.toString() + ')');
      }
    }, serveoptions);
  };
  
  if (modelid == '_temp') {
    var fname = path.basename(keyid);
    var file_ext = path.extname(fname).toLowerCase(); //Get extension
    if ((file_ext == '') || (!_.includes(global.valid_extensions, file_ext))) { return Helper.GenError(req, res, -32, 'File extension is not supported.'); }
    var fpath = global.datadir + 'temp/' + req._DBContext + '/' + fname;
    serveFile(req, res, fpath, fname, fname);
  }
  else {
    if (!this.jsh.hasModel(req, modelid)) throw new Error("Error: Model " + modelid + " not found in collection.");
    var model = this.jsh.getModel(req, modelid);
    //Verify model access
    if (!Helper.HasModelAccess(req, model, 'B')) { Helper.GenError(req, res, -11, 'Invalid Model Access'); return; }
    if (model.unbound) { Helper.GenError(req, res, -11, 'Cannot run database queries on unbound models'); return; }
    //Get key name
    var keylist = this.getKeyNames(model.fields);
    var keys = this.getFieldsByName(model.fields, keylist);
    if (keys.length != 1) throw new Error('File downloads require one key');
    var filelist = this.getFileFieldNames(req, model.fields, 'B');
    var fieldlist = [keylist[0]];
    //Make sure fieldid is in fields
    if (!_.includes(filelist, fieldid)) return Helper.GenError(req, res, -33, 'Download file not found.');
    var field = this.getFieldByName(model.fields, fieldid);
    if (!('controlparams' in field)) { throw new Error('File ' + file + ' missing controlparams'); }
    if (!('sqlparams' in field.controlparams)) { throw new Error('File ' + file + ' missing sqlparams'); }
    if ('FILE_EXT' in field.controlparams.sqlparams) { fieldlist.push(field.controlparams.sqlparams.FILE_EXT); }
    if ('FILE_NAME' in field.controlparams.sqlparams) { fieldlist.push(field.controlparams.sqlparams.FILE_NAME); }
    //Get row from database
    var sql_ptypes = [];
    var sql_params = {};
    var verrors = {};
    var datalockqueries = [];
    var fields = _this.getFieldsByName(model.fields, fieldlist);
    
    //Add DataLock parameters to SQL 
    this.getDataLockSQL(req, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery) { datalockqueries.push(datalockquery); });
    //Add keys as SQL parameters
    var keyfield = keys[0];
    var keyname = keyfield.name;
    var dbtype = AppSrv.prototype.getDBType(keyfield);
    sql_ptypes.push(dbtype);
    sql_params[keyname] = this.DeformatParam(keyfield, keyid, verrors);
    
    verrors = _.merge(verrors, model.xvalidate.Validate('K', sql_params));
    if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
    
    var sql = _this.db.sql.Download(_this.jsh, model, fields, keys, datalockqueries);
    
    this.ExecRow(req._DBContext, sql, sql_ptypes, sql_params, function (err, rslt) {
      //Get extension, filename
      if ((rslt == null) || (rslt.length != 1) || (rslt[0] == null)) { return Helper.GenError(req, res, -33, 'Download file not found.'); }
      var fname = keyid;
      if ('FILE_NAME' in field.controlparams.sqlparams) { fname = rslt[0][field.controlparams.sqlparams.FILE_NAME]; }
      else if ('FILE_EXT' in field.controlparams.sqlparams) { fname += rslt[0][field.controlparams.sqlparams.FILE_EXT]; }
      else if (field.controlparams.image && field.controlparams.image.format) { fname += '.' + field.controlparams.image.format; }
      var fpath = global.datadir + field.controlparams.data_folder + '/' + fieldid + '_' + keyid;
      if (options.thumb) {
        if (field.controlparams.thumbnails) for (var tname in field.controlparams.thumbnails) {
          fpath = global.datadir + field.controlparams.data_folder + '/' + tname + '_' + keyid;
          break;
        }
      }
      serveFile(req, res, fpath, fname, fname);
    });
  }
};

AppSrv.prototype.GetToken = function (req, res) {
  if (!('_DBContext' in req) || (req._DBContext == '') || (req._DBContext == null)) { return Helper.GenError(req, res, -10, 'Invalid Login / Not Authenticated'); }
  if (!req.jshconfig.auth) { return Helper.GenError(req, res, -99999, 'Authentication not defined'); }
  if (!req.jshconfig.auth.getToken) { return Helper.GenError(req, res, -99999, 'Token generation not defined'); }
  req.jshconfig.auth.getToken(this, req, function (rslt, err) {
    if (err) { return Helper.GenError(req, res, -99999, err); }
    res.end(JSON.stringify(rslt));
  });
};

AppSrv.prototype.SubscribeToQueue = function (req, res, next, queueid) {
  if (!this.jsh.Config.queues) { next(); return; }
  if (!(queueid in this.jsh.Config.queues)) { return Helper.GenError(req, res, -1, 'Queue not found'); }
  if (!this.jobproc) { return Helper.GenError(req, res, -1, 'Job Processor not configured'); }
  if (global.debug_params.appsrv_requests) global.log('User subscribing to queue ' + queueid);
  var queue = this.jsh.Config.queues[queueid];
  if (!Helper.HasModelAccess(req, queue, 'B')) { Helper.GenError(req, res, -11, 'Invalid Access'); return; }
  //Check if queue has a message, otherwise, add to subscriptions
  this.jobproc.SubscribeToQueue(req, res, queueid);
}

AppSrv.prototype.PopQueue = function (req, res, queueid) {
  var _this = this;
  if (!this.jsh.Config.queues) { next(); return; }
  if (!(queueid in this.jsh.Config.queues)) { return Helper.GenError(req, res, -1, 'Queue not found'); }
  if (global.debug_params.appsrv_requests) global.log('Result for queue ' + queueid);
  if (!this.jobproc) throw new Error('Job Processor not configured');
  var queue = this.jsh.Config.queues[queueid];
  
  //Verify parameters
  var P = req.body || {};
  if (!_this.ParamCheck('P', P, ['&ID', '&RSLT', '&NOTES'])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  var validate = new XValidate();
  validate.AddValidator('_obj.ID', 'Queue Task ID', 'B', [XValidate._v_IsNumeric(), XValidate._v_Required()]);
  validate.AddValidator('_obj.RSLT', 'Queue Task Result', 'B', [XValidate._v_MaxLength(8), XValidate._v_Required()]);
  validate.AddValidator('_obj.NOTES', 'Queue Task Result Notes', 'B', [XValidate._v_MaxLength(4000)]);
  var verrors = validate.Validate('B', P);
  if (!_.isEmpty(verrors)) { return Helper.GenError(req, res, -2, verrors[''].join('\n')); }
  
  if (!Helper.HasModelAccess(req, queue, 'D')) { return Helper.GenError(req, res, -11, 'Invalid Access'); }
  this.jobproc.PopQueue(req, res, queueid, P, function () { res.end(JSON.stringify({ '_success': 1 })); });
}

AppSrv.prototype.SendQueue = function (queueid, message) {
  for (var i = 0; i < this.QueueSubscriptions.length; i++) {
    var queue = this.QueueSubscriptions[i];
    if (!queue.res || queue.res.finished) { this.QueueSubscriptions.splice(i, 1); i--; continue; }
    if (queue.id == queueid) {
      if (global.debug_params.appsrv_requests) global.log('Notifying subscriber ' + queueid);
      try {
        queue.res.send(message);
      } catch (ex) {
        Helper.GenError(req, res, -99999, ex);
      }
      queue.res.end();
      //queue.res.set("Connection", "close");
      this.QueueSubscriptions.splice(i, 1);
      i--;
    }
  }
}

AppSrv.prototype.getSQL = function (sqlid) {
  return DB.ParseSQL(sqlid, this.jsh);
}

/***************
HELPER FUNCTIONS
****************/
AppSrv.prototype.ExecDBFunc = function (dbfunc, context, sql, ptypes, params, callback, constring) {
  var _this = this;
  _this.db.ExecTasks([function (cb) {
      dbfunc.call(_this.db, context, sql, ptypes, params, undefined, function (err, rslt) { cb(err, rslt); }, constring);
    }], callback);
}
AppSrv.prototype.ExecRecordset = function (context, sql, ptypes, params, callback, constring) {
  this.ExecDBFunc(this.db.Recordset, context, sql, ptypes, params, callback, constring);
};
AppSrv.prototype.ExecMultiRecordset = function (context, sql, ptypes, params, callback, constring) {
  this.ExecDBFunc(this.db.MultiRecordset, context, sql, ptypes, params, callback, constring);
};
AppSrv.prototype.ExecRow = function (context, sql, ptypes, params, callback, constring) {
  this.ExecDBFunc(this.db.Row, context, sql, ptypes, params, callback, constring);
};
AppSrv.prototype.ExecCommand = function (context, sql, ptypes, params, callback, constring) {
  this.ExecDBFunc(this.db.Command, context, sql, ptypes, params, callback, constring);
};
AppSrv.prototype.ExecScalar = function (context, sql, ptypes, params, callback, constring) {
  this.ExecDBFunc(this.db.Scalar, context, sql, ptypes, params, callback, constring);
};
AppSrv.prototype.AppDBError = function (req, res, err) {
  if ('model' in err) {
    var model = err.model;
    if ('dberrors' in model) {
      for (var i = 0; i < model.dberrors.length; i++) {
        var dberr = model.dberrors[i];
        var erex = dberr[0];
        var etxt = dberr[1];
        if (erex.indexOf('/') == 0) {
          erex = erex.substr(1, erex.length - 2);
          if (err.message.match(new RegExp(erex))) { return Helper.GenError(req, res, -9, etxt); }
        }
        else if (err.message.indexOf(erex) >= 0) { return Helper.GenError(req, res, -9, etxt); }
      }
    }
  }
  //Not necessary because sql is printed out in node debug in global.log below
  //if ('sql' in err) { if (global.debug_params.appsrv_logsql) err.message += ' SQL: ' + err.sql; }
  if ((err.message) && (err.message == 'INVALID ACCESS')) return Helper.GenError(req, res, -12, "Invalid DataLock Access");
  if (global.debug_params.appsrv_requests) global.log(err);
  if ((err.message) && (err.message.indexOf('Application Error - ') == 0)) return Helper.GenError(req, res, -5, err.message);
  if ('number' in err) return Helper.GenError(req, res, err.number, err.message);
  return Helper.GenError(req, res, -99999, err.message);
}
AppSrv.prototype.ParamCheck = Helper.ParamCheck;
AppSrv.prototype.DeformatParam = function (field, val, verrors) {
  if ((field.type == 'date') || (field.type == 'datetime')) {
    if (val === '') return null;
    if (val === null) return null;
    var dtstmp = Date.parse(val);
    if (isNaN(dtstmp)) { add_verror(verrors, field.name + ': Invalid Date'); return ''; }
    //Get time in original timezone
    var has_timezone = false;
    if (/Z|[+\-][0-9]+:[0-9]+$/.test(val)) has_timezone = true;
    var mtstmp = null;
    if (has_timezone) mtstmp = moment.parseZone(val);
    else mtstmp = moment(val);
    if (!mtstmp.isValid()) { add_verror(verrors, field.name + ': Invalid Date'); return ''; }
    if (mtstmp.year()>9999) { add_verror(verrors, field.name + ': Invalid Date'); return ''; }
    if (mtstmp.year()<1753) { add_verror(verrors, field.name + ': Invalid Date'); return ''; }
    //Remove timezone
    return moment(mtstmp.format("YYYY-MM-DDTHH:mm:ss.SSS")).toDate();
    //return mtstmp.toDate();
    //return new Date(dtstmp);
  }
  else if (field.type == 'time') {
    if (val === '') return null;
    if (val === null) return null;
    var fulldate = false;
    var dtstmp = Date.parse('1970-01-01 ' + val);
    if (isNaN(dtstmp)) { dtstmp = Date.parse(val); fulldate = true; }
    if (isNaN(dtstmp)) { add_verror(verrors, field.name + ': Invalid Time'); return ''; }
    var dt = new Date('1970-01-01');
    if (fulldate) {
      var has_timezone = false;
      if (/Z|[+\-][0-9]+:[0-9]+$/.test(val)) has_timezone = true;
      var mtstmp = null;
      if (has_timezone) mtstmp = moment.parseZone(val);
      else mtstmp = moment(val);
      dt = moment(mtstmp.format("YYYY-MM-DDTHH:mm:ss.SSS")).toDate();
    }
    else dt = new Date('1970-01-01 ' + val);
    //else dt = new Date(dtstmp - dt.getTimezoneOffset() * 60 * 1000);
    return dt;
  }
  else if (field.type == 'encascii') {
    //return Helper.stringToASCIIBuffer(val);
    return new Buffer(val, 'ascii');
  }
  
  else if (field.type == 'bit') {
    if (val === '') return null;
    if (val === null) return null;
    return val;
    /*
    if (!val) return false;
    if (val == '0') return false;
    if (val == 0) return false;
    return true;
    */
  }
  return val;
}
function add_verror(verrors, err) {
  if (!('' in verrors)) verrors[''] = [];
  verrors[''].push(err);
}
function ApplyTransTbl(sql_params, transtbl) {
  if (typeof transtbl == 'undefined') return sql_params;
  for (var pname in sql_params) {
    if ((sql_params[pname] == '%%%' + pname + '%%%') && (pname in transtbl)) {
      sql_params[pname] = transtbl[pname];
    }
  }
  return sql_params;
}
AppSrv.prototype.addSearchTerm = function (field, search_i, in_search_value, comparison, sql_ptypes, sql_params, verrors) {
  if (!('type' in field)) throw new Error('Search term ' + field.name + ' must have type.');
  var ftype = field.type;
  var pname = 'search_' + search_i + '_' + field.name;
  if ((comparison == 'null') || (comparison == 'notnull')) {
    in_search_value = '';
  }
  else {
    //Validate search parameter
    switch (field.type) {
      case 'bit':
        break;
      case 'bigint':
      case 'int':
      case 'smallint':
        //If is not numeric, move on
        if (isNaN(in_search_value)) return '';
        break;
      case 'decimal':
        if (isNaN(in_search_value)) return '';
        break;
      case 'varchar':
      case 'char':
        break;
      case 'datetime':
      case 'date':
        var dtval = this.DeformatParam(field, in_search_value, {});
        if (!dtval) return ''; //Check if this is a date
        in_search_value = dtval; //new Date(moment.utc(in_search_value).format("YYYY-MM-DDTHH:mm:ss.SSS") + 'Z');
        break;
      case 'time':
        var tmval = this.DeformatParam(field, in_search_value, {});
        if (!tmval) return '';
        in_search_value = tmval;
        break;
      case 'hash':
        //Generate Hash
        if (!(field.salt in this.jsh.Config.salts)) throw new Error('Hash salt not defined.');
        in_search_value = crypto.createHash('sha1').update(in_search_value + this.jsh.Config.salts[field.salt]).digest();
        in_search_value = this.DeformatParam(field, in_search_value, {});
        break;
      default: throw new Error('Search type ' + field.name + '/' + ftype + ' not supported.');
    }
  }
  var searchterm = this.db.sql.getSearchTerm(this.jsh, field, pname, in_search_value, comparison);
  if (searchterm) {
    if (!searchterm.dbtype) searchterm.dbtype = AppSrv.prototype.getDBType(field);
    sql_ptypes.push(searchterm.dbtype);
    //Dont deformat dates
    if ((ftype != 'datetime') && (ftype != 'date') && (ftype != 'time')) searchterm.search_value = this.DeformatParam(field, searchterm.search_value, verrors);
    sql_params[pname] = searchterm.search_value;
    return searchterm.sql;
  }
  return '';
}

AppSrv.prototype.addDefaultTasks = function (req, res, model, Q, dbtasks) {
  var _this = this;
  var _defaults = {};
  
  //Prepare Default Values Query
  var dflt_ptypes = [];
  var dflt_params = {};
  var dflt_verrors = {};
  var dflt_sql_fields = [];
  
  for (var field_i = 0; field_i < model.fields.length; field_i++) {
    var field = model.fields[field_i];
    if ('default' in field) {
      var dflt = field['default'];
      if (_.isString(dflt)) _defaults[field.name] = field.default;
      else {
        var sql = '';
        if ('sql' in dflt) { sql = dflt.sql; }
        else { Helper.GenError(req, res, -99999, 'Custom Default Value requires SQL'); return; }
        
        var datalockstr = '';
        var dflt_sql_field_datalockqueries = [];
        var dflt_sql_field_param_datalocks = [];
        _this.getDataLockSQL(req, [dflt], dflt_ptypes, dflt_params, dflt_verrors, function (datalockquery) { dflt_sql_field_datalockqueries.push(datalockquery); }, dflt.nodatalock, field.name + "_" + model.id + "_dflt");
        
        //Add lov parameters
        if ('sql_params' in dflt) {
          var dflt_pfields = _this.getFieldsByName(model.fields, dflt.sql_params);
          for (var i = 0; i < dflt_pfields.length; i++) {
            var dflt_pfield = dflt_pfields[i];
            var dflt_pname = dflt_pfield.name;
            if (dflt_pname in dflt_params) continue;
            dflt_ptypes.push(AppSrv.prototype.getDBType(dflt_pfield));
            dflt_params[dflt_pname] = null;
            if (dflt_pname in Q) {
              dflt_params[dflt_pname] = _this.DeformatParam(dflt_pfield, Q[dflt_pname], dflt_verrors);
              _this.getDataLockSQL(req, model.fields, dflt_ptypes, dflt_params, dflt_verrors, function (datalockquery, dfield) {
                if (dfield != dflt_pfield) return false;
                dflt_sql_field_param_datalocks.push({ pname: dflt_pname, datalockquery: datalockquery, field: dfield });
                return true;
              }, undefined, field.name + "_" + model.id + "_dflt_key");
            }
          }
          dflt_verrors = _.merge(dflt_verrors, model.xvalidate.Validate('KF', dflt_params));
        }
        if (!_.isEmpty(dflt_verrors)) { Helper.GenError(req, res, -2, dflt_verrors[''].join('\n')); return; }
        
        dflt_sql_fields.push({ name: field.name, field: field, sql: sql, datalockqueries: dflt_sql_field_datalockqueries, param_datalocks: dflt_sql_field_param_datalocks });
      }
    }
  }
  
  var dflt_sql = _this.db.sql.getDefaultTasks(_this.jsh, dflt_sql_fields);
  
  //Execute Query
  dbtasks['_defaults'] = function (dbtrans, callback, transtbl) {
    if (transtbl) {
      for (dflt_param in dflt_params) {
        if ((dflt_params[dflt_param] === null) && (dflt_param in transtbl)) dflt_params[dflt_param] = transtbl[dflt_param];
      }
    }
    if (dflt_sql) {
      _this.db.Row(req._DBContext, dflt_sql, dflt_ptypes, dflt_params, dbtrans, function (err, rslt) {
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

AppSrv.prototype.addBreadcrumbTasks = function (req, res, model, Q, dbtasks) {
  var _this = this;
  var _defaults = {};
  var verrors = {};
  
  if (!('breadcrumbs' in model) || !('sql' in model.breadcrumbs)) return;
  
  var bcrumb_ptypes = [];
  var bcrumb_params = {};
  var datalockqueries = [];
  var bcrumb_sql_fieldlist = [];
  var bcrumb_fields = this.getFields(req, model.fields, 'KC');
  for (var i = 0; i < bcrumb_fields.length; i++) {
    var field = bcrumb_fields[i];
    var fname = field.name;
    bcrumb_ptypes.push(AppSrv.prototype.getDBType(field));
    bcrumb_params[fname] = null;
    if (fname in Q) {
      bcrumb_params[fname] = _this.DeformatParam(field, Q[fname], verrors);
      _this.getDataLockSQL(req, model.fields, bcrumb_ptypes, bcrumb_params, verrors, function (datalockquery, dfield) {
        if (dfield != field) return false;
        datalockqueries.push(datalockquery);
        if (bcrumb_sql_fieldlist.indexOf(fname) < 0) bcrumb_sql_fieldlist.push(fname);
        return true;
      });
    }
  }
  verrors = _.merge(verrors, model.xvalidate.Validate('KFC', bcrumb_params));
  var bcrumb_sql_fields = _this.getFieldsByName(model.fields, bcrumb_sql_fieldlist);
  var bcrumb_sql = _this.db.sql.getBreadcrumbTasks(_this.jsh, model, datalockqueries, bcrumb_sql_fields);
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  dbtasks['_bcrumbs'] = function (dbtrans, callback) {
    _this.db.Row(req._DBContext, bcrumb_sql, bcrumb_ptypes, bcrumb_params, dbtrans, function (err, rslt) {
      if ((err == null) && (rslt == null)) err = Helper.NewError('Breadcrumbs not found', -14);
      if (err != null) { err.model = model; err.sql = bcrumb_sql; }
      callback(err, rslt);
    });
  };
}

AppSrv.prototype.addLOVTasks = function (req, res, model, Q, dbtasks) {
  var _this = this;
  var jsh = _this.jsh;
  _.each(model.fields, function (field) {
    if ('lov' in field) {
      var lov = field['lov'];
      var lov_ptypes = [];
      var lov_params = {};
      var lov_verrors = {};
      var datalockqueries = [];
      var param_datalocks = [];
      
      if (('sql' in lov) || ('sql2' in lov) || ('sqlmp' in lov)) {
        _this.getDataLockSQL(req, [lov], lov_ptypes, lov_params, lov_verrors, function (datalockquery) { datalockqueries.push(datalockquery); }, lov.nodatalock, field.name + "_" + model.id + "_lov");
        //Add lov parameters
        if ('sql_params' in lov) {
          var lov_pfields = _this.getFieldsByName(model.fields, lov.sql_params);
          for (var i = 0; i < lov_pfields.length; i++) {
            var lov_pfield = lov_pfields[i];
            var lov_pname = lov_pfield.name;
            lov_ptypes.push(AppSrv.prototype.getDBType(lov_pfield));
            lov_params[lov_pname] = null;
            if (lov_pname in Q) {
              lov_params[lov_pname] = _this.DeformatParam(lov_pfield, Q[lov_pname], lov_verrors);
              _this.getDataLockSQL(req, model.fields, lov_ptypes, lov_params, lov_verrors, function (datalockquery, dfield) {
                if (dfield != lov_pfield) return false;
                param_datalocks.push({ pname: lov_pname, datalockquery: datalockquery, field: dfield });
                return true;
              }, undefined, field.name + "_" + model.id + "_lov_key");
              lov_verrors = _.merge(lov_verrors, model.xvalidate.Validate('*', lov_params, lov_pname));
            }
          }
          lov_verrors = _.merge(lov_verrors, model.xvalidate.Validate('KF', lov_params));
        }
      }
      if (!_.isEmpty(lov_verrors)) { Helper.GenError(req, res, -2, lov_verrors[''].join('\n')); return; }
      var sql = _this.db.sql.getLOV(_this.jsh, field.name, lov, datalockqueries, param_datalocks);
      dbtasks['_LOV_' + field.name] = function (dbtrans, callback, transtbl) {
        if (transtbl) {
          for (lov_param in lov_params) {
            if ((lov_params[lov_param] === null) && (lov_param in transtbl)) lov_params[lov_param] = transtbl[lov_param];
          }
        }
        _this.db.Recordset(req._DBContext, sql, lov_ptypes, lov_params, dbtrans, function (err, rslt) {
          if (err == null) {
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
}

AppSrv.prototype.ProcessFileParams = function (req, res, model, P, fieldlist, sql_extfields, sql_extvalues, fileops, vfiles, file, filecallback) {
  var _this = this;
  var field = this.getFieldByName(model.fields, file);
  //Validate File field
  if (file in P) {
    if (!('controlparams' in field)) { throw new Error('File ' + file + ' missing controlparams'); }
    if (!('sqlparams' in field.controlparams)) { throw new Error('File ' + file + ' missing sqlparams'); }
    if ('FILE_SIZE' in field.controlparams.sqlparams) { fieldlist.push(field.controlparams.sqlparams.FILE_SIZE); if (!this.getFieldByName(model.fields, field.controlparams.sqlparams.FILE_SIZE)) throw new Error(file + ' FILE_SIZE parameter not defined as a field'); }
    if ('FILE_EXT' in field.controlparams.sqlparams) { fieldlist.push(field.controlparams.sqlparams.FILE_EXT); if (!this.getFieldByName(model.fields, field.controlparams.sqlparams.FILE_EXT)) throw new Error(file + ' FILE_EXT parameter not defined as a field'); }
    if ('FILE_UTSTMP' in field.controlparams.sqlparams) {
      sql_extfields.push(field.controlparams.sqlparams.FILE_UTSTMP);
      if (!('sqlparams' in req.jshconfig)) { throw new Error('Config missing sqlparams'); }
      if (!('TSTMP' in req.jshconfig.sqlparams)) { throw new Error('No TSTMP in sqlparams'); }
      if (!this.getFieldByName(model.fields, field.controlparams.sqlparams.FILE_UTSTMP)) throw new Error(file + ' FILE_UTSTMP parameter not defined as a field');
      sql_extvalues.push(_this.getSQL(req.jshconfig.sqlparams.TSTMP));
    }
    if ('FILE_UU' in field.controlparams.sqlparams) {
      sql_extfields.push(field.controlparams.sqlparams.FILE_UU);
      if (!('sqlparams' in req.jshconfig)) { throw new Error('Config missing sqlparams'); }
      if (!('CUSER' in req.jshconfig.sqlparams)) { throw new Error('No CUSER in sqlparams'); }
      if (!this.getFieldByName(model.fields, field.controlparams.sqlparams.FILE_UU)) throw new Error(file + ' FILE_UU parameter not defined as a field');
      sql_extvalues.push(_this.getSQL(req.jshconfig.sqlparams.CUSER));
    }
    if (!('_DBContext' in req) || (req._DBContext == '') || (req._DBContext == null)) { return filecallback(Helper.GenError(req, res, -10, 'Invalid Login / Not Authenticated')); }
    var filedest = global.datadir + field.controlparams.data_folder + '/' + file + '_%%%KEY%%%';
    if (P[file] == '') {
      if ('FILE_SIZE' in field.controlparams.sqlparams) {
        if (field.controlparams.sqlparams.FILE_SIZE in P) throw new Error('Parameter conflict - ' + field.controlparams.sqlparams.FILE_SIZE);
        P[field.controlparams.sqlparams.FILE_SIZE] = null;
      }
      if ('FILE_EXT' in field.controlparams.sqlparams) {
        if (field.controlparams.sqlparams.FILE_EXT in P) throw new Error('Parameter conflict - ' + field.controlparams.sqlparams.FILE_EXT);
        P[field.controlparams.sqlparams.FILE_EXT] = null;
      }
      //Delete File in main operation
      fileops.push({ op: 'move', src: '', dest: filedest });
      //Delete Thumbnails in main operation
      if (field.controlparams.thumbnails) for (var tname in field.controlparams.thumbnails) {
        var tdest = global.datadir + field.controlparams.data_folder + '/' + tname + '_%%%KEY%%%';
        fileops.push({ op: 'move', src: '', dest: tdest });
      }
      filecallback(null);
    }
    else {
      var fpath = '';
      //Separate model.id, keyid
      if (P[file].indexOf('_temp/') != 0) { return Helper.GenError(req, res, -34, 'File path not supported'); }
      var filekeyid = P[file].substr(('_temp/').length);
      var fname = path.basename(filekeyid);
      var file_ext = path.extname(fname).toLowerCase(); //Get extension
      if ((file_ext == '') || (!_.includes(global.valid_extensions, file_ext))) { return filecallback(Helper.GenError(req, res, -32, 'File extension is not supported.')); }
      fpath = global.datadir + 'temp/' + req._DBContext + '/' + fname;
      //Validate file exists, get stats (size + ext)
      HelperFS.getFileStats(req, res, fpath, function (err, stat) {
        if (err != null) { return filecallback(Helper.GenError(req, res, -33, 'File not found.')); }
        //Add parameters, make sure they don't conflict with existing parameters
        var file_size = stat.size;
        if ('FILE_SIZE' in field.controlparams.sqlparams) {
          if (field.controlparams.sqlparams.FILE_SIZE in P) throw new Error('Parameter conflict - ' + field.controlparams.sqlparams.FILE_SIZE);
          P[field.controlparams.sqlparams.FILE_SIZE] = file_size;
        }
        if ('FILE_EXT' in field.controlparams.sqlparams) {
          if (field.controlparams.sqlparams.FILE_EXT in P) throw new Error('Parameter conflict - ' + field.controlparams.sqlparams.FILE_EXT);
          P[field.controlparams.sqlparams.FILE_EXT] = file_ext;
        }
        //Perform validation, if necessary - MaxSize, Extension, Required
        vfiles[file] = {
          size: file_size,
          ext: file_ext
        };
        
        //Resize Image, if applicable
        if (field.controlparams.image && _.includes(Helper.SUPPORTED_IMAGES, file_ext)) {
          //Create Thumbnails, if applicable
          if (field.controlparams.thumbnails) for (var tname in field.controlparams.thumbnails) {
            var tdest = global.datadir + field.controlparams.data_folder + '/' + tname + '_%%%KEY%%%';
            if (_.includes(Helper.SUPPORTED_IMAGES, file_ext)) {
              if (field.controlparams.thumbnails[tname].resize) fileops.push({ op: 'img_resize', src: fpath, dest: tdest, size: field.controlparams.thumbnails[tname].resize, format: field.controlparams.thumbnails[tname].format });
              else if (field.controlparams.thumbnails[tname].crop) fileops.push({ op: 'img_crop', src: fpath, dest: tdest, size: field.controlparams.thumbnails[tname].crop, format: field.controlparams.thumbnails[tname].format });
              else throw new Error('No thumbnail resize or crop operation in ' + field.name);
            }
          }
          
          if (field.controlparams.image.resize) fileops.push({ op: 'img_resize', src: fpath, dest: filedest, size: field.controlparams.image.resize, format: field.controlparams.image.format });
          else if (field.controlparams.image.crop) fileops.push({ op: 'img_crop', src: fpath, dest: filedest, size: field.controlparams.image.crop, format: field.controlparams.image.format });
          else throw new Error('No image resize or crop operation in ' + field.name);
          fileops.push({ op: 'delete_on_complete', src: fpath });
        }
        else {
          //On completion (of entire SQL statement), move file (Add another dbtask to be executed)
          fileops.push({ op: 'move', src: fpath, dest: filedest });
        }
        
        filecallback(null);
      });
    }
  }
  else filecallback(null);
};

AppSrv.prototype.ProcessFileOperations = function (keyval, fileops, rslt, callback) {
  if ((typeof keyval == 'undefined') || !keyval) return callback(Helper.NewError('Invalid file key', -13), null);
  
  async.each(fileops, function (fileop, opcallback) {
    var filesrc = '';
    var filedest = '';
    if (fileop.src) filesrc = Helper.ReplaceAll(fileop.src, '%%%KEY%%%', keyval);
    if (fileop.dest) filedest = Helper.ReplaceAll(fileop.dest, '%%%KEY%%%', keyval);
    
    if (fileop.op == 'move') {
      HelperFS.copyFile(fileop.src, filedest, function (fileerr) {
        if (fileerr != null) return opcallback(fileerr);
        return opcallback(null);
      });
    }
    else if (fileop.op == 'img_crop') {
      //Calculate w/h + x/y
      //Optionally override output format
      var img = imagick(filesrc);
      img.size(function (err, size) {
        if (err) return opcallback(err);
        var cropw = fileop.size[0];
        var croph = fileop.size[1];
        var outerw = cropw;
        var outerh = croph;
        if ((size.width / cropw) > (size.height / croph)) {
          outerw = Math.round(size.width * (croph / size.height));
        }
        else {
          outerh = Math.round(size.height * (cropw / size.width));
        }
        var cropx = (outerw - cropw) / 2;
        var cropy = (outerh - croph) / 2;
        
        if (fileop.format) {
          img.setFormat(fileop.format);
          if (_.includes(['jpeg', 'jpg'], fileop.format)) img.flatten();
        }
        img.quality(90);
        img.resize(outerw, outerh);
        img.crop(cropw, croph, cropx, cropy);
        img.repage(0, 0, 0, 0);
        img.noProfile().write(filedest, function (err) {
          if (err) return opcallback(err);
          return opcallback(null);
        });
      });
    }
    else if (fileop.op == 'img_resize') {
      var img = imagick(filesrc);
      var imgoptions = {};
      if ((fileop.size.length >= 3) && fileop.size[2]) imgoptions = fileop.size[2];
      if (fileop.format) {
        img.setFormat(fileop.format);
        if (_.includes(['jpeg', 'jpg'], fileop.format)) { img.flatten(); }
      }
      img.quality(90);
      if (imgoptions.upsize) {
        img.resize(fileop.size[0], fileop.size[1]);
      }
      else img.resize(fileop.size[0], fileop.size[1], '>');
      if (imgoptions.extend) {
        img.gravity('Center').extent(fileop.size[0], fileop.size[1]);
      }
      img.noProfile().write(filedest, function (err) {
        if (err) return opcallback(err);
        return opcallback(null);
      });
    }
    else return opcallback(null);
  }, function (fileerr) {
    if ((fileerr != null) && ('code' in fileerr) && (fileerr.code == 'ENOENT')) { /* Ignore this error */ }
    else if (fileerr != null) {
      global.log(fileerr);
      return callback(Helper.NewError('Error committing file update.', -35), null);
    }
    return callback(null, rslt);
  });
};

AppSrv.prototype.ProcessFileOperationsDone = function (fileops, callback) {
  async.eachSeries(fileops, function (fileop, opcallback) {
    if ((fileop.op == 'move') || (fileop.op == 'delete_on_complete')) {
      if (fileop.src == '') return opcallback(null);
      HelperFS.unlink(fileop.src, function (err) { opcallback(null); });
    }
    else return opcallback(null);
  }, function (err) { callback(null, null); });
};

AppSrv.prototype.getFieldNames = function (req, fields, perm, fcond) {
  return _.map(AppSrv.prototype.getFields(req, fields, perm, fcond), 'name');
}

AppSrv.prototype.getFields = function (req, fields, perm, fcond) {
  var rslt = [];
  _.each(fields, function (field) {
    if (ejsext.accessField(req, field, perm)) {
      if (('type' in field) && (field.type == 'file')) return;
      if (!('type' in field)) return;
      if(fcond && (!fcond(field))) return;
      rslt.push(field);
    }
  });
  return rslt;
}

AppSrv.prototype.getFieldNamesWithProp = function (fields, prop) {
  return _.map(AppSrv.prototype.getFieldsWithProp(fields, prop), 'name');
}

AppSrv.prototype.getFieldsWithProp = function (fields, prop) {
  var rslt = [];
  _.each(fields, function (field) {
    if ((prop in field) && (field[prop])) {
      if (('type' in field) && (field.type == 'file')) return;
      rslt.push(field);
    }
  });
  return rslt;
}

AppSrv.prototype.getFieldsByName = function (fields, fieldnames) {
  var rslt = [];
  if(!fieldnames) return rslt;
  var fieldnames_missing = fieldnames.slice();
  for(var i=0;i<fields.length;i++){
    var field = fields[i];
    if (_.includes(fieldnames, field.name)){
      rslt.push(field);
      for(var j=0;j<fieldnames_missing.length;j++){
        if(fieldnames_missing[j]==field.name){ 
          fieldnames_missing.splice(j,1);
          j--;
        }
      }
    }
  }
  if(fieldnames_missing.length > 0){ global.log('Fields not found: ' + fieldnames_missing.join(', ')); }
  
  return rslt;
}

AppSrv.prototype.getFieldByName = function (fields, fieldname) {
  for (var i = 0; i < fields.length; i++) {
    if (fields[i].name == fieldname) return fields[i];
  }
  return;
}

AppSrv.prototype.getKeyNames = function (fields) {
  return _.map(AppSrv.prototype.getKeys(fields), 'name');
}

AppSrv.prototype.getKeys = function (fields) {
  return _.filter(fields, function (field) {
    if (field.key) return true;
    return false;
  });
}

AppSrv.prototype.getEncryptedFields = function (req, fields, perm) {
  var rslt = [];
  _.each(fields, function (field) {
    if (('type' in field) && ((field.type == 'encascii') || (field.type == 'hash')) && ejsext.accessField(req, field, perm)) rslt.push(field);
  });
  return rslt;
};

AppSrv.prototype.getFileFieldNames = function (req, fields, perm) {
  var rslt = [];
  _.each(fields, function (field) {
    if (('type' in field) && (field.type == 'file') && ejsext.accessField(req, field, perm)) rslt.push(field.name);
  });
  return rslt;
};

AppSrv.prototype.getDataLockSQL = function (req, fields, sql_ptypes, sql_params, verrors, fPerDataLock, nodatalock, descriptor) {
  if (!('datalock' in req.jshconfig)) return;
  if (!nodatalock) nodatalock = '';
  var arrayOptions = {};
  if(global.jshSettings.case_insensitive_datalocks) arrayOptions.caseInsensitive = true;

  for (datalockid in req.jshconfig.datalock) {
    if ((typeof nodatalock != 'undefined') && (Helper.arrayIndexOf(nodatalock,datalockid,arrayOptions) >= 0)) continue;
    var found_datalock = false;
    datalockval = req.jshconfig.datalock[datalockid](req);
    for (i = 0; i < fields.length; i++) {
      var field = fields[i];
      if ('datalock' in field) {
        var datalockqueryid = Helper.arrayItem(field.datalock,datalockid,arrayOptions);
        if (datalockqueryid) {
          if (!('datalocks' in this.jsh.Config)) throw new Error("No datalocks in config");
          if (!(datalockqueryid in this.jsh.Config.datalocks)) throw new Error("Datalock query '" + datalockqueryid + "' not defined in config");
          var datalockquery = this.jsh.Config.datalocks[datalockqueryid];
          var frslt = fPerDataLock(datalockquery, field);
          if ((typeof frslt !== 'undefined') && (frslt === false)) continue;
          found_datalock = true;
          //Add field to parameters
          if (!(('datalock_' + datalockid) in sql_params)) {
            if (!('datalocktypes' in req.jshconfig)) throw new Error('Missing datalocktypes in config');
            if (!(datalockid in req.jshconfig.datalocktypes)) throw new Error('Missing DataLock type for ' + datalockid);
            var datalocktype = req.jshconfig.datalocktypes[datalockid];
            var dbtype = AppSrv.prototype.getDBType(datalocktype);
            sql_ptypes.push(dbtype);
            sql_params['datalock_' + datalockid] = this.DeformatParam(datalocktype, datalockval, verrors);
          }
        }
      }
      else if (field.key) throw new Error('Missing DataLock for key.');
      else if (('access' in field) && (Helper.access(field.access, 'F'))) throw new Error('Missing DataLock for foreign key ' + field.name);
      else if (('access' in field) && (Helper.access(field.access, 'C'))) throw new Error('Missing DataLock for breadcrumb key ' + field.name);
    }
    //if(!found_datalock){ console.log(fields); } //Use for debugging
    if (!found_datalock) throw new Error('DataLock ' + datalockid + ' not found.' + (descriptor ? ' (' + descriptor + ')' : ''));
  }
};

AppSrv.prototype.getDBType = function (field) {
  var fname = field.name;
  if (!('type' in field)) throw new Error('Key ' + fname + ' must have type.');
  var ftype = field.type;
  var flen = field.length;
  if (ftype == 'bigint') return DB.types.BigInt;
  else if (ftype == 'varchar') {
    if ((typeof flen == 'undefined') || (flen==-1)) flen = DB.types.MAX;
    return DB.types.VarChar(flen);
  }
  else if (ftype == 'char') {
    if ((typeof flen == 'undefined') || (flen==-1)) flen = DB.types.MAX;
    return DB.types.Char(flen);
  }
  else if (ftype == 'datetime') {
    if (typeof flen == 'undefined') throw new Error('Key ' + fname + ' must have length.');
    return DB.types.DateTime(flen);
  }
  else if (ftype == 'time') {
    if (typeof flen == 'undefined') throw new Error('Key ' + fname + ' must have length.');
    return DB.types.Time(flen);
  }
  else if (ftype == 'date') return DB.types.Date;
  else if (ftype == 'decimal') {
    var prec_h = 38;
    var prec_l = 10;
    if ('precision' in field) {
      prec_h = field.precision[0];
      prec_l = field.precision[1];
    }
    return DB.types.Decimal(prec_h, prec_l);
  }
  else if (ftype == 'int') return DB.types.Int;
  else if (ftype == 'smallint') return DB.types.SmallInt;
  else if (ftype == 'bit') return DB.types.Bit;
  else if ((ftype == 'hash') || (ftype == 'encascii')) {
    if (typeof flen == 'undefined') throw new Error('Key ' + fname + ' must have length.');
    return DB.types.VarBinary(flen);
  }
  else throw new Error('Key ' + fname + ' has invalid type.');
}
AppSrv.prototype.exportCSV = function (req, res, dbtasks, modelid) {
  var _this = this;
  var jsh = _this.jsh;
  if (!jsh.hasModel(req, modelid)) throw new Error('Model not found');
  var model = jsh.getModel(req, modelid);
  dbtasks = _.reduce(dbtasks, function (rslt, dbtask, key) { rslt[key] = async.apply(dbtask, undefined); return rslt; }, {});
  _this.db.ExecTasks(dbtasks, function (err, rslt) {
    if (err != null) { _this.AppDBError(req, res, err); return; }
    if (!modelid in rslt) throw new Error('DB result missing model.');
    var eof = false;
    if (_.isArray(rslt[modelid]) && (_.isObject(rslt[modelid][rslt[modelid].length - 1])) && ('_eof' in rslt[modelid][rslt[modelid].length - 1])) {
      var eof = rslt[modelid].pop();
      eof = eof._eof;
    }
    //Add header
    if (rslt[modelid].length > 0) {
      var header = {};
      var frow = rslt[modelid][0];
      for (fcol in frow) {
        var field = _this.getFieldByName(model.fields, fcol);
        if (field && ('caption' in field)) { header[fcol] = field.caption_ext || field.caption; }
        else if (fcol.indexOf('__' + jsh.map.codetxt + '__') == 0) {
          field = _this.getFieldByName(model.fields, fcol.substr(('__' + jsh.map.codetxt + '__').length));
          if (field && ('caption' in field)) { header[fcol] = (field.caption_ext || field.caption || '') + ' Desc'; }
          else header[fcol] = fcol;
        }
        else header[fcol] = fcol;
      }
      rslt[modelid].unshift(header);
      if (!eof) {
        var eofrow = {};
        for (fcol in frow) {
          eofrow[fcol] = '';
        }
        for (fcol in frow) {
          eofrow[fcol] = 'Data exceeded limit of ' + global.export_rowlimit + ' rows, data has been truncated.';
          break;
        }
        rslt[modelid].unshift(eofrow);
      }
      //Escape Dates
      for (var i = 0; i < rslt[modelid].length; i++) {
        var crow = rslt[modelid][i];
        for (ccol in crow) {
          if (_.isDate(crow[ccol])) {
            crow[ccol] = crow[ccol].toISOString();//.replace('T', ' ').replace('Z', '');
          }
        }
      }
    }
    //No results found
    res.writeHead(200, {
      'Content-Type': 'text/csv',
      //'Content-Length': stat.size,
      'Content-Disposition': 'attachment; filename = ' + encodeURIComponent(modelid + '.csv')
    });
    csv.stringify(rslt[modelid], { quotedString: true }).pipe(res);
  });
}
AppSrv.prototype.ExecTasks = function (req, res, dbtasks, trans, callback) {
  var _this = this;
  if (_.isEmpty(dbtasks)) { res.end(JSON.stringify({ '_success': 1 })); return; }
  
  //Split off post-processing
  var posttasks = [];
  dbtasks = _.reduce(dbtasks, function (rslt, dbtask, key) {
    if (Helper.endsWith(key, '_POSTPROCESS')) posttasks.push(dbtask);
    else rslt[key] = dbtask;
    return rslt;
  }, {});
  
  var dbfunc = _this.db.ExecTasks;
  if ((typeof trans != 'undefined') && trans) dbfunc = _this.db.ExecTransTasks;
  else dbtasks = _.reduce(dbtasks, function (rslt, dbtask, key) { rslt[key] = async.apply(dbtask, undefined); return rslt; }, {});
  dbfunc.call(_this.db, dbtasks, function (err, rslt) {
    if (err != null) { _this.AppDBError(req, res, err); return; }
    if (rslt == null) rslt = {};
    rslt['_success'] = 1;
    //Handle EOF
    for (var rs in rslt) {
      if (_.isArray(rslt[rs]) && (_.isObject(rslt[rs][rslt[rs].length - 1])) && ('_eof' in rslt[rs][rslt[rs].length - 1])) {
        var eof = rslt[rs].pop();
        rslt['_eof_' + rs] = eof._eof;
      }
    }
    //Run POSTPROCESS tasks
    async.eachSeries(posttasks, function (posttask, postcallback) {
      posttask(postcallback);
    }, function (err) {
      if (err != null) { _this.AppDBError(req, res, err); return; }
      res.send(JSON.stringify(rslt));
      if (typeof callback != 'undefined') callback();
    });
  });
};

module.exports = AppSrv;