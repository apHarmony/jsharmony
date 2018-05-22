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
var ejsext = require('./lib/ejsext.js');

module.exports = exports = {};

exports.getFieldNames = function (req, fields, perm, fcond) {
  return _.map(exports.getFields(req, fields, perm, fcond), 'name');
}

exports.getFields = function (req, fields, perm, fcond) {
  var rslt = [];
  _.each(fields, function (field) {
    if (ejsext.accessField(req, field, perm)) {
      if (('type' in field) && (field.type == 'file')) return;
      if (!('type' in field)) return;
      if(fcond && (!fcond(field))) return;
      rslt.push(field);
    }
  });
  return rslt;
}

exports.getFieldNamesWithProp = function (fields, prop) {
  return _.map(exports.getFieldsWithProp(fields, prop), 'name');
}

exports.getFieldsWithProp = function (fields, prop) {
  var rslt = [];
  _.each(fields, function (field) {
    if ((prop in field) && (field[prop])) {
      if (('type' in field) && (field.type == 'file')) return;
      rslt.push(field);
    }
  });
  return rslt;
}

exports.getFieldsByName = function (fields, fieldnames) {
  var rslt = [];
  if(!fieldnames) return rslt;
  var fieldnames_missing = fieldnames.slice();
  for(var i=0;i<fields.length;i++){
    var field = fields[i];
    if (_.includes(fieldnames, field.name)){
      rslt.push(field);
      for(var j=0;j<fieldnames_missing.length;j++){
        if(fieldnames_missing[j]==field.name){ 
          fieldnames_missing.splice(j,1);
          j--;
        }
      }
    }
  }
  if(fieldnames_missing.length > 0){ global.log('Fields not found: ' + fieldnames_missing.join(', ')); }
  
  return rslt;
}

//Static function
exports.getFieldByName = function (fields, fieldname) {
  for (var i = 0; i < fields.length; i++) {
    if (fields[i].name == fieldname) return fields[i];
  }
  return;
}

exports.getKeyNames = function (fields) {
  return _.map(exports.getKeys(fields), 'name');
}

exports.getKeys = function (fields) {
  return _.filter(fields, function (field) {
    if (field.key) return true;
    return false;
  });
}

exports.getEncryptedFields = function (req, fields, perm) {
  var rslt = [];
  _.each(fields, function (field) {
    if (('type' in field) && ((field.type == 'encascii') || (field.type == 'hash')) && ejsext.accessField(req, field, perm)) rslt.push(field);
  });
  return rslt;
};

exports.getFileFieldNames = function (req, fields, perm) {
  var rslt = [];
  _.each(fields, function (field) {
    if (('type' in field) && (field.type == 'file') && ejsext.accessField(req, field, perm)) rslt.push(field.name);
  });
  return rslt;
};

return module.exports;