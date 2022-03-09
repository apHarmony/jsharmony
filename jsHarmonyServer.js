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
var compression = require('compression');
var cookieParser = require('cookie-parser');
var path = require('path');
var fs = require('fs');
var http = require('http');
var https = require('https');
var os = require('os');
var WebSocket = require('ws');
var url = require('url');
var _ = require('lodash');
var jsHarmonyRouter = require('./jsHarmonyRouter.js');
var Helper = require('./lib/Helper.js');
var HelperFS = require('./lib/HelperFS.js');

function jsHarmonyServer(serverConfig, jsh){
  this.jsh = jsh;   //jsHarmony Object
  this.app = null;  //Express Server
  this.running = false;
  this.serverConfig = serverConfig||{};
  this.servers = [];
  if(!('add_default_routes' in serverConfig)) serverConfig.add_default_routes = true;
  this.redirectRouter = null; //Express router for redirect HTTP server
  /*
  serverConfig: {
    add_default_routes: true,
    http_port:0,
    http_port: 0,
    http_ip: '0.0.0.0',
    https_port: 0,
    https_ip: '0.0.0.0',
    https_key: 'path/to/file',
    https_cert: 'path/to/file',
    https_ca: 'path/to/file',
    request_timeout: 2*60*1000,
    webSockets = [
      {
        path: '/path',     //Path of the WebSocket for "upgrade" HTTP request
        server: wsServer,  //WebSocket.Server object handling the request - new WebSocket.Server({ noServer: true })
        roles: {},         //jsHarmony roles { "DADMIN": "B" }   "B" action is required for websocket access
        dev: 1             //Enable for users with the "DEV" role, not for users with the "SYSADMIN" role
      }
    ]
  }
  */
}

//Initialize Express
jsHarmonyServer.prototype.Init = function(cb){
  var _this = this;

  if(!_this.serverConfig.webSockets) _this.serverConfig.webSockets = [];

  this.app = express();
  var app = this.app;
  app.jsh = this.jsh;

  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
  app.use(compression({
    filter: function(req, res){
      if(res && res.locals && res.locals.noCompression) return false;
      return compression.filter(req, res);
    }
  }));
  if(_this.jsh.Config.debug_params && _this.jsh.Config.debug_params.dev_client_js){
    app.get('/js/jsHarmony.js', function(req, res){
      var fcontent = 'alert("jsHarmony.dev.js not compiled.  Please compile using clientcompiler.cmd")';
      var fpath = path.join(__dirname, 'public','js','jsHarmony.dev.js');
      if(fs.existsSync(fpath)) fcontent = fs.readFileSync(fpath);
      HelperFS.outputContent(req, res, fcontent, 'text/css');
    });
  }
  app.use(jsHarmonyRouter.PublicRoot(path.join(_this.jsh.Config.appbasepath, 'public')));
  app.use(jsHarmonyRouter.PublicRoot(path.join(__dirname, 'public')));
  app.use('/cmsfiles', express.static(path.join(_this.jsh.Config.datadir, 'cmsfiles')));
  app.use(function (req, res, next) { req.env = app.get('env'); next(); });
  app.use(_this.jsh.Log.express);
  app.set('view engine', 'ejs');

  if(_this.serverConfig.add_default_routes){
    var siteConfig = _this.jsh.Sites['main'];
    if(!siteConfig) throw new Error('serverConfig.add_default_routes: Missing jsh.Site "main"');
    var router = jsHarmonyRouter(_this.jsh, 'main');
    //Set up cookies
    if(siteConfig.cookiesalt) app.use('/', cookieParser(siteConfig.cookiesalt, { path: siteConfig.baseurl }));
    else app.use('/', cookieParser({ path: siteConfig.baseurl }));
    app.use('/', router);
    _this.addDefaultRoutes();
  }
  if(cb) return cb();
};

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
};

