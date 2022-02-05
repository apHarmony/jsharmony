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
var async = require('async');
var crypto = require('crypto');
var moment = require('moment');

module.exports = exports = {};

exports.ExecDBFunc = function (dbfunc, context, sql, ptypes, params, callback, dbconfig, db) {
  var _this = this;
  if(!db) db = _this.jsh.getDB('default');
  db.ExecTasks([function (cb) {
    dbfunc.call(db, context, sql, ptypes, params, undefined, function (err, rslt, stats) { cb(err, rslt, stats); }, dbconfig);
  }], callback);
};

exports.ExecRecordset = function (context, sql, ptypes, params, callback, dbconfig, db) {
  if(!db) db = this.jsh.getDB('default');
  this.ExecDBFunc(db.Recordset, context, sql, ptypes, params, callback, dbconfig, db);
};

exports.ExecMultiRecordset = function (context, sql, ptypes, params, callback, dbconfig, db) {
  if(!db) db = this.jsh.getDB('default');
  this.ExecDBFunc(db.MultiRecordset, context, sql, ptypes, params, callback, dbconfig, db);
};

exports.ExecRow = function (context, sql, ptypes, params, callback, dbconfig, db) {
  if(!db) db = this.jsh.getDB('default');
  this.ExecDBFunc(db.Row, context, sql, ptypes, params, callback, dbconfig, db);
};

exports.ExecCommand = function (context, sql, ptypes, params, callback, dbconfig, db) {
  if(!db) db = this.jsh.getDB('default');
  this.ExecDBFunc(db.Command, context, sql, ptypes, params, callback, dbconfig, db);
};

exports.ExecScalar = function (context, sql, ptypes, params, callback, dbconfig, db) {
  if(!db) db = this.jsh.getDB('default');
  this.ExecDBFunc(db.Scalar, context, sql, ptypes, params, callback, dbconfig, db);
};

exports.GetDBErrorMessage = function(dberrors, errmsg){
  if(!dberrors) return null;
  errmsg = (errmsg||'').toString().toLowerCase();
  for (var i = 0; i < dberrors.length; i++) {
    var dberr = dberrors[i];
    var erex = dberr[0].toString().toLowerCase();
    var etxt = dberr[1];
    if (erex.indexOf('/') == 0) {
      erex = erex.substr(1, erex.length - 2);
      if (errmsg.match(new RegExp(erex))) { return etxt; }
    }
    else if (errmsg.indexOf(erex) >= 0) { return etxt; }
  }
  return null;
};

exports.AppDBError = function (req, res, err, stats, errorHandler) {
  if(err.stats) stats = err.stats;
  if(!errorHandler) errorHandler = function(num, txt, stats){ return Helper.GenError(req, res, num, txt, { stats: stats }); };
  if ('model' in err) {
    var model = err.model;
    if ('dberrors' in model) {
      var dberrormsg = exports.GetDBErrorMessage(model.dberrors, err.message);
      if(dberrormsg !== null) { return errorHandler(-9, dberrormsg, stats); }
    }
  }
  //Not necessary because sql is printed out in node debug in log below
  //if ('sql' in err) { if (this.jsh.Config.debug_params.appsrv_logsql) err.message += ' SQL: ' + err.sql; }
  if ((err.message) && (err.message == 'INVALID ACCESS')) return errorHandler(-12, 'Invalid DataLock Access', stats);
  if(err.message){
    if(err.message.indexOf('Application Error - ') == 0) return errorHandler(-5, err.message, stats);
    if(err.message.indexOf('Application Warning - ') == 0) return errorHandler(-5, err.message, stats);
    if(err.message.indexOf('Execute Form - ') == 0) return errorHandler(-5, err.message, stats);
  }
  if(('number' in err) && err.frontend_visible) return errorHandler(err.number, err.message, stats);
  //if ('number' in err) return errorHandler(err.number, err.message);  //This would prevent show_system_errors from functioning
  return errorHandler(-99999, err.message, stats);
};

