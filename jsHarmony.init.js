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
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var async = require('async');
var DB = require('jsharmony-db');
var HelperFS = require('./lib/HelperFS.js');
var Helper = require('./lib/Helper.js');
var path = require('path');
var fs = require('fs');
var jsh_logger = require('./lib/Logger.js');
var jsh_routes = require('./routes.js');
var http = require('http');
var https = require('https');
var os = require('os');
var _ = require('lodash');
exports = module.exports = {};

exports.validateGlobals = function(){
  if(!global.dbconfig) { global.dbconfig = { _driver: new DB.noDriver() }; }
  else if(!global.dbconfig._driver || !global.dbconfig._driver.name) { console.error("*** Fatal error: global.dbconfig missing or invalid _driver"); process.exit(8); }
  if(!global.support_email) global.support_email = 'donotreply@company.com';
  if(!global.mailer_email) global.mailer_email = 'DO NOT REPLY <donotreply@company.com>';
  if(Helper.notset(global.default_rowlimit)) global.default_rowlimit = 50;
  if(Helper.notset(global.export_rowlimit)) global.export_rowlimit = 5000;
  if(Helper.notset(global.max_filesize)){ global.max_filesize = 50000000; }
  if(Helper.notset(global.max_user_temp_foldersize)) global.max_user_temp_foldersize = 50000000;//50000000;
  if(Helper.notset(global.public_temp_expiration)) global.public_temp_expiration = 5 * 60; //Clear 5 min of public temp files
  if(Helper.notset(global.user_temp_expiration)) global.user_temp_expiration = 6 * 60 * 60; //Clear 6 hours of user temp files
  if(Helper.notset(global.jshSettings)) global.jshSettings = {};
  if(Helper.notset(global.jshSettings.case_insensitive_datalocks)) global.jshSettings.case_insensitive_datalocks = true;
  if(Helper.notset(global.jshSettings.ignore_imagemagick)) global.jshSettings.ignore_imagemagick = false;
  if(!global.valid_extensions) global.valid_extensions = [".jpg", ".jpeg", ".pdf", ".png", ".gif", ".txt", ".xlsm", ".xls", ".xlsx", ".bak", ".zip", ".csv"];
  if(!global.debug_params) global.debug_params = {  };
  if(Helper.notset(global.debug_params.jsh_error_level)) global.debug_params.jsh_error_level = 1; //1 = ERROR, 2 = WARNING, 4 = INFO  :: Messages generated while parsing jsHarmony configs
  if(Helper.notset(global.debug_params.pipe_log)) global.debug_params.pipe_log = true;
  if(Helper.notset(global.LogSleepDelay)){ global.LogSleepDelay = 1000; }
  if(Helper.notset(global.site_title)) global.site_title = 'jsHarmony';
  if(!global.public_apps) global.public_apps = [];
  if(!global.private_apps) global.private_apps = [];

  if(!global.appbasepath) global.appbasepath = path.dirname(require.main.filename);
  if(!global.datadir) global.datadir = global.appbasepath + '/data/';
  if(!global.logdir) global.logdir = global.datadir + 'log/';
  if (!global.modeldir) global.modeldir = [];
  if (!_.isArray(global.modeldir)) global.modeldir = [global.modeldir];
  if (!global.localmodeldir){
    global.localmodeldir = global.appbasepath + '/models/';
    global.modeldir.push(global.localmodeldir);
  }
  else if(global.modeldir.count==0) global.modeldir.push(global.localmodeldir);

  if(_.isString(global.localmodeldir)) global.localmodeldir = { path: global.localmodeldir };
  for(var i=0;i<global.modeldir.length;i++){
    if(_.isString(global.modeldir[i])) global.modeldir[i] = { path: global.modeldir[i] };
  }


  HelperFS.loadViews(path.join(__dirname, 'views'), '', true);
  HelperFS.loadViews(global.appbasepath + '/views', '');

  requireFolder(global.datadir,'Data folder');
  HelperFS.createFolderIfNotExistsSync(global.localmodeldir.path);
  HelperFS.createFolderIfNotExistsSync(global.localmodeldir.path + 'reports');
  async.waterfall([
    async.apply(HelperFS.createFolderIfNotExists, global.logdir),
    async.apply(HelperFS.createFolderIfNotExists, global.datadir + 'temp'),
    async.apply(HelperFS.createFolderIfNotExists, global.datadir + 'temp/public'),
    async.apply(HelperFS.createFolderIfNotExists, global.datadir + 'temp/cmsfiles'),
    async.apply(HelperFS.createFolderIfNotExists, global.datadir + 'temp/report'),
  ], function (err, rslt) { if (err) global.log(err); });
}