jsHarmonyServer.prototype.initDebugLogSocket = function(){
  var _this = this;

  //Initialize socket for debug log
  if(_this.jsh.Config.debug_params.log_socket){
    var logServer = new WebSocket.Server({ noServer: true });
    _this.serverConfig.webSockets.push({
      path: '/_log',
      server: logServer,
      roles: {},
      dev: 1
    });
    //On New connection
    logServer.on('connection', function(ws, req, socket, head){
      ws.sources = {};
      if(!req._roles || (!('SYSADMIN' in req._roles) && !('DEV' in req._roles))){
        ws.terminate();
        _this.jsh.Log.error('Potential Hacking Attempt - Unsecure Debug Log Client Connected from '+Helper.GetIP(req));
        return;
      }
      _this.jsh.Log('Debug Log Client Connected from '+Helper.GetIP(req));
      ws.isAlive = true;
      ws.on('pong', function(){ ws.isAlive = true; });
      ws.on('message', function(data){
        //Try to parse message
        var jmsg = {};
        try{
          jmsg = JSON.parse(data);
        }
        catch(ex){} // eslint-disable-line no-empty
        //If message has "setSettings", read the "sources" object
        if(jmsg && jmsg.setSettings){
          var sources = jmsg.setSettings.sources;
          if(sources){
            //Enable Database option
            if(sources.database){
              if(!('_orig_db_requests' in _this.jsh.Config.debug_params)) _this.jsh.Config.debug_params._orig_db_requests = _this.jsh.Config.debug_params.db_requests;
              _this.jsh.Config.debug_params.db_requests = true;
            }
            else {
              if('_orig_db_requests' in _this.jsh.Config.debug_params) _this.jsh.Config.debug_params.db_requests = _this.jsh.Config.debug_params._orig_db_requests;
              delete _this.jsh.Config._orig_db_requests;
            }
            //Enable Database Raw SQL option
            if(sources.database_raw_sql){
              if(!('_orig_db_raw_sql' in _this.jsh.Config.debug_params)) _this.jsh.Config.debug_params._orig_db_raw_sql = _this.jsh.Config.debug_params.db_raw_sql;
              _this.jsh.Config.debug_params.db_raw_sql = true;
            }
            else {
              if('_orig_db_raw_sql' in _this.jsh.Config.debug_params) _this.jsh.Config.debug_params.db_raw_sql = _this.jsh.Config.debug_params._orig_db_raw_sql;
              delete _this.jsh.Config._orig_db_raw_sql;
            }
            //Enable Authentication option
            if(sources.authentication){
              if(!('_orig_auth_debug' in _this.jsh.Config.debug_params)) _this.jsh.Config.debug_params._orig_auth_debug = _this.jsh.Config.debug_params.auth_debug;
              _this.jsh.Config.debug_params.auth_debug = true;
            }
            else {
              if('_orig_auth_debug' in _this.jsh.Config.debug_params) _this.jsh.Config.debug_params.auth_debug = _this.jsh.Config.debug_params._orig_auth_debug;
              delete _this.jsh.Config._orig_auth_debug;
            }
            ws.sources.database = !!sources.database;
            ws.sources.database_raw_sql = !!sources.database_raw_sql;
            ws.sources.authentication = !!sources.authentication;
            ws.sources.system = !!sources.system;
            ws.sources.webserver = !!sources.webserver;
          }
        }
        //If message has "getHistory", return the history
        if(jmsg && jmsg.getHistory){
          var history = _this.jsh.Log.getHistory(ws.sources);
          _.each(history, function(logObject){
            ws.send(JSON.stringify(logObject));
          });
        }
      });
    });
    //Keepalive
    setInterval(function(){
      logServer.clients.forEach(function(ws){
        if(ws.isAlive===false) return ws.terminate();
        ws.isAlive = false;
        ws.ping(function(){});
      });
    }, 30000);
    //Send logs to client
    _this.jsh.Log.on('log', function(msg){
      logServer.clients.forEach(function each(ws) {
        if (ws.readyState === WebSocket.OPEN) {
          if(ws.sources){
            if(msg && msg.source && ws.sources[msg.source]){
              ws.send(JSON.stringify(msg));
            }
          }
        }
      });
    });
  }
};

