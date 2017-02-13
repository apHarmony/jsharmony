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

var twilio = require('twilio');
var ejs = require('ejs');
var _ = require('lodash');
var async = require('async');

exports = module.exports = {};

exports.SendTXTSMS = function (dbcontext, jsh, TXT_ATTRIB, sms_to, params, callback) {
  var _this = this;
  //Pull TXT data from database
  var dbtypes = jsh.AppSrv.DB.types;
  jsh.AppSrv.ExecRecordset(dbcontext, "SMS_SendTXTSMS", [dbtypes.VarChar(32)], { 'TXT_ATTRIB': TXT_ATTRIB }, function (err, rslt) {
    if ((rslt != null) && (rslt.length == 1) && (rslt[0].length == 1)) {
      var TXT = rslt[0][0];
      _this.SendBaseSMS(dbcontext, jsh, TXT[jsh.map.txt_val], sms_to, params, callback)
    }
    else return callback(new Error('SMS ' + TXT_ATTRIB + ' not found.'));
  });
};
exports.SendBaseSMS = function (dbcontext, jsh, sms_body, sms_to, params, callback) {
  var _this = this;
  sms_to = sms_to || null;
  
  var mparams = {};
  if (sms_to) mparams.to = sms_to;
  mparams.text = sms_body;
  //Replace Params
  try {
    mparams.text = ejs.render(mparams.text, { data: params, _: _ });
  }
  catch (e) {
    return callback(e);
  }
  _this.SendSMS(mparams, callback);
}
exports.SendSMS = function (mparams, callback) {
  var maxSMS = 70;
  if (!global.twilio_settings) return callback(new Error('Invalid global.twilio_settings'));
  if (!global.twilio_settings.ACCOUNT_SID || !global.twilio_settings.AUTH_TOKEN) return callback(new Error('Invalid global.twilio_settings'));
  if (!('from' in mparams)) mparams.from = global.twilio_settings.SMS_FROM;
  try {
    var client = new twilio.RestClient(global.twilio_settings.ACCOUNT_SID, global.twilio_settings.AUTH_TOKEN);
    var msgpos = 0;
    var msg = mparams.text.toString();
    
    //Use client.messages.create instead of client.sms.messages.create to auto-split longer than 160 chars
    client.messages.create({
      to: mparams.to,
      from: mparams.from,
      body: msg
    }, function (err, rslt) {
      if (err && err.status && err.message) err = JSON.stringify(err);
      callback(err);
    });
  }
  catch (e) {
    return callback(e);
  }
}