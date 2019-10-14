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
var _ = require('lodash');
var async = require('async');
var fs = require('fs');
var path = require('path');
var Helper = require('./lib/Helper.js');
var DB = require('jsharmony-db');
var jsHarmonyCodeGen = require('./lib/CodeGen.js');

module.exports = exports = {};

var _DBDRIVERS = ['pgsql', 'mssql', 'sqlite'];

exports.getDBDrivers = function(){ return _DBDRIVERS; };

//Validate Database Drive and Load SQL Configuration
exports.InitDB = function(dbid, cb){
  var _this = this;
  var dbconfig = this.DBConfig[dbid];
  var dbdriver = dbconfig._driver;
  if(!dbconfig) { this.Log.console_error('*** Fatal error: Database ID '+dbid+' not found'); process.exit(8); }
  if(!dbdriver || !dbdriver.name) { this.Log.console_error('*** Fatal error: Database ID "'+dbid+'" has missing or invalid _driver'); process.exit(8); }
  for(var odbid in this.DBConfig){
    if(odbid==dbid) continue;
    if(this.DBConfig[odbid] && this.DBConfig[odbid]._driver == dbdriver){ this.Log.console_error('*** Fatal error: Database ID "'+dbid+'" shares database driver with Database ID "'+odbid+'"'); process.exit(8); }
  }
  var driverName = dbdriver.name;
  if(dbid=='default'){
    //Set MSSQL and PGSQL drivers to Pooled for default connection
    if(_.includes(['mssql','pgsql'],driverName)){
      if(!dbconfig.options) dbconfig.options = {};
      if(!('pooled' in dbconfig.options)) dbconfig.options.pooled = true;
    }
  }
  if(dbid=='scripts') throw new Error('Invalid database ID - cannot use reserved keyword: scripts');
  if(!(dbid in this.DB)) this.DB[dbid] = new DB(this.DBConfig[dbid], this);
  var db = this.DB[dbid];
  var modeldirs = this.getModelDirs();
  for (let i = 0; i < modeldirs.length; i++) {
    var modeldir = modeldirs[i];
    var module = this.Modules[modeldir.module];
    var fpath = modeldir.path;
    if(modeldir.module=='jsharmony') fpath = path.normalize(modeldir.path + '../');
    var hasSQL = false;
    _.each([
      fpath + 'sql/',
      fpath + 'sql/'+dbid+'/'
    ], function(dir){
      if(fs.existsSync(dir)){
        hasSQL = true;
        _this.LogInit_PERFORMANCE('Loading SQL from '+dir+' '+(Date.now()-_this.Statistics.StartTime));
        _this.LoadSQL(db, dir, driverName, modeldir.module);
      }
    });
  }
  this.AddGlobalSQLParams(db.SQLExt.Funcs, this.map, 'jsh.map.');
  if(cb) return cb();
};

//Add items as global SQL parameters
exports.AddGlobalSQLParams = function(sqlFuncs, items, prefix){
  if(!items) return;
  for(var key in items){
    var fullkey = prefix + key;
    if(fullkey in sqlFuncs) continue;
    sqlFuncs[fullkey] = items[key];
  }
};

exports.LoadSQL = function (db, dir, type, moduleName) {
  var rslt = this.LoadSQLFromFolder(dir, type, moduleName);
  var sqlext = db.SQLExt;
  for(var funcName in rslt.Funcs){
    sqlext.Funcs[funcName] = rslt.Funcs[funcName];
    sqlext.Meta.FuncSource[funcName] = moduleName;
  }
  for(var datatypeid in rslt.CustomDataTypes) sqlext.CustomDataTypes[datatypeid] = rslt.CustomDataTypes[datatypeid];
  sqlext.Scripts = _.merge(sqlext.Scripts, rslt.Scripts);
  sqlext.Objects = _.merge(sqlext.Objects, rslt.Objects);
};

