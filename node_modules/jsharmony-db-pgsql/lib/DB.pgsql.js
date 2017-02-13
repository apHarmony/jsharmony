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
var types = DB.types;
var pgsql = require('pg');
var pgPool = pgsql.Pool;
var _ = require('lodash');
var async = require('async');
var moment = require('moment');
var pgtypes = pgsql.types;
var pgParseDate = require('postgres-date-utc');

//select * from pg_type
pgtypes.setTypeParser(1700, pgtypes.getTypeParser(700));

var dtParser = function (dt) {
  if (!dt) return dt;
  var mdt = moment(dt);
  if (!mdt.isValid()) return dt;
  return mdt.format("YYYY-MM-DDTHH:mm:ss.SSS");
}
var tmParser = function (tm) {
  if (!tm) return tm;
  var mdt = moment('1970-01-01 ' + tm);
  if (!mdt.isValid()) return tm;
  return mdt.format("1970-01-01THH:mm:ss.SSS");
}
//pgtypes.setTypeParser(20, pgtypes.getTypeParser(21));  Use this to convert bigint to int
pgtypes.setTypeParser(1082, dtParser); //was pgParseDate
pgtypes.setTypeParser(1083, tmParser); //was pgParseDate
pgtypes.setTypeParser(1114, dtParser); //was pgParseDate
pgtypes.setTypeParser(1184, pgParseDate);
pgtypes.setTypeParser(1560, function (val) { if (val && val != '0') return true; return false; }); //Convert bit to boolean

function DBdriver() {
  this.name = 'pgsql';
  this.sql = require('./DB.pgsql.sql.js');
  this.pgpool = null;
}

DBdriver.prototype.Init = function () {
  var _this = this;
  if (!this.pgpool) {
    _this.pgpool = new pgPool(global.dbconfig);
    _this.pgpool.on('error', function (err, client) { DB.log('PostgreSQL Pool Error: ' + err.toString()); });
  }
}

DBdriver.prototype.getDBParam = function (dbtype, val) {
  if (!dbtype) throw new Error('Cannot get dbtype of null object');
  if (val === null) return 'NULL';
  if (typeof val === 'undefined') return 'NULL';
  
  if ((dbtype.name == 'VarChar') || (dbtype.name == 'Char')) {
    var valstr = val.toString();
    if (dbtype.length == types.MAX) return "'" + escape(valstr) + "'::text";
    return "'" + escape(valstr.substring(0, dbtype.length)) + "'::text";
  }
  else if (dbtype.name == 'VarBinary') {
    var valbin = null;
    if (val instanceof Buffer) valbin = val;
    else valbin = new Buffer(val.toString());
    if (valbin.legth == 0) return "NULL";
    return "E'\\\\x " + valbin.toString('hex').toUpperCase() + " '";
  }
  else if ((dbtype.name == 'BigInt') || (dbtype.name == 'Int') || (dbtype.name == 'SmallInt')) {
    var valint = parseInt(val);
    if (isNaN(valint)) { return "NULL"; }
    return valint.toString();
  }
  else if (dbtype.name == 'Bit') {
    var valint = parseInt(val);
    if (isNaN(valint)) { return "NULL"; }
    return 'B\'' + ((val == 0)?'0':'1') + '\'';
  }
  else if (dbtype.name == 'Decimal') {
    var valfloat = parseFloat(val);
    if (isNaN(valfloat)) { return "NULL"; }
    return valfloat.toString();
  }
  else if ((dbtype.name == 'Date') || (dbtype.name == 'Time') || (dbtype.name == 'DateTime')) {
    var valdt = null;
    if (val instanceof Date) { valdt = val; }
    else {
      if (isNaN(Date.parse(val))) return "NULL";
      valdt = new Date(val);
    }
    var mdate = moment(valdt);
    if (!mdate.isValid()) return "NULL";
    if (dbtype.name == 'Date') return "'" + mdate.format('YYYY-MM-DD') + "'";
    else if (dbtype.name == 'Time') return "'" + mdate.format('HH:mm:ss.SS') + "'";
    else return "'" + mdate.format('YYYY-MM-DD HH:mm:ss.SSZ') + "'";
  }
  throw new Error('Invalid datetype: ' + JSON.stringify(dbtype));
}

DBdriver.prototype.ExecSession = function (dbtrans, constring, session) {
  var _this = this;
  
  if (dbtrans) {
    session(null, dbtrans.pgclient, '', function () { });
  }
  else {
    if (constring && (constring != global.dbconfig)) {
      var con = new pgsql.Client(constring);
      con.connect(function (err) {
        if (err) { return ExecError(err, session, "DB Connect Error: "); }
        session(null, con, constring._presql || '', function () { con.end(); });
      });
    }
    else {
      _this.Init();
      _this.pgpool.connect(function (err, pgclient, conComplete) {
        if (err) { return ExecError(err, session, "DB Connect Error: "); }
        var presql = '';
        if(global.dbconfig && global.dbconfig._presql) presql = global.dbconfig._presql;
        session(null, pgclient, presql, conComplete);
      });
    }
  }
}

function ExecError(err, callback, errprefix) {
  if (global.debug_params && global.debug_params.db_error_sql_state) DB.log((errprefix || '') + err.toString());
  if (callback) return callback(err, null);
  else throw err;
}

