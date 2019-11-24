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

var moment = require('moment');
var fs = require('fs');
var util = require('util');
var events = require('events');
var _ = require('lodash');
var path = require('path');
var HelperFS = require('./HelperFS.js')
var Helper = require('./Helper.js')

function Logger(platform){
  if(platform) this.platform = platform;
  else{
    this.platform = {
      Config: {
        debug_params: { 
          pipe_log: true 
        },
        interactive: false,
        app_name: '',
        error_email: '',
        logdir: '',       //Required in order to log data
        LogSleepDelay: 1000
      },
      SendEmail: function(mparams, cb){ },
      Mailer: null
    }
  }
  var _this = this;
  this.last_express_log = null;
  this.logqueue = [];
  this.logmailqueue = [];
  this.logFirstRun = true;
  this.lastError = null;
  this.logProcessor_started = false;
  this.isSendingEmail = false;
  this.events = new events();
  this.history = [];
  this.historyLength = 1000;

  //Handle uncaught exceptions
  process.on('uncaughtException', function (err) { return _this.onUncaughtException(err); });

  var rslt = function(txt, options){ _this.log(txt, options); }
  rslt.error = function(txt, options){ _this.log(txt, _.extend({ logtype: 'ERROR' }, options)); }
  rslt.warning = function(txt, options){ _this.log(txt, _.extend({ logtype: 'WARNING' }, options)); }
  rslt.info = function(txt, options){ _this.log(txt, options); }
  rslt.debug = function(txt){ console.log(txt); } // eslint-disable-line no-console
  rslt.console = function(txt){ console.log(txt); } // eslint-disable-line no-console
  rslt.console_error = function(txt){ console.error(txt); } // eslint-disable-line no-console
  rslt.express = function(req, res, next){ _this.express(req, res, next); }
  rslt.on = function(){ _this.events.on.apply(_this.events, arguments); }
  rslt.getHistory = function(){ return _this.getHistory.apply(_this, arguments); }
  rslt.clearLastErrorFile = function(){ return _this.clearLastErrorFile.apply(_this, arguments); }
  rslt.platform = this.platform;
  return rslt;
}

//Add history to the history array
Logger.prototype.addHistory = function(logObject){
  this.history.push(logObject);
  while(this.history.length > this.historyLength) this.history.shift();
}

Logger.prototype.getHistory = function(sources){
  var rslt = [];
  if(!sources) return rslt;
  _.each(this.history, function(logObject){
    if(sources[logObject.source]) rslt.push(logObject);
  });
  return rslt;
}

//Primary logging function
Logger.prototype.log = function(txt, options) {
  options = _.extend({ source: 'system', force: false }, options);

  var color = options.color;
  var ext = options.ext;
  var logtype = options.logtype;
  var source = options.source;

  var _this = this;
  if (!txt) return;
  if(!this.logProcessor_started){
    this.logProcessor_started = true;
    this.logProcessor();
  }
  if (!(_.isString(txt))) txt = util.inspect(txt);
  if (!ext) ext = '';
  if (ext && /[^a-zA-Z0-9.]/.test(ext)) { ext = ''; this.log('Invalid log file extension', { logtype: 'ERROR' }); }
  var logstr = (new Date()).toISOString() + " " + (logtype ? logtype + ' ' : '') + txt;
  //If set to display log to screen, display log
  if (!_this.platform.Config.debug_params || _this.platform.Config.debug_params.pipe_log) {
    if(color) console.log('\033[' + _this.getConsoleColor(color) + 'm' + logstr + '\033[0m')
    else console.log(logstr);
    //console.log((new Error()).stack); //DEBUG - Print Stack
  }
  this.logqueue.push({txt: logstr, ext: ext, logtype: logtype});
  if(_this.platform.Config.interactive || options.force) _this.logProcessor(true);
  //Emit events
  var logObject = {
    txt: txt,
    source: source,
    severity: (logtype||''),
    data: undefined,
    color: _this.getHexColor(color),
    timestamp: Date.now()
  };
  _this.addHistory(logObject);
  _this.events.emit('log', logObject);
};

//black (default), gray, red, green, yellow, blue, magenta, cyan, white
Logger.prototype.getHexColor = function(color){
  if(color=='black') return '#000000';
  else if(color=='grey') return '#999999';
  else if(color=='gray') return '#999999';
  else if(color=='red') return '#FF0000';
  else if(color=='green') return '#008000';
  else if(color=='yellow') return '#EEEE00';
  else if(color=='blue') return '#0000FF';
  else if(color=='magenta') return '#FF00FF';
  else if(color=='cyan') return '#00EEEE';
  else if(color=='white') return '#FFFFFF';
  else return '#000000';
}

//black, gray, red, green, yellow, blue, magenta, cyan, white (default)
Logger.prototype.getConsoleColor = function(color){
  if(color=='black') return '7';
  else if(color=='grey') return '90';
  else if(color=='gray') return '90';
  else if(color=='red') return '91';
  else if(color=='green') return '92';
  else if(color=='yellow') return '93';
  else if(color=='blue') return '94';
  else if(color=='magenta') return '95';
  else if(color=='cyan') return '96';
  else if(color=='white') return '0';
  else return '0';
}

