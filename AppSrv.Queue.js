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
var XValidate = require('jsharmony-validate');

module.exports = exports = {};

exports.GetToken = function (req, res) {
  if (!('_DBContext' in req) || (req._DBContext == '') || (req._DBContext == null)) { return Helper.GenError(req, res, -10, 'Invalid Login / Not Authenticated'); }
  if (!req.jshconfig.auth) { return Helper.GenError(req, res, -99999, 'Authentication not defined'); }
  if (!req.jshconfig.auth.getToken) { return Helper.GenError(req, res, -99999, 'Token generation not defined'); }
  req.jshconfig.auth.getToken(this, req, function (rslt, err) {
    if (err) { return Helper.GenError(req, res, -99999, err); }
    res.end(JSON.stringify(rslt));
  });
};

exports.SubscribeToQueue = function (req, res, next, queueid) {
  if (!this.jsh.Config.queues) { next(); return; }
  if (!(queueid in this.jsh.Config.queues)) { return Helper.GenError(req, res, -1, 'Queue not found'); }
  if (!this.JobProc) { return Helper.GenError(req, res, -1, 'Job Processor not configured'); }
  if (this.jsh.Config.debug_params.appsrv_requests) this.jsh.Log.info('User subscribing to queue ' + queueid);
  var queue = this.jsh.Config.queues[queueid];
  if (!Helper.HasModelAccess(req, queue, 'B')) { Helper.GenError(req, res, -11, 'Invalid Access'); return; }
  //Check if queue has a message, otherwise, add to subscriptions
  this.JobProc.SubscribeToQueue(req, res, queueid);
}

exports.PopQueue = function (req, res, queueid) {
  var _this = this;
  if (!this.jsh.Config.queues) { next(); return; }
  if (!(queueid in this.jsh.Config.queues)) { return Helper.GenError(req, res, -1, 'Queue not found'); }
  if (this.jsh.Config.debug_params.appsrv_requests) this.jsh.Log.info('Result for queue ' + queueid);
  if (!this.JobProc) throw new Error('Job Processor not configured');
  var queue = this.jsh.Config.queues[queueid];
  
  //Verify parameters
  var P = req.body || {};
  if (!_this.ParamCheck('P', P, ['&ID', '&RSLT', '&NOTES'])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  var validate = new XValidate();
  validate.AddValidator('_obj.ID', 'Queue Task ID', 'B', [XValidate._v_IsNumeric(), XValidate._v_Required()]);
  validate.AddValidator('_obj.RSLT', 'Queue Task Result', 'B', [XValidate._v_MaxLength(8), XValidate._v_Required()]);
  validate.AddValidator('_obj.NOTES', 'Queue Task Result Notes', 'B', [XValidate._v_MaxLength(4000)]);
  var verrors = validate.Validate('B', P);
  if (!_.isEmpty(verrors)) { return Helper.GenError(req, res, -2, verrors[''].join('\n')); }
  
  if (!Helper.HasModelAccess(req, queue, 'D')) { return Helper.GenError(req, res, -11, 'Invalid Access'); }
  this.JobProc.PopQueue(req, res, queueid, P, function () { res.end(JSON.stringify({ '_success': 1 })); });
}

exports.SendQueue = function (queueid, message) {
  var _this = this;
  for (var i = 0; i < this.QueueSubscriptions.length; i++) {
    var queue = this.QueueSubscriptions[i];
    if (!queue.res || queue.res.finished) { this.QueueSubscriptions.splice(i, 1); i--; continue; }
    if (queue.id == queueid) {
      if (_this.jsh.Config.debug_params.appsrv_requests) _this.jsh.Log.info('Notifying subscriber ' + queueid);
      try {
        queue.res.send(message);
      } catch (ex) {
        Helper.GenError(req, res, -99999, ex);
      }
      queue.res.end();
      //queue.res.set("Connection", "close");
      this.QueueSubscriptions.splice(i, 1);
      i--;
    }
  }
}

return module.exports;