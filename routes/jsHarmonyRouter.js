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
var csv = require('csv');

var jsHarmonyRouter = function (jsh, siteid) {
  if(!(siteid in jsh.Sites)) throw new Error('Site '+siteid+' not defined');
  var siteConfig = jsh.Sites[siteid];
  siteConfig.processCustomRouting = processCustomRouting;
  siteConfig.Validate();
  var router = express.Router();
  router.jsh = jsh;
  router.jshsite = siteConfig;
  if(!siteConfig.router) siteConfig.router = router;
  if (siteConfig.onLoad) siteConfig.onLoad(jsh, router);

  function bindApps(apps){
    if(!apps) return;
    for (var i = 0; i < apps.length; i++) {
      var app = apps[i];
      for (var j in app){
        var pathExp = j;
        if(j.toString().substr(0,6)=='regex:'){
          pathExp = new RegExp(j.substr(6));
        }
        if(app[j].route){ router.use(pathExp, app[j]); }
        else router.all(pathExp, app[j].bind(jsh.AppSrv));
      }
    }
  }
  
  /* GET home page. */
  router.all('*', function (req, res, next) {
    req.baseurl = siteConfig.baseurl;
    req.jshsite = siteConfig;
    req.jshlocal = {
      Models: { },
    };
    req.forcequery = {};
    //Delete jQuery Anti-Cache timestamp
    if('_' in req.query) delete req.query['_'];
    req.getJSClientParams = function () { return jsh.getJSClientParams(req); }
    req.getJSLocals = function(){ return jsh.getJSLocals(req); }
    req.getJSH = function() { return jsh; };
    if (req.jshsite && req.jshsite.show_system_errors) req._show_system_errors = 1;
    setNoCache(req,res);
    res.setHeader('X-UA-Compatible','IE=edge');
    return next();
  });
  //Add Artificial Delay (Optional for testing)
  router.all('*', function(req, res, next){
    if(jsh && jsh.Config && jsh.Config.debug_params && jsh.Config.debug_params.delay_requests) setTimeout(next, jsh.Config.debug_params.delay_requests);
    else next();
  });
  router.route('/login').all(function (req, res, next) {
    if(!siteConfig.auth){ jsh.Log.error('Auth not configured in config'); return next(); }
    (siteConfig.auth.onRenderLogin || jsh.RenderLogin).call(jsh, req, res, function (rslt) {
      if (rslt != false) jsh.RenderTemplate(req, res, '', { title: 'Login', body: rslt, menudata: {}, selectedmenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh });
    });
  });
  router.route('/login/forgot_password').all(function (req, res, next) {
    if(!siteConfig.auth){ jsh.Log.error('Auth not configured in config'); return next(); }
    (siteConfig.auth.onRenderLoginForgotPassword || jsh.RenderLoginForgotPassword).call(jsh, req, res, function (rslt) {
      if (rslt != false) jsh.RenderTemplate(req, res, '', { title: 'Forgot Password', body: rslt, menudata: {}, selectedmenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh });
    });
  });
  router.route('/login/forgot_password_reset').all(function (req, res, next) {
    if(!siteConfig.auth){ jsh.Log.error('Auth not configured in config'); return next(); }
    (siteConfig.auth.onRenderLoginForgotPasswordReset || jsh.RenderLoginForgotPasswordReset).call(jsh, req, res, function (rslt) {
      if (rslt != false) jsh.RenderTemplate(req, res, '', { title: 'Reset Password', body: rslt, menudata: {}, selectedmenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh });
    });
  });
  bindApps(siteConfig.public_apps);
  for(var stylusName in jsh.Stylus){
    handleStylus(jsh, siteid, router, stylusName, { public: true });
  }
  router.get('/application.css', function (req, res) {
    //Concatenate jsh css with system css
    jsh.getSystemCSS(function(systemCSS){
      var rootcss = req.jshsite.rootcss;
      if(req.query.rootcss) rootcss = req.query.rootcss;
      var instanceName = req.jshsite.instance;
      HelperFS.outputContent(req, res, ejs.render(systemCSS + '\r\n' + jsh.Cache['application.css'], {
        req: req,
        rootcss: rootcss,
        jshElementSelector: (instanceName ? '.jsHarmonyElement_'+Helper.escapeCSSClass(instanceName) : ''),
        _: _,
      }),'text/css');
    });
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
        req.isAuthenticated = false;
        return next();
      }
    });
  });
  bindApps(siteConfig.privateoptional_apps);
  router.all('*', function(req, res, next){
    if(!req.isAuthenticated){
      var loginurl = req.baseurl + 'login?' + querystring.stringify({ 'source': req.originalUrl });
      jsh.Redirect302(res, loginurl);
    }
    else return next();
  });
  router.get('/logout', function (req, res, next) {
    if(!siteConfig.auth){ jsh.Log.error('Auth not configured in config'); return next(); }
    (siteConfig.auth.onRenderLogout || jsh.RenderLogout).call(jsh, req, res, function (rslt) {
      if (rslt != false) jsh.RenderTemplate(req, res, '', { title: 'Logout', body: rslt, menudata: {}, selectedmenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh });
    });
  });
  router.get('/application.js', function (req, res) {
    HelperFS.outputContent(req, res, Helper.ReplaceAll(jsh.Cache['application.js'],'{req.jshsite.instance}',req.jshsite.instance), 'text/javascript');
  });
  router.get(/^\/js\/jsHarmony.render.js/, function(req, res, next){
    res.end(ejs.render(jsh.getEJS('jsh_render.js'), {
      req: req, _: _, ejsext: ejsext, jsh: jsh,
      srcfiles: jsh.AppSrv.modelsrv.getSrcFiles(),
      popups: jsh.Popups,
      _: _
    }));
  });
  router.get(/^\/js\/jsHarmony.loader.js/, function (req, res, next) {
    //Verify model exists
    res.end(ejs.render(jsh.getEJS('jsh_loader.js'), {
      req: req, _: _, ejsext: ejsext, jsh: jsh,
      srcfiles: jsh.AppSrv.modelsrv.getSrcFiles(),
      popups: jsh.Popups,
      _: _
    }));
  });
  bindApps(siteConfig.private_apps);
  for(var stylusName in jsh.Stylus){
    handleStylus(jsh, siteid, router, stylusName, { public: false });
  }
  router.post('/_ul/clear', function (req, res) {
    jsh.AppSrv.ClearUpload(req, res);
  });
  router.post('/_ul/ckeditor', function (req, res) {
    jsh.AppSrv.UploadCKEditor(req, res);
  });
  router.post('/_ul/', function (req, res) {
    req.jsproxyid = 'xfileuploader';
    if(req.query && ('jsproxyid' in req.query)) req.jsproxyid = req.query.jsproxyid;
    jsh.AppSrv.Upload(req, res);
  });
  router.post('/_ul/json', function (req, res) {
    jsh.AppSrv.Upload(req, res);
  });
  router.get('/_dl/_temp/:keyid', function (req, res, next) {
    var keyid = req.params.keyid;
    if (typeof keyid === 'undefined') { next(); return; }
    var params = {};
    if (req.query && req.query.view) params.view = true;
    jsh.AppSrv.Download(req, res, '_temp', keyid, undefined, params);
  });
  //router.get('/_dl/:modelid/:keyid/:fieldid', function (req, res, next) {
  router.get(/^\/\_dl\/(.*)\/([^/]*)\/([^/]*)/, function (req, res, next) {
    var fullmodelid = req.params[0];
    fullmodelid = Helper.trimRight(fullmodelid,'/');
    if (typeof fullmodelid === 'undefined') { next(); return; }
    var keyid = req.params[1];
    if (typeof keyid === 'undefined') { next(); return; }
    var fieldid = req.params[2];
    if (typeof fieldid === 'undefined') { next(); return; }
    var params = {};
    if (req.query && req.query.view) params.view = true;
    if (req.query && ('thumb' in req.query)) params.thumb = req.query.thumb;
    jsh.AppSrv.Download(req, res, fullmodelid, keyid, fieldid, params);
  });
  router.get('/_token', function (req, res) { 
    jsh.AppSrv.GetToken(req, res);
  });
  router.post('/_d/_transaction', function (req, res, next) {
    if (!('data' in req.body)) { next(); return; }
    var data = JSON.parse(req.body.data);
    if (!(data instanceof Array)) { next(); return; }
    
    var dbtasks = {};
    if (jsh.Config.debug_params.appsrv_requests) jsh.Log.info(data);
    var i = 0;
    var firstdb = undefined;
    async.eachSeries(data, function (action, callback) {
      i += 1;
      var query = {};
      var post = {};
      if (!('method' in action)) throw new Error('Action missing method');
      if (!('model' in action)) throw new Error('Action missing model');
      var method = action.method;
      var fullmodelid = action.model

      if (!jsh.hasModel(req, fullmodelid)) throw new Error("Error: Model " + fullmodelid + " not found in collection.");
      //Parse query, post
      if ('query' in action) query = querystring.parse(action.query);
      if ('post' in action) post = querystring.parse(action.post);
      processCustomRouting('d_transaction', req, res, jsh, fullmodelid, function(){
        //Queue up dbtasks
        var actionprocessed = function (err, curdbtasks) {
          if (typeof curdbtasks == 'undefined') { return callback(new Error('Error occurred while processing DB action')); /*Error has occurred*/ }
          if (_.isEmpty(curdbtasks)) { return callback(null); /*Nothing to execute*/ }
          
          for (var model in curdbtasks) {
            dbtasks[i + '_' + model] = curdbtasks[model];
          }
          return callback(null);
        };
        if (method == 'get') actionprocessed(null, jsh.AppSrv.getModel(req, res, fullmodelid, true, query, post));
        else if (method == 'put') jsh.AppSrv.putModel(req, res, fullmodelid, true, query, post, actionprocessed);
        else if (method == 'post') jsh.AppSrv.postModel(req, res, fullmodelid, true, query, post, actionprocessed);
        else if (method == 'delete') jsh.AppSrv.deleteModel(req, res, fullmodelid, true, query, post, actionprocessed);
        firstdb = jsh.getModelDB(req, fullmodelid);
      }, { query: query, post: post });
    }, function (err) {
      if (err == null) {
        //Execute them all
        jsh.AppSrv.ExecTasks(req, res, dbtasks, true, undefined, { db: firstdb });
      }
    });
  });
  // /_d/_report/:modelid
  router.get(/^\/\_d\/\_report\/(.*)/, function (req, res, next) {
    var fullmodelid = req.params[0];
    fullmodelid = Helper.trimRight(fullmodelid,'/');
    if (typeof fullmodelid === 'undefined') { next(); return; }
    processModelQuerystring(jsh, req, fullmodelid);
    processCustomRouting('d_report', req, res, jsh, fullmodelid, function(){
      jsh.AppSrv.getReport(req, res, fullmodelid);
    });
  });
  // /_d/_report_html/:modelid
  router.get(/^\/\_d\/\_report_html\/(.*)/, function (req, res, next) {
    var fullmodelid = req.params[0];
    fullmodelid = Helper.trimRight(fullmodelid,'/');
    if (typeof fullmodelid === 'undefined') { next(); return; }
    processModelQuerystring(jsh, req, fullmodelid);
    processCustomRouting('d_report_html', req, res, jsh, fullmodelid, function(){
      jsh.AppSrv.getReportHTML(req, res, fullmodelid);
    });
  });
  // /_d/_reportjob/:modelid
  router.get(/^\/\_d\/\_reportjob\/(.*)/, function (req, res, next) {
    var fullmodelid = req.params[0];
    fullmodelid = Helper.trimRight(fullmodelid,'/');
    if (typeof fullmodelid === 'undefined') { next(); return; }
    processModelQuerystring(jsh, req, fullmodelid);
    processCustomRouting('d_reportjob', req, res, jsh, fullmodelid, function(){
      jsh.AppSrv.getReportJob(req, res, fullmodelid);
    });
  });
  // /_csv/:modelid
  router.get(/^\/\_csv\/(.*)/, function (req, res, next) {
    var fullmodelid = req.params[0];
    fullmodelid = Helper.trimRight(fullmodelid,'/');
    if (typeof fullmodelid === 'undefined') { next(); return; }
    if (!jsh.hasModel(req, fullmodelid)) { next(); return; }
    var model = jsh.getModel(req, fullmodelid);
    if (model.layout != 'grid') throw new Error('CSV Export only supported on Grid');
    processCustomRouting('csv', req, res, jsh, fullmodelid, function(){
      var dbtask = jsh.AppSrv.getModelRecordset(req, res, fullmodelid,
        _.pick(req.query || {}, ['rowstart', 'rowcount', 'sort', 'search', 'searchjson', 'd', 'meta', 'getcount']),
        req.body, jsh.Config.export_rowlimit, {'export': false}
      );
      var options = _.pick(req.query || {}, ['columns']);
      jsh.AppSrv.exportCSV(req, res, dbtask, fullmodelid, options);
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
  router.route(/^\/\_d\/(.*)/)
		.all(function (req, res, next) {
    var fullmodelid = req.params[0];
    fullmodelid = Helper.trimRight(fullmodelid,'/');
    if (typeof fullmodelid === 'undefined') { next(); return; }
    if (!jsh.hasModel(req, fullmodelid)) throw new Error("Error: Model " + fullmodelid + " not found in collection.");
    processCustomRouting('d', req, res, jsh, fullmodelid, function(){
      var verb = req.method.toLowerCase();
      if (verb == 'get') jsh.AppSrv.getModel(req, res, fullmodelid);
      else if (verb == 'put') jsh.AppSrv.putModel(req, res, fullmodelid);
      else if (verb == 'post') jsh.AppSrv.postModel(req, res, fullmodelid);
      else if (verb == 'delete') jsh.AppSrv.deleteModel(req, res, fullmodelid);
    });
  });
  router.get('/', function (req, res) {
    //Get root menu and render
    var params = {};
    req.jshsite.menu(req, res, jsh, params, function () {
      if (params.startmodel && (params.startmodel != url.parse(req.originalUrl).pathname)) {
        return Helper.Redirect302(res, params.startmodel);
      }
      //Show model listing, if no menu exists and user has access
      if(params.showlisting || !siteConfig.auth || ('DEV' in req._roles)){
        return jsh.RenderTemplate(req, res, 'index', {
          title: 'Models', body: jsh.RenderListing(req), selectedmenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh
        });
      }
      //Otherwise, show error
      var no_forms_html = '<html><body>No forms available';
      if(siteConfig.auth) no_forms_html += '<br/><br/><a href="'+req.baseurl+'logout">Logout</a>';
      no_forms_html += '</body</html>';
      res.end(no_forms_html);
    });
  });
  // /_report/:modelid
  router.get(/^\/\_report\/(.*)/, function (req, res, next) {
    var fullmodelid = req.params[0];
    fullmodelid = Helper.trimRight(fullmodelid,'/');
    if (!jsh.hasModel(req, fullmodelid)) return next();
    processModelQuerystring(jsh, req, fullmodelid);
    processCustomRouting('report', req, res, jsh, fullmodelid, function(){
      genSinglePage(jsh, req, res, fullmodelid);
    });
  });
  // /_model/:modelid
  router.get(/^\/\_model\/(.*)/, function (req, res, next) {
    //Return model meta-data for SinglePage rendering
    var fullmodelid = req.params[0];
    fullmodelid = Helper.trimRight(fullmodelid,'/');
    if (!jsh.hasModel(req, fullmodelid)) return next();
    processModelQuerystring(jsh, req, fullmodelid);
    processCustomRouting('model', req, res, jsh, fullmodelid, function(){
      jsh.AppSrv.modelsrv.GetModel(req, res, fullmodelid);
    });
  });
  router.get('/_restart', function (req, res, next) {
    if(!('SYSADMIN' in req._roles) && !('DEV' in req._roles)) return next();
    res.end('<html><body>System will restart in 1 sec...<script type="text/javascript">window.setTimeout(function(){document.write(\'Restart initiated...\');},1000); window.setTimeout(function(){window.location.href="/";},5000);</script></body></html>');
    setTimeout(function(){ process.exit(); },1000);
  });
  router.get('/_listing', function (req, res, next) {
    if(!('SYSADMIN' in req._roles) && !('DEV' in req._roles)) return next();
    return jsh.RenderTemplate(req, res, 'index', {
      title: 'Models', body: jsh.RenderListing(req), selectedmenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh
    });
  });
  router.post('/_js/exec', function (req, res, next) {
    if(!('SYSADMIN' in req._roles) && !('DEV' in req._roles)) return next();
    var sql = req.body.sql;
    var js = req.body.js;

    var jsvars = {
      appsrv: 'jsh.AppSrv'
    };
    var jscmd = '(function(jsh){'+_.reduce(jsvars, function(rslt, val,key){ return 'var '+key+' = '+val+'; ' }, '')+'return (function(){'+js+'})();}).call(undefined, jsh)';
    var jsrslt = '';
    var jserr = '';
    try{
      var jsrslt = eval(jscmd);
    }
    catch(ex){
      jserr = ex.toString();
    }
    var strrslt = '';
    try {
      if(_.isString(jsrslt)) strrslt = jsrslt;
      else if(!jsrslt) strrslt = JSON.stringify(jsrslt);
      else strrslt = JSON.stringify(jsrslt, null, 4);
    }
    catch(ex){
      strrslt = Helper.stringify(jsrslt, null, 4);
    }
    var rslt = {
      '_success': 1,
      'jsrslt': strrslt,
      'err': jserr
    };
    res.send(rslt);
  });
  router.post('/_db/exec', function (req, res, next) {
    if(!('SYSADMIN' in req._roles) && !('DEV' in req._roles)) return next();
    var sql = req.body.sql;
    var dbid = req.body.db;
    if(!(dbid in jsh.DB)) { Helper.GenError(req, res, -4, 'Invalid Database ID'); return; }
    var db = jsh.DB[dbid];

    var export_csv = false;

    //Run as user, if applicable
    var dbconfig = jsh.DBConfig[dbid];
    if(req.body.runas_user){
      dbconfig = _.extend({}, dbconfig);
      dbconfig.user = req.body.runas_user;
      dbconfig.password = req.body.runas_password;
    }
    if(req.body.export_csv) export_csv = true;

    var show_notices = false;
    if(req.body.show_notices) show_notices = true;

    var context = req._DBContext;
    if(req.body.nocontext) context = '';

    db.MultiRecordset(context, sql, [], {}, undefined, function (err, dbrslt, stats) {
      if(err){ err.sql = sql; return jsh.AppSrv.AppDBError(req, res, err, stats); }
      //Convert buffers to hex strings
      Helper.convertBufferToHexString(dbrslt);
      //Return result
      rslt = {
        '_success': 1,
        '_stats': Helper.FormatStats(req, stats, { notices: show_notices, show_all_messages: true }),
        'dbrslt': dbrslt
      };

      if(export_csv){
        var csvdata = [];
        var sql_lines = (sql||'').toString().split('\n');
        _.each(sql_lines, function(sql_line){ csvdata.push([sql_line]); });
        csvdata.push([]);
        for(var rs_id in dbrslt){
          csvdata.push(['Resultset', rs_id]);
          var rs = dbrslt[rs_id];
          if(rs.length) csvdata.push(_.keys(rs[0]));
          for(var i=0;i < rs.length;i++) csvdata.push(_.values(rs[i]));
          csvdata.push([]);
        }
        //No results found
        res.writeHead(200, {
          'Content-Type': 'text/csv',
          //'Content-Length': stat.size,
          'Content-Disposition': 'attachment; filename=' + encodeURIComponent('db_exec_'+(new Date().getTime()).toString()+'.csv')
        });
        csv.stringify(csvdata, { quotedString: true }).pipe(res);
      }
      else {
        res.send(JSON.stringify(rslt));
      }
    }, dbconfig);
  });
  // /_debug/:modelid
  router.get(/^\/\_debug\/(.*)/, function (req, res, next) {
    if(!('SYSADMIN' in req._roles) && !('DEV' in req._roles)) return next();
    var fullmodelid = req.params[0];
    fullmodelid = Helper.trimRight(fullmodelid,'/');
    if (typeof fullmodelid === 'undefined') { next(); return; }
    if (!jsh.hasModel(req, fullmodelid)) { next(); return; }
    var model = jsh.getModel(req, fullmodelid);
    res.header("Content-Type",'application/json');
    //Sort alpha
    res.send(JSON.stringify(model,function(key,val){
      if(_.isString(val)) return val;
      if(_.isNumber(val)) return val;
      if(_.isBoolean(val)) return val;
      if(!val) return val;
      if(_.isArray(val)){ var arr = _.clone(val); arr.sort(); return arr; }
      var obj = {};
      var keys = _.keys(val);
      keys.sort();
      _.each(keys, function(key){ obj[key] = val[key]; });
      return obj;
    },4));
  });
  router.get(/^\/(.*)/, function (req, res, next) {
    //Verify model exists
    var fullmodelid = req.params[0];
    fullmodelid = Helper.trimRight(fullmodelid,'/');
    if (!jsh.hasModel(req, fullmodelid)){ return next(); }
    processModelQuerystring(jsh, req, fullmodelid);
    processCustomRouting('singlepage', req, res, jsh, fullmodelid, function(){
      genSinglePage(jsh, req, res, fullmodelid);
    });
  });
  router.get('*', function(req, res, next){
    //Validate WebSocket exists
    var server = jsh.Servers['default'];
    if(server && server.serverConfig.webSockets){
      var pathname = url.parse(req.url).pathname;
      for(var i=0;i<server.serverConfig.webSockets.length;i++){
        var webSocket = server.serverConfig.webSockets[i];
        if(webSocket.path==pathname){
          res._headers = res._headers || {};
          res.end('WEBSOCKET');
          return;
        }
      }
    }
    return next();
  });
  bindApps(siteConfig.catchall_apps);
  
  return router;
};

function genSinglePage(jsh, req, res, fullmodelid){
  //Render SinglePage body content
  var ejsbody = ejs.render(jsh.getEJS('jsh_singlepage'), {
    req: req, _: _, ejsext: ejsext, jsh: jsh,
    _: _
  });
  //Set template (popup vs full)
  var tmpl_name = req.jshsite.basetemplate;
  var model = jsh.getModel(req, fullmodelid);
  if ('popup' in model){
    if('popup' in jsh.Views) tmpl_name = 'popup';
  }
  //Render page
  jsh.RenderTemplate(req, res, tmpl_name, {
    title: '', body: ejsbody, selectedmenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh
  });
}

function processModelQuerystring(jsh, req, fullmodelid) {
  if (!jsh.hasModel(req, fullmodelid)) return;
  req.forcequery = {};
  var model = jsh.getModel(req, fullmodelid);
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

function processCustomRouting(routetype, req, res, jsh, fullmodelid, cb, params){
  var model = jsh.getModel(req, fullmodelid);
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

    try{
      model.onroute(routetype, req, res, cb, require, jsh, fullmodelid, onroute_params);
    }
    catch(ex){
      Helper.GenError(req, res, -99999, 'Error processing model.onroute for '+fullmodelid+'::'+routetype+' with '+JSON.stringify(onroute_params)+': '+ex.toString());
    }
  }
  else return cb();
}

function setNoCache(req, res){
  if (req.headers['user-agent'] && req.headers['user-agent'].match(/Trident\//)) {
    //Add Cache header for IE
    res.header('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
  }
}

function handleStylus(jsh, siteid, router, stylusName, options){
  options = _.extend({ public: true }, options);
  var stylusConfig = jsh.Stylus[stylusName];
  var stylusSites = [];
  if(!('roles' in stylusConfig)) stylusSites = [siteid];
  else stylusSites = Helper.GetRoleSites(stylusConfig.roles);
  if(options.public && !stylusConfig.public) return;
  if(!options.public && stylusConfig.public) return;
  if(_.includes(stylusSites, siteid)) router.get(stylusConfig.path, function(req, res){
    if (!options.public && !Helper.hasModelAction(req, { actions: 'B', roles: stylusConfig.roles }, 'B')) { Helper.GenError(req, res, -11, 'Invalid Access for '+stylusName); return; }
    jsh.getStylusCSS(stylusName, function(err, css){
      if(err) jsh.Log.error(err);
      else HelperFS.outputContent(req, res, css,'text/css');
    });
  });
}

jsHarmonyRouter.PublicRoot = function(root, options){
  var staticRouter = express.static(root, options);
  return function(req, res, next){
    if (Helper.beginsWith(req.path, '/cmsfiles/')) return next();
    if (Helper.beginsWith(req.path, '/_ul/')) return next();
    if (Helper.beginsWith(req.path, '/_dl/')) return next();
    if (Helper.beginsWith(req.path, '/_d/')) return next();
    if (Helper.beginsWith(req.path, '/_queue/')) return next();
    if (Helper.beginsWith(req.path, '/_report/')) return next();
    if (Helper.beginsWith(req.path, '/_model/')) return next();
    return staticRouter(req, res, next);
  }
}

module.exports = jsHarmonyRouter;