exports.LoadSQLFiles = function(dir, options){
  options = _.extend({ ignoreDirectories: true, filterType: '' },options||{});
  var dbDrivers = this.getDBDrivers();
  if (!fs.existsSync(dir)) return [];
  var d = fs.readdirSync(dir);
  d.sort(function (a, b) {
    var abase = a;
    var bbase = b;
    var a_lastdot = a.lastIndexOf('.');
    var b_lastdot = b.lastIndexOf('.');
    if (a_lastdot > 0) abase = a.substr(0, a_lastdot);
    if (b_lastdot > 0) bbase = b.substr(0, b_lastdot);
    if (abase == bbase) return a > b;
    return abase > bbase;
  });
  var rslt = [];
  for (let i=0; i<d.length; i++) {
    var fname = dir + d[i];
    var fstat = fs.lstatSync(fname);
    var fobj = {
      name: d[i],
      path: fname,
      type: (fstat.isDirectory()?'folder':'file')
    };
    
    //Ignore directories
    if(fstat.isDirectory()){
      if(options.ignoreDirectories){
        continue;
      }
      else {
        if (options.filterType && (fname!=options.filterType)) {
          let found_other_dbtype = false;
          _.each(dbDrivers, function (dbtype) { if (fname==dbtype) found_other_dbtype = true; });
          if (found_other_dbtype){
            continue;
          }
        }
      }
    }

    if (options.filterType && (fname.indexOf('.' + options.filterType + '.') < 0)) {
      let found_other_dbtype = false;
      _.each(dbDrivers, function (dbtype) { if (fname.indexOf('.' + dbtype + '.') >= 0) found_other_dbtype = true; });
      if (found_other_dbtype){
        continue;
      }
    }

    rslt.push(fobj);
  }
  return rslt;
};

exports.LoadSQLObjects = function(dir, module, options){
  var _this = this;
  options = _.extend({ dbtype: null }, options);

  var rslt = [];

  if (!fs.existsSync(dir)) return [];
  var d = fs.readdirSync(dir);
  
  //Process files
  for(let i=0;i<d.length;i++){
    var fname = d[i];
    var fpath = path.join(dir, fname);
    var fstat = fs.lstatSync(fpath);
    var fobj = {
      name: d[i],
      path: fpath,
      type: (fstat.isDirectory()?'folder':'file')
    };

    if(fobj.type=='file'){
      if (fname.indexOf('.json', fname.length - 5) == -1) continue;
      var objname = fname.replace('.json', '');
      _this.LogInit_INFO('Loading ' + objname);
      var obj = _this.ParseJSON(fpath, module.name, 'SQL Object ' + objname);
      if(!('type' in obj)){
        _.each(obj, function (subobj, subobjname) {
          _this.LogInit_INFO('Loading sub-object ' + subobjname);
          rslt.push(_this.ParseSQLObject(module, subobjname, subobj, fpath));
        });
      }
      else rslt.push(_this.ParseSQLObject(module, objname, obj, fpath));
    }
    else if(fobj.type=='folder'){
      if(fname == 'data_files') continue;
      rslt = rslt.concat(_this.LoadSQLObjects(fpath, module, options));
    }
  }

  return rslt;
}

