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

var util = require('./util.js');
var async = require('async');
var types = require('./DB.types.js');

function DB(){
  if (!global.dbconfig || !global.dbconfig._driver){ throw new Error('Database driver (global.dbconfig._driver) not configured'); }
  else this.sql = global.dbconfig._driver.sql;

  this.parseSQL = function (sql) { return sql; };
}

/*
DB.prototype.ProcessParams = function(params){
	return params.splice(0,2);
}*/

DB.prototype.Recordset = function (context, sql){
  this.Exec(context, sql, 'recordset', arguments);
};

DB.prototype.MultiRecordset = function (context, sql){
  this.Exec(context, sql, 'multirecordset', arguments);
};

DB.prototype.Row = function (context, sql){
  this.Exec(context, sql, 'row', arguments);
};

DB.prototype.Command = function (context, sql){
  this.Exec(context, sql, 'command', arguments);
};

DB.prototype.Scalar = function(context,sql){
  this.Exec(context, sql, 'scalar', arguments);
};

DB.prototype.DBError = function(callback,txt){
	var err = new Error(txt);
	if(callback != null) callback(err,null);
	else throw err;
	return err;	
};

//context,sql
//context,sql,callback
//context,sql,ptypes,params
//context,sql,ptypes,params,callback
//context,sql,ptypes,params,dbtrans,callback
//context,sql,ptypes,params,dbtrans,callback,constring
DB.prototype.Exec = function (context, sql, return_type, args){
	if(typeof context == 'undefined'){ return DB.prototype.DBError(callback,"System Error -- Context not defined."); }
	var params = [];
	var ptypes = [];
  var dbtrans = undefined;
  var constring = undefined;
  sql = this.parseSQL(sql);
	//Process Parameters
  var callback = null;
	if(args.length > 3){
    if (args.length >= 6) {
      dbtrans = args[4];
      callback = args[5];
      if (args.length >= 7) constring = args[6];
    }
		else if(args.length == 5) callback = args[4];
		ptypes = args[2];
		params = args[3];
		if(util.Size(params) != ptypes.length){ return DB.prototype.DBError(callback,"System Error -- Query prepare: Number of parameters does not match number of parameter types.  Check if any parameters are listed twice."); }
		//Convert shortcut parameter types to full form
		if(typeof ptypes == 'string' || ptypes instanceof String){		  
			var i = 0;
			var optypes = [];
			for(var p in params){
				var ptype = ptypes[i];
				var pdbtype = null;
				if(ptype == 's') pdbtype = types.VarChar(p.length);
				else if(ptype == 'i') pdbtype = types.BigInt;
				else if(ptype == 'd') pdbtype = types.Decimal(10,4);
				else { return DB.prototype.DBError(callback,'Invalid type ' + ptype); }
				optypes.push(pdbtype);
				i++;
			}
			ptypes = optypes;
		}
	}
	else if(args.length == 3){ 
	  callback = args[2]; 
	}
	if(return_type=='debug'){ return DB.prototype.DBError(sql + ' ' + JSON.stringify(ptypes) + ' ' + JSON.stringify(params)); }
  
  if (global.debug_params && global.debug_params.db_requests && global.log) {
    global.log(sql + ' ' + JSON.stringify(ptypes) + ' ' + JSON.stringify(params));
  }
  
  if(!constring) constring = global.dbconfig;
  constring._driver.Exec(dbtrans, context, return_type, sql, ptypes, params, callback, constring);
};

DB.prototype.ExecTasks = function (dbtasks, callback){
  async.parallelLimit(dbtasks, 3, function (dberr, rslt) {
    callback(dberr, (dberr ? null : rslt));
  });
};

DB.prototype.ExecTransTasks = function (dbtasks, callback, constring){
  if (!constring) constring = global.dbconfig;
  constring._driver.ExecTransTasks(dbtasks, callback, constring);
};

DB.types = types;
DB.util = util;
DB.ParseSQL = util.ParseSQL;
DB.log = function(txt){
  if(global.log) global.log(txt);
  else console.log(txt);
}

exports = module.exports = DB;