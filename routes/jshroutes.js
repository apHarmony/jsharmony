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

var express = require('express');
var querystring = require('querystring');
var _ = require('lodash');
var path = require('path');
var fs = require('fs');

var ejsext = require('../lib/ejsext.js');
var Helper = require('../lib/Helper.js');
var HelperFS = require('../lib/HelperFS.js');
var async = require('async');
var url = require('url');

var Routes = function (jsh, jshconfig) {
  if(!jshconfig) jshconfig = {};
  Routes.ValidateSystemConfig(jshconfig);
  var router = express.Router();
  router.jsh = jsh;
  router.jshconfig = jshconfig;
  if (jshconfig.onLoad) jshconfig.onLoad(jsh);
  
  /* GET home page. */
  router.all('*', function (req, res, next) {
    req.baseurl = jshconfig.baseurl;
    req.jshconfig = jshconfig;
    req.jshlocal = {
      Models: { } 
    };
    req.forcequery = {};
    req.getBaseJS = function () { return jsh.getBaseJS(req, jsh); }
    if (global.debug_params.web_detailed_errors) req._web_detailed_errors = 1;
    setNoCache(req,res);
    res.setHeader('X-UA-Compatible','IE=edge');
    return next();
  });
  router.route('/login').all(function (req, res, next) {
    if(!jshconfig.auth){ console.log('Auth not configured in config'); return next(); }
    (jshconfig.auth.onRenderLogin || jsh.RenderLogin).call(jsh, req, res, function (rslt) {
      if (rslt != false) jsh.RenderTemplate(req, res, '', { title: 'Login', body: rslt, XMenu: {}, TopMenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh });
    });
  });
  router.route('/login/forgot_password').all(function (req, res, next) {
    if(!jshconfig.auth){ console.log('Auth not configured in config'); return next(); }
    (jshconfig.auth.onRenderLoginForgotPassword || jsh.RenderLoginForgotPassword).call(jsh, req, res, function (rslt) {
      if (rslt != false) jsh.RenderTemplate(req, res, '', { title: 'Forgot Password', body: rslt, XMenu: {}, TopMenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh });
    });
  });
  router.route('/login/forgot_password_reset').all(function (req, res, next) {
    if(!jshconfig.auth){ console.log('Auth not configured in config'); return next(); }
    (jshconfig.auth.onRenderLoginForgotPasswordReset || jsh.RenderLoginForgotPasswordReset).call(jsh, req, res, function (rslt) {
      if (rslt != false) jsh.RenderTemplate(req, res, '', { title: 'Reset Password', body: rslt, XMenu: {}, TopMenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh });
    });
  });
  for (var i = 0; i < global.public_apps.length; i++) {
    var app = global.public_apps[i];
    for (var j in app) router.all(j, app[j].bind(jsh.AppSrv));
  }
  for (var i = 0; i < jshconfig.public_apps.length; i++) {
    var app = jshconfig.public_apps[i];
    for (var j in app) router.all(j, app[j].bind(jsh.AppSrv));
  }
  router.get('/system.css', function (req, res) {
    //Concatenate jsh css with system css
	var f = function(){ HelperFS.outputContent(req, res, jsh.Cache['jsHarmony.css'] + '\r\n' + jsh.Cache['system.css'],'text/css'); };
	if(jsh.Cache['jsHarmony.css']) f();
	else{
		var jshDir = path.dirname(module.filename);
		fs.readFile(jshDir + '/../jsHarmony.css','utf8',function(err,data){
			if(err) console.log(err);
			else{
				jsh.Cache['jsHarmony.css'] = data;
				f();
			}
		});
	}
  });
  router.all('*', function (req, res, next) {
    if(!jshconfig.auth){ return jsh.Auth.NoAuth(req, res, next); }
    //Handle Authentication
    (jshconfig.auth.onAuth || jsh.Auth).call(jsh, req, res, next, function (errno, msg) {
      if ((req.url.indexOf('/_d/') == 0) || (req.url.indexOf('/_ul/') == 0)) {
        //For AppSrv, return error message
        if (typeof errno == 'undefined') return Helper.GenError(req, res, -10, "User not authenticated, please log in");
        return Helper.GenError(req, res, errno, msg);
      }
      else {
        var loginurl = req.baseurl + 'login?' + querystring.stringify({ 'source': req.originalUrl });
        jsh.Redirect302(res, loginurl);
      }
    });
  });
  router.get('/logout', function (req, res, next) {
    if(!jshconfig.auth){ console.log('Auth not configured in config'); return next(); }
    jsh.RenderLogout(req, res, function (rslt) {
      if (rslt != false) jsh.RenderTemplate(req, res, '', { title: 'Logout', body: rslt, XMenu: {}, TopMenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh });
    });
  });
  router.get('/system.js', function (req, res) {
    HelperFS.outputContent(req, res, jsh.Cache['system.js'],'text/javascript');
  });
  for (var i = 0; i < global.private_apps.length; i++) {
    var app = global.private_apps[i];
    for (var j in app) router.all(j, app[j].bind(jsh.AppSrv));
  }
  for (var i = 0; i < jshconfig.private_apps.length; i++) {
    var app = jshconfig.private_apps[i];
    for (var j in app) router.all(j, app[j].bind(jsh.AppSrv));
  }
  router.post('/_ul/clear', function (req, res) {
    jsh.AppSrv.ClearUpload(req, res);
  });
  router.post('/_ul/ckeditor', function (req, res) {
    jsh.AppSrv.UploadCKEditor(req, res);
  });
  router.post('/_ul/', function (req, res) {
    req.jsproxyid = 'xfileuploader';
    jsh.AppSrv.Upload(req, res);
  });
  router.post('/_ul/json', function (req, res) {
    jsh.AppSrv.Upload(req, res);
  });
  router.get('/_dl/_temp/:keyid', function (req, res) {
    var keyid = req.params.keyid;
    if (typeof keyid === 'undefined') { next(); return; }
    var params = {};
    if (req.query && req.query.view) params.view = true;
    jsh.AppSrv.Download(req, res, '_temp', keyid, undefined, params);
  });
  router.get('/_dl/:modelid/:keyid/:fieldid', function (req, res) {
    var modelid = req.params.modelid;
    if (typeof modelid === 'undefined') { next(); return; }
    var keyid = req.params.keyid;
    if (typeof keyid === 'undefined') { next(); return; }
    var fieldid = req.params.fieldid;
    if (typeof fieldid === 'undefined') { next(); return; }
    var params = {};
    if (req.query && req.query.view) params.view = true;
    if (req.query && req.query.thumb) params.thumb = true;
    jsh.AppSrv.Download(req, res, modelid, keyid, fieldid, params);
  });
  router.get('/_token', function (req, res) { 
    jsh.AppSrv.GetToken(req, res);
  });
  router.post('/_d/_transaction', function (req, res) {
    if (!('data' in req.body)) { next(); return; }
    var data = JSON.parse(req.body.data);
    if (!(data instanceof Array)) { next(); return; }
    
    var dbtasks = {};
    if (global.debug_params.appsrv_requests) global.log(data);
    var i = 0;
    async.eachSeries(data, function (action, callback) {
      i += 1;
      var query = {};
      var post = {};
      if (!('method' in action)) throw new Error('Action missing method');
      if (!('model' in action)) throw new Error('Action missing model');
      var method = action.method;
      var modelid = action.model

      if (!jsh.hasModel(req, modelid)) throw new Error("Error: Model " + modelid + " not found in collection.");
      //Parse query, post
      if ('query' in action) query = querystring.parse(action.query);
      if ('post' in action) post = querystring.parse(action.post);
      processCustomRouting('d_transaction', req, res, jsh, modelid, function(){
        //Queue up dbtasks
        var actionprocessed = function (err, curdbtasks) {
          if (typeof curdbtasks == 'undefined') { return callback(new Error('Error occurred while processing DB action')); /*Error has occurred*/ }
          if (_.isEmpty(curdbtasks)) { return callback(null); /*Nothing to execute*/ }
          
          for (var model in curdbtasks) {
            dbtasks[i + '_' + model] = curdbtasks[model];
          }
          return callback(null);
        };
        if (method == 'get') actionprocessed(null, jsh.AppSrv.getModel(req, res, modelid, true, query, post));
        else if (method == 'put') jsh.AppSrv.putModel(req, res, modelid, true, query, post, actionprocessed);
        else if (method == 'post') jsh.AppSrv.postModel(req, res, modelid, true, query, post, actionprocessed);
        else if (method == 'delete') jsh.AppSrv.deleteModel(req, res, modelid, true, query, post, actionprocessed);
      }, { query: query, post: post });
    }, function (err) {
      if (err == null) {
        //Execute them all
        jsh.AppSrv.ExecTasks(req, res, dbtasks, true);
      }
    });
  });
  router.get('/_d/_report/:reportid/', function (req, res, next) {
    var modelid = '_report_' + req.params.reportid;
    if (typeof modelid === 'undefined') { next(); return; }
    processModelQuerystring(jsh, req, modelid);
    processCustomRouting('d_report', req, res, jsh, modelid, function(){
      jsh.AppSrv.getReport(req, res, modelid);
    });
  });
  router.get('/_d/_report_html/:reportid/', function (req, res, next) {
    var modelid = '_report_' + req.params.reportid;
    if (typeof modelid === 'undefined') { next(); return; }
    processModelQuerystring(jsh, req, modelid);
    processCustomRouting('d_report_html', req, res, jsh, modelid, function(){
      jsh.AppSrv.getReportHTML(req, res, modelid);
    });
  });
  router.get('/_d/_reportjob/:reportid/', function (req, res, next) {
    var modelid = '_report_' + req.params.reportid;
    if (typeof modelid === 'undefined') { next(); return; }
    processModelQuerystring(jsh, req, modelid);
    processCustomRouting('d_reportjob', req, res, jsh, modelid, function(){
      jsh.AppSrv.getReportJob(req, res, modelid);
    });
  });
  router.get('/_csv/:modelid/', function (req, res, next) {
    var modelid = req.params.modelid;
    if (typeof modelid === 'undefined') { next(); return; }
    if (!jsh.hasModel(req, modelid)) { next(); return; }
    var model = jsh.getModel(req, modelid);
    if (model.layout != 'grid') throw new Error('CSV Export only supported on Grid');
    processCustomRouting('csv', req, res, jsh, modelid, function(){
      var dbtask = jsh.AppSrv.getModelRecordset(req, res, modelid, req.query, req.body, global.export_rowlimit, { 'export': false });
      jsh.AppSrv.exportCSV(req, res, dbtask, modelid);
    });
  });
  router.get('/_queue/:queueid', function (req, res, next) {
    var queueid = req.params.queueid;
    if (typeof queueid === 'undefined') { next(); return; }
    jsh.AppSrv.SubscribeToQueue(req, res, next, queueid);
  });
  router.delete('/_queue/:queueid', function (req, res, next) {
    var queueid = req.params.queueid;
    if (typeof queueid === 'undefined') { next(); return; }
    jsh.AppSrv.PopQueue(req, res, queueid);
  });
  router.route('/_d/:modelid/')
		.all(function (req, res, next) {
    var modelid = req.params.modelid;
    if (typeof modelid === 'undefined') { next(); return; }
    if (!jsh.hasModel(req, modelid)) throw new Error("Error: Model " + modelid + " not found in collection.");
    processCustomRouting('d', req, res, jsh, modelid, function(){
      var verb = req.method.toLowerCase();
      if (verb == 'get') jsh.AppSrv.getModel(req, res, modelid);
      else if (verb == 'put') jsh.AppSrv.putModel(req, res, modelid);
      else if (verb == 'post') jsh.AppSrv.postModel(req, res, modelid);
      else if (verb == 'delete') jsh.AppSrv.deleteModel(req, res, modelid);
    });
  });
  router.get('/', function (req, res) {
    var modelid = jsh.getModelID(req);
    if (modelid != '') {
      return Helper.Redirect302(res,'/'+modelid);
    }
    else {
      //Get root menu and render
      var params = {};
      req.jshconfig.menu(req, res, jsh, params, function () {
        if (params.XMenu && params.XMenu.MainMenu) {
          for (var i = 0; i < params.XMenu.MainMenu.length; i++) {
            var link = params.XMenu.MainMenu[i].Link;
            if(link && (link != url.parse(req.originalUrl).pathname)) return Helper.Redirect302(res, link);
          }
        }
        //Show model listing, if applicable
        if(params.ShowListing){
          //_.extend(params, { title: 'Models', body: jsh.RenderListing(), XMenu: {}, TopMenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh });
          return jsh.RenderTemplate(req, res, 'index', {
            title: 'Models', body: jsh.RenderListing(), TopMenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh
          });
        }
        //Otherwise, show error
        res.end('No forms available');
      });
    }
  });
  router.get('/_report/:reportid/:reportkey?', function (req, res, next) {
    var modelid = '_report_' + req.params.reportid;
    if (!jsh.hasModel(req, modelid)) return next();
    processModelQuerystring(jsh, req, modelid);
    processCustomRouting('report', req, res, jsh, modelid, function(){
      genOnePage(jsh, req, res, modelid);
    });
  });
  router.get('/_model/:modelid', function (req, res, next) {
    //Return model meta-data for OnePage rendering
    var modelid = req.params.modelid;
    if (!jsh.hasModel(req, modelid)) return next();
    processModelQuerystring(jsh, req, modelid);
    processCustomRouting('model', req, res, jsh, modelid, function(){
      jsh.AppSrv.modelsrv.GetModel(req, res, modelid);
    });
  });
  router.get('/_restart', function (req, res, next) {
    if(!('SYSADMIN' in req._roles) && !('DEV' in req._roles)) return next();
    res.end('<html><body>Server will restart in 1 sec...<script type="text/javascript">window.setTimeout(function(){document.write(\'Restart initiated\');},1000);</script></body></html>');
    setTimeout(function(){ process.exit(); },1000);
  });
  router.get('/:modelid/:modelkey?', function (req, res, next) {
    //Verify model exists
    var modelid = req.params.modelid;
    if (!jsh.hasModel(req, modelid)){ return next(); }
    processModelQuerystring(jsh, req, modelid);
    processCustomRouting('onepage', req, res, jsh, modelid, function(){
      genOnePage(jsh, req, res, modelid);
    });
  });
  
  return router;
};

