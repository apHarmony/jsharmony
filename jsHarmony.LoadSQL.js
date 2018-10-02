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
var fs = require('fs');
var path = require('path');
var Helper = require('./lib/Helper.js');
var DB = require('jsharmony-db');

module.exports = exports = {};

var _DBDRIVERS = ['pgsql', 'mssql', 'sqlite'];

exports.getDBDrivers = function(){ return _DBDRIVERS; }

//Validate Database Drive and Load SQL Configuration
exports.InitDB = function(dbid, cb){
  var dbconfig = this.DBConfig[dbid];
  var dbdriver = dbconfig._driver;
  if(!dbconfig) { console.error("*** Fatal error: Database ID "+dbid+" not found"); process.exit(8); }
  if(!dbdriver || !dbdriver.name) { console.error("*** Fatal error: Database ID "+dbid+" has missing or invalid _driver"); process.exit(8); }
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
  for (var i = 0; i < modeldirs.length; i++) {
    var modeldir = modeldirs[i];
    var fpath = modeldir.path;
    if(modeldir.component=='jsharmony') fpath = modeldir.path + '../';
    this.LoadSQL(db, fpath + 'sql/', driverName, modeldir.component);
    this.LoadSQL(db, fpath + 'sql/'+dbid+'/', driverName, modeldir.component);
  }
  this.AddGlobalSQLParams(db.SQLExt.Funcs, this.map, 'jsh.map.');
  if(cb) return cb();
}

//Add items as global SQL parameters
exports.AddGlobalSQLParams = function(sqlFuncs, items, prefix){
  if(!items) return;
  for(var key in items){
    var fullkey = prefix + key;
    if(fullkey in sqlFuncs) continue;
    sqlFuncs[fullkey] = items[key];
  }
}

exports.LoadSQL = function (db, dir, type, component) {
  var rslt = this.LoadSQLFromFolder(dir, type, component);
  var sqlext = db.SQLExt;
  for(var funcName in rslt.Funcs) sqlext.Funcs[funcName] = rslt.Funcs[funcName];
  for(var datatypeid in rslt.CustomDataTypes) sqlext.CustomDataTypes[datatypeid] = rslt.CustomDataTypes[datatypeid];
  sqlext.Scripts = _.merge(sqlext.Scripts, rslt.Scripts);
}

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
  for (var i=0; i<d.length; i++) {
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
          var found_other_dbtype = false;
          _.each(dbDrivers, function (dbtype) { if (fname==dbtype) found_other_dbtype = true; });
          if (found_other_dbtype){
            continue;
          }
        }
      }
    }

    if (options.filterType && (fname.indexOf('.' + options.filterType + '.') < 0)) {
      var found_other_dbtype = false;
      _.each(dbDrivers, function (dbtype) { if (fname.indexOf('.' + dbtype + '.') >= 0) found_other_dbtype = true; });
      if (found_other_dbtype){
        continue;
      }
    }

    rslt.push(fobj);
  }
  return rslt;
}

exports.LoadSQLFromFolder = function (dir, type, component, rslt) {
  if(!rslt) rslt = {};
  if(!rslt.CustomDataTypes) rslt.CustomDataTypes = {};
  if(!rslt.Funcs) rslt.Funcs = {};
  if(!rslt.Scripts) rslt.Scripts = { };

  var _this = this;
  
  var d = _this.LoadSQLFiles(dir, { ignoreDirectories: true, filterType: type })  

  //Load Base SQL files
  if(d.length){
    var found_funcs = {};

    for (var i=0; i<d.length; i++) {
      var fpath = d[i].path;

      _this.LogInit_INFO('Loading ' + fpath);
      //Parse text
      var sql = _this.ParseJSON(fpath, "SQL");
      if(path.basename(fpath).toLowerCase() == ('datatypes.'+type+'.json')){
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
  if(component && (d.length > 0)){
    var scripts = {};

    //Process folders
    for(var i=0;i<d.length;i++){
      if(d[i].type=='folder'){
        var subdname = d[i].name;
        var subd1 = _this.LoadSQLFiles(scriptsdir+subdname+'/', { ignoreDirectories: true, filterType: type });
        var subd2 = _this.LoadSQLFiles(scriptsdir+subdname+'/'+type+'/', { ignoreDirectories: true, filterType: type });
        var subd = subd1.concat(subd2);
        scripts[subdname] = {};
        for(var j=0;j<subd.length;j++){
          var fname = subd[j].name;
          if(!(fname in subd[j])) scripts[subdname][fname] = '';
          else scripts[subdname][fname] += "\r\n";
          scripts[subdname][fname] += fs.readFileSync(subd[j].path, 'utf8');
        }
      }
    }

    //Process files
    for(var i=0;i<d.length;i++){
      if(d[i].type=='file'){
        scripts[d[i].name] = fs.readFileSync(d[i].path, 'utf8')
      }
    }

    //Post-process - extract prefix if in aaa.bbb.sql format
    function processScriptPrefix(node){
      for(var key in node){
        var val = node[key];
        if(_.isString(val)){
          //File has as least two periods
          if(key.indexOf(".",key.indexOf(".")+1)>=0){
            var prefix = key.substr(0,key.indexOf("."));
            var newkey = key.substr(key.indexOf(".")+1);
            if(prefix && newkey){
              if(!(prefix in node)) node[prefix] = {};
              if(_.isString(node[prefix])) node[prefix] = { prefix: node[prefix] };
              //Move node to element with prefix
              if(!(newkey in node[prefix])) node[prefix][newkey] = '';
              else node[prefix][newkey] += "\r\n";
              node[prefix][newkey] += val;
              if(_.isString(node[key])) delete node[key];
            }
          }
        }
      }
      for(var key in node){
        var val = node[key];
        if(!_.isString(val)) processScriptPrefix(val);
      }
    }
    processScriptPrefix(scripts);

    rslt.Scripts[component] = scripts;
  }

  return rslt;
}