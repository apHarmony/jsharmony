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
var path = require('path');
var fs = require('fs');
var http = require('http');
var https = require('https');
var os = require('os');
var _ = require('lodash');
var jsHarmonyRouter = require('./jsHarmonyRouter.js');

function jsHarmonyServer(serverConfig, jsh){
  this.jsh = jsh;   //jsHarmony Object
  this.app = null;  //Express Server
  this.running = false;
  this.serverConfig = serverConfig||{};
  this.servers = [];
  if(!('add_default_routes' in serverConfig)) serverConfig.add_default_routes = true;
  /*
  {
    add_default_routes: true,
    http_port:0,
    http_port: 0,
    http_ip: '0.0.0.0',
    https_port: 0,
    https_ip: '0.0.0.0',
    https_key: 'path/to/file',
    https_cert: 'path/to/file',
    https_ca: 'path/to/file',
    request_timeout: 2*60*1000
  }
  */
}

//Initialize Express
jsHarmonyServer.prototype.Init = function(cb){
  var _this = this;
  this.app = express();
  var app = this.app;
  app.jsh = this.jsh;

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(express.static(path.join(_this.jsh.Config.appbasepath, 'public')));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/cmsfiles', express.static(path.join(_this.jsh.Config.datadir, 'cmsfiles')));
  app.use(function (req, res, next) { req.env = app.get('env'); next(); });
  app.use(_this.jsh.Log.express);
  app.set('view engine', 'ejs');

  if(_this.serverConfig.add_default_routes){
    var siteConfig = _this.jsh.Sites['default'];
    if(!siteConfig) throw new Error('serverConfig.add_default_routes: Missing jsh.Site "default"');
    var router = jsHarmonyRouter(_this.jsh, 'default');
    //Set up cookies
    if(siteConfig.cookiesalt) app.use('/', cookieParser(siteConfig.cookiesalt, { path: siteConfig.baseurl }));
    else app.use('/', cookieParser({ path: siteConfig.baseurl }));
    app.use('/', router);
    siteConfig.router = router;
    _this.addDefaultRoutes();
  }
  if(cb) return cb();
}

jsHarmonyServer.prototype.addDefaultRoutes = function () {
  var _this = this;
  
  // catch 404 and forward to error handler
  _this.app.use(function (req, res, next) {
    _this.jsh.Gen404(req, res);
    return;
  });

  /// error handlers
  _this.app.use(function (err, req, res, next) {
    var errorpage = 'error';
    if (req.jshsite && req.jshsite.show_system_errors) errorpage = 'error_debug';
    _this.jsh.Log.error(err);
    _this.jsh.Log.info(err.stack);
    res.status(err.status || 500);
    res.render(_this.jsh.getView(req, errorpage, { disable_override: true }), {
      message: err.message,
      error: err,
    });
  });
}

//ListenPortParams Object
jsHarmonyServer.ListenPortParams = function(firstPort){
  this.firstRun = true;
  this.tryNextPort = false;
  this.currentPort = firstPort;
}

//Bind port
jsHarmonyServer.prototype.ListenPort = function(server, firstPort, ip, onSuccess, onError, params){
  var _this = this;
  if(!params){ params = new jsHarmonyServer.ListenPortParams(firstPort); }
  if(params.firstRun){
    params.firstRun = false;
    server.on('listening',onSuccess);
    server.on('error',function (err) {
      if (err && (err.code == 'EADDRINUSE')){
        params.currentPort = params.currentPort + 1;
        if(params.tryNextPort) return _this.ListenPort(server, firstPort,ip,onSuccess,onError,params);
      }
      onError(err);
    });
    //server.on('connection',function(socket){ socket.setTimeout(0); });
  }
  if(!params.currentPort){ params.currentPort = 8080; params.tryNextPort = true;  }
  server.listen(params.currentPort, ip);
}