exports.ValidateConfig = function(jsh){
  if(!jsh.Config.passwords) jsh.Config.passwords = {};
  if(!jsh.Config.salts) jsh.Config.salts = {};
  if(!jsh.Config.queues) jsh.Config.queues = {};
  if(!jsh.Config.datalocks) jsh.Config.datalocks = {};
  if(!jsh.Config.field_mapping) jsh.Config.field_mapping = {
    "user_id": "user_id",
    "user_hash": "user_hash",
    "user_status": "user_status",
    "user_email": "user_email",
    "user_name": "user_name",
    "user_firstname": "user_firstname",
    "user_lastname": "user_lastname",
    "user_last_ip": "user_last_ip",
    "user_last_tstmp": "user_last_tstmp",
    "user_role": "user_role",
    "rowcount": "xrowcount",
    "codeval": "codeval",
    "codetxt": "codetxt",
    "codeseq": "codseq",
    "codeparent": "codeparent",
  };
  if(!jsh.Config.ui_field_mapping) jsh.Config.ui_field_mapping = {
    "codeval": "codeval",
    "codetxt": "codetxt",
    "codeparentid": "codeparentid",
    "codeicon": "codeicon",
    "codeid": "codeid",
    "codeparent": "codeparent",
    "codeseq": "codeseq",
    "codetype": "codetype"
  };
  if(!jsh.Config.default_buttons) jsh.Config.default_buttons = { "add": { "icon": "add", "text": "Add %%%CAPTION%%%", "access": "I", "class": "xbuttonadd" } };
  //if (!jsh.Config.field_mapping) throw 'field_mapping required in _config.json';
  //if (!jsh.Config.ui_field_mapping) throw 'ui_field_mapping required in _config.json';
}

exports.addDefaultRoutes = function (app) {
  // catch 404 and forward to error handler
  app.use(function (req, res, next) {
    HelperFS.gen404(req, res);
    return;
  });

  /// error handlers
  app.use(function (err, req, res, next) {
    var errorpage = 'error';
    if (req.jshconfig && req.jshconfig.show_system_errors) errorpage = 'error_debug';
    global.log(err);
    global.log(err.stack);
    res.status(err.status || 500);
    res.render(HelperFS.getView(req, errorpage, { disable_override: true }), {
      message: err.message,
      error: err,
    });
  });
}

exports.App = function(jshconfig, jsh){
  if(this.typename != 'jsHarmony') throw new Error('Use syntax jsHarmony.App(...).  Do not call from a different base class thisArg.');
  if(!jsh) jsh = new this();

  var app = express();
  app.jsh = jsh;
  global.log = jsh_logger;

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(express.static(path.join(global.appbasepath, 'public')));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/cmsfiles', express.static(path.join(global.datadir, 'cmsfiles')));
  app.use(function (req, res, next) { req.env = app.get('env'); next(); });
  app.use(global.log.express);
  app.set('view engine', 'ejs');

  if(jshconfig && jshconfig.noroutes){}
  else {
    var routes = jsh_routes(jsh, jshconfig);
    jshconfig = routes.jshconfig;
    //Set up cookies
    if(jshconfig.cookiesalt) app.use('/', cookieParser(jshconfig.cookiesalt, { path: jshconfig.baseurl }));
    else app.use('/', cookieParser({ path: jshconfig.baseurl }));
    app.use('/', routes);
    app.jshRouter = routes;
    exports.addDefaultRoutes(app);
  }

  return app;
}

