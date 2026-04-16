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

var Helper = require('./lib/Helper.js');
var _ = require('lodash');

module.exports = exports = {};

exports.execTask = function (req, res, fullmodelid, Q, P, callback) {

  if (!this.jsh.hasModel(req, fullmodelid)) throw new Error('Error: Task ' + fullmodelid + ' not found in collection.');
  if (typeof Q == 'undefined') Q = req.query;
  if (typeof P == 'undefined') P = req.body;
  if (typeof callback == 'undefined') callback = function (err) {
    if(err){ Helper.GenError(req, res, -99999, err.toString()); return; }
    
    res.type('json');
    res.end(JSON.stringify({ _success: 1 }));
  };

  var model = this.jsh.getModel(req, fullmodelid);
  var db = this.jsh.getModelDB(req, fullmodelid);
  var dbcontext = this.jsh.getDBContext(req, model, db);
  
  this.jsh.AppSrv.tasksrv.exec(req, res, dbcontext, fullmodelid, Q, callback);
};

return module.exports;