exports.DeformatParam = function (field, val, verrors) {
  function add_verror(verrors, err) {
    if (!('' in verrors)) verrors[''] = [];
    verrors[''].push(err);
  }
  if ((field.type == 'date') || (field.type == 'datetime')) {
    return (function(){
      if (val === '') return null;
      if (val === null) return null;
      var dtstmp = Date.parse(val);
      if (isNaN(dtstmp)) { add_verror(verrors, field.name + ': Invalid Date'); return ''; }
      
      //Get time in original timezone
      var has_timezone = false;
      if (/Z|[+\-][0-9]+:[0-9]+$/.test(val)) has_timezone = true; // eslint-disable-line no-useless-escape
      var mtstmp = null;
      if (has_timezone) mtstmp = moment.parseZone(val);
      else mtstmp = moment(Helper.ParseDate(val));

      if (!mtstmp.isValid()) { add_verror(verrors, field.name + ': Invalid Date'); return ''; }
      if (mtstmp.year()>9999) { add_verror(verrors, field.name + ': Invalid Date'); return ''; }
      if (mtstmp.year()<1753) { add_verror(verrors, field.name + ': Invalid Date'); return ''; }
      
      //Remove timezone, unless we need to preserve it
      var dtrslt = null;
      if(field.type=='date'){
        dtrslt = moment(mtstmp.format('YYYY-MM-DDTHH:mm:ss.SSS')).toDate();
      }
      else if(field.type=='datetime'){
        if(field.datatype_config.preserve_timezone){
          //If no timezone specified, set to UTC
          if(!has_timezone) mtstmp = moment.parseZone(mtstmp.format('YYYY-MM-DDTHH:mm:ss.SSS')+'Z');
          dtrslt = mtstmp.toDate();
          dtrslt.jsh_utcOffset = -1*mtstmp.utcOffset();
        }
        else dtrslt = moment(mtstmp.format('YYYY-MM-DDTHH:mm:ss.SSS')).toDate();
        //Get microseconds
        if(val){
          var re_micros_date = /:\d\d\.\d\d\d(\d+)/.exec(val);
          if(re_micros_date){ dtrslt.jsh_microseconds = parseFloat('0.'+re_micros_date[1]) * 1000; }
        }
      }
      return dtrslt;
      //return mtstmp.format("YYYY-MM-DDTHH:mm:ss.SSS")+'Z';
      //return mtstmp.toDate();
      //return new Date(dtstmp);
    })();
  }
  else if (field.type == 'time') {
    return (function(){
      if (val === '') return null;
      if (val === null) return null;
      var fulldate = false;
      var dtstmp = Date.parse('1970-01-01 ' + val);
      if (isNaN(dtstmp)) { dtstmp = Date.parse(val); fulldate = true; }
      if (isNaN(dtstmp)) { add_verror(verrors, field.name + ': Invalid Time'); return ''; }
      var dt = new Date('1970-01-01');
      
      //Get time in original timezone
      var has_timezone = false;
      if (/Z|[+\-][0-9]+:[0-9]+$/.test(val)) has_timezone = true; // eslint-disable-line no-useless-escape

      var mtstmp = null;
      var prefix = (!fulldate?'1970-01-01 ':'');
      if (has_timezone) mtstmp = moment.parseZone(prefix + val);
      else mtstmp = moment(Helper.ParseDate(prefix + val));

      if(field.datatype_config.preserve_timezone){
        //If no timezone specified, set to UTC
        if(!has_timezone) mtstmp = moment.parseZone(mtstmp.format('YYYY-MM-DDTHH:mm:ss.SSS')+'Z');
        dt = mtstmp.toDate();
        dt.jsh_utcOffset = -1*mtstmp.utcOffset();
      }
      else dt = moment(mtstmp.format('YYYY-MM-DDTHH:mm:ss.SSS')).toDate();

      //Get microseconds
      if(val){
        var re_micros_time = /:\d\d\.\d\d\d(\d+)/.exec(val);
        if(re_micros_time){ dt.jsh_microseconds = parseFloat('0.'+re_micros_time[1]) * 1000; }
      }
      return dt;
    })();
  }
  else if (field.type == 'encascii') {
    //return Helper.stringToASCIIBuffer(val);
    return Buffer.from(val, 'ascii');
  }
  else if (field.type == 'binary') {
    if(!val) return null;
    if(val && (val.toString().substr(0,2).toLowerCase()=='0x')){
      val = val.toString().substr(2);
      if(val.length % 2 == 1) val = val + '0';
      return Buffer.from(val, 'hex');
    }
    return Buffer.from(val, 'ascii');
  }
  else if (field.type == 'boolean') {
    if (val === '') return null;
    if (val === null) return null;
    if (typeof val == 'undefined') return null;
    if (val === false) return false;
    if (val === true) return true;
    var valstr = val.toString().toUpperCase();
    if((valstr==='TRUE')||(valstr==='T')||(valstr==='Y')||(valstr==='YES')||(valstr==='ON')||(valstr==='1')) return true;
    if((valstr==='FALSE')||(valstr==='F')||(valstr==='N')||(valstr==='NO')||(valstr==='OFF')||(valstr==='0')) return false;
    return null;
    /*
    if (!val) return false;
    if (val == '0') return false;
    if (val == 0) return false;
    return true;
    */
  }
  return val;
};

