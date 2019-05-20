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
var Helper = require('./lib/Helper.js');

function jsHarmonyModuleTransform(module){
  this.module = module;

  this.tables = {};
  this.fields = {};
  this.models = {};
  this.sql = {};

  this.ignore_errors = {
    key: {},
    value: {}
  };
};

jsHarmonyModuleTransform.prototype.Validate = function(){
  var _this = this;

  //Check for conflicts on keys
  var allkeys = {};
  for(var key in _this.sql) allkeys[key] = 'sql';
  for(var key in _this.fields){
    if(!_this.ignore_errors.key[key] && (key in allkeys) && (_this[allkeys[key]][key] != _this.fields[key])){ _this.module.jsh.Log.error('Conflict on key '+key+' between fields and '+allkeys[key]); }
    allkeys[key] = 'fields';
  }
  for(var key in _this.tables){
    if(_this.ignore_errors.key[key]) continue;
    if(!_this.ignore_errors.key[key] && (key in allkeys) && (_this[allkeys[key]][key] != _this.tables[key])){ _this.module.jsh.Log.error('Conflict on key '+key+' between tables and '+allkeys[key]); }
    allkeys[key] = 'table';
  }

  //Check for conflicts on models
  var allvalues = {};
  var allvaluekeys = {};
  _.each(_this.sql, function(val, key){
    if(!_this.ignore_errors.value[val] && (val in allvalues) && (key != allvaluekeys[val])){ _this.module.jsh.Log.error('Conflict on value '+val+' between sql and '+allvalues[val]); }
    allvalues[val] = 'sql';
    allvaluekeys[val] = key; 
  });
  _.each(_this.fields, function(val, key){
    if(!_this.ignore_errors.value[val] && (val in allvalues) && (key != allvaluekeys[val])){ _this.module.jsh.Log.error('Conflict on value '+val+' between fields and '+allvalues[val]); }
    allvalues[val] = 'fields';
    allvaluekeys[val] = key; 
  });
  _.each(_this.tables, function(val, key){
    if(!_this.ignore_errors.value[val] && (val in allvalues) && (key != allvaluekeys[val])){ _this.module.jsh.Log.error('Conflict on value '+val+' between tables and '+allvalues[val]); }
    allvalues[val] = 'tables'; 
    allvaluekeys[val] = key;
  });
}

jsHarmonyModuleTransform.prototype.Add = function(transform){
  var _this = this;
  if(!transform) return;
  _.each(['tables','fields','models','sql'], function(elem){
    if(transform[elem]){
      for(var prop in transform[elem]){
        if(!(prop in _this[elem])) _this.module.jsh.Log.error('Error adding ' + _this.module.name + ' transform: Invalid ' + elem + ' property: '+prop);
        else _this[elem][prop] = transform[elem][prop];
      }
    }
  });
  if(transform.ignore_errors){
    _this.ignore_errors.key = _.extend(_this.ignore_errors.key, transform.ignore_errors.key);
    _this.ignore_errors.value = _.extend(_this.ignore_errors.value, transform.ignore_errors.value);
  }
}

jsHarmonyModuleTransform.prototype.Apply = function(){
  var _this = this;
  var jsh = _this.module.jsh;
  //For each database
  _.each(jsh.DB, function(db, dbid){
    var sqlext = db.SQLExt;
    if(sqlext.Scripts[_this.module.name]){
      //Apply transforms to each SQL Script
      var traverse = function(obj, desc, f){
        for(var elem in obj){
          if(_.isString(obj[elem])) obj[elem] = f(obj[elem], desc + '.' + elem);
          else traverse(obj[elem], desc + '.' + elem, f);
        }
      };
      traverse(sqlext.Scripts[_this.module.name], _this.module.name + '.SQL.Scripts', function(txt, desc){ return _this.ApplyTransform(txt, desc); });
    }
    //Apply transforms to each SQL Func
    var funcs = _.keys(sqlext.Funcs);
    _.each(funcs, function(funcName){
      var func_desc =  _this.module.name + '.SQL.Funcs' + '.' + funcName;
      var funcSource = sqlext.Funcs[funcName].source;
      if(sqlext.Meta.FuncSource[funcName] == _this.module.name){
        var newFuncName = _this.ApplyTransform(funcName, func_desc);
        if(newFuncName != funcName){
          sqlext.Funcs[newFuncName] = sqlext.Funcs[funcName];
          sqlext.Meta.FuncSource[newFuncName] = _this.module.name;
          delete sqlext.Funcs[funcName];
          delete sqlext.Meta.FuncSource[funcName];
          funcName = newFuncName;
        }
        if(_.isString(sqlext.Funcs[funcName])) sqlext.Funcs[funcName] = _this.ApplyTransform(sqlext.Funcs[funcName], func_desc);
        else {
          var func = sqlext.Funcs[funcName];
          if(func.params){
            for(var i=0; i<func.params.length; i++) func.params[i] = _this.ApplyTransform(func.params[i], func_desc);
          }
          if(func.exec) func.exec = _this.ApplyTransform(func.exec, func_desc);
          if(func.sql) func.sql = _this.ApplyTransform(func.sql, func_desc);
        }
      }
    });
  });
  //For each SQL Func
}

jsHarmonyModuleTransform.prototype.ApplyTransform = function(txt, desc){
  var _this = this;
  if(!txt) return txt;
  txt = txt.toString().replace(/{([\w@-]*)}/gm, function(match, p1, offset){
    if(p1 == 'schema') return _this.module.schema;
    else if(p1 in _this.sql) return _this.sql[p1];
    else if(p1 in _this.fields) return _this.fields[p1];
    else if(p1 in _this.tables) return _this.tables[p1];
    return match;
  });
  return txt;
}

exports = module.exports = jsHarmonyModuleTransform;