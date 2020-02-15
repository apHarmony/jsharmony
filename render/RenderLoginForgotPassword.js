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
exports = module.exports = function (req, res, onComplete){
  var jsh = this;
  if (!(req.secure) && !(req.jshsite.auth.allow_insecure_http_logins)) { return Helper.GenError(req, res, -21, 'Secure connection required'); return; }
  if(!req.jshsite.auth.on_passwordreset) { return Helper.GenError(req, res, -9, 'Password reset not enabled'); return; }
  var fdata = { username:'' };
  var accountCookie = Helper.GetCookie(req, jsh, 'account');
	if(accountCookie){
		if('username' in accountCookie) fdata.username = accountCookie.username;
	}
  if ('username' in req.body) fdata.username = req.body.username;

  if (req.method == 'POST') {
    var dbtypes = this.AppSrv.DB.types;
    var _this = this;
    var verrors = {};
    var email = fdata.username;
    
    //Validate Email
    if ((email == '') || XValidate.Vex(XValidate._v_IsEmail, email)) { verrors[''] = 'Invalid email address.'; onComplete(RenderPage(req, jsh, fdata, verrors)); return; }

    //Check User against database
    req._DBContext = 'loginforgotpassword';
    var sqlparams = {};
    sqlparams[jsh.map.user_email] = fdata.username;
    req.jshsite.auth.on_auth(req, jsh, sqlparams, function (err, rslt) {
      if ((rslt != null) && (rslt.length == 1) && (rslt[0].length == 2) && (rslt[0][0].length >= 1)) {
        var all_suspended = true;
        for (var i = 0; i < rslt[0][0].length; i++) {
          var user_info = rslt[0][0][i];
          if (user_info[jsh.map.user_status].toUpperCase() == 'ACTIVE') {
            all_suspended = false;
            //Send message
            var user_id = user_info[jsh.map.user_id];
            var sys_user_name = req.jshsite.auth.getuser_name(user_info, jsh);
            var pe_ll_tstmp = user_info[jsh.map.user_last_tstmp];
            var pe_email = user_info[jsh.map.user_email];
            var support_email = jsh.Config.support_email;
            var reset_link = Helper.getFullURL(req, req.baseurl + 'login/forgot_password_reset?email=' + encodeURIComponent(email) + '&key=' + crypto.createHash('sha1').update(user_id + req.jshsite.auth.salt + pe_ll_tstmp).digest('hex'));
            var email_params = { 'SYS_USER_NAME': sys_user_name, 'SUPPORT_EMAIL': support_email, 'RESET_LINK': reset_link };
            jsh.SendTXTEmail(req._DBContext, 'RESETPASS', pe_email, null, null, null, email_params, function (err) {
              if (err) { jsh.Log.error(err); res.end('An error occurred sending the password reset email.  Please contact support for assistance.'); }
              else onComplete(RenderPage(req, jsh, fdata, verrors, "A link to reset your password has been sent to your email address."));
            });
            return;
          }
        }
        if(all_suspended) { verrors[''] = 'Your account has been suspended.  Please contact support at <a href="mailto:' + jsh.Config.support_email + '">' + jsh.Config.support_email + '</a> for more information'; }
      }
      else { verrors[''] = 'Invalid email address.'; }
			onComplete(RenderPage(req, jsh,fdata,verrors));
		});
	}
	else onComplete(RenderPage(req,jsh,fdata));
};

function RenderPage(req, jsh, fdata, verrors, rslt){
	return ejs.render(jsh.getEJS('jsh_login.forgotpassword'),{ 
		'fdata':fdata,
	  'jsh': jsh,
    'verrors': verrors,
    'rslt': rslt,
		'ejsext':ejsext,
    'req': req,
    _: _
	});
}