//Add handler for WebSocket endpoints
jsHarmonyServer.prototype.addWebSocketHandler = function(server){
  var _this = this;
  if(!_this.serverConfig.webSockets) return;

  server.on('upgrade', function(req, socket, head){
    var pathname = url.parse(req.url).pathname;
    for(var i=0;i<_this.serverConfig.webSockets.length;i++){
      var webSocket = _this.serverConfig.webSockets[i];
      if(webSocket.path==pathname){
        var initSocket = function(){
          _this.jsh.Log(pathname + ' : Websocket connection initialized '+pathname);
          webSocket.server.handleUpgrade(req, socket, head, function(ws){ webSocket.server.emit('connection', ws, req, socket, head); });
        };
        if(webSocket.roles || webSocket.dev){
          //Run route to validate authentication
          var siteConfig = _this.jsh.Sites['main'];
          if(!siteConfig){
            _this.jsh.Log.error('WebSocket Authentication requires jsh.Site "main"');
            socket.destroy();
            return;
          }
          var router = _this.app;
          router.handle(req, {
            writeHead: function(txt){ },
            setHeader: function(txt){ },
            getHeader: function(){ return null; },
            send: function(txt){ },
            end: function(txt){
              //Route returned WEBSOCKET
              if(txt=='WEBSOCKET'){
                //Validate Roles
                if(!Helper.hasModelAction(req, { actions: 'B', roles: webSocket.roles, dev: webSocket.dev }, 'B')) {
                  _this.jsh.Log.error('Unauthorized access to WebSocket '+webSocket.path+' by '+Helper.GetIP(req));
                  socket.destroy();
                  return;
                }
                initSocket();
                return;
              }
              else{
                _this.jsh.Log.error('Unauthorized access to WebSocket '+webSocket.path+' by '+Helper.GetIP(req));
                socket.destroy();
                return;
              }
            }
          }, function(){
            _this.jsh.Log.error('WebSocket Authentication Failed for: '+webSocket.path+' by '+Helper.GetIP(req));
            socket.destroy();
            return;
          });
        }
        else initSocket();
        return;
      }
      else {
        _this.jsh.Log.error('Unhandled WebSocket request: '+pathname);
        socket.destroy();
      }
    }
  });
};

//ListenPortParams Object
jsHarmonyServer.ListenPortParams = function(firstPort){
  this.firstRun = true;
  this.tryNextPort = false;
  this.currentPort = firstPort;
};

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
  }
  if(!params.currentPort){ params.currentPort = 8080; params.tryNextPort = true;  }
  server.listen(params.currentPort, ip);
};

