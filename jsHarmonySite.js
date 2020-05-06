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
var crypto = require('crypto');
var Helper = require('./lib/Helper.js');

///////////////
//jsHarmonySite
///////////////
function jsHarmonySite(jsh, id, config){
  //jsHarmony
  this.jsh = jsh;
  //Site ID
  this.id = id;
  //"Home" button URL
  this.home_url = '/';
  //Default EJS template for rendering pages on this site
  this.basetemplate = 'index';
  //Root URL for models / images / JavaScript
  this.baseurl = '/';
  //Public folder URL (for shared public folder between multiple sites)
  this.publicurl = '/';
  //Client-side JSH Instance ID
  this.instance = 'jshInstance';
  //CSS Prefix for styles
  this.rootcss = '';
  //Whether to display debug information in the system errors (should be set to false for production)
  this.show_system_errors = true;
  //Site title
  this.title = '';
  //Salt used by cookieParser to prevent user from modifying cookie data
  this.cookiesalt = '';
  //Samesite setting override for jsHarmony cookie - strict / lax / none - default is lax
  this.cookie_samesite = 'lax';
  //Site authentication method - parameters below
  this.auth = undefined;
  /*
  {
    salt: "",
    supersalt: "",
    sql_auth: "",
    sql_login: "",
    sql_superlogin: "",
    sql_loginsuccess: "",
    sql_passwordreset: "",
    getuser_name: function (user_info, jsh) { return user_info[jsh.map.user_firstname] + ' ' + user_info[jsh.map.user_lastname]; },
    getContextUser: function (user_info, jsh) { return 'S' + user_info[jsh.map.user_id]; },
    onAuthComplete: function (req, user_info, jsh, onSuccess) { onSuccess(); },
    preprocess_account: function (AppSrv, account, onComplete, onFail) { onComplete(); },
    getToken = function (AppSrv, req, cb) {
      cb({
        __auth_user_id: req.user_id,
        __auth_token: passhash,
        __auth_tstmp: tstmp
      });
    },
    onAuth: function (req, res, onSuccess, onFail) { },
    onRenderLogin: function (req, res, onComplete) { },
    onRenderLoginForgotPassword: function (req, res, onComplete) { },
    onRenderLoginForgotPasswordReset: function (req, res, onComplete) { },
    onRenderLogout: function (req, res, onComplete) { },
    getTrustedToken: function (req, jsh, user_info, cb) { },   //cb = function(err, token){ }
    validatePassword: function (req, jsh, user_info, password, cb) { },   //cb = function(err, token){ }
    validateSuperPassword: function (req, jsh, admin_info, password, cb) { },   //cb = function(err, token){ }
    allow_insecure_http_logins: false,
    on_auth: function(req, jsh, params, cb){ /*cb(err, rslt)* / },
    on_login: function(req, jsh, params, cb){ /*cb(err, rslt)* / },
    on_loginsuccess: function(req, jsh, params, cb){ /*cb(err, rslt)* / },
    on_superlogin: function(req, jsh, params, cb){ /*cb(err, rslt)* / },
    on_passwordreset: function(req, jsh, params, cb){ /*cb(err, rslt)* / }
  } 
  */
  //Site menu generator
  this.menu = function(req,res,jsh,params,onComplete){ 
    params.showlisting = true; 
    params.startmodel = null;
    params.menudata = { MainMenu:[], SubMenus:{}  }; 
    onComplete(); 
  };
  //Help System
  this.help = function(req, res, jsh, helpid, onComplete){
    var helpurl = '';
    var helpurl_onclick = req.jshsite.instance+'.XExt.Alert(\'Help System not initialized.\'); return false;';
    return onComplete(helpurl, helpurl_onclick);
  };
  //Global parameters sent to the client front-end
  this.globalparams = {
    /* user_id: function (req) { return req.user_id; }, */
  };
  //Site router - automatically set when jsHarmonyRouter is initialized with the site as a parameter
  this.router = undefined;
  //Function run when routing is initialized
  this.onLoad = function (jsh) { };
  //Public apps (not requiring login)
  this.public_apps = [];
  //Private apps (requiring login)
  this.private_apps = [];
  //Datalock value functions
  this.datalock = {
    /* "c_id": function (req) { return req.gdata[jsh.map.client_id]; } */
  };
  //Datalock datatypes
  this.datalocktypes = {
    /* "c_id": { 'name': "c_id", 'type': 'bigint' } */
  };

  if(config) this.Merge(config);

  //Whether the site has been initialized
  this.initialized = true;
}

//Merge target configuration with existing
jsHarmonySite.prototype.Merge = function(config){
  if(config){
    for(var prop in config){
      //Add new objects
      if(!(prop in this)) this[prop] = config[prop];
      //Handle disabled authentication
      else if((prop=='auth') && (config[prop] === false)) this[prop] = false;
      //Merge objects
      else if(_.includes(['auth', 'datalock','datalocktypes','globalparams'],prop)) this[prop] = _.extend(this[prop],config[prop]);
      //Merge arrays      
      else if(_.includes(['public_apps','private_apps'],prop)) this[prop] = config[prop].concat(this[prop]);
      //Replace existing objects
      else this[prop] = config[prop];
    }
  }
};