function ExecQuery(pgclient, sql, conComplete, callback, processor) {
  var notices = [];
  var notice_handler = function (msg) { notices.push(msg); };
  pgclient.removeAllListeners('notice');
  pgclient.on('notice', notice_handler);
  pgclient.query(sql, function (err, rslt) {
    pgclient.removeListener('notice', notice_handler);
    conComplete();
    if (err) { return ExecError(err, callback, 'SQL Error: ' + sql + ' :: '); }
    if (notices.length) { return ExecError(notices[0], callback, 'SQL Error: ' + sql + ' :: '); }
    processor(rslt);
  });
}

DBdriver.prototype.Exec = function (dbtrans, context, return_type, sql, ptypes, params, callback, constring) {
  var _this = this;
  
  _this.ExecSession(dbtrans, constring, function (err, pgclient, presql, conComplete) {
    if(err) {
      if (callback != null) callback(err, null);
      else throw err;
      return;
    }
    
    var pgsql = presql + sql;
    
    //Apply ptypes, params to SQL
    var ptypes_ref = {};
    var i = 0;
    for (var p in params) {
      ptypes_ref[p] = ptypes[i];
      i++;
    }
    //Sort params by length
    var param_keys = _.keys(params);
    param_keys.sort(function (a, b) { return b.length - a.length; });
    //Replace params in SQL statement
    for (var i = 0; i < param_keys.length; i++) {
      var p = param_keys[i];
      var val = params[p];
      if (val === '') val = null;
      pgsql = DB.util.ReplaceAll(pgsql, '@' + p, DBdriver.prototype.getDBParam(ptypes_ref[p], val));
    }
    
    //Add context SQL
    pgsql = getContextSQL(context) + pgsql;
    
    //DB.log(pgsql);
    //console.log(params);
    //console.log(ptypes);
    
    //Execute sql    
    ExecQuery(pgclient, pgsql, conComplete, callback, function (rslt) {
      var dbrslt = null;
      
      if (return_type == 'row') { if (rslt.rows && rslt.rows.length) dbrslt = rslt.rows[0]; }
      else if (return_type == 'recordset') dbrslt = rslt.rows;
      else if (return_type == 'multirecordset') {
        //Validate multirecordset requires TABLE separators
        dbrslt = [];
        var curtbl = [];
        if (rslt.rows && rslt.rows.length) {
          if (!('table_boundary' in rslt.rows[0])) return ExecError('MultiRecordset missing table_boundary - First Result must be -----TABLE-----', callback);
          var lastrowsize = -1;
          for (var i = 1; i < rslt.rows.length; i++) {
            var row = rslt.rows[i];
            var currowsize = DB.util.Size(row);
            if (('table_boundary' in row) && (currowsize == 1) && (row.table_boundary == '-----TABLE-----')) { dbrslt.push(curtbl); curtbl = []; lastrowsize = -1; }
            else {
              if ((lastrowsize > 0) && (lastrowsize != currowsize)) return ExecError('MultiRecordset missing table_boundary between result sets', callback);
              lastrowsize = currowsize;
              curtbl.push(row);
            }
          }
          dbrslt.push(curtbl);
        }
      }
      else if (return_type == 'scalar') {
        if (rslt.rows && rslt.rows.length) {
          var row = rslt.rows[0];
          for (var key in row) if (row.hasOwnProperty(key)) dbrslt = row[key];
        }
      }
      if (callback) callback(null, dbrslt);
    });
  });
};

DBdriver.prototype.ExecTransTasks = function (dbtasks, callback, constring) {
  if (!constring) constring = global.dbconfig;
  var _this = this;
  _this.ExecSession(null, constring, function (err, pgclient, presql, conComplete) {
    if(err) return callback(err, null);
    //Begin transaction
    ExecQuery(pgclient, presql + "start transaction", function () { }, callback, function () {
      var transtbl = {};
      var trans = { pgclient: pgclient };
      dbtasks = _.reduce(dbtasks, function (rslt, dbtask, key) {
        rslt[key] = function (callback) {
          var xcallback = function (err, rslt) {
            if (rslt != null) {
              if (!_.isArray(rslt) || rslt.length < 2)
                transtbl = _.extend(transtbl, rslt);
            }
            callback(err, rslt);
          };
          return dbtask.call(null, trans, xcallback, transtbl);
        };
        return rslt;
      }, {});
      async.series(dbtasks, function (dberr, rslt) {
        if (dberr != null) {
          if ((constring.jsharmony_options && (constring.jsharmony_options.stopTransactionAndCommitOnWarning)) && 
              (dberr.severity == 'WARNING')) {
            ExecQuery(pgclient, "commit transaction", conComplete, callback, function () {
              callback(dberr, null);
            });
          }
          else {
            //Rollback transaction
            ExecQuery(pgclient, "rollback transaction", conComplete, callback, function () {
              callback(dberr, null);
            });
          }
        }
        else {
          //Commit transaction
          ExecQuery(pgclient, "commit transaction", conComplete, callback, function () {
            callback(null, rslt);
          });
        }
      });
    });
  });
};

function escape(val) {
  if (val === 0) return val;
  if (val === 0.0) return val;
  if (val === "0") return val;
  if (!val) return '';
  
  if (!isNaN(val)) return val;
  
  val = val.toString();
  if (!val) return '';
  val = val.replace(/[\0\x01\x02\x03\x04\x05\x06\x07\x08\x0b\x0c\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f]/g, '');
  val = val.replace(/'/g, '\'\'');
  val = val.replace(/\\/g, '\\\\');
  //val = val.replace(/"/g, '\\"');
  return val;
}
DBdriver.prototype.escape = escape;

function getContextSQL(context) {
  return "set sessionvars.appuser to '" + escape(context) + "';";
}

exports = module.exports = DBdriver;
