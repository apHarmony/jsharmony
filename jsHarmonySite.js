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
var Helper = require('./lib/Helper.js');

///////////////
//jsHarmonySite
///////////////
function jsHarmonySite(config){
  this.id = "default";
  this.basetemplate = "index";
  this.baseurl = '/';
  this.show_system_errors = true;
  this.cookiesalt = '';
  this.router = undefined;
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
        __auth_PE_ID: req.user_id,
        __auth_tstmp: tstmp,
        __auth_token: passhash
      });
    },
    onAuth: function (req, res, onSuccess, onFail) { },
    onRenderLogin: function (req, res, onComplete) { },
    onRenderLoginForgotPassword: function (req, res, onComplete) { },
    onRenderLoginForgotPasswordReset: function (req, res, onComplete) { },
    allow_insecure_http_logins: false,
    on_auth: function(req, jsh, params, cb){ /*cb(err, rslt)* / },
    on_login: function(req, jsh, params, cb){ /*cb(err, rslt)* / },
    on_loginsuccess: function(req, jsh, params, cb){ /*cb(err, rslt)* / },
    on_superlogin: function(req, jsh, params, cb){ /*cb(err, rslt)* / },
    on_passwordreset: function(req, jsh, params, cb){ /*cb(err, rslt)* / }
  } 
  */
  this.menu = function(req,res,jsh,params,onComplete){ 
    params.ShowListing = true; 
    params.XMenu = { MainMenu:[], SubMenus:{} }; 
    onComplete(); 
  }
  this.globalparams = {
    /* user_id: function (req) { return req.user_id; }, */
  };
  this.sqlparams = {
    /* "TSTMP": "TSTMP" */
  };
  this.onLoad = function (jsh) { };
  this.public_apps = [];
  this.private_apps = [];
  this.datalock = {
    /* "c_id": function (req) { return req.gdata[jsh.map.client_id]; } */
  };
  this.datalocktypes = {
    /* "c_id": { 'name': "c_id", 'type': 'bigint' } */
  };

  if(config) this.Merge(config);
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
      else if(_.includes(['auth', 'datalock','datalocktypes','globalparams','sqlparams'],prop)) this[prop] = _.extend(this[prop],config[prop]);
      //Merge arrays      
      else if(_.includes(['public_apps','private_apps'],prop)) this[prop] = this[prop].concat(config[prop]);
      //Replace existing objects
      else this[prop] = config[prop];
    }
  }
}

jsHarmonySite.prototype.Validate = function(){
  var _this = this;
  if(!_this.id){
    console.log('jsHarmony Site ID not set, setting value to "default"');
    _this.id = 'default';
  }
  if(Helper.notset(_this.basetemplate)) _this.basetemplate = 'index';
  if(Helper.notset(_this.baseurl)) _this.baseurl = '/';
  if(Helper.notset(_this.show_system_errors)) _this.show_system_errors = true;
  if(!_this.menu) _this.menu = function(req,res,jsh,params,onComplete){ params.ShowListing = true; params.XMenu = { MainMenu:[], SubMenus:{} }; onComplete(); }
  if(!_this.globalparams) _this.globalparams = {};
  if(!_this.sqlparams) _this.sqlparams = {};
  if(!_this.public_apps) _this.public_apps = [];
  if(!_this.private_apps) _this.private_apps = [];

  if(_this.auth){
    if(Helper.notset(_this.auth.on_login)) _this.auth.on_login = function(req, jsh, params, cb){ //cb(err, rslt)
      jsh.AppSrv.ExecRecordset('login', req.jshconfig.auth.sql_login, [jsh.AppSrv.DB.types.VarChar(255)], params, cb);
    };
    if(Helper.notset(_this.auth.on_superlogin)) _this.auth.on_superlogin = function(req, jsh, params, cb){ //cb(err, rslt)
      jsh.AppSrv.ExecRecordset('login', req.jshconfig.auth.sql_superlogin, [jsh.AppSrv.DB.types.VarChar(255)], params, cb);
    };
    if(Helper.notset(_this.auth.on_loginsuccess)) _this.auth.on_loginsuccess = function(req, jsh, params, cb){ //cb(err, rslt)
      var context = params[jsh.map.user_id];
      if(_this.auth.getContextUser) context = _this.auth.getContextUser(context, jsh);
      jsh.AppSrv.ExecRow(context, req.jshconfig.auth.sql_loginsuccess, [jsh.AppSrv.DB.types.VarChar(255), jsh.AppSrv.DB.types.BigInt, jsh.AppSrv.DB.types.DateTime(7)], params, cb);
    };
    if(Helper.notset(_this.auth.on_passwordreset)) _this.auth.on_passwordreset = function(req, jsh, params, cb){ //cb(err, rslt)
      var context = params[jsh.map.user_id];
      if(_this.auth.getContextUser) context = _this.auth.getContextUser(context, jsh);
      jsh.AppSrv.ExecRow(context, req.jshconfig.auth.sql_passwordreset, [jsh.AppSrv.DB.types.VarBinary(200), jsh.AppSrv.DB.types.VarChar(255), jsh.AppSrv.DB.types.BigInt, jsh.AppSrv.DB.types.DateTime(7)], params, cb);
    };
    if(Helper.notset(_this.auth.on_auth)) _this.auth.on_auth = function(req, jsh, params, cb){ //cb(err, rslt)
      jsh.AppSrv.ExecMultiRecordset('login', req.jshconfig.auth.sql_auth, [jsh.AppSrv.DB.types.VarChar(255)], params, cb);
    };
  }
}

exports = module.exports = jsHarmonySite;