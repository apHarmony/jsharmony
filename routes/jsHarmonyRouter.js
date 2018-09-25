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

var ejs = require('ejs');
var ejsext = require('../lib/ejsext.js');
var Helper = require('../lib/Helper.js');
var HelperFS = require('../lib/HelperFS.js');
var jsHarmonySite = require('../jsHarmonySite.js');
var async = require('async');
var url = require('url');

var jsHarmonyRouter = function (jsh, siteid) {
  if(!(siteid in jsh.Sites)) throw new Error('Site '+siteid+' not defined');
  var siteConfig = jsh.Sites[siteid];
  siteConfig.Validate();
  var router = express.Router();
  router.jsh = jsh;
  router.jshsite = siteConfig;
  if (siteConfig.onLoad) siteConfig.onLoad(jsh, router);
  
  /* GET home page. */
  router.all('*', function (req, res, next) {
    req.baseurl = siteConfig.baseurl;
    req.jshsite = siteConfig;
    req.jshlocal = {
      Models: { },
    };
    req.forcequery = {};
    req.getJSClientParams = function () { return jsh.getJSClientParams(req, jsh); }
    req.getJSH = function() { return jsh; };
    if (jsh.Config.debug_params.web_detailed_errors) req._web_detailed_errors = 1;
    setNoCache(req,res);
    res.setHeader('X-UA-Compatible','IE=edge');
    return next();
  });
  router.route('/login').all(function (req, res, next) {
    if(!siteConfig.auth){ jsh.Log.error('Auth not configured in config'); return next(); }
    (siteConfig.auth.onRenderLogin || jsh.RenderLogin).call(jsh, req, res, function (rslt) {
      if (rslt != false) jsh.RenderTemplate(req, res, '', { title: 'Login', body: rslt, XMenu: {}, TopMenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh });
    });
  });
  router.route('/login/forgot_password').all(function (req, res, next) {
    if(!siteConfig.auth){ jsh.Log.error('Auth not configured in config'); return next(); }
    (siteConfig.auth.onRenderLoginForgotPassword || jsh.RenderLoginForgotPassword).call(jsh, req, res, function (rslt) {
      if (rslt != false) jsh.RenderTemplate(req, res, '', { title: 'Forgot Password', body: rslt, XMenu: {}, TopMenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh });
    });
  });
  router.route('/login/forgot_password_reset').all(function (req, res, next) {
    if(!siteConfig.auth){ jsh.Log.error('Auth not configured in config'); return next(); }
    (siteConfig.auth.onRenderLoginForgotPasswordReset || jsh.RenderLoginForgotPasswordReset).call(jsh, req, res, function (rslt) {
      if (rslt != false) jsh.RenderTemplate(req, res, '', { title: 'Reset Password', body: rslt, XMenu: {}, TopMenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh });
    });
  });
  for (var i = 0; i < jsh.Config.public_apps.length; i++) {
    var app = jsh.Config.public_apps[i];
    for (var j in app) router.all(j, app[j].bind(jsh.AppSrv));
  }
  for (var i = 0; i < siteConfig.public_apps.length; i++) {
    var app = siteConfig.public_apps[i];
    for (var j in app) router.all(j, app[j].bind(jsh.AppSrv));
  }
  router.get('/application.css', function (req, res) {
    //Concatenate jsh css with system css
    var f = function(){ HelperFS.outputContent(req, res, ejs.render(jsh.Cache['jsHarmony.css'] + '\r\n' + jsh.Cache['application.css'], { req: req, rootcss: req.jshsite.rootcss }),'text/css'); };
    if(jsh.Cache['jsHarmony.css']) f();
    else{
      var jshDir = path.dirname(module.filename);
      fs.readFile(jshDir + '/../jsHarmony.css','utf8',function(err,data){
        if(err) jsh.Log.error(err);
        else{
          jsh.Cache['jsHarmony.css'] = data;
          jsh.LoadFilesToString(jsh.Config.css_extensions, function(err,extdata){
            if(err) jsh.Log.error(err);
            jsh.Cache['jsHarmony.css'] += "\r\n" + extdata;
            f();
          });
        }
      });
    }
  });
  router.all('*', function (req, res, next) {
    if(!siteConfig.auth){ return jsh.Auth.NoAuth(req, res, next); }
    //Handle Authentication
    (siteConfig.auth.onAuth || jsh.Auth).call(jsh, req, res, next, function (errno, msg) {
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
    if(!siteConfig.auth){ jsh.Log.error('Auth not configured in config'); return next(); }
    jsh.RenderLogout(req, res, function (rslt) {
      if (rslt != false) jsh.RenderTemplate(req, res, '', { title: 'Logout', body: rslt, XMenu: {}, TopMenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh });
    });
  });
  router.get('/application.js', function (req, res) {
    HelperFS.outputContent(req, res, jsh.Cache['application.js'],'text/javascript');
  });
  for (var i = 0; i < jsh.Config.private_apps.length; i++) {
    var app = jsh.Config.private_apps[i];
    for (var j in app) router.all(j, app[j].bind(jsh.AppSrv));
  }
  for (var i = 0; i < siteConfig.private_apps.length; i++) {
    var app = siteConfig.private_apps[i];
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
    if (jsh.Config.debug_params.appsrv_requests) jsh.Log.info(data);
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
      var dbtask = jsh.AppSrv.getModelRecordset(req, res, modelid, req.query, req.body, jsh.Config.export_rowlimit, { 'export': false });
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
      req.jshsite.menu(req, res, jsh, params, function () {
        if (params.XMenu && params.XMenu.MainMenu) {
          for (var i = 0; i < params.XMenu.MainMenu.length; i++) {
            var link = params.XMenu.MainMenu[i].Link;
            if(link && (link != url.parse(req.originalUrl).pathname)) return Helper.Redirect302(res, link);
          }
        }
        //Show model listing, if no menu exists and user has access
        if(params.ShowListing || !siteConfig.auth || ('DEV' in req._roles)){
          //_.extend(params, { title: 'Models', body: jsh.RenderListing(), XMenu: {}, TopMenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh });
          return jsh.RenderTemplate(req, res, 'index', {
            title: 'Models', body: jsh.RenderListing(), TopMenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh
          });
        }
        //Otherwise, show error
        var no_forms_html = '<html><body>No forms available';
        if(siteConfig.auth) no_forms_html += '<br/><br/><a href="'+req.baseurl+'logout">Logout</a>';
        no_forms_html += '</body</html>';
        res.end(no_forms_html);
      });
    }
  });
  router.get('/_report/:reportid/:reportkey?', function (req, res, next) {
    var modelid = '_report_' + req.params.reportid;
    if (!jsh.hasModel(req, modelid)) return next();
    processModelQuerystring(jsh, req, modelid);
    processCustomRouting('report', req, res, jsh, modelid, function(){
      genSinglePage(jsh, req, res, modelid);
    });
  });
  router.get('/_model/:modelid', function (req, res, next) {
    //Return model meta-data for SinglePage rendering
    var modelid = req.params.modelid;
    if (!jsh.hasModel(req, modelid)) return next();
    processModelQuerystring(jsh, req, modelid);
    processCustomRouting('model', req, res, jsh, modelid, function(){
      jsh.AppSrv.modelsrv.GetModel(req, res, modelid);
    });
  });
  router.get('/_restart', function (req, res, next) {
    if(!('SYSADMIN' in req._roles) && !('DEV' in req._roles)) return next();
    res.end('<html><body>System will restart in 1 sec...<script type="text/javascript">window.setTimeout(function(){document.write(\'Restart initiated...\');},1000); window.setTimeout(function(){window.location.href="/";},5000);</script></body></html>');
    setTimeout(function(){ process.exit(); },1000);
  });
  router.post('/_db/exec', function (req, res, next) {
    if(!('SYSADMIN' in req._roles) && !('DEV' in req._roles)) return next();
    var sql = req.body.sql;
    var dbid = req.body.db;
    if(!(dbid in jsh.DB)) { Helper.GenError(req, res, -4, 'Invalid Database ID'); return; }
    var db = jsh.DB[dbid];

    //Run as user, if applicable
    var dbconfig = jsh.DBConfig[dbid];
    if(req.body.runas_user){
      dbconfig = _.extend({}, dbconfig);
      dbconfig.user = req.body.runas_user;
      dbconfig.password = req.body.runas_password;
    }

    db.MultiRecordset(req._DBContext, sql, [], {}, undefined, function (err, dbrslt) {
      if(err){ err.sql = sql; return jsh.AppSrv.AppDBError(req, res, err); }
      rslt = {
        '_success': 1,
        'dbrslt': dbrslt
      };
      res.send(JSON.stringify(rslt));
    }, dbconfig);
  });
  router.get('/:modelid/:modelkey?', function (req, res, next) {
    //Verify model exists
    var modelid = req.params.modelid;
    if (!jsh.hasModel(req, modelid)){ return next(); }
    processModelQuerystring(jsh, req, modelid);
    processCustomRouting('singlepage', req, res, jsh, modelid, function(){
      genSinglePage(jsh, req, res, modelid);
    });
  });
  
  return router;
};