Routes.ValidateSystemConfig = function(jshconfig){
  if(Helper.notset(jshconfig.basetemplate)) jshconfig.basetemplate = 'index';
  if(Helper.notset(jshconfig.baseurl)) jshconfig.baseurl = '/';
  if(Helper.notset(jshconfig.show_system_errors)) jshconfig.show_system_errors = true;
  if(!jshconfig.menu) jshconfig.menu = function(req,res,jsh,params,onComplete){ params.ShowListing = true; onComplete(); }
  if(!jshconfig.globalparams) jshconfig.globalparams = {};
  if(!jshconfig.sqlparams) jshconfig.sqlparams = {};
  if(!jshconfig.public_apps) jshconfig.public_apps = [];
  if(!jshconfig.private_apps) jshconfig.private_apps = [];

  if(jshconfig.auth){
    if(Helper.notset(jshconfig.auth.on_login)) jshconfig.auth.on_login = function(req, jsh, params, cb){ //cb(err, rslt)
      jsh.AppSrv.ExecRecordset('login', req.jshconfig.auth.sql_login, [jsh.AppSrv.DB.types.VarChar(255)], params, cb);
    };
    if(Helper.notset(jshconfig.auth.on_superlogin)) jshconfig.auth.on_superlogin = function(req, jsh, params, cb){ //cb(err, rslt)
      jsh.AppSrv.ExecRecordset('login', req.jshconfig.auth.sql_superlogin, [jsh.AppSrv.DB.types.VarChar(255)], params, cb);
    };
    if(Helper.notset(jshconfig.auth.on_loginsuccess)) jshconfig.auth.on_loginsuccess = function(req, jsh, params, cb){ //cb(err, rslt)
      jsh.AppSrv.ExecRow(params[jsh.map.user_id], req.jshconfig.auth.sql_loginsuccess, [jsh.AppSrv.DB.types.VarChar(255), jsh.AppSrv.DB.types.BigInt, jsh.AppSrv.DB.types.DateTime(7)], params, cb);
    };
    if(Helper.notset(jshconfig.auth.on_passwordreset)) jshconfig.auth.on_passwordreset = function(req, jsh, params, cb){ //cb(err, rslt)
      jsh.AppSrv.ExecRow(params[jsh.map.user_id], req.jshconfig.auth.sql_passwordreset, [jsh.AppSrv.DB.types.VarBinary(200), jsh.AppSrv.DB.types.VarChar(255), jsh.AppSrv.DB.types.BigInt, jsh.AppSrv.DB.types.DateTime(7)], params, cb);
    };
    if(Helper.notset(jshconfig.auth.on_auth)) jshconfig.auth.on_auth = function(req, jsh, params, cb){ //cb(err, rslt)
      jsh.AppSrv.ExecMultiRecordset('login', req.jshconfig.auth.sql_auth, [jsh.AppSrv.DB.types.VarChar(255)], params, cb);
    };
  }
}