exports.ParseSQLObject = function(module, objname, obj, fpath){
  var _this = this;
  if(!('name' in obj)) obj.name = objname;
  obj.path = fpath;
  if(obj.name.indexOf('.')<0){
    if(module.schema) obj.name = module.schema + '.' + obj.name;
  }

  if(obj.type=='table'){
    obj._foreignkeys = {};
    if(obj.columns) _.each(obj.columns, function(column){
      column.name = column.name||'';
      if(!column.name) _this.LogInit_ERROR('Database object ' + objname + ' has column missing "name" property');
      if(!('null' in column)) column.null = true;
      if(column.foreignkey){
        var tbls = _.keys(column.foreignkey);
        if(tbls.length == 0) delete column.foreignkey;
        if(tbls.length > 1) _this.LogInit_ERROR('Database object ' + objname + ' > Column '+column.name+' cannot have multiple foreign keys');
        if(module.schema){
          if(tbls[0].indexOf('.')<0){
            column.foreignkey[module.schema + '.' + tbls[0]] = column.foreignkey[tbls[0]];
            delete column.foreignkey[tbls[0]];
          }
        }
        if(obj.type=='table'){
          for(var tbl in column.foreignkey){
            if(!(tbl in obj._foreignkeys)) obj._foreignkeys[tbl] = [];
            obj._foreignkeys[tbl].push(column.foreignkey[tbl]);
          }
        }
      }
    });
  }

  if(obj.type=='view'){
    obj._tables = {};
    var tblnames = _.keys(obj.tables);
    _.each(tblnames, function(tblname){
      if(module.schema){
        if(tblname.indexOf('.')<0){
          obj.tables[module.schema + '.' + tblname] = obj.tables[tblname];
          delete obj.tables[tblname];
        }
      }
    });
    for(var tblname in obj.tables){
      obj._tables[tblname] = tblname;
      var tbl = obj.tables[tblname];
      if(tbl.columns) for(var i=0;i<tbl.columns.length;i++){
        var col = tbl.columns[i];
        if(_.isString(col)) tbl.columns[i] = col = { name: col };
      }
    }
  }


  //Validate canonical_sqlobject.json
  return obj;
}

exports.LoadSQLFromFolder = function (dir, type, moduleName, rslt) {

  //Post-process - extract script prefix if in aaa.bbb.sql format
  function processScriptPrefix(node){
    for(let key in node){
      let val = node[key];
      if(_.isString(val)){
        //File has as least two periods
        if(key.indexOf('.',key.indexOf('.')+1)>=0){
          var prefix = key.substr(0,key.indexOf('.'));
          var newkey = key.substr(key.indexOf('.')+1);
          if(prefix && newkey){
            if(!(prefix in node)) node[prefix] = {};
            if(_.isString(node[prefix])) node[prefix] = { prefix: node[prefix] };
            //Move node to element with prefix
            if(!(newkey in node[prefix])) node[prefix][newkey] = '';
            else node[prefix][newkey] += '\r\n';
            node[prefix][newkey] += val;
            if(_.isString(node[key])) delete node[key];
          }
        }
      }
    }
    for(let key in node){
      let val = node[key];
      if(!_.isString(val)) processScriptPrefix(val);
    }
  }

  //-----------------------------------

  if(!rslt) rslt = {};
  if(!rslt.CustomDataTypes) rslt.CustomDataTypes = {};
  if(!rslt.Funcs) rslt.Funcs = {};
  if(!rslt.Scripts) rslt.Scripts = { };
  if(!rslt.Objects) rslt.Objects = { };

  var _this = this;
  
  var d = _this.LoadSQLFiles(dir, { ignoreDirectories: true, filterType: type });  

  //Load Base SQL files
  _this.LogInit_PERFORMANCE('Loading Base SQL Files '+(Date.now()-_this.Statistics.StartTime));
  if(d.length){
    var found_funcs = {};

    for (let i=0; i<d.length; i++) {
      var fpath = d[i].path;

      _this.LogInit_INFO('Loading ' + fpath);
      //Parse text
      var sql = _this.ParseJSON(fpath, moduleName, 'SQL');
      if((path.basename(fpath).toLowerCase() == ('datatypes.'+type+'.json')) ||
         (path.basename(fpath).toLowerCase() == ('datatypes.json'))){
        for (var datatypeid in sql) {
          rslt.CustomDataTypes[datatypeid] = sql[datatypeid];
        }
      }
      else{
        for (var funcName in sql) {
          if (funcName in found_funcs) { _this.LogInit_ERROR('Duplicate SQL ' + funcName + ' in ' + found_funcs[funcName] + ' and ' + fpath); }
          found_funcs[funcName] = fpath;
          var sqlval = sql[funcName];
          if(sqlval && sqlval.params){
            //SQL Function
            if(sqlval.sql) sqlval.sql = Helper.ParseMultiLine(sqlval.sql);
            if(sqlval.exec) sqlval.exec = Helper.ParseMultiLine(sqlval.exec);
          }
          else sqlval = Helper.ParseMultiLine(sqlval);
          rslt.Funcs[funcName] = sqlval;
        }
      }
    }
  }

  //Load SQL Scripts
  _this.LogInit_PERFORMANCE('Loading SQL Scripts '+(Date.now()-_this.Statistics.StartTime));
  var scriptsdir = dir+'scripts/';
  d = _this.LoadSQLFiles(scriptsdir, { ignoreDirectories: false, filterType: type });
  if(moduleName && (d.length > 0)){
    var module = _this.Modules[moduleName];
    var scripts = {};

    //Process folders
    for(let i=0;i<d.length;i++){
      if(d[i].type=='folder'){
        var subdname = d[i].name;
        var subd1 = _this.LoadSQLFiles(scriptsdir+subdname+'/', { ignoreDirectories: true, filterType: type });
        var subd2 = _this.LoadSQLFiles(scriptsdir+subdname+'/'+type+'/', { ignoreDirectories: true, filterType: type });
        var subd = subd1.concat(subd2);
        scripts[subdname] = {};
        for(var j=0;j<subd.length;j++){
          var fname = subd[j].name;
          if(!(fname in subd[j])) scripts[subdname][fname] = '';
          else scripts[subdname][fname] += '\r\n';
          scripts[subdname][fname] += fs.readFileSync(subd[j].path, 'utf8');
        }
      }
    }

    //Process files
    for(let i=0;i<d.length;i++){
      if(d[i].type=='file'){
        scripts[d[i].name] = fs.readFileSync(d[i].path, 'utf8');
      }
    }

    processScriptPrefix(scripts);

    rslt.Scripts[moduleName] = scripts;
  }

  //Load SQL Objects
  _this.LogInit_PERFORMANCE('Loading SQL Objects '+(Date.now()-_this.Statistics.StartTime));
  if(moduleName){
    var module = _this.Modules[moduleName];
    var objectsdir = dir+'objects/';
    rslt.Objects[moduleName] = _this.LoadSQLObjects(objectsdir, module, { dbtype: type });
    if(rslt.Objects[moduleName].length){
      var objScripts = {
        'init': {
          'init': { '00_SQLOBJECT': 'object:init' },
        },
        'init_data': {
          'init': { '00_SQLOBJECT': 'object:init_data' },
        },
        'restructure': {
          'drop': { '00_SQLOBJECT': 'object:restructure_drop' },
          'init': { '00_SQLOBJECT': 'object:restructure_init' },
        },
        'sample_data': { '00_SQLOBJECT': 'object:sample_data' },
        'drop': { '00_SQLOBJECT': 'object:drop' },
      }
      if(!rslt.Scripts[moduleName]) rslt.Scripts[moduleName] = {};
      rslt.Scripts[moduleName] = _.merge(rslt.Scripts[moduleName], objScripts);
    }
  }

  return rslt;
};

