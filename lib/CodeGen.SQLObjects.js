/*
Copyright 2020 apHarmony

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

var _ = require('lodash');
var async = require('async');
var jshParser = require('./JSParser.js');

module.exports = exports = {};

exports.generateSQLObjects = function(table, options, callback){
  var _this = this;
  
  options = _.extend({ db: 'default', withData: false, maxDataCount: 5000 }, options);
  if(!options.db) options.db = 'default';
  var db = this.jsh.DB[options.db];
  var rslt = {};
  var rsltmessages = [];
  db.meta.getTables(table, {}, function(err, messages, tabledefs){
    if(err) return callback(err);
    if(messages.length > 0) rsltmessages = rsltmessages.concat(messages);
    async.eachSeries(tabledefs, function(tabledef, table_callback){
      db.meta.getTableFields(tabledef, function(err, messages, fields){
        if(err) return table_callback(err);
        if(messages.length > 0) rsltmessages = rsltmessages.concat(messages);
        tabledef.fields = fields;
        tabledef.data = [];
        //SQLObject Name
        var sqlobject_name = tabledef.name;
        async.waterfall([
          //Get foreign key
          function(generate_cb){
            db.meta.getForeignKeys(tabledef, function(err, messages, fields){
              if(err){ err.message = 'schema.getForeignKeys: '+err.message; return generate_cb(err); }
              tabledef.foreignkeys = fields||[];
              return generate_cb(null);
            });
          },
          //Get data
          function(generate_cb){
            if(!options.withData) return generate_cb();
            db.Scalar('','select count(*) from ' + tabledef.name,[],{},function(err,datacnt){
              if(err){ return generate_cb(err); }
              if(datacnt > options.maxDataCount){
                _this.jsh.Log.warning('Warning: Skipping data for table ' + tabledef.name + ', exceeds max rowcount of ' + options.maxDataCount + ', has ' + datacnt + ' rows' );
                return generate_cb(null);
              }
              db.Recordset('','select * from ' + tabledef.name,[],{},function(err,rslt){
                if(err){ return generate_cb(err); }
                tabledef.data = rslt;
                return generate_cb(null);
              });
            });
          },
          //Generate SQL Object
          function(generate_cb){
            _this.generateSQLObjectFromTableDefition(tabledef, { db: options.db, withData: options.withData }, function(err, messages, sqlobject){  
              if(err) return generate_cb(err);
              if(messages.length > 0) rsltmessages = rsltmessages.concat(messages);
              var sqlobjecttxt = '';
              if(sqlobject) sqlobjecttxt = _this.sqlobjectToJSON(sqlobject);
              if(sqlobjecttxt) rslt[sqlobject_name] = sqlobjecttxt;
              return generate_cb(null);
            });
          },
        ], table_callback);
      });
    }, function(err){
      if(err) return callback(err);
      if(table && !_.size(rslt)) return callback(new Error('Table not found: '+(table.schema?(table.schema+'.'):'')+table.name));
      return callback(null, rsltmessages, rslt);
    });
  });
}

exports.generateSQLObjectFromTableDefition = function(tabledef, options, callback){
  var _this = this;
  options = _.extend({ db: 'default', withData: false }, options);
  if(!options.db) options.db = 'default';
  var db = _this.jsh.DB[options.db];
  var messages = [];
  var sqlobject = {};
  sqlobject.type = 'table';
  sqlobject.caption = tabledef.description||tabledef.name;
  sqlobject.table = tabledef.name;
  if(options.db != 'default') sqlobject.db = options.db;
  if(tabledef.schema) sqlobject.table = tabledef.schema + '.' + sqlobject.table;

  var primary_keys = [];
  _.each(tabledef.fields,function(fielddef){
    if(fielddef.coldef.primary_key) primary_keys.push(fielddef.name);
  });

  var allfields = {};
  _.each(tabledef.fields, function(fielddef){ if(fielddef.name) allfields[fielddef.name.toLowerCase()] = 1; });

  sqlobject.columns = [];
  var sqlext = db.getSQLExt();
  _.each(tabledef.fields,function(fielddef){
    var column = { };
    var coldef = fielddef.coldef;
    for(prop in fielddef){ if(prop != 'coldef') column[prop] = fielddef[prop]; }

    //Primary Key
    if(coldef.primary_key) column.key = true;

    for(var i=0;i<tabledef.foreignkeys.length;i++){
      var fkey = tabledef.foreignkeys[i];
      if(fkey.from.column_name==column.name){
        var fkey_tbl = fkey.to.table_name;
        if(fkey.from.schema_name!=fkey.to.schema_name) fkey_tbl = fkey.to.schema_name + '.' + fkey_tbl;
        column.foreignkey = {};
        column.foreignkey[fkey_tbl] = fkey.to.column_name;
      }
    }

    if(coldef.required) column.null = false;

    sqlobject.columns.push(column);
  });

  if(options.withData && tabledef.data && tabledef.data.length){
    sqlobject.init_data = tabledef.data;
  }

  return callback(null, messages, sqlobject);
}

exports.sqlobjectToJSON = function(sqlobject){
  //Format JSON
  var formatter = [{Pre:'',Post:''}];
  for(var prop in sqlobject){
    var proptoken = {S:prop,SPre:"\r\n  ",SPost:"",VPre:" ",VMid:"",VPost:""};
    var splitarrays = ['columns','init_data','sample_data'];
    if(_.includes(splitarrays, prop)){
      proptoken.V = [];
      for(var i=0;i<sqlobject[prop].length;i++){
        var fieldtoken = { I:(i+1), VPre: "\r\n    ",VMid: "",VPost:"", V:[] };
        for(var fprop in sqlobject[prop][i]){
          fieldtoken.V.push({S:fprop,SPre:" ",SPost:"",VPre:"",VMid:"",VPost:""});
        }
        if(fieldtoken.V.length > 0) fieldtoken.V[0].SPre = "";
        proptoken.V.push(fieldtoken);
      }
      if(proptoken.V.length) proptoken.V[proptoken.V.length-1].VPost = "\r\n  ";
    }
    formatter.push(proptoken);
  }
  formatter[formatter.length-1].VPost = "\r\n";

  //Generate Output
  var rslt = jshParser.GenString(sqlobject,formatter);
  return rslt;
}

return module.exports;