//Static function - jsh parameter required for static call
exports.getSQLParameters = function(sql, fields, jsh){
  if(!jsh) jsh = this.jsh;
  if(!jsh) throw new Error('jsh parameter must be defined');
  if(!jsh.Config.system_settings.automatic_parameters) return [];
  var rslt = [];
  var _this = this;
  //Sort keys descending
  var ivars = [];
  _.each(fields, function(field){
    if(!field.name) return;
    if(!field.type) return;
    if(field.type == 'file') return;
    ivars.push(field.name);
  });
  ivars.sort(function (a, b) { return b.length - a.length; });
  var usql = sql.toUpperCase();
  //Search SQL for missing parameters that are defined as fields
  var sql_terminators = _this.SQL_TERMINATORS;
  for(var i=0;i<ivars.length;i++){
    var ivar = ivars[i];
    //Check if the iparamname is in usql
    var lastidx = null;
    var uivar = '@'+ivar.toUpperCase();
    var foundvar = false;
    while(!foundvar && (lastidx != -1)){
      lastidx = usql.indexOf(uivar,(lastidx===null?0:lastidx+1));
      if(lastidx >= 0){
        var nextchar = '';
        if(usql.length > (lastidx+uivar.length)) nextchar = usql[lastidx+uivar.length];
        if((nextchar==='') || (sql_terminators.indexOf(nextchar)>=0)) foundvar = true;
      }
    }
    if(foundvar){
      //Add missing variable
      rslt.push(ivar);
    }
  }
  return rslt;
};

exports.ApplyAutomaticSQLParameters = function(ivars, sql, sql_ptypes, sql_params, fields){
  if(!ivars) return;
  if(!this.jsh.Config.system_settings.automatic_parameters) return;
  var _this = this;
  //Sort keys descending
  var ikeys = _.keys(ivars);
  ikeys.sort(function (a, b) { return b.length - a.length; });
  var usql = sql.toUpperCase();
  //Search SQL for missing parameters that are in ivars
  var sql_terminators = _this.SQL_TERMINATORS;
  for(var i=0;i<ikeys.length;i++){
    var ivar = ikeys[i];
    if(ivar in sql_params) continue;
    //Check if the iparamname is in usql
    var lastidx = null;
    var uivar = '@'+ivar.toUpperCase();
    var foundvar = false;
    while(!foundvar && (lastidx != -1)){
      lastidx = usql.indexOf(uivar,(lastidx===null?0:lastidx+1));
      if(lastidx >= 0){
        var nextchar = '';
        if(usql.length > (lastidx+uivar.length)) nextchar = usql[lastidx+uivar.length];
        if((nextchar==='') || (sql_terminators.indexOf(nextchar)>=0)) foundvar = true;
      }
    }
    if(foundvar){
      //Add missing variable
      var field = _this.getFieldByName(fields, ivar);
      if(field){
        sql_ptypes.push(_this.getDBType(field));
        sql_params[ivar] = ivars[ivar];
      }
    }
  }
};

exports.ApplyQueryParameters = function(Q, sql, sql_ptypes, sql_params, model){
  if(!Q) return;
  this.ApplyAutomaticSQLParameters(Q, sql, sql_ptypes, sql_params, model.fields);
};