jsHarmonyServer.prototype.Run = function(cb){
  var _this = this;
  if(!_this.jsh) throw new Error('jsHarmony is required to run jsHarmonyServer');
  if(!_this.app) throw new Error('Router is required to run jsHarmonyServer');

  var http_redirect = false;
  var http_server = false;
  var https_server = false;

  //this.serverConfig
  if(!_this.jsh.Config.frontsalt){
    var xlib = (require('./WebConnect.js')).xlib;
    _this.jsh.Config.frontsalt = xlib.getSalt(60);
  }
  if(typeof _this.serverConfig.request_timeout === 'undefined') _this.serverConfig.request_timeout = 2*60*1000;
  if(('http_ip' in _this.serverConfig) && !('http_port' in _this.serverConfig)) _this.serverConfig.http_port = 0;
  if(('http_port' in _this.serverConfig) && !('http_ip' in _this.serverConfig)) _this.serverConfig.http_ip = '0.0.0.0';
  if(('https_ip' in _this.serverConfig) && !('https_port' in _this.serverConfig)) _this.serverConfig.https_port = 0;
  if(('https_port' in _this.serverConfig) && !('https_ip' in _this.serverConfig)) _this.serverConfig.https_ip = '0.0.0.0';
  var f_cert = null,f_key = null,f_ca = null;
  if('https_port' in _this.serverConfig){
    if(!('https_cert' in _this.serverConfig)) throw new Error('HTTPS requires a certificate - https_cert (containing all bundled CAs)');
    if(!('https_key' in _this.serverConfig)) throw new Error('HTTPS requires a key file - https_key');
    f_cert = fs.readFileSync(_this.serverConfig.https_cert);
    f_key = fs.readFileSync(_this.serverConfig.https_key);
    if(_this.serverConfig.https_ca){
      if(_.isArray(_this.serverConfig.https_ca)){
        f_ca = [];
        _.each(_this.serverConfig.https_ca,function(ca){ f_ca.push(fs.readFileSync(ca)); });
      }
      else f_ca = fs.readFileSync(_this.serverConfig.https_ca);
    }
  }
  if('https_port' in _this.serverConfig) https_server = true;
  if('http_port' in _this.serverConfig){
    if(https_server) http_redirect = true;
    else http_server = true;
  }

  if(http_server){
    var server = http.createServer(_this.app);
    _this.servers.push(server);
    server.timeout = _this.serverConfig.request_timeout;
    _this.ListenPort(server, _this.serverConfig.http_port, _this.serverConfig.http_ip, function(){
      _this.jsh.Log.info('Listening on HTTP port ' + server.address().port);
      if(!_this.serverConfig.http_port){
        var server_txt = _this.serverConfig.http_ip;
        if(server_txt == '0.0.0.0') server_txt = os.hostname().toLowerCase();
        _this.jsh.Log.info('Log in at http://'+server_txt+':'+server.address().port);
      }
      if (_this.jsh.Config.onServerReady) _this.jsh.Config.onServerReady([server]);
      if (cb) cb([server]);
    }, function(err){
      console.log('\r\n\r\nCANNOT START SERVER!!!!!!\r\n\r\n');
      if (err && (err.code == 'EADDRINUSE')) {
        console.log('SERVER ALREADY RUNNING ON PORT '+_this.serverConfig.http_port+'\r\n\r\n');
        if (_this.jsh.Config.onServerReady) _this.jsh.Config.onServerReady(); 
        if(cb) cb();
      } 
      else throw err;
    });
  }

  if(https_server){
    var https_options = {
      key: f_key,
      cert: f_cert
    };
    if(f_ca) https_options.ca = f_ca;
    var server = https.createServer(https_options, _this.app);
    _this.servers.push(server);
    server.timeout = _this.serverConfig.request_timeout;
    var new_http_port = 0;
    var new_https_port = 0; 

    var start_https_server = function(cb_https,servers){
      if(!servers) servers = [];
      _this.ListenPort(server, _this.serverConfig.https_port, _this.serverConfig.https_ip, function(){
        new_https_port = server.address().port;
        if(!http_redirect){
          _this.jsh.Log.info('Listening on HTTPS port ' + new_https_port);
        }
        else {
          _this.jsh.Log.info('Listening on HTTP/HTTPS ports ' + new_http_port + '/' + new_https_port);
        }
        if(!_this.serverConfig.https_port){
          var server_txt = _this.serverConfig.https_ip;
          if(server_txt == '0.0.0.0') server_txt = os.hostname().toLowerCase();
          _this.jsh.Log.info('Log in at https://'+server_txt+':'+new_https_port);
        }
        if(servers.push(server));
        if (_this.jsh.Config.onServerReady) _this.jsh.Config.onServerReady(servers);
        if(cb_https) cb_https(servers);
      }, function(err){
        console.log('\r\n\r\nCANNOT START SERVER!!!!!!\r\n\r\n');
        if (err && (err.code == 'EADDRINUSE')) {
          console.log('SERVER ALREADY RUNNING ON PORT '+_this.serverConfig.https_port+'\r\n\r\n');
          if (_this.jsh.Config.onServerReady) _this.jsh.Config.onServerReady();
          if (cb_https) cb_https();
        } 
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
      _this.servers.push(redirect_server);
      redirect_server.timeout = _this.serverConfig.request_timeout;
      _this.ListenPort(redirect_server, _this.serverConfig.http_port, _this.serverConfig.http_ip, function(){
        new_http_port = redirect_server.address().port;
        start_https_server(cb,[redirect_server]);
      }, function(err){
        console.log('\r\n\r\nCANNOT START SERVER!!!!!!\r\n\r\n');
        if (err && (err.code == 'EADDRINUSE')) {
          console.log('SERVER ALREADY RUNNING ON PORT '+_this.serverConfig.http_port+'\r\n\r\n');
          if (_this.jsh.Config.onServerReady) _this.jsh.Config.onServerReady();
          if (cb) cb();
        } 
        else throw err;
      });
    }
  }
}

jsHarmonyServer.prototype.Close = function(cb){
  var _this = this;
  for(var i=0;i<_this.servers.length;i++) _this.servers[i].close();
  _this.servers = [];
  _this.running = false;
  if(cb) return cb();
}

exports = module.exports = jsHarmonyServer;