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

module.exports = exports = {};

exports.getSchema = function(options, callback){
  var _this = this;
  options = _.extend({ db: 'default' }, options);
  if(!options.db) options.db = 'default';
  var db = _this.jsh.DB[options.db];
  var rslt = {};
  if(!db.getType() || (db.getType()=='none')) return callback(null, null);
  async.parallel([
    function(cb){
      db.meta.getTables(undefined, { ignore_jsharmony_schema: false }, function(err, messages, tabledefs){
        if(err){ err.message = 'schema.getTables: '+err.message; return cb(null,err); }
        rslt.tables = tabledefs;
        return cb();
      });
    },
    function(cb){
      db.meta.getTableFields(undefined, function(err, messages, fields){
        if(err){ err.message = 'schema.getTableFields: '+err.message; return cb(null,err); }
        rslt.fields = fields;
        return cb();
      });
    },
    function(cb){
      db.meta.getForeignKeys(undefined, function(err, messages, fields){
        if(err){ err.message = 'schema.getForeignKeys: '+err.message; return cb(null,err); }
        rslt.foreignkeys = fields;
        return cb();
      });
    }
  ], function(err,errrslt){
    if(!err){
      for(var i=0;i<errrslt.length;i++){
        if(errrslt[i]){ err = errrslt[i]; break; }
      }
    }
    if(err) return callback(err);
    return callback(null,rslt);
  });
};

return module.exports;