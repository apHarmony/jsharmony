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

var Helper = require('./Helper.js');
var HelperFS = require('./HelperFS.js');
var _ = require('lodash');
var async = require('async');
var XValidate = require('jsharmony-validate');
var ejs = require('ejs');
var ejsext = require('./ejsext.js');

exports = module.exports = {};

exports.reqGet = function (req, res, jsh, ejsname, title, _options, cb) {
  var options = {
    basetemplate: req.jshconfig.basetemplate,
    XMenu: {},
    TopMenu: '',
    params: {}
  };
  
  _.extend(options, _options);
  var ejsparams = {
    'global': global,
    'ejsext': ejsext,
    _: _
  };
  _.extend(ejsparams, options.params);
  var rslt = ejs.render(jsh.getEJS(ejsname), ejsparams);
  jsh.RenderTemplate(req, res, options.basetemplate, { title: title, body: rslt, XMenu: options.XMenu, TopMenu: options.TopMenu, ejsext: ejsext, modelid: '', req: req, jsh: jsh });
  if(typeof cb !== 'undefined') cb();
}

exports.getCMS_M = function (req, res, appsrv, dbcontext, aspa_object, cb) {
  var sql = appsrv.db.sql.getCMS_M(aspa_object);
  exports.getDBScalar(req, res, appsrv, dbcontext, sql, [], { }, cb);
}

exports.getTXT = function (req, res, appsrv, dbcontext, TXT_PROCESS, TXT_ATTRIB, cb) {
  var dbtypes = appsrv.DB.types;
  var sql = "HelperRender_getTXT";
  var sql_ptypes = [dbtypes.VarChar(32), dbtypes.VarChar(32)];
  var sql_params = { 'TXT_PROCESS': TXT_PROCESS, 'TXT_ATTRIB': TXT_ATTRIB };
  exports.getDBScalar(req, res, appsrv, dbcontext, sql, sql_ptypes, sql_params, cb);
}

exports.getDBScalar = function (req, res, appsrv, dbcontext, sql, sql_ptypes, sql_params, cb) {
  appsrv.ExecScalar(dbcontext, sql, sql_ptypes, sql_params, function (err, rslt) {
    if (err != null) { err.sql = sql; appsrv.AppDBError(req, res, err); return; }
    cb(rslt);
  });
}

exports.getDBRecordset = function (req, res, appsrv, dbcontext, sql, sql_ptypes, sql_params, cb) {
  appsrv.ExecRecordset(dbcontext, sql, sql_ptypes, sql_params, function (err, rslt) {
    if (err != null) { err.sql = sql; appsrv.AppDBError(req, res, err); return; }
    if ((rslt != null) && (rslt.length > 0)) cb(rslt[0]);
    else cb(null);
  });
}