exports.getTransVars = function(transtbl){
  var transvars = {};
  if(transtbl){
    for(var tblid in transtbl){
      if(transtbl[tblid]){
        var tbl = transtbl[tblid];
        if(_.isString(tbl)) continue;
        if (!_.isArray(tbl) || tbl.length < 2) transvars = _.extend(transvars, tbl);
      }
    }
  }
  return transvars;
};

exports.ApplyTransTblEscapedParameters = function(sql_params, transtbl) {
  if (typeof transtbl == 'undefined') return sql_params;
  var transvars = this.getTransVars(transtbl);
  for (var pname in sql_params) {
    if ((sql_params[pname] == '%%%' + pname + '%%%') && (pname in transvars)) {
      sql_params[pname] = transvars[pname];
    }
  }
  return sql_params;
};

exports.ApplyTransTblChainedParameters = function(transtbl, sql, sql_ptypes, sql_params, fields){
  if(!transtbl) return;
  var transvars = this.getTransVars(transtbl);
  for (var sql_param in sql_params) {
    if ((sql_params[sql_param] === null) && (sql_param in transvars)){
      sql_params[sql_param] = transvars[sql_param];
    }
  }
  this.ApplyAutomaticSQLParameters(transtbl, sql, sql_ptypes, sql_params, fields);
};

exports.addSearchTerm = function (req, model, field, search_i, in_search_value, comparison, sql_ptypes, sql_params, verrors, options) {
  var _this = this;
  var db = _this.jsh.getModelDB(req, model.id);
  if(!options) options = {};
  if (!('type' in field)) throw new Error('Search term ' + field.name + ' must have type.');
  var ftype = field.type;
  var pname = 'search_' + search_i + '_' + field.name;
  if ((comparison == 'null') || (comparison == 'notnull')) {
    in_search_value = '';
  }
  else {
    //Validate search parameter
    switch (field.type) {
      case 'boolean':
        break;
      case 'bigint':
      case 'int':
      case 'smallint':
      case 'tinyint':
        if (isNaN(in_search_value)) return '';
        if ((parseFloat(in_search_value)%1) != 0) return '';
        break;
      case 'float':
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
      case 'binary':
        if(in_search_value){
          in_search_value = in_search_value.toString();
          var wild_start = (in_search_value.substr(0,1)=='%');
          if(wild_start) in_search_value = in_search_value.substr(1);
          var wild_end = (in_search_value && (in_search_value.substr(in_search_value.length-1,1)=='%'));
          if(wild_end) in_search_value = in_search_value.substr(0,in_search_value.length - 1);
          if(in_search_value.substr(0,2).toLowerCase()=='0x') in_search_value = in_search_value.substr(2).toUpperCase();
          else if(in_search_value) in_search_value = Helper.str2hex(in_search_value).toUpperCase();
          else in_search_value = '';
          if(wild_start) in_search_value = '%' + in_search_value;
          if(wild_end) in_search_value = in_search_value + '%';
        }
        else in_search_value = null;
        break;
      default: throw new Error('Search type ' + field.name + '/' + ftype + ' not supported.');
    }
  }
  var searchterm = db.sql.getSearchTerm(this.jsh, model, field, pname, in_search_value, comparison);
  if (searchterm) {
    if (!searchterm.dbtype) searchterm.dbtype = _this.getDBType(field);
    //Don't deformat dates
    if ((ftype != 'datetime') && (ftype != 'date') && (ftype != 'time') && (ftype != 'binary')) searchterm.search_value = this.DeformatParam(field, searchterm.search_value, verrors);
    if((searchterm.search_value === null) && ((comparison != 'null') && (comparison != 'notnull'))){
      if(options.search_all) return '';
      else {
        if(!verrors['']) verrors[''] = [];
        verrors[''].push('Invalid search value for ' + field.name + ' (' + ftype + ')');
      }
    }
    sql_ptypes.push(searchterm.dbtype);
    sql_params[pname] = searchterm.search_value;
    if(comparison=='soundslike'){
      sql_ptypes.push(_this.DB.types.VarChar(4));
      sql_params[pname+'_soundex'] = _this.DB.util.Soundex((searchterm.search_value||'').toString());
    }
    return searchterm.sql;
  }
  return '';
};