exports.LoadDBSchemas = function(cb){

  function hasForeignKey(list, fkey){
    for(let i=0;i<list.length;i++){
      let elem = list[i];
      if(elem.schema_name!=fkey.schema_name) return false;
      if(elem.table_name!=fkey.table_name) return false;
      if(elem.column_name!=fkey.column_name) return false;
      return true;
    }
    return false;
  }

  function getCODE(dbtype, schema_name, table_name){
    let code_types = ['code2','code'];
    if(map.code_app != map.code) code_types.unshift('code_app');
    if(map.code_sys != map.code) code_types.unshift('code_sys');
    if(map.code2_app != map.code2) code_types.unshift('code2_app');
    if(map.code2_sys != map.code2) code_types.unshift('code2_sys');
    for(let i=0;i<code_types.length;i++){
      let code_type = code_types[i];
      if(table_name.indexOf(map[code_type]+'_')==0){
        let code_name = table_name.substr(map[code_type].length+1);
        return {
          code_type: code_type,
          code_name: code_name,
          code_schema: schema_name
        };
      }
      //SQLite additionally has optional schema prefix
      if(dbtype=='sqlite'){
        if(table_name.indexOf('_'+map[code_type]+'_')>=0){
          let code_name = table_name.substr(table_name.indexOf('_'+map[code_type]+'_')+map[code_type].length+2);
          let code_schema = table_name.substr(0,table_name.indexOf('_'+map[code_type]+'_'));
          return {
            code_type: code_type,
            code_name: code_name,
            code_schema: code_schema
          };
        }
      }
    }
    return undefined;
  }

  let _this = this;
  let map = _this.Config.field_mapping;
  //Load Database Schemas
  let codegen = new jsHarmonyCodeGen(_this);
  if(!_this.Config.system_settings.automatic_schema) return cb();
  async.eachOf(_this.DBConfig, function(dbConfig, dbid, db_cb){
    var wasSilent = _this.DB[dbid].isSilent();
    if(!wasSilent) _this.DB[dbid].setSilent(true);

    codegen.getSchema({ db: dbid }, function(err, rslt){
      if(!wasSilent) _this.DB[dbid].setSilent(false);

      if(err) return db_cb(err);
      if(!rslt) return db_cb();

      let db = _this.DB[dbid];
      if(!db) return db_cb();

      let defaultSchema = db.getDefaultSchema();

      //Handle rslt
      let table_schemas = {};
      let tables = {};
      let field_idx = 0;
      let lovs = {
        code: {},
        code2: {},
        code_sys: {},
        code2_sys: {},
        code_app: {},
        code2_app: {}
      };
      //Process fields
      for(let i=0;i<rslt.tables.length;i++){
        let table = rslt.tables[i];
        let table_schema = (table.schema||'').toLowerCase();
        let table_name = (table.name||'').toLowerCase();
        let full_table_name = table_schema + '.' + table_name;
        if(!(table_name in table_schemas)) table_schemas[table_name] = [];
        table_schemas[table_name].push(table_schema);
        table.fields = {};
        //Add table to LOVs, if applicable
        let code = getCODE(dbConfig._driver.name, table_schema, table_name);
        if(code){
          lovs[code.code_type][full_table_name] = 1;
          if(!lovs[code.code_type][code.code_name]) lovs[code.code_type][code.code_name] = [];
          lovs[code.code_type][code.code_name].push({ schema: table_schema, table: table_name, full_table_name: full_table_name });
        }
        //Add fields to array
        for(;field_idx<rslt.fields.length;field_idx++){
          let field = rslt.fields[field_idx];
          let coldef = field.coldef;
          let field_name = field.name.toLowerCase();
          let field_schema_name = (coldef.schema_name||'').toLowerCase();
          let field_table_name = (coldef.table_name||'').toLowerCase();
          if((field_schema_name==table_schema) && (field_table_name==table_name)){
            table.fields[field_name] = field;
          }
          else break;
        }
        tables[full_table_name] = table;
      }
      if(rslt.fields.length > field_idx) _this.Log.error('Error reading database schema - column not matched to table: '+JSON.stringify(rslt.fields[field_idx]));


      //Sort LOVs to put default schema first
      _.map(['code','code2','code_sys','code_app','code2_sys','code2_app'],function(code_type){
        for(let field_name in lovs[code_type]){
          let field_lovs = lovs[code_type][field_name];
          if(field_lovs.length >= 1){
            field_lovs.sort(function(a,b){
              if(a.schema==defaultSchema) return -1;
              if(b.schema==defaultSchema) return 1;
              if(a.schema>b.schema) return 1;
              if(a.schema==b.schema) return 0;
              if(a.schema<b.schema) return -1;
            });
          }
        }
      });

      //Index foreign keys by table name and column name
      let foreignkeys = {
        tables: {},
        fields: {}
      };
      for(let i=0;i<rslt.foreignkeys.length;i++){
        let foreignkey = rslt.foreignkeys[i];
        if(foreignkey.from){
          if(foreignkey.from.schema_name) foreignkey.from.schema_name = foreignkey.from.schema_name.toLowerCase();
          if(foreignkey.from.table_name) foreignkey.from.table_name = foreignkey.from.table_name.toLowerCase();
          if(foreignkey.from.column_name) foreignkey.from.column_name = foreignkey.from.column_name.toLowerCase();
        }
        if(foreignkey.to){
          if(foreignkey.to.schema_name) foreignkey.to.schema_name = foreignkey.to.schema_name.toLowerCase();
          if(foreignkey.to.table_name) foreignkey.to.table_name = foreignkey.to.table_name.toLowerCase();
          if(foreignkey.to.column_name) foreignkey.to.column_name = foreignkey.to.column_name.toLowerCase();
        }
        let table_schema = (foreignkey.from.schema_name||'').toLowerCase();
        let table_name = (foreignkey.from.table_name||'').toLowerCase();
        let full_table_name = table_schema + '.' + table_name;
        let column_name = (foreignkey.from.column_name||'').toLowerCase();

        let code = getCODE(dbConfig._driver.name, foreignkey.to.schema_name, foreignkey.to.table_name);
        if(code){
          foreignkey.to.code_type = code.code_type;
          foreignkey.to.code_name = code.code_name;
          foreignkey.to.code_schema = code.code_schema;
          if((code.code_type=='code2_sys')||(code.code_type=='code2_app')||(code.code_type=='code2')){
            //If this is the child column
            if(foreignkey.to.column_name==map.code_val2){
              //Find the parent column
              let prevKey = ((i>0) ? rslt.foreignkeys[i-1] : null);
              let nextKey = (rslt.foreignkeys.length > (i+1) ? rslt.foreignkeys[i+1]: null);
              let parentKey = null;
              if(prevKey && (prevKey.id==foreignkey.id)) parentKey = prevKey;
              else if(nextKey && (nextKey.id==foreignkey.id)) parentKey = nextKey;
              if(parentKey && (parentKey.to.column_name.toLowerCase()==map.code_val1)){
                foreignkey.to.code_parent = parentKey.from.column_name.toLowerCase();
              }
            }
          }
        }

        if(!(full_table_name in foreignkeys.tables)) foreignkeys.tables[full_table_name] = {};
        if(!(column_name in foreignkeys.tables[full_table_name])) foreignkeys.tables[full_table_name][column_name] = [];
        if(!hasForeignKey(foreignkeys.tables[full_table_name][column_name],foreignkey.to)){
          foreignkeys.tables[full_table_name][column_name].push(foreignkey.to);
        }

        if(!(column_name in foreignkeys.fields)) foreignkeys.fields[column_name] = [];
        if(!hasForeignKey(foreignkeys.fields[column_name],foreignkey.to)){
          foreignkeys.fields[column_name].push(foreignkey.to);
        }
      }

      //Process foreign keys
      for(let full_table_name in tables){
        let table = tables[full_table_name];
        for(let field_name in table.fields){
          let field = table.fields[field_name];
          field.foreignkeys = {
            direct: [],
            indirect: [],
            lov: []
          };
          //Check foreign keys by table
          if(foreignkeys.tables[full_table_name] && foreignkeys.tables[full_table_name][field_name]){
            field.foreignkeys.direct = foreignkeys.tables[full_table_name][field_name];
          }

          //Check foreign keys by column name
          if(foreignkeys.fields[field_name]){
            field.foreignkeys.indirect = foreignkeys.fields[field_name];
          }

          //Check LOV by column name
          _.map(['code','code_sys','code_app'],function(code_type){
            if(lovs[code_type][field_name]){
              _.each(lovs[code_type][field_name], function(lov){
                let code = getCODE(dbConfig._driver.name, lov.schema, lov.table);
                field.foreignkeys.lov.push({ 
                  code_type: code_type,
                  code_name: field_name,
                  code_schema: code.code_schema,
                  schema_name: lov.schema,
                  table_name: lov.table, 
                  column_name: map.code_val,
                });
              });
            }
          });
        }
      }

      db.schema_definition = {
        tables: tables,
        table_schemas: table_schemas
      };

      return db_cb();
    });
  }, function(err){
    if(err){
      if(!_this.Config.silentStart) _this.Log.error(err);
    }
    return cb();
  });
};