jsHarmonyServer.prototype.Run = function(cb){
  var _this = this;
  if(!_this.jsh) throw new Error('jsHarmony is required to run jsHarmonyServer');
  if(!_this.app) throw new Error('Router is required to run jsHarmonyServer');

  var http_redirect = false;
  var http_server = false;
  var https_server = false;
  var server = null;

  _this.initDebugLogSocket();

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
    server = http.createServer(_this.app);
    _this.servers.push(server);
    _this.addWebSocketHandler(server);
    server.timeout = _this.serverConfig.request_timeout;
    _this.ListenPort(server, _this.serverConfig.http_port, _this.serverConfig.http_ip, function(){
      _this.jsh.Log.info(_this.jsh.Config.app_name + ' listening on HTTP port ' + server.address().port);
      _this.jsh.Log.info('Log in at '+_this.getURL());
      Helper.triggerAsync(_this.jsh.Config.onServerReady, null, [server]);
      if (cb) cb([server]);
    }, function(err){
      _this.jsh.Log.error('\r\n\r\n\r\nCANNOT START SERVER!!!!!!\r\n\r\n');
      if (err && (err.code == 'EADDRINUSE')) {
        _this.jsh.Log.error('SERVER ALREADY RUNNING ON PORT '+_this.serverConfig.http_port+'\r\n\r\n');
        Helper.triggerAsync(_this.jsh.Config.onServerReady);
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
    server = https.createServer(https_options, _this.app);
    _this.servers.push(server);
    _this.addWebSocketHandler(server);
    server.timeout = _this.serverConfig.request_timeout;
    var new_http_port = 0;
    var new_https_port = 0;

    var start_https_server = function(cb_https,servers){
      if(!servers) servers = [];
      _this.ListenPort(server, _this.serverConfig.https_port, _this.serverConfig.https_ip, function(){
        new_https_port = server.address().port;
        if(!http_redirect){
          _this.jsh.Log.info(_this.jsh.Config.app_name + ' listening on HTTPS port ' + new_https_port);
        }
        else {
          _this.jsh.Log.info(_this.jsh.Config.app_name + ' listening on HTTP/HTTPS ports ' + new_http_port + '/' + new_https_port);
        }
        _this.jsh.Log.info('Log in at '+_this.getURL());
        if(servers.push(server));
        Helper.triggerAsync(_this.jsh.Config.onServerReady, null, servers);
        if(cb_https) cb_https(servers);
      }, function(err){
        _this.jsh.Log.error('\r\n\r\n\r\nCANNOT START SERVER!!!!!!\r\n\r\n');
        if (err && (err.code == 'EADDRINUSE')) {
          _this.jsh.Log.error('SERVER ALREADY RUNNING ON PORT '+_this.serverConfig.https_port+'\r\n\r\n');
          Helper.triggerAsync(_this.jsh.Config.onServerReady);
          if (cb_https) cb_https();
        }
        else throw err;
      });
    };

    if(!http_redirect) start_https_server(cb);
    else {
      var redirect_app = express();
      _this.redirectRouter = express.Router();
      redirect_app.use(_this.redirectRouter);
      redirect_app.get('*', function (req, res) {
        var hostname = Helper.GetIP(req);
        if(req.headers && req.headers.host){
          hostname = (req.headers.host.match(/:/g)) ? req.headers.host.slice(0, req.headers.host.indexOf(':')) : req.headers.host;
        }
        res.redirect('https://' + hostname + ':' + new_https_port + req.url);
      });
      var redirect_server = http.createServer(redirect_app);
      _this.servers.push(redirect_server);
      redirect_server.timeout = _this.serverConfig.request_timeout;
      _this.ListenPort(redirect_server, _this.serverConfig.http_port, _this.serverConfig.http_ip, function(){
        new_http_port = redirect_server.address().port;
        start_https_server(cb,[redirect_server]);
      }, function(err){
        _this.jsh.Log.error('\r\n\r\n\r\nCANNOT START SERVER!!!!!!\r\n\r\n');
        if (err && (err.code == 'EADDRINUSE')) {
          _this.jsh.Log.error('SERVER ALREADY RUNNING ON PORT '+_this.serverConfig.http_port+'\r\n\r\n');
          Helper.triggerAsync(_this.jsh.Config.onServerReady);
          if (cb) cb();
        }
        else throw err;
      });
    }
  }
};

jsHarmonyServer.prototype.getURLFromReq = function(req){
  var hostname = undefined;
  if(req && req.headers && req.headers.host){
    hostname = req.headers.host.toString();
    if(hostname.indexOf(':')>=0) hostname = hostname.split(':')[0];
  }
  return this.getURL(hostname);
};

jsHarmonyServer.prototype.getURL = function(hostname){
  var _this = this;
  var https_server = false;
  var http_server = false;

  if('https_port' in _this.serverConfig) https_server = true;
  if('http_port' in _this.serverConfig){
    if(!https_server) http_server = true; //If https_server is enabled, the http_server is only used for redirects
  }

  var server_txt = '';
  var server_port = '';
  var server_scheme = 'https://';
  if(http_server){
    server_txt = _this.serverConfig.http_ip;
    for(let i=0;i<_this.servers.length;i++){
      if(_this.servers[i] instanceof http.Server){ server_port = _this.servers[i].address().port; break; }
    }
    if(!https_server) server_scheme = 'http://';
  }
  if(https_server){
    server_txt = _this.serverConfig.https_ip;
    for(let i=0;i<_this.servers.length;i++){
      if(_this.servers[i] instanceof https.Server){ server_port = _this.servers[i].address().port; break; }
    }
  }

  if(hostname && server_port) return server_scheme+hostname+':'+server_port;

  if(server_txt == '0.0.0.0') server_txt = os.hostname().toLowerCase();
  if(server_txt && server_port) return server_scheme+server_txt+':'+server_port;
  return '';
};

jsHarmonyServer.prototype.Close = function(cb){
  var _this = this;
  for(var i=0;i<_this.servers.length;i++) _this.servers[i].close();
  _this.servers = [];
  _this.running = false;
  if(cb) return cb();
};

exports = module.exports = jsHarmonyServer;