function genSinglePage(jsh, req, res, modelid){
  //Render SinglePage body content
  var ejsbody = require('ejs').render(jsh.getEJS('jsh_singlepage'), {
    req: req, _: _, ejsext: ejsext, jsh: jsh,
    srcfiles: jsh.AppSrv.modelsrv.srcfiles,
    popups: jsh.Popups
  });
  //Set template (popup vs full)
  var tmpl_name = req.jshsite.basetemplate;
  var model = jsh.getModel(req, modelid);
  if ('popup' in model){
    if('popup' in jsh.Views) tmpl_name = 'popup';
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
  var qs = model.querystring||{};
  var foundq = [];
  for (qkey in model.querystring) {
    if (qkey.length < 2) continue;
    var qtype = qkey[0];
    var qkeyname = qkey.substr(1);
    foundq.push(qkeyname);
    if ((qtype == '&') || ((qtype == '|') && !(qkeyname in req.query))) {
      var qval = model.querystring[qkey];
      qval = Helper.ResolveParams(req, qval);
      //Resolve qval
      req.query[qkeyname] = qval;
      req.forcequery[qkeyname] = qval;
    }
  }
  //Add querystring parameters for datalocks
  for(var datalockid in req.jshsite.datalock){
    if(_.includes(foundq, datalockid)) continue;
    if(!(datalockid in req.query)){
      var qval = Helper.ResolveParams(req, '@'+datalockid);
      req.query[datalockid] = qval;
      req.forcequery[datalockid] = qval;
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

module.exports = jsHarmonyRouter;