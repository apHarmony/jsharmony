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


// RenderLoginForgotPassword
exports = module.exports = function (req, res, onComplete){
  var jsh = this;
  if (!(req.secure) && !(req.jshconfig.auth.allow_insecure_http_logins)) { return Helper.GenError(req, res, -21, 'Secure connection required'); return; }
  if(!req.jshconfig.auth.on_passwordreset) { return Helper.GenError(req, res, -9, 'Password reset not enabled'); return; }
	var fdata = { username:'' };
	if('account' in req.cookies){
		if('username' in req.cookies.account) fdata.username = req.cookies.account.username;
	}
  if ('username' in req.body) fdata.username = req.body.username;

  if (req.method == 'POST') {
    var dbtypes = this.AppSrv.DB.types;
    var _this = this;
    var verrors = {};
    var email = fdata.username;
    
    //Validate Email
    if ((email == '') || XValidate.Vex(XValidate._v_IsEmail, email)) { verrors[''] = 'Invalid email address.'; onComplete(RenderPage(jsh, fdata, verrors)); return; }

    //Check User against database
    req._DBContext = 'loginforgotpassword';
    var sqlparams = {};
    sqlparams[jsh.map.user_email] = fdata.username;
    req.jshconfig.auth.on_auth(req, jsh, sqlparams, function (err, rslt) {
      if ((rslt != null) && (rslt.length == 1) && (rslt[0].length == 2) && (rslt[0][0].length >= 1)) {
        var all_suspended = true;
        for (var i = 0; i < rslt[0][0].length; i++) {
          var user_info = rslt[0][0][i];
          if (user_info[jsh.map.user_status].toUpperCase() == 'ACTIVE') {
            all_suspended = false;
            //Send message
            var user_id = user_info[jsh.map.user_id];
            var PE_Name = req.jshconfig.auth.getuser_name(user_info, jsh);
            var PE_LL_Tstmp = user_info[jsh.map.user_last_tstmp];
            var PE_Email = user_info[jsh.map.user_email];
            var support_email = global.support_email;
            var reset_link = Helper.getFullURL(req, req.baseurl + 'login/forgot_password_reset?email=' + encodeURIComponent(email) + '&key=' + crypto.createHash('sha1').update(user_id + req.jshconfig.auth.salt + PE_LL_Tstmp).digest('hex'));
            Helper.SendTXTEmail(req._DBContext, jsh, 'RESETPASS', PE_Email, null, null, null, { 'PE_NAME': PE_Name, 'SUPPORT_EMAIL': support_email, 'RESET_LINK': reset_link }, function (err) {
              if (err) { global.log(err); res.end('An error occurred sending the password reset email.  Please contact support for assistance.'); }
              else onComplete(RenderPage(jsh, fdata, verrors, "A link to reset your password has been sent to your email address."));
            });
            return;
          }
        }
        if(all_suspended) { verrors[''] = 'Your account has been suspended.  Please contact support at <a href="mailto:' + global.support_email + '">' + global.support_email + '</a> for more information'; }
      }
      else { verrors[''] = 'Invalid email address.'; }
			onComplete(RenderPage(jsh,fdata,verrors));
		});
	}
	else onComplete(RenderPage(jsh,fdata));
};

function RenderPage(jsh, fdata, verrors, rslt){
	return ejs.render(jsh.getEJS('jsh_login.forgotpassword'),{ 
		'fdata':fdata,
	  'global':global,
    'verrors': verrors,
    'rslt': rslt,
		'ejsext':ejsext
	});
}

