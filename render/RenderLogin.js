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
var HelperFS = require('../lib/HelperFS.js');


// RenderLogin
exports = module.exports = function (req, res, onComplete) {
  var jsh = this;
  if (!(req.secure) && !(req.jshconfig.auth.allow_insecure_http_logins)) { Helper.GenError(req, res, -21, 'Secure connection required for login'); return; }
  var source = (('source' in req.query) ? req.query.source : req.baseurl);
  var account = {
    username: '',
    password: '',
    remember: false,
    tstmp: ''
  };
  if ('account' in req.cookies) {
    if ('username' in req.cookies.account) account.username = req.cookies.account.username;
    if ('remember' in req.cookies.account) account.remember = (req.cookies.account.remember == 1);
  }
  var xpassword = '';
  if ('username' in req.body) account.username = req.body.username;
  if ('password' in req.body) xpassword = req.body.password;
  if ('remember' in req.body) account.remember = true;
  if ('source' in req.body) source = req.body.source;
  
  if (req.method == 'POST') {
    var curtime = Date.now();
    var good_login = false;
    var expiry = false;
    var ipaddr = req.connection.remoteAddress;
    account.remember = ('remember' in req.body);
    if (account.remember) expiry = new Date(Date.now() + 31536000000);
    //Handle superadmin::user
    
    var dbtypes = this.AppSrv.DB.types;
    var _this = this;
    var verrors = {};
    var loginfunc = function (nopass) {
      //Check User against database
      //client@clientdomain.com:admin@admindomain.com
      var sqlparams = {};
      sqlparams[jsh.map.user_email] = account.username;
      req.jshconfig.auth.on_login(req, jsh, sqlparams, function (err, rslt) {
        if ((rslt != null) && (rslt.length == 1) && (rslt[0].length == 1)) {
          var user_info = rslt[0][0];
          var prehash = crypto.createHash('sha1').update(user_info[jsh.map.user_id] + xpassword + req.jshconfig.auth.salt).digest('hex');
          if ((user_info[jsh.map.user_status]||'').toUpperCase() != 'ACTIVE') { verrors[''] = 'Your account has been suspended.  Please contact support at <a href="mailto:' + global.support_email + '">' + global.support_email + '</a> for more information'; }
          else if (user_info[jsh.map.user_hash] == null) { verrors[''] = 'Invalid email address or password'; }
          else {
            if (nopass) prehash = user_info[jsh.map.user_hash].toString('hex');
            if (user_info[jsh.map.user_hash].toString('hex') == prehash) {
              var user_id = user_info[jsh.map.user_id];
              good_login = true;
              var PE_LL_Tstmp = new Date();
              account.tstmp = Helper.DateToSQLISO(PE_LL_Tstmp);
              account.password = crypto.createHash('sha1').update(prehash + account.tstmp).digest('hex');
              var sqlparams = {};
              sqlparams[jsh.map.user_last_ip] = ipaddr;
              sqlparams[jsh.map.user_id] = user_id;
              sqlparams[jsh.map.user_last_tstmp] = PE_LL_Tstmp;
              req.jshconfig.auth.on_loginsuccess(req, jsh, sqlparams, function (err, rslt) {
                if ((rslt != null) && (rslt.length == 1) && (rslt[0] != null) && (rslt[0][jsh.map.rowcount] == 1)) {
                  res.clearCookie('account', { 'path': req.baseurl });
                  res.cookie('account', account, { 'expires': expiry, 'path': req.baseurl });
                  Helper.Redirect302(res, source);
                  onComplete(false);
                  return;
                }
                else { verrors[''] = 'An unexpected error has occurred'; }
                onComplete(RenderPage(req, jsh, account, source, verrors));
              });
              return;
            }
            else { verrors[''] = 'Invalid email address or password'; }
          }
        }
        else { verrors[''] = 'Invalid email address or password'; }
        onComplete(RenderPage(req, jsh, account, source, verrors));
      });
    }
    var superindex = account.username.indexOf(":");
    if ((superindex >= 0) && (superindex < (account.username.length - 1))) {
      var uemail = account.username.substr(0, superindex);
      var superemail = account.username.substr(superindex + 1);
      var sqlparams = {};
      sqlparams[jsh.map.user_email] = superemail;
      req.jshconfig.auth.on_superlogin(req, jsh, sqlparams, function (err, rslt) {
        if ((rslt != null) && (rslt.length == 1) && (rslt[0] != null) && (rslt[0].length == 1)) {
          var admin_info = rslt[0][0];
          var prehash = crypto.createHash('sha1').update(admin_info[jsh.map.user_id] + xpassword + req.jshconfig.auth.supersalt).digest('hex');
          if ((admin_info[jsh.map.user_hash] != null) && (admin_info[jsh.map.user_hash].toString('hex') == prehash)) {
            account.username = uemail;
            loginfunc(true);
            return;
          }
          else { verrors[''] = 'Invalid email address or password'; }
        }
        else { verrors[''] = 'Invalid email address or password'; }
        onComplete(RenderPage(req, jsh, account, source, verrors));
      });
    }
    else loginfunc(false);
		//if(!('account' in res.cookies)) res.cookies.account = {};
		//res.cookies.account.username = username;
  }
  else onComplete(RenderPage(req, jsh, account, source));
};

function RenderPage(req, jsh, account, source, verrors) {
  return ejs.render(jsh.getEJS('jsh_login'), {
    'username': account.username,
    'remember': account.remember,
    'source': source,
    'global': global,
    'verrors': verrors,
    'ejsext': ejsext,
    'enable_password_reset': (req.jshconfig.auth.on_passwordreset?true:false)
  });
}