jsHarmonySite.prototype.Validate = function(){
  var _this = this;
  if(!_this.id){
    _this.jsh.Log.debug('jsHarmony Site ID not set, setting value to "main"');
    _this.id = 'main';
  }
  if(Helper.notset(_this.basetemplate)) _this.basetemplate = 'index';
  if(Helper.notset(_this.baseurl)) _this.baseurl = '/';
  if(Helper.notset(_this.show_system_errors)) _this.show_system_errors = true;
  if(!_this.menu) _this.menu = function(req,res,jsh,params,onComplete){ params.showlisting = true; params.startmodel = null; params.menudata = { }; onComplete(); };
  if(!_this.help) _this.help = function(req, res, jsh, helpid, onComplete){ var helpurl = ''; var helpurl_onclick = req.jshsite.instance+'.XExt.Alert(\'Help System not initialized.\'); return false;'; return onComplete(helpurl, helpurl_onclick); };
  if(!_this.globalparams) _this.globalparams = {};
  if(!_this.public_apps) _this.public_apps = [];
  if(!_this.private_apps) _this.private_apps = [];

  if(_this.auth){
    if(Helper.notset(_this.auth.on_login)) _this.auth.on_login = function(req, jsh, params, cb){ //cb(err, rslt)
      jsh.AppSrv.ExecRecordset('login', req.jshsite.auth.sql_login, [jsh.AppSrv.DB.types.VarChar(255)], params, cb);
    };
    if(Helper.notset(_this.auth.on_superlogin)) _this.auth.on_superlogin = function(req, jsh, params, cb){ //cb(err, rslt)
      jsh.AppSrv.ExecRecordset('login', req.jshsite.auth.sql_superlogin, [jsh.AppSrv.DB.types.VarChar(255)], params, cb);
    };
    if(Helper.notset(_this.auth.on_loginsuccess)) _this.auth.on_loginsuccess = function(req, jsh, params, cb){ //cb(err, rslt)
      var context = params[jsh.map.user_id];
      if(_this.auth.getContextUser) context = _this.auth.getContextUser(params, jsh);
      jsh.AppSrv.ExecRow(context, req.jshsite.auth.sql_loginsuccess, [jsh.AppSrv.DB.types.VarChar(255), jsh.AppSrv.DB.types.BigInt, jsh.AppSrv.DB.types.DateTime(7)], params, cb);
    };
    if(Helper.notset(_this.auth.on_passwordreset)) _this.auth.on_passwordreset = function(req, jsh, params, cb){ //cb(err, rslt)
      var context = params[jsh.map.user_id];
      if(_this.auth.getContextUser) context = _this.auth.getContextUser(params, jsh);
      jsh.AppSrv.ExecRow(context, req.jshsite.auth.sql_passwordreset, [jsh.AppSrv.DB.types.VarBinary(200), jsh.AppSrv.DB.types.VarChar(255), jsh.AppSrv.DB.types.BigInt, jsh.AppSrv.DB.types.DateTime(7)], params, cb);
    };
    if(Helper.notset(_this.auth.on_auth)) _this.auth.on_auth = function(req, jsh, params, cb){ //cb(err, rslt)
      jsh.AppSrv.ExecMultiRecordset('login', req.jshsite.auth.sql_auth, [jsh.AppSrv.DB.types.VarChar(255)], params, cb);
    };
    if(Helper.notset(_this.auth.validatePassword)) _this.auth.validatePassword = function(req, jsh, user_info, password, cb){ //cb(err, token)
      var prehash = crypto.createHash('sha1').update(user_info[jsh.map.user_id] + password + req.jshsite.auth.salt).digest('hex');
      if (user_info[jsh.map.user_hash] == null) {
        if(jsh.Config.debug_params.auth_debug) jsh.Log('Login: DB Password empty', { source: 'authentication' });
      }
      else {
        var dbhash = user_info[jsh.map.user_hash].toString('hex');
        if(jsh.Config.debug_params.auth_debug){
          jsh.Log('Login DB Hash:     '+dbhash, { source: 'authentication' });
          jsh.Log('Login Client Hash: '+prehash, { source: 'authentication' });
        }
        if (dbhash == prehash) {
          return cb(null, prehash);
        }
      }
      return cb('Invalid email address or password');
    }
    if(Helper.notset(_this.auth.validateSuperPassword)) _this.auth.validateSuperPassword = function(req, jsh, admin_info, password, cb){ //cb(err, token)
      var prehash = crypto.createHash('sha1').update(admin_info[jsh.map.user_id] + password + req.jshsite.auth.supersalt).digest('hex');
      if ((admin_info[jsh.map.user_hash] != null) && (admin_info[jsh.map.user_hash].toString('hex') == prehash)) {
        cb(null, prehash);
        return;
      }
      else { cb('Invalid email address or password'); }
    }
    if(Helper.notset(_this.auth.getTrustedToken)) _this.auth.getTrustedToken = function(req, jsh, user_info, cb){ //cb(err, token)
      var dbhash = user_info[jsh.map.user_hash].toString('hex');
      cb(null, dbhash);
    }
  }

  if(!_this.cookie_samesite) _this.cookie_samesite = 'lax';
  else{
    _this.cookie_samesite = _this.cookie_samesite.toString().toLowerCase();
    if(!_.includes(['strict','lax','none'], _this.cookie_samesite)) _this.jsh.Log.error('Site ' +_this.id + ' > cookie_samesite must be either Strict, Lax, or None');
    if(_this.auth && _this.auth.allow_insecure_http_logins){
      if(_this.cookie_samesite == 'none') _this.jsh.Log.error('Site ' +_this.id + ' > cookie_samesite=None requires login over HTTPS (samesite=None cannot be used with insecure cookies)');
    }
  }
};

jsHarmonySite.prototype.getGlobalParams = function(req){
  var _this = this;
  if(!_this.globalparams) return {};
  var rslt = _.mapValues(_this.globalparams,function(val,key){ if(_.isFunction(val)) return val(req); return val; });
  return rslt;
};

jsHarmonySite.Placeholder = function(){
  this.initialized = false;
};

exports = module.exports = jsHarmonySite;