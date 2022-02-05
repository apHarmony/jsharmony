/*
Copyright 2020 apHarmony

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

var fs = require('fs');
var async = require('async');
var _ = require('lodash');
var spawn = require('child_process').spawn;

exports = module.exports = {};

exports.exec = function(path, params, cb, stdout, stderr, onError, options, onMessage){
  if(!options) options = { };
  var cmd = spawn(path, params, options);
  if(stdout) cmd.stdout.on('data',function(data){ stdout(data.toString()); }); //stdout(data){ ... }
  if(stderr) cmd.stderr.on('data',stderr); //stderr(data){ ... }
  cmd.on('error', function(err){
    if(onError) return onError(err);
    console.log(err); // eslint-disable-line no-console
  });
  if(onMessage) cmd.on('message', onMessage);
  if(cb) cmd.on('close',cb); //cb(code){ ... }
  return cmd;
};

exports.runNodeScript = function(script, params, options, callback){
  callback = callback || function(){};
  options = _.extend({ onMessage: undefined /*function(msg, handle){}*/ }, options);
  var cmd = [script].concat(params || []);
  exports.exec('node',cmd,
    function(code){
      callback(code); //0 = success
    },
    undefined,undefined,
    function(err){
      console.log('ERROR: Could not find or start command "node". Check to make sure Node.js is installed and is in the global path.'); // eslint-disable-line no-console
    },
    { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] },
    options.onMessage);
};

exports.getSalt = function(len){
  var rslt = '';
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=][}{|~,.<>?';
  for(var i=0;i<len;i++) rslt += chars.charAt(Math.floor(Math.random()*chars.length));
  return rslt;
};

exports.genDBPassword = function(len){
  var rslt = '';
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#%^&_+-=|~.<>';
  for(var i=0;i<len;i++) rslt += chars.charAt(Math.floor(Math.random()*chars.length));
  return rslt;
};

exports.createFolderIfNotExistsSync = function(path){
  if(fs.existsSync(path)) return;
  fs.mkdirSync(path, '0777');
};

exports.sys_error = function (err) {
  console.log('An error occurred while processing the operation:'); // eslint-disable-line no-console
  console.log(err); // eslint-disable-line no-console
  console.log('\r\nPress enter to exit'); // eslint-disable-line no-console
  exports.getString(function (rslt) { process.exit(1); });
};

exports.rmdir_sub = function (path, cb){
  if ((path[path.length - 1] == '/') || (path[path.length - 1] == '\\')) path = path.substr(0, path.length - 1);
  fs.exists(path, function (exists) {
    if (!exists) return cb();
    fs.readdir(path, function (err, files) {
      if (err) return exports.sys_error(err);
      async.eachSeries(files, function (file, files_cb) {
        var filepath = path + '/' + file;
        fs.lstat(filepath, function (lstat_err, stats) {
          if (lstat_err) return exports.sys_error(lstat_err);
          if (stats.isDirectory()) {
            exports.rmdir_sub(filepath, function () {
              fs.rmdir(filepath, function (rmdir_err) {
                if (rmdir_err) return exports.sys_error(rmdir_err);
                files_cb();
              });
            });
          }
          else {
            fs.unlink(filepath, function (unlink_err) {
              if (unlink_err) return exports.sys_error(unlink_err);
              files_cb();
            });
          }
        });
      }, function (files_err) {
        if (err) return exports.sys_error(err);
        cb();
      });
    });
  });
};

exports.padLeftZ = function (str, len) {
  var rslt = str.toString();
  while (rslt.length < len) rslt = '0' + rslt;
  return rslt;
};

exports.getPassword = function (cb) { return exports.getString(cb, '*'); };

exports.getStringAsync = function(onStart,onComplete, passchar){
  return function(){ return new Promise(function(resolve,reject){
    var rslt_onStart = true;
    var handleResult = function(rslt, retry){ var cbrslt = onComplete(rslt,retry); if(cbrslt===false) return reject(); if(cbrslt===true) return resolve(rslt); };
    if(onStart) rslt_onStart = onStart();
    if(rslt_onStart === false) return resolve();
    if(_.isString(rslt_onStart)) return handleResult(rslt_onStart, function(){ exports.getString(handleResult,passchar); });
    exports.getString(handleResult,passchar);
  }); };
};

exports.getString = function (cb, passchar) {
  var stdin = process.openStdin();
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  var rslt = '';
  stdin.on('data', function (c) {
    c = c + '';
    switch (c) {
      case '\n': case '\r': case '\u0004':
        process.stdout.write('\n');
        //stdin.setRawMode(false); //Would cause problems on Windows 8, subsequent reads don't work
        stdin.pause();
        stdin.removeAllListeners('data');
        cb(rslt, function(){ exports.getString(cb,passchar); });
        break;
      case '\u0003':
        process.exit();
        break;
      case '\u0008':
        if(rslt.length <= 0) break;
        process.stdout.write(c);
        process.stdout.write(' ');
        process.stdout.write(c);
        if (rslt.length > 0) rslt = rslt.substr(0, rslt.length - 1);
        break;
      default:
        if (c.charCodeAt(0).toString(16) == '1b') break;
        if (passchar) process.stdout.write(passchar);
        else process.stdout.write(c);
        rslt += c;
        break;
    }
  });
};

exports.readParameters = function(config, args){
  /*
  {
    name: 'script_name',
    parameters: {
      'param1': { type: 'flag', 'args': ['path'] }
    }
  }
  --> script_name --param1 /var/www
  */
  //--help

  config = _.extend({
    name: '<script>',
    parameters: {},
  }, config);
  for(let key in config.parameters){
    config.parameters[key] = _.extend({ type: 'flag', args: [] }, config.parameters[key]);
  }

  var help_text = '';
  help_text += '\r\n';
  help_text += '-------------------\r\n';
  help_text += 'Usage: '+config.name+(!_.isEmpty(config.parameters)?' [options]':'')+'\r\n';
  help_text += '\r\n';
  if(!_.isEmpty(config.parameters)){
    help_text += 'The following options are available:\r\n';
    help_text += '\r\n';
    for(let key in config.parameters){
      let parameter = config.parameters[key];
      help_text += '    --'+key;
      _.each(parameter.args, function(arg){ help_text += ' [' + arg + ']'; });
      help_text += '\r\n';
    }
  }
  help_text += '\r\n';

  var isValid = true;
  var rslt = {};

  for(var i=0;i<args.length;i++){
    var arg = (args[i]||'').toString();
    if(arg=='--help'){
      isValid = false;
      break;
    }
    arg = arg.substr(2);
    if(arg in config.parameters){
      let parameter = config.parameters[arg];
      if(!parameter.args.length) rslt[arg] = true;
      else {
        if(args.length < (i+parameter.args.length+1)){
          isValid = false;
          help_text += 'Parameter + '+arg+' requires ' + config.parameters.args.join(', ') + '\r\n\r\n';
          break;
        }
        if(parameter.args.length == 1){
          rslt[arg] = args[i+1];
        }
        else {
          rslt[arg] = args.splice(i+1, parameter.args.length);
        }
        i+= parameter.args.length;
      }
    }
    else {
      isValid = false;
      help_text += 'Invalid option: '+ (args[i]) + '\r\n\r\n';
    }
  }

  if(!isValid){
    console.log(help_text); // eslint-disable-line no-console
    process.exit(1);
  }
  return rslt;
};