Logger.prototype.sendErrorEmail = function(txt, cb){
  var _this = this;
  if(!_this.platform.Config.error_email) return;
  if(!_this.platform.SendEmail) return;
  if(_this.isSendingEmail){
    setTimeout(function(){ _this.sendErrorEmail(txt, cb); }, 100);
    return;
  }
  var subject = 'Error in application: '+(_this.platform.Config.app_name||'');
  var mparams = {
    to: _this.platform.Config.error_email,
    subject: subject,
    text: subject + '\r\n' + txt
  };
  _this.isSendingEmail = true;
  _this.platform.SendEmail(mparams, function(){
    _this.isSendingEmail = false;
    if(cb) cb();
  });
}

Logger.prototype.getLastErrorPath = function(){
  return this.platform.Config.logdir + 'lasterror.log';
}

Logger.prototype.clearLastErrorFile = function(){
  var _this = this;
  if(fs.existsSync(this.getLastErrorPath())){
    _this.lastError = fs.readFileSync(_this.getLastErrorPath(),'utf8')||'';
    _this.addHistory({
      txt: _this.lastError,
      source: 'system',
      severity: 'ERROR',
      data: undefined,
      color: _this.getHexColor(),
      timestamp: Date.now()
    });
    fs.unlinkSync(this.getLastErrorPath());
    _this.log('Clearing previous crash error log');
  }
}

Logger.prototype.logProcessor = function(force) {
  var _this = this;
  if(!_this.logqueue){
    console.log('MISSING!!!!');
    console.log(_this);
  }
  //On first run, load messages from lasterror.log
  if(_this.logFirstRun && _this.platform.Config.logdir){
    _this.logFirstRun = false;
    _this.clearLastErrorFile();
  }
  //Check logqueue for log messages
  while (_this.logqueue.length > 0) {
    var logdata = _this.logqueue.shift();
    //If logtype=='ERROR', send email
    logtype = logdata.logtype;
    if(logtype && (logtype.toUpperCase()=='ERROR')){
      //Queue email
      _this.logmailqueue.push(logdata);
    }
    if(!_this.platform.Config.logdir) break;
    var logstr = logdata.txt;
    logstr += "\r\n";
    //Get log file path
    var logfile = _this.platform.Config.logdir + moment().format('YYYYMMDD') + '.log';
    if (logdata.ext) logdata += '.' + logdata.ext;
    //Write to log file
    if (force) {
      if(logtype && (logtype.toUpperCase()=='ERROR')){
        fs.appendFileSync(_this.getLastErrorPath(), logstr);
      }
      fs.appendFileSync(logfile, logstr);
    }
    else {
      fs.appendFile(logfile, logstr, function(){ _this.logProcessor(); });
      return;
    }
  }
  if(_this.platform.Mailer && _this.platform.Config.error_email && !_this.isSendingEmail){
    if(_this.lastError){
      errmsg = _this.lastError.substr(0,1000);
      _this.sendErrorEmail(errmsg, function(){
        _this.lastError = null;
        fs.unlink(_this.getLastErrorPath(), function(){ _this.logProcessor(); });
      });
      return;
    }
    while(_this.logmailqueue.length > 0){
      var logdata = _this.logmailqueue.shift();
      _this.sendErrorEmail(logdata.txt, function(){ _this.logProcessor(); });
      return;
    }
  }
  if(!_this.platform.Config.interactive){
    setTimeout(function () { _this.logProcessor() }, _this.platform.Config.LogSleepDelay);
  }
}

//Express Web Server logging
Logger.prototype.express = function(req, res, next) {
  var _this = this;
  req._startTime = new Date;
  var log_on_end = true;
  function log_express() {
    if (log_on_end) {
      res.removeListener('finish', log_express);
      res.removeListener('close', log_express);
    }
    var txt = '' +
      req.method + ' ' + 
      (req.originalUrl || req.url) + ' ' + 
      (res._header ? res.statusCode : '---') + ' ' + 
      Helper.GetIP(req)
    ;
    if (log_on_end) txt += ' ' + ((new Date) - req._startTime).toString() + 'ms';
    var logcolor = 'gray';
    if (res.statusCode == 500) logcolor = 'red';
    if (res.statusCode == 404) logcolor = 'red';
    _this.log(txt, { color: logcolor, source: 'webserver' });
  }  ;
  if (log_on_end) {
    _this.last_express_log = log_express;
    res.on('finish', log_express);
    res.on('close', log_express);
  }
  else log_express();
  
  next();
}

Logger.prototype.onUncaughtException = function(err){
  if (this.last_express_log) this.last_express_log();
  this.log('Uncaught Exception: ' + err.message + ' - ' + err.stack, { logtype: 'ERROR' });
  this.logProcessor(true);
  process.exit(1);
}

exports = module.exports = Logger;