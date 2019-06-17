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
        _this.LoadSQL(db, dir, driverName, modeldir.module);
      }
    });
    if(hasSQL){
      module.transform.Validate();
      module.transform.Apply();
    }
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

  var _this = this;
  
  var d = _this.LoadSQLFiles(dir, { ignoreDirectories: true, filterType: type });  

  //Load Base SQL files
  if(d.length){
    var found_funcs = {};

    for (let i=0; i<d.length; i++) {
      var fpath = d[i].path;

      _this.LogInit_INFO('Loading ' + fpath);
      //Parse text
      var sql = _this.ParseJSON(fpath, 'SQL');
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
  var scriptsdir = dir+'scripts/';
  d = _this.LoadSQLFiles(scriptsdir, { ignoreDirectories: false, filterType: type });
  if(moduleName && (d.length > 0)){
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
    let codetypes = ['ucod','ucod2','gcod','gcod2'];
    for(let i=0;i<codetypes.length;i++){
      let codetype = codetypes[i];
      if(table_name.indexOf(codetype+'_')==0){
        let codename = table_name.substr(codetype.length+1);
        return {
          codetype: codetype,
          codename: codename,
          codeschema: schema_name
        };
      }
      //SQLite additionally has optional schema prefix
      if(dbtype=='sqlite'){
        if(table_name.indexOf('_'+codetype+'_')>=0){
          let codename = table_name.substr(table_name.indexOf('_'+codetype+'_')+codetype.length+2);
          let codeschema = table_name.substr(0,table_name.indexOf('_'+codetype+'_'));
          return {
            codetype: codetype,
            codename: codename,
            codeschema: codeschema
          };
        }
      }
    }
    return undefined;
  }

  let _this = this;
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
        ucod: {},
        ucod2: {},
        gcod: {},
        gcod2: {}
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
          lovs[code.codetype][full_table_name] = 1;
          if(!lovs[code.codetype][code.codename]) lovs[code.codetype][code.codename] = [];
          lovs[code.codetype][code.codename].push({ schema: table_schema, table: table_name, full_table_name: full_table_name });
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
      _.map(['ucod','gcod','ucod2','gcod2'],function(codetype){
        for(let field_name in lovs[codetype]){
          let field_lovs = lovs[codetype][field_name];
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
          foreignkey.to.codetype = code.codetype;
          foreignkey.to.codename = code.codename;
          foreignkey.to.codeschema = code.codeschema;
          if((code.codetype=='ucod2')||(code.codetype=='gcod2')){
            //If this is the child column
            if(foreignkey.to.column_name=='codeval2'){
              //Find the parent column
              let prevKey = ((i>0) ? rslt.foreignkeys[i-1] : null);
              let nextKey = (rslt.foreignkeys.length > (i+1) ? rslt.foreignkeys[i+1]: null);
              let parentKey = null;
              if(prevKey && (prevKey.id==foreignkey.id)) parentKey = prevKey;
              else if(nextKey && (nextKey.id==foreignkey.id)) parentKey = nextKey;
              if(parentKey && (parentKey.to.column_name.toLowerCase()=='codeval1')){
                foreignkey.to.codeparent = parentKey.from.column_name.toLowerCase();
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
          _.map(['ucod','gcod'],function(codetype){
            if(lovs[codetype][field_name]){
              _.each(lovs[codetype][field_name], function(lov){
                let code = getCODE(dbConfig._driver.name, lov.schema, lov.table);
                field.foreignkeys.lov.push({ 
                  codetype: codetype,
                  codename: field_name,
                  codeschema: code.codeschema,
                  schema_name: lov.schema,
                  table_name: lov.table, 
                  column_name: 'codeval',
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