function ListenPortParams(firstPort){
  this.firstRun = true;
  this.tryNextPort = false;
  this.currentPort = firstPort;
}

function ListenPort(server, firstPort, ip, onSuccess, onError, params){
  if(!params){ params = new ListenPortParams(firstPort); }
  if(params.firstRun){
    params.firstRun = false;
    server.on('listening',onSuccess);
    server.on('error',function (err) {
      if (err && (err.code == 'EADDRINUSE')){
        params.currentPort = params.currentPort + 1;
        if(params.tryNextPort) return ListenPort(server, firstPort,ip,onSuccess,onError,params);
      }
      onError(err);
    });
    //server.on('connection',function(socket){ socket.setTimeout(0); });
  }
  if(!params.currentPort){ params.currentPort = 8080; params.tryNextPort = true;  }
  server.listen(params.currentPort, ip);
}

exports.Run = function(jshconfig, jsh, app, cb){
  if(this.typename != 'jsHarmony') throw new Error('Use syntax jsHarmony.Run(...).  Do not call from a different base class thisArg.');
  /* - jshconfig
  server:{
    http_port: 0,
    http_ip: '0.0.0.0',
    https_port: 0,
    https_ip: '0.0.0.0',
    https_key: 'path/to/file',
    https_cert: 'path/to/file',
    https_ca: 'path/to/file'
  }
  */
  var http_redirect = false;
  var http_server = false;
  var https_server = false;

  if(!jshconfig) jshconfig = {};
  if(!jshconfig.server) jshconfig.server = { http_port:0 };
  if(!global.frontsalt){
    var xlib = (require('./WebConnect.js')).xlib;
    global.frontsalt = xlib.getSalt(60);
  }
  if(typeof jshconfig.server.request_timeout === 'undefined') jshconfig.server.request_timeout = 2*60*1000;
  if(('http_ip' in jshconfig.server) && !('http_port' in jshconfig.server)) jshconfig.server.http_port = 0;
  if(('http_port' in jshconfig.server) && !('http_ip' in jshconfig.server)) jshconfig.server.http_ip = '0.0.0.0';
  if(('https_ip' in jshconfig.server) && !('https_port' in jshconfig.server)) jshconfig.server.https_port = 0;
  if(('https_port' in jshconfig.server) && !('https_ip' in jshconfig.server)) jshconfig.server.https_ip = '0.0.0.0';
  var f_cert = null,f_key = null,f_ca = null;
  if('https_port' in jshconfig.server){
    if(!('https_cert' in jshconfig.server)) throw new Error('HTTPS requires a certificate - https_cert (containing all bundled CAs)');
    if(!('https_key' in jshconfig.server)) throw new Error('HTTPS requires a key file - https_key');
    f_cert = fs.readFileSync(jshconfig.server.https_cert);
    f_key = fs.readFileSync(jshconfig.server.https_key);
    if(jshconfig.server.https_ca){
      if(_.isArray(jshconfig.server.https_ca)){
        f_ca = [];
        _.each(jshconfig.server.https_ca,function(ca){ f_ca.push(fs.readFileSync(ca)); });
      }
      else f_ca = fs.readFileSync(jshconfig.server.https_ca);
    }
  }
  if('https_port' in jshconfig.server) https_server = true;
  if('http_port' in jshconfig.server){
    if(https_server) http_redirect = true;
    else http_server = true;
  }

  if(!jsh) jsh = new this();
  if(!app) app = this.App(jshconfig, jsh);

  if(http_server){
    var server = http.createServer(app);
    server.timeout = jshconfig.server.request_timeout;
    ListenPort(server, jshconfig.server.http_port, jshconfig.server.http_ip, function(){
      global.log('Listening on HTTP port ' + server.address().port);
      if(!jshconfig.server.http_port){
        var server_txt = jshconfig.server.http_ip;
        if(server_txt == '0.0.0.0') server_txt = os.hostname().toLowerCase();
        global.log('Log in at http://'+server_txt+':'+server.address().port);
      }
      if (global.onServerStart) global.onServerStart([server]);
      if(cb) cb([server]);
    }, function(err){
      console.log('\r\n\r\nCANNOT START SERVER!!!!!!\r\n\r\n');
      if (err && (err.code == 'EADDRINUSE')) { console.log('SERVER ALREADY RUNNING ON PORT '+jshconfig.server.http_port+'\r\n\r\n'); if (global.onServerStart) global.onServerStart(); } 
      else throw err;
    });
  }

  if(https_server){
    var https_options = {
      key: f_key,
      cert: f_cert
    };
    if(f_ca) https_options.ca = f_ca;
    var server = https.createServer(https_options, app);
    server.timeout = jshconfig.server.request_timeout;
    var new_http_port = 0;
    var new_https_port = 0; 

    var start_https_server = function(cb_https,servers){
      if(!servers) servers = [];
      ListenPort(server, jshconfig.server.https_port, jshconfig.server.https_ip, function(){
        new_https_port = server.address().port;
        if(!http_redirect){
          global.log('Listening on HTTPS port ' + new_https_port);
        }
        else {
          global.log('Listening on HTTP/HTTPS ports ' + new_http_port + '/' + new_https_port);
        }
        if(!jshconfig.server.https_port){
          var server_txt = jshconfig.server.https_ip;
          if(server_txt == '0.0.0.0') server_txt = os.hostname().toLowerCase();
          global.log('Log in at https://'+server_txt+':'+new_https_port);
        }
        if(servers.push(server));
        if (global.onServerStart) global.onServerStart(servers);
        if(cb_https) cb_https(servers);
      }, function(err){
        console.log('\r\n\r\nCANNOT START SERVER!!!!!!\r\n\r\n');
        if (err && (err.code == 'EADDRINUSE')) { console.log('SERVER ALREADY RUNNING ON PORT '+jshconfig.server.https_port+'\r\n\r\n'); if (global.onServerStart) global.onServerStart(); } 
        else throw err;
      });
    };

    if(!http_redirect) start_https_server(cb);
    else {
      var redirect_app = express();
      redirect_app.get('*', function (req, res) {
        var hostname = (req.headers.host.match(/:/g)) ? req.headers.host.slice(0, req.headers.host.indexOf(":")) : req.headers.host;
        res.redirect('https://' + hostname + ':' + new_https_port + req.url);
      })
      var redirect_server = http.createServer(redirect_app);
      redirect_server.timeout = jshconfig.server.request_timeout;
      ListenPort(redirect_server, jshconfig.server.http_port, jshconfig.server.http_ip, function(){
        new_http_port = redirect_server.address().port;
        start_https_server(cb,[redirect_server]);
      }, function(err){
        console.log('\r\n\r\nCANNOT START SERVER!!!!!!\r\n\r\n');
        if (err && (err.code == 'EADDRINUSE')) { console.log('SERVER ALREADY RUNNING ON PORT '+jshconfig.server.http_port+'\r\n\r\n'); if (global.onServerStart) global.onServerStart(); } 
        else throw err;
      });
    }
  }

  return app;
}

exports.Routes = jsh_routes;
exports.Logger = jsh_logger;

function requireFolder(path,desc){
  if(!fs.existsSync(path)){
    if(!desc) desc = 'Path';
    console.log ("FATAL ERROR: "+desc+" "+path+" not found.");
    console.log("Please create this folder or change the settings to use a different path.");
    process.exit(8);
  }
}
