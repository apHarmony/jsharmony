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
var ejs = require('ejs');
var ejsext = require('./ejsext.js');

exports = module.exports = {};

exports.ejsext = ejsext;

exports.reqGet = function (req, res, jsh, ejsname, title, _options, cb) {
  var options = {
    basetemplate: req.jshsite.basetemplate,
    menudata: {},
    startmodel: null,
    selectedmenu: '',
    params: {},
    async: false,
  };
  
  _.extend(options, _options);
  var ejsparams = {
    req: req,
    jsh: jsh,
    'global': global,
    'ejsext': ejsext,
    _: _
  };
  _.extend(ejsparams, options.params);
  if(options.async){
    (async function(){
      var rslt = await ejs.render(jsh.getEJS(ejsname), ejsparams, {async: true});
      jsh.RenderTemplate(req, res, options.basetemplate, { title: title, body: rslt, menudata: options.menudata, startmodel: options.startmodel, selectedmenu: options.selectedmenu, ejsext: ejsext, modelid: '', req: req, jsh: jsh, params: ejsparams });
      if(typeof cb !== 'undefined') cb();
    })();
  }
  else {
    var rslt = ejs.render(jsh.getEJS(ejsname), ejsparams);
    jsh.RenderTemplate(req, res, options.basetemplate, { title: title, body: rslt, menudata: options.menudata, startmodel: options.startmodel, selectedmenu: options.selectedmenu, ejsext: ejsext, modelid: '', req: req, jsh: jsh, params: ejsparams });
    if(typeof cb !== 'undefined') cb();
  }
};

exports.getCMS_M = function (req, res, appsrv, dbcontext, aspa_object, cb) {
  var db = appsrv.jsh.getDB('default');
  var sql = db.sql.getCMS_M(aspa_object);
  exports.getDBScalar(req, res, appsrv, dbcontext, sql, [], { }, cb);
};

exports.getTXT = function (req, res, appsrv, dbcontext, txt_process, txt_attrib, cb) {
  var dbtypes = appsrv.DB.types;
  var sql = 'HelperRender_getTXT';
  var sql_ptypes = [dbtypes.VarChar(32), dbtypes.VarChar(32)];
  var sql_params = { 'txt_process': txt_process, 'txt_attrib': txt_attrib };
  exports.getDBScalar(req, res, appsrv, dbcontext, sql, sql_ptypes, sql_params, cb);
};

exports.getDBScalar = function (req, res, appsrv, dbcontext, sql, sql_ptypes, sql_params, cb, db) {
  appsrv.ExecScalar(dbcontext, sql, sql_ptypes, sql_params, function (err, rslt, stats) {
    if (err != null) { err.sql = sql; appsrv.AppDBError(req, res, err, stats); return; }
    cb(rslt);
  }, undefined, db);
};

exports.getDBRecordset = function (req, res, appsrv, dbcontext, sql, sql_ptypes, sql_params, cb, db) {
  appsrv.ExecRecordset(dbcontext, sql, sql_ptypes, sql_params, function (err, rslt, stats) {
    if (err != null) { err.sql = sql; appsrv.AppDBError(req, res, err, stats); return; }
    if ((rslt != null) && (rslt.length > 0)) cb(rslt[0]);
    else cb(null);
  }, undefined, db);
};