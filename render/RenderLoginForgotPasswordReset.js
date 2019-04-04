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

var ejs = require('ejs');
var crypto = require('crypto');
var ejsext = require('../lib/ejsext.js');
var Helper = require('../lib/Helper.js');
var XValidate = require('jsharmony-validate');
var _ = require('lodash');

// RenderLoginForgotPassword
exports = module.exports = function (req, res, onComplete) {
  if (!(req.secure) && !(req.jshsite.auth.allow_insecure_http_logins)) { Helper.GenError(req, res, -21, 'Secure connection required'); return; }
  if(!req.jshsite.auth.on_passwordreset) { return Helper.GenError(req, res, -9, 'Password reset not enabled'); return; }
  //Get user_id from URL
  //If no user_id, redirect to regular forgot_password
  var fdata = {};
  if ('password' in req.body) fdata.password = req.body.password;
  if ('confirm_password' in req.body) fdata.confirm_password = req.body.confirm_password;
  if ('email' in req.query) fdata.username = req.query.email;
  else return Helper.GenHTMLError(res, -20, 'Your password reset link has expired');
  if ('key' in req.query) fdata.key = req.query.key;
  else return Helper.GenHTMLError(res, -20, 'Your password reset link has expired');
  
  var dbtypes = this.AppSrv.DB.types;
  var verrors = {};
  var _this = this;
  var jsh = this;
  req._DBContext = 'loginforgotpasswordreset';
  
  //Verify Key
  var sqlparams = {};
  sqlparams[jsh.map.user_email] = fdata.username;
  req.jshsite.auth.on_auth(req, jsh, sqlparams, function (err, rslt) {
    if ((rslt != null) && (rslt.length == 1) && (rslt[0].length == 2) && (rslt[0][0].length == 1)) {
      var user_info = rslt[0][0][0];
      if (user_info[jsh.map.user_status].toUpperCase() == 'ACTIVE') {
        var user_id = user_info[jsh.map.user_id];
        var pe_ll_tstmp = user_info[jsh.map.user_last_tstmp];
        var hash = crypto.createHash('sha1').update(user_id + req.jshsite.auth.salt + pe_ll_tstmp).digest('hex');
        if (hash == fdata.key) {
          //Key is Good
          if (req.method == 'POST') {
            //Validate Password
            var xvalidate = new XValidate();
            xvalidate.AddValidator('_obj.password', 'New Password', 'IU', [XValidate._v_Required(), function (caption, val) {
                if ((fdata.password == '') && (fdata.confirm_password == '')) return "";
                if (fdata.password != fdata.confirm_password) return "Password and confirmed password must match.";
                return "";
              }, XValidate._v_MinLength(6), XValidate._v_MaxLength(50)]);
            verrors = xvalidate.Validate('IU', fdata);
            if (!_.isEmpty(verrors)) { onComplete(RenderPage(req, jsh, fdata, verrors)); return; }
            
            //Genereate new hash
            var pe_hash = crypto.createHash('sha1').update(user_id + fdata.password + req.jshsite.auth.salt).digest();
            var prehash = crypto.createHash('sha1').update(user_id + fdata.password + req.jshsite.auth.salt).digest('hex');
            pe_ll_tstmp = new Date();
            var tstmp = Helper.DateToSQLISO(pe_ll_tstmp);
            var ipaddr = req.connection.remoteAddress;
            //Save to database
            var sqlparams = {};
            sqlparams[jsh.map.user_hash] = pe_hash;
            sqlparams[jsh.map.user_last_ip] = ipaddr;
            sqlparams[jsh.map.user_id] = user_id;
            sqlparams[jsh.map.user_last_tstmp] = pe_ll_tstmp;
            req.jshsite.auth.on_passwordreset(req, jsh, sqlparams, function (err, rslt) {
              if ((rslt != null) && (rslt.length == 1) && (rslt[0][jsh.map.rowcount] == 1)) {
                //Create authentication cookie
                Helper.ClearCookie(req, res, jsh, 'account', { 'path': req.baseurl });
                var account = {
                  username: fdata.username,
                  password: crypto.createHash('sha1').update(prehash + tstmp).digest('hex'),
                  remember: false,
                  tstmp: tstmp
                };
                Helper.SetCookie(req, res, jsh, 'account', account, { 'expires': false, 'path': req.baseurl });
                //Redirect to home
                Helper.Redirect302(res, req.baseurl);
                onComplete(false);
                return;
                //onComplete(RenderPage(req, jsh, fdata, verrors, 'Success')); return;
              }
              else { verrors[''] = 'An unexpected error has occurred'; }
              onComplete(RenderPage(req, jsh, account, verrors));
            });
            return;
          }
          onComplete(RenderPage(req, jsh, fdata, verrors));
          return;
        }
      }
    }
    return Helper.GenHTMLError(res, -20, 'Your password reset link has expired');
  });
};

function RenderPage(req, jsh, fdata, verrors, rslt) {
  return ejs.render(jsh.getEJS('jsh_login.forgotpassword.reset'), {
    'fdata': fdata,
    'jsh': jsh,
    'verrors': verrors,
    'rslt': rslt,
    'ejsext': ejsext,
    'req': req,
    _: _
  });
}

