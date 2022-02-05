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

var crypto = require('crypto');
var Helper = require('./Helper.js');
var HelperFS = require('./HelperFS.js');
var _ = require('lodash');

//Auth
var Auth = function (req, res, onSuccess, onFail) {
  var account = Helper.GetCookie(req, this, 'account')||{};
  var _this = this;
  var _Xauth = function (extraSalt) { handleAuth.call(_this, req, res, onSuccess, onFail, account, extraSalt); };
  if (req.jshsite.auth.preprocess_account) { req.jshsite.auth.preprocess_account(this.AppSrv, account, _Xauth, onFail, req); }
  else _Xauth();
};
Auth.NoAuth = function(req, res, onComplete){
  req.isAuthenticated = true;
  req.user_id = 0;
  req.user_name = 'System';
  req._DBContext = 'system';
  req._roles = {'SYSADMIN':'SYSADMIN', 'DEV':'DEV'};
  if(onComplete) onComplete();
};
Auth.Static = function(logins){
  var auth_salt = HelperFS.staticSalt('static_login');
  function getLogins(jsh){
    _.each(logins,function(login){
      login[jsh.map.user_hash] = crypto.createHash('sha1').update(login[jsh.map.user_id] + login['password'] + auth_salt).digest('hex');
      if(!login[jsh.map.user_status]) login[jsh.map.user_status] = 'ACTIVE';
      if(!login[jsh.map.user_last_ip]) login[jsh.map.user_last_ip] = '0.0.0.0';
      if(!login[jsh.map.user_last_tstmp]) login[jsh.map.user_last_tstmp] = (new Date()).toString();
    });
    return logins;
  }
  return {
    salt: auth_salt,
    allow_insecure_http_logins: true,
    on_login: function(req, jsh, params, cb){
      var user_info = [_.find(getLogins(jsh),function(o){ return (o[jsh.map.user_email] == params[jsh.map.user_email]); })];
      if(!user_info[0]) user_info = [];
      cb(null,[user_info]);
    },
    on_superlogin: function(req, jsh, params, cb){ return cb([[]]); },
    on_loginsuccess: function(req, jsh, params, cb){ _.extend(_.find(getLogins(jsh),{user_id:params.user_id}),params); cb(null,[{xrowcount:1}]); },
    on_passwordreset: null,
    on_auth: function(req, jsh, account, params, cb){
      var login = [_.find(getLogins(jsh),function(o){ return (o[jsh.map.user_email] == params[jsh.map.user_email]); })];
      if(!login[0]) login = [];
      var base_roles = ((login.length)?login[0]._roles:[]) || [];
      var roles = _.map(base_roles, function(role){ var rslt = {}; rslt[jsh.map.user_role] = role; return rslt; });
      cb(null,[[login, roles]]);
    },
    getuser_name: function(user_info, jsh) { return user_info[jsh.map.user_name]; },
    getContextUser: function(user_info, jsh) { return user_info[jsh.map.user_id]; },
  };
};
function handleAuth(req, res, onSuccess, onFail, account, extraSalt) {
  if (!('username' in account) || !('password' in account) || !('tstmp' in account) || (account.username == '') || (account.tstmp == '')) return onFail();
  if (!('remember' in account)) account.remember = false;
  if (!extraSalt) extraSalt = '';
  
  var jsh = this.AppSrv.jsh;
  var sqlparams = {};
  sqlparams[jsh.map.user_email] = account.username;
  req.jshsite.auth.on_auth(req, jsh, account, sqlparams, function (err, rslt) {
    if (err) { jsh.Log.error(err); return onFail(); }
    if ((rslt != null) && (rslt.length == 1) && (rslt[0].length == 2) && (rslt[0][0].length >= 1)) {
      var user_roles = [];
      if (rslt[0][1].length > 0) user_roles = _.map(rslt[0][1], jsh.map.user_role);
      var user_info = rslt[0][0][0];
      if ((user_info[jsh.map.user_status]||'').toUpperCase() != 'ACTIVE'){
        if(jsh.Config.debug_params.auth_debug) jsh.Log('Auth: User status not ACTIVE', { source: 'authentication' });
        return onFail();
      }
      else {
        req.jshsite.auth.getTrustedToken(req, jsh, user_info, function(error, token){
          if (error) return onFail();
          var posthash = crypto.createHash('sha1').update(token + account.tstmp + extraSalt).digest('hex');
          if(jsh.Config.debug_params.auth_debug){
            jsh.Log('Auth DB Hash:     '+posthash, { source: 'authentication' });
            jsh.Log('Auth Client Hash: '+account.password, { source: 'authentication' });
          }
          if (posthash == account.password) {
            req.isAuthenticated = true;
            req.user_id = user_info[jsh.map.user_id];
            req.user_name = req.jshsite.auth.getuser_name(user_info, jsh);
            req._DBContext = req.jshsite.auth.getContextUser(user_info, jsh);
            req._roles = {};
            _.each(user_roles, function (role) { req._roles[role] = role; });
            if(jsh.Config.debug_params.auth_debug) jsh.Log('Auth: Success', { source: 'authentication' });
            if ('onAuthComplete' in req.jshsite.auth) req.jshsite.auth.onAuthComplete(req, user_info, jsh, onSuccess);
            return onSuccess();
          }
          else return onFail();
        });
      }
    }
    else{
      if(jsh.Config.debug_params.auth_debug) jsh.Log('Auth: User not found', { source: 'authentication' });
      return onFail();
    }
  });
}

exports = module.exports = Auth;