function genOnePage(jsh, req, res, modelid){
  //Render OnePage body content
  var ejsbody = require('ejs').render(jsh.getEJS('jsh_onepage'), {
    req: req, _: _, ejsext: ejsext,
    srcfiles: jsh.AppSrv.modelsrv.srcfiles,
    popups: jsh.Popups
  });
  //Set template (popup vs full)
  var tmpl_name = req.jshconfig.basetemplate;
  var model = jsh.getModel(req, modelid);
  if ('popup' in model){
    if('popup' in global.views) tmpl_name = 'popup';
  }
  //Render page
  jsh.RenderTemplate(req, res, tmpl_name, {
    title: '', body: ejsbody, TopMenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh
  });
}

function processModelQuerystring(jsh, req, modelid) {
  if (!jsh.hasModel(req, modelid)) return;
  req.forcequery = {};
  var model = jsh.getModel(req, modelid);
  if (!('querystring' in model)) return;
  var qs = model.querystring;
  for (qkey in model.querystring) {
    if (qkey.length < 2) continue;
    var qtype = qkey[0];
    var qkeyname = qkey.substr(1);
    if ((qtype == '&') || ((qtype == '|') && !(qkeyname in req.query))) {
      var qval = model.querystring[qkey];
      qval = Helper.ResolveParams(req, qval);
      //Resolve qval
      req.query[qkeyname] = qval;
      req.forcequery[qkeyname] = qval;
    }
  }
}

function processCustomRouting(routetype, req, res, jsh, modelid, cb, params){
  var model = jsh.getModel(req, modelid);
  if (model && model.onroute) {
    var onroute_params = { };
    if((routetype=='d') || (routetype=='csv')){
      var verb = req.method.toLowerCase();
      if((model.layout=='grid') && (verb == 'get')){
        onroute_params = { query: {}, post: req.body };
        if (req.query && ('d' in req.query)) onroute_params.query = JSON.parse(req.query.d);
      }
      else onroute_params = { query: req.query, post: req.body }
    }
    else if(routetype=='d_transaction'){ onroute_params = params; }
    else { onroute_params = { query: req.query, post: req.body }; }
    return model.onroute(routetype, req, res, cb, require, jsh, modelid, onroute_params);
  }
  else return cb();
}

function setNoCache(req, res){
  if (req.headers['user-agent'] && req.headers['user-agent'].match(/Trident\//)) {
    //Add Cache header for IE
    res.header('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
  }
}

module.exports = Routes;