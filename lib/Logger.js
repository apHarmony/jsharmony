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
var _ = require('lodash');
var HelperFS = require('./HelperFS.js')
var Helper = require('./Helper.js')

var logqueue = [];
var logmailqueue = [];
var logmailFirstRun = true;
var logProcessor_started = false;

function logger(txt, color, ext, logtype) {
  if (!txt) return;
  if(!logProcessor_started){
    logProcessor_started = true;
    logProcessor();
  }
  if (!(_.isString(txt))) txt = util.inspect(txt);
  if (!ext) ext = '';
  if (isNaN(color)) color = '';
  if (ext && /[^a-zA-Z0-9.]/.test(ext)) { ext = ''; logger('Invalid log file extension'); }
  var logstr = (new Date()).toISOString() + " " + (logtype ? logtype + ' ' : '') + txt;
  //If set to display log to screen, display log
  if (!global.debug_params || global.debug_params.pipe_log) {
    if(color) console.log('\033[' + color.toString() + 'm' + logstr + '\033[0m')
    else console.log(logstr);
  }
  logqueue.push({txt: logstr, ext: ext, logtype: logtype});
};

exports = module.exports = logger

function sendErrorEmail(txt, cb){
  var subject = 'Error in jsHarmony application: '+(global.site_title||'');
  var mparams = {
    to: global.error_email,
    subject: subject,
    text: subject + '\r\n' + txt
  };
  Helper.SendEmail(mparams, cb);
}

function getLastErrorPath(){
  return global.logdir + 'lasterror.log';
}

function logProcessor(force) {
  var _this = this;
  while (logqueue.length > 0) {
    var logdata = logqueue.shift();
    //If logtype=='ERROR', send email
    logtype = logdata.logtype;
    if(logtype && (logtype.toUpperCase()=='ERROR')){
      //Queue email
      logmailqueue.push(logdata);
    }
    if(!global.logdir) break;
    var logstr = logdata.txt;
    logstr += "\r\n";
    //Get log file path
    var logfile = global.logdir + moment().format('YYYYMMDD') + '.log';
    if (logdata.ext) logdata += '.' + logdata.ext;
    //Write to log file
    if (force) {
      fs.appendFileSync(getLastErrorPath(), logstr);
      fs.appendFileSync(logfile, logstr);
    }
    else {
      fs.appendFile(logfile, logstr, logProcessor);
      return;
    }
  }
  if(global.mailer && global.error_email){
    if(logmailFirstRun){
      logmailFirstRun = false;
      if(fs.existsSync(getLastErrorPath())){
        var errmsg = fs.readFileSync(getLastErrorPath(),'utf8')||'';
        errmsg = errmsg.substr(0,1000);
        sendErrorEmail(errmsg, function(){
          fs.unlink(getLastErrorPath(), logProcessor);
        });
      }
    }
    while(logmailqueue.length > 0){
      var logdata = logmailqueue.shift();
      sendErrorEmail(logdata.txt, logProcessor);
      return;
    }
  }
  setTimeout(function () { logProcessor() }, global.LogSleepDelay);
}

var last_express_log = null;

logger.express = function (req, res, next) {
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
      (req._remoteAddress || (req.connection && req.connection.remoteAddress))
    ;
    if (log_on_end) txt += ' ' + ((new Date) - req._startTime).toString() + 'ms';
    var logcolor = 90;
    if (res.statusCode == 500) logcolor = 91;
    if (res.statusCode == 404) logcolor = 91;
    logger(txt, logcolor);
  }  ;
  if (log_on_end) {
    last_express_log = log_express;
    res.on('finish', log_express);
    res.on('close', log_express);
  }
  else log_express();
  
  next();
}

logger.error = function(txt, color, ext){
  logger(txt, color, ext, 'ERROR');
}

logger.warning = function(txt, color, ext){
  logger(txt, color, ext, 'WARNING');
}

logger.info = function(txt, color, ext){
  logger(txt, color, ext, '');
}

process.on('uncaughtException', function (err) {
  if (last_express_log) last_express_log();
  logger('Uncaught Exception: ' + err.message + ' - ' + err.stack);
  logProcessor(true);
  process.exit(1);
})