exports.getDataLockSQL = function (req, model, fields, sql_ptypes, sql_params, verrors, fPerDataLock, nodatalock, descriptor, options) {
  if (!('datalock' in req.jshsite)) return;
  if(!descriptor){
    if(model) descriptor = model.id;
    else descriptor = '';
  }
  descriptor =  (descriptor ? ' (' + descriptor + ')' : '');
  options = _.extend({ skipDataLocks: [] }, options);
  var _this = this;
  if (!nodatalock) nodatalock = '';
  var arrayOptions = {};
  if(this.jsh.Config.system_settings.case_insensitive_datalocks) arrayOptions.caseInsensitive = true;

  for (var datalockid in req.jshsite.datalock) {
    if ((typeof nodatalock != 'undefined') && (Helper.arrayIndexOf(nodatalock,datalockid,arrayOptions) >= 0)) continue;
    if(model && Helper.arrayIndexOf(model.nodatalock,datalockid,arrayOptions) >= 0) continue;
    var found_datalock = false;
    var datalockval = req.jshsite.datalock[datalockid](req);
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if(Helper.arrayIndexOf(options.skipDataLocks,field.name,arrayOptions) >= 0) continue;
      if ('datalock' in field) {
        var datalockqueryid = Helper.arrayItem(field.datalock,datalockid,arrayOptions);
        if (datalockqueryid) {
          if (!('datalocks' in this.jsh.Config)) throw new Error('No datalocks in config');
          if(!(req.jshsite.id in this.jsh.Config.datalocks)) throw new Error("Site '"+req.jshsite.id+"' not defined in datalocks");
          var datalocks = Helper.arrayItem(this.jsh.Config.datalocks[req.jshsite.id],datalockid,arrayOptions);
          if(!datalocks) throw new Error("Datalock '"+datalockid+"' not defined in site datalocks");
          var datalockquery = Helper.arrayItem(datalocks,datalockqueryid,arrayOptions);
          if (!datalockquery) throw new Error("Datalock query '" + datalockqueryid + "' not defined in config for site "+req.jshsite.id+', datalock: '+datalockid);
          var frslt = fPerDataLock(datalockquery, field);
          if ((typeof frslt !== 'undefined') && (frslt === false)) continue;
          found_datalock = true;
          //Add field to parameters
          var datalockparamname = 'datalock_' + datalockid;
          if (!(datalockparamname in sql_params)) {
            if (!('datalocktypes' in req.jshsite)) throw new Error('Missing datalocktypes in config ' + descriptor);
            if (!(datalockid in req.jshsite.datalocktypes)) throw new Error('Missing DataLock type for ' + datalockid + descriptor);
            var datalocktype = req.jshsite.datalocktypes[datalockid];
            var dbtype = _this.getDBType(datalocktype);
            sql_ptypes.push(dbtype);
            sql_params[datalockparamname] = this.DeformatParam(datalocktype, datalockval, verrors);
          }
        }
      }
      else if (field.key) throw new Error('Missing DataLock for key ' + field.name + descriptor);
      else if (('actions' in field) && (Helper.hasAction(field.actions, 'F'))) throw new Error('Missing DataLock for foreign key ' + field.name + descriptor);
      else if (('actions' in field) && (Helper.hasAction(field.actions, 'C'))) throw new Error('Missing DataLock for initial parameter ' + field.name + descriptor);
    }
    //if(!found_datalock){ this.jsh.Log.debug(fields); } //Use for debugging
    if (!found_datalock) throw new Error('No fields with DataLock ' + datalockid + ' found in ' + descriptor);
  }
};

