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

  this.tables = this.tables || {};
  this.fields = this.fields || {};
  this.models = this.models || {};
  this.sql = this.sql || {};

  this.mapping = {};
  this.transformCount = 0;
  this.transformTime = 0;

  if(!this.ignore_errors) this.ignore_errors = {};
  if(!this.ignore_errors.key) this.ignore_errors.key = {};
  if(!this.ignore_errors.value) this.ignore_errors.value = {};

  this.updateMapping();
}

jsHarmonyModuleTransform.prototype.hasTransforms = function(){
  if(!_.isEmpty(this.tables)) return true;
  if(!_.isEmpty(this.fields)) return true;
  if(!_.isEmpty(this.models)) return true;
  if(!_.isEmpty(this.sql)) return true;
  return false;
};

jsHarmonyModuleTransform.prototype.Validate = function(){
  var _this = this;
  if(!_this.module.jsh){ if(this.hasTransforms()) throw new Error('Cannot Validate Transforms: jsHarmony Module '+_this.module.name+' missing reference to jsh.'); return; }

  //Check for conflicts on keys
  var allkeys = {};
  for(let key in _this.sql) allkeys[key] = 'sql';
  for(let key in _this.fields){
    if(!_this.ignore_errors.key[key] && (key in allkeys) && (_this[allkeys[key]][key] != _this.fields[key])){ _this.module.jsh.Log.error('Conflict on key '+key+' between fields and '+allkeys[key]); }
    allkeys[key] = 'fields';
  }
  for(let key in _this.tables){
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
};

jsHarmonyModuleTransform.prototype.Add = function(transform, options){
  var _this = this;
  options = _.extend({ force: false }, options);

  if(!transform) return;
  _.each(['tables','fields','models','sql'], function(elem){
    if(transform[elem]){
      for(var prop in transform[elem]){
        if(!options.force && !(prop in _this[elem])){
          var errmsg = 'Error adding ' + (_this.module.name||_this.module.typename) + ' transform: Invalid ' + elem + ' property: '+prop;
          if(_this.module.jsh) _this.module.jsh.Log.error(errmsg);
          else throw new Error(errmsg);
        }
        else _this[elem][prop] = transform[elem][prop];
      }
    }
  });
  if(transform.ignore_errors){
    _this.ignore_errors.key = _.extend(_this.ignore_errors.key, transform.ignore_errors.key);
    _this.ignore_errors.value = _.extend(_this.ignore_errors.value, transform.ignore_errors.value);
  }
  _this.updateMapping();
};

jsHarmonyModuleTransform.prototype.updateMapping = function(){
  var mapping = {};
  var _this = this;
  if(_this.module){
    mapping['{schema}'] = _this.module.schema;
    mapping['{namespace}'] = _this.module.namespace;
  }
  _.each(['tables', 'fields', 'models', 'sql'], function(elem){
    for(var key in _this[elem]){
      if((key in mapping) && (mapping[key] != _this[elem][key])){
        var errmsg = 'Error: Duplicate key '+key+' in '+_this.module.schema+' transform';
        if(_this.module.jsh) _this.module.jsh.Log.error(errmsg);
        else console.log(errmsg); // eslint-disable-line no-console
      }
      mapping[key] = _this[elem][key];
    }
  });
  this.mapping = mapping;
};

jsHarmonyModuleTransform.prototype.Apply = function(txt, desc){
  var _this = this;
  if(!txt) return txt;
  var startTime = Date.now();
  _this.transformCount++;
  _this.mapping['{schema}'] = _this.module.schema;
  _this.mapping['{namespace}'] = _this.module.namespace;
  var rslt = Helper.cubeMapReplace(_this.mapping, txt);
  _this.transformTime += (Date.now() - startTime);
  //console.log(_this.transformCount + ' ' + _this.transformTime + ' ' + desc);
  return rslt;
};

exports = module.exports = jsHarmonyModuleTransform;