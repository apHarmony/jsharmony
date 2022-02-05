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

function CodeGen(jsh){
  this.jsh = jsh;
}

CodeGen.prototype = _.extend(CodeGen.prototype, require('./CodeGen.Schema.js'));
CodeGen.prototype = _.extend(CodeGen.prototype, require('./CodeGen.Models.js'));
CodeGen.prototype = _.extend(CodeGen.prototype, require('./CodeGen.SQLObjects.js'));

CodeGen.prototype.resolveType = function(sqlext, field){
  if(!field.type) return field;
  if(!field.datatype_config) field.datatype_config = {};
  if(!field.datatype_config.types) field.datatype_config.types = [];
  field.datatype_config.types.push(field.type);
  if(!sqlext.CustomDataTypes) return field;

  while(field.type in sqlext.CustomDataTypes){
    var curtypename = field.type;
    var curtype = sqlext.CustomDataTypes[curtypename];
    for (var prop in curtype) {
      if(!(prop in field) || (prop=='type')) field[prop] = curtype[prop];
      else if(prop=='datatype_config'){
        for(var subprop in curtype.datatype_config){
          if(!(subprop in field.datatype_config)) field.datatype_config[subprop] = curtype.datatype_config[subprop];
        }
      }
    }
    if(field.type==curtypename) break;
    field.datatype_config.types.push(field.type);
  }
  return field;
};

exports = module.exports = CodeGen;