exports.getDBType = function (field) {
  var _this = this;
  var fname = field.name;
  if (!('type' in field)) throw new Error('Field ' + fname + ' must have type.');
  var ftype = field.type;
  var flen = field.length;
  if (ftype == 'bigint') return _this.DB.types.BigInt;
  else if (ftype == 'varchar') {
    if ((typeof flen == 'undefined') || (flen==-1)) flen = _this.DB.types.MAX;
    return _this.DB.types.VarChar(flen);
  }
  else if (ftype == 'char') {
    if ((typeof flen == 'undefined') || (flen==-1)) flen = _this.DB.types.MAX;
    return _this.DB.types.Char(flen);
  }
  else if (ftype == 'datetime') {
    return _this.DB.types.DateTime(field.precision, field.datatype_config.preserve_timezone);
  }
  else if (ftype == 'time') {
    return _this.DB.types.Time(field.precision, field.datatype_config.preserve_timezone);
  }
  else if (ftype == 'date') return _this.DB.types.Date;
  else if (ftype == 'decimal') {
    var prec_h = 38;
    var prec_l = 10;
    if ('precision' in field) {
      prec_h = field.precision[0];
      prec_l = field.precision[1];
    }
    return _this.DB.types.Decimal(prec_h, prec_l);
  }
  else if (ftype == 'float') {
    var prec = 53;
    if ('precision' in field) {
      prec = field.precision;
    }
    return _this.DB.types.Float(prec);
  }
  else if (ftype == 'int') return _this.DB.types.Int;
  else if (ftype == 'smallint') return _this.DB.types.SmallInt;
  else if (ftype == 'tinyint') return _this.DB.types.TinyInt;
  else if (ftype == 'boolean') return _this.DB.types.Boolean;
  else if ((ftype == 'hash') || (ftype == 'encascii')) {
    if (typeof flen == 'undefined') throw new Error('Field ' + fname + ' must have length.');
    return _this.DB.types.VarBinary(flen);
  }
  else if(ftype == 'binary'){
    if ((typeof flen == 'undefined') || (flen==-1)) flen = _this.DB.types.MAX;
    return _this.DB.types.VarBinary(flen);
  }
  else throw new Error('Key ' + fname + ' has invalid type.');
};

exports.TransformDBTasks = function(collection, f){
  return _.transform(collection, function(accumulator, value, key){
    if(!_.isFunction(value)){
      var childarr = exports.TransformDBTasks(value, f, {});
      if(!_.isEmpty(childarr)) accumulator[key] = childarr;
      //else delete accumulator[key]; //Transform does not require this
    }
    else {
      var newf = f(value, key);
      if(typeof newf != 'undefined') accumulator[key] = newf;
      //else delete accumulator[key]; //Transform does not require this
    }
  });
};

exports.ExecTasks = function (req, res, dbtasks, trans, callback, options) {
  options = _.extend({ db: undefined }, options);
  /*
  dbtasks is an array of:
    function(dbtrans, callback, transtbl){ ... }
  */
  var _this = this;
  if (_.isEmpty(dbtasks)) { res.end(JSON.stringify({ '_success': 1, '_stats': {} })); return; }
  
  //Split off post-processing
  var posttasks = [];
  dbtasks = _this.TransformDBTasks(dbtasks, function(dbtask, key){
    if (Helper.endsWith(key, '_POSTPROCESS')) posttasks.push(dbtask);
    else return dbtask;
  });
  var db = options.db || _this.jsh.getDB('default');
  var dbfunc = db.ExecTasks;
  if ((typeof trans != 'undefined') && trans) dbfunc = db.ExecTransTasks;
  else{
    /*
    For db.ExecTasks, dbtasks is converted to an array of:
      dbtask = function(cb, transtbl){ ... }
    dbtrans is set to undefined
    */
    dbtasks = _this.TransformDBTasks(dbtasks, function(dbtask, key){ return async.apply(dbtask, undefined); });
  }
  dbfunc.call(db, dbtasks, function (err, rslt, stats) {
    if (err != null) { _this.AppDBError(req, res, err, stats); return; }
    if (rslt == null) rslt = {};
    rslt['_success'] = 1;
    rslt['_stats'] = Helper.FormatStats(req, stats);
    //Handle EOF
    for (var rs in rslt) {
      if (_.isArray(rslt[rs]) && (_.isObject(rslt[rs][rslt[rs].length - 1])) && ('_eof' in rslt[rs][rslt[rs].length - 1])) {
        var eof = rslt[rs].pop();
        rslt['_eof_' + rs] = eof._eof;
      }
    }
    //Convert buffers to hex strings
    Helper.convertBufferToHexString(rslt);
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

return module.exports;