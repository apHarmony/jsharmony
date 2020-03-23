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

var Helper = require('./lib/Helper.js');
var _ = require('lodash');
var HelperFS = require('./lib/HelperFS.js');
var fs = require('fs');
var async = require('async');
var path = require('path');
var csv = require('csv');

//Task Logger
function AppSrvTaskLogger(jsh) {
  var _this = this;
  this.jsh = jsh;

  this.isSendingEmail = false;

  var rslt = function(model, loglevel, msg){ return _this.log(model, loglevel, msg); };
  rslt.debug = function(model, msg){ _this.log(model, 'debug', msg); }
  rslt.info = function(model, msg){ _this.log(model, 'info', msg); }
  rslt.warning = function(model, msg){ _this.log(model, 'warning', msg); }
  rslt.error = function(model, msg){ _this.log(model, 'error', msg); }

  return rslt;
}

AppSrvTaskLogger.prototype.log = function(model, loglevel, msg){
  var _this = this;

  if(!msg) return;
  msg = msg.toString();

  if(!_.includes(['debug','info','warning','error'], loglevel)) throw new Error('Invalid loglevel: ' + loglevel);

  if(!model || !model.task || !model.task.logtarget){
    if(_.includes(['info','warning','error'], loglevel)) _this.jsh.Log[loglevel](msg);
  }

  if(model && model.task){
    _.each(model.task.log, function(logtarget){
      var logfile = logtarget.path;
      if(!logfile) return;
      if(logtarget.events && !_.includes(logtarget.events, loglevel)) return;
      if(!logtarget.events && (loglevel == 'debug')) return;

      var curdt = new Date();
      logfile = Helper.ReplaceAll(logfile, '%YYYY', Helper.pad(curdt.getFullYear(),'0',4));
      logfile = Helper.ReplaceAll(logfile, '%MM', Helper.pad(curdt.getMonth()+1,'0',2));
      logfile = Helper.ReplaceAll(logfile, '%DD', Helper.pad(curdt.getDate(),'0',2));

      if(!path.isAbsolute(logfile)) logfile = path.join(_this.jsh.Config.logdir, logfile);

      _this.jsh.Log[loglevel](msg, { logfile: logfile });
    });

    if(loglevel == 'error'){
      _.each(model.task.onerror, function(erroraction){
        if(erroraction.email){
          //Send email on error
          _this.sendErrorEmail(model.task, erroraction.email, msg);
        }
      });
    }
  }
}

AppSrvTaskLogger.prototype.sendErrorEmail = function(model, email_params, txt){
  var _this = this;

  var email_to = email_params.to || !_this.jsh.Config.error_email;
  if(!email_to){ _this.jsh.Log.error('Could not send task error email - No TO address specified'); }
  if(!_this.jsh.SendEmail) return;
  if(_this.isSendingEmail){
    setTimeout(function(){ _this.sendErrorEmail(model, email_params, txt); }, 100);
    return;
  }
  var email_subject = email_params.subject || ((_this.platform.Config.app_name||'') + ':: Error executing task ' + model.id);
  var mparams = {
    to: email_to,
    subject: email_subject,
    text: email_subject + '\r\n' + txt
  };
  _.extend(mparams, _.pick(email_params, ['cc','bcc','from']));
  _this.isSendingEmail = true;
  _this.jsh.SendEmail(mparams, function(){
    _this.isSendingEmail = false;
    if(cb) cb();
  });
}

//Task Server
function AppSrvTask(appsrv) {
  this.AppSrv = appsrv;
  this.jsh = appsrv.jsh;

  this.log = new AppSrvTaskLogger(this.jsh);
}

AppSrvTask.prototype.getParamType = function(fields, key, value){
  var _this = this;
  //Search fields for type
  if(fields) for(var i=0;i<fields.length;i++){
    var field = fields[i];
    if(field.name == key){
      if(!('type' in field)) break;
      return _this.AppSrv.getDBType(field);
    }
  }
  //Return type based on value
  return _this.AppSrv.DB.types.fromValue(value);
}

AppSrvTask.prototype.getParamValues = function(params){
  var rslt = {};
  for(var pname in params){
    rslt[pname] = params[pname].value;
  }
  return rslt;
}

AppSrvTask.prototype.getParamTypes = function(params){
  var rslt = [];
  for(var pname in params){
    rslt.push(params[pname].type);
  }
  return rslt;
}

AppSrvTask.prototype.addParam = function(params, fields, key, value){
  if(key in params) throw new Error('Parameter already defined: ' + key);
  params[key] = { name: key, value: value, type: this.getParamType(fields, key, value) };
}

AppSrvTask.prototype.logParams = function(model, params){
  var rslt = JSON.stringify(this.getParamValues(params),null,4);
  this.log.debug(model, model.id + ': Params ' + rslt);
}

AppSrvTask.prototype.exec = function (req, res, dbcontext, modelid, taskparams, taskcallback) {
  taskparams = taskparams || {};

  var _this = this;
  var model = null;

  var callback = function(err, rslt){
    if(err){
      _this.log.error(model, err.toString());
      return taskcallback(err);
    }
    return taskcallback(null, rslt);
  }

  if (!this.jsh.hasTask(req, modelid)) return callback(new Error("Error: Task Model " + modelid + " is not defined."));
  model = this.jsh.getModel(req, modelid);
  var task = model.task;

  this.log.info(model, 'Running task: ' + model.id);

  var verrors = this.validateFields(task, taskparams);
  if(verrors) return callback(new Error('Task parameter errors: ' + verrors));

  var params = {};
  for(var key in taskparams){ _this.addParam(params, model.fields, key, taskparams[key]); }

  if(dbcontext && !taskparams._DBContext) _this.addParam(params, [], '_DBContext', dbcontext);

  var options = {
    trans: { },
    exec_counter: [],
  }

  this.exec_actions(model, task.actions, params, options, callback);
}

AppSrvTask.prototype.exec_actions = function (model, actions, params, options, callback) {
  var _this = this;
  var rslt = _this.getParamValues(params);
  options.exec_counter.push(0);
  async.eachSeries(actions, function(action, action_cb){
    var action_type = action.exec;
    var standard_actions = [
      'sql','sqltrans',
      'create_folder','delete_folder','list_files',
      'delete_file','copy_file','write_file','append_file','read_file',
      'write_csv','append_csv','read_csv',
      'js','email',
    ];
    options.exec_counter[options.exec_counter.length-1]++;
    _this.log.debug(model, model.id + ': ' + _this.jsh.getTaskActionDesc(action, options));
    if(_.includes(standard_actions, action_type)){
      try{
        _this['exec_'+action_type](model, action, params, options, action_cb);
      }
      catch(ex){
        return action_cb(ex);
      }
    }
    else return action_cb(new Error('Action.exec "' + action_type + '" not supported'));
  }, function(err){
    if(err) _this.jsh.Log.error('Error executing task ' + model.id + ': ' + err.toString());
    options.exec_counter.pop();
    callback(err, rslt);
  });
}

AppSrvTask.prototype.validateFields = function(obj, values){
  if(!obj.xvalidate) return '';
  var verrors = _.merge({}, obj.xvalidate.Validate('U', values||{}));
  if (!_.isEmpty(verrors)) { return verrors[''].join('\n'); }
  return '';
}

AppSrvTask.prototype.replaceParams = function(params, val){
  if(!val) return val;
  var _this = this;
  //Traverse val
  if(_.isString(val)){
    return Helper.mapReplace(params, val, {
      getKey: function(key){ return '@' + key; },
      getValue: function(key){ return params[key].value; }
    });
  }
  if(_.isNumber(val) || _.isDate(val) || _.isBoolean(val) || _.isDate(val) || _.isFunction(val)) return val;
  if(_.isArray(val)){
    val = val.concat([]);
    for(var i=0;i<val.length;i++) val[i] = _this.replaceParams(params, val[i]);
    return val;
  }
  val = _.extend({}, val);
  for(var key in val){
    val[key] = _this.replaceParams(params, val[key]);
  }
  return val;
}

AppSrvTask.prototype.exec_sqltrans = function(model, action, params, options, action_cb){
  //sqltrans (db, actions)

  var _this = this;

  //Resolve database connection
  var dbid = action.db || 'default';
  if(!(dbid in _this.jsh.DB)) return action_cb(new Error('Database connection '+dbid+' not found'));
  var db = this.jsh.DB[dbid];

  //Make sure a transaction with the same dbid is not already in progress
  if(dbid in options.trans) return action_cb(new Error('Database connection '+dbid+' already has a transaction in progress.  Nested task transactions are not supported.'));

  var dbtasks = {};
  dbtasks['action'] = function (dbtrans, callback) {
    //Add transaction to options
    var transOptions = _.extend({}, options);
    transOptions.trans = _.extend({}, transOptions.trans);
    transOptions.trans[dbid] = dbtrans;

    //Execute Actions
    _this.exec_actions(model, action.actions, params, transOptions, function(err){
      return callback(err);
    });
  }
  db.ExecTransTasks(dbtasks, function (err, rslt, stats) {
    return action_cb(err);
  });
}

AppSrvTask.prototype.exec_sql = function(model, action, params, options, action_cb){
  //sql (sql, db, into, foreach_row)

  var _this = this;

  var sql = action.sql;
  if(!sql) return action_cb(new Error('SQL action missing "sql" property - no SQL to execute'));

  if(action.foreach_row && !action.into) return action_cb(new Error('Action with "foreach_row" requires "into" property'));

  //Generate array of parameters
  var sql_ptypes = _this.getParamTypes(params);
  var sql_params = _this.getParamValues(params);

  //Resolve database connection
  var dbid = action.db || 'default';
  if(!(dbid in _this.jsh.DB)) return action_cb(new Error('Database connection '+dbid+' not found'));
  var db = this.jsh.DB[dbid];
  
  var dbcontext = 'task' || action._DBContext || sql_params._DBContext;

  var dbtasks = {};
  dbtasks['action'] = function (callback) {
    //Execute SQL
    db.Recordset(dbcontext, sql, sql_ptypes, sql_params, options.trans[dbid], function (err, rslt, stats) {
      if (stats) stats.model = model;
      if (err) { err.model = model; err.sql = sql; _this.logParams(model, params); return callback(err, rslt, stats); }

      Helper.execif(action.foreach_row && rslt,
        function(f){
          if(action.foreach_row && rslt){
            options.exec_counter.push(0);
            async.eachSeries(rslt, function(row, row_cb){
              //Validate
              var verrors = _this.validateFields(action, row);
              if(verrors) return row_cb(new Error('Error validating ' + action.into + ': ' + verrors + '\nData: ' + JSON.stringify(row)));

              //Add to parameters
              var rowparams = _.extend({}, params);
              for(var key in row){
                _this.addParam(rowparams, action.fields, action.into + '.' + key, row[key]);
              }
              
              //Execute Actions
              options.exec_counter[options.exec_counter.length-1]++;
              _this.exec_actions(model, action.foreach_row, rowparams, options, row_cb);
            }, function(err){
              options.exec_counter.pop();
              if(err) return callback(err);
              return f();
            });
          }
        },
        function(){
          callback(err, rslt, stats);
        }
      );
    });
  }
  db.ExecTasks(dbtasks, function (err, rslt, stats) {
    return action_cb(err);
  });
}

AppSrvTask.prototype.exec_create_folder = function(model, action, params, options, action_cb){
  //create_folder (path)

  var _this = this;

  var fpath = action.path;
  if(!fpath) return action_cb(new Error('create_folder action missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  HelperFS.createFolderIfNotExists(fpath, action_cb);
}

AppSrvTask.prototype.exec_delete_folder = function(model, action, params, options, action_cb){
  //delete_folder (path, recursive)

  var _this = this;

  var fpath = action.path;
  if(!fpath) return action_cb(new Error('delete_folder action missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  fs.exists(fpath, function(exists){
    if(!exists) return action_cb();

    if(action.recursive){
      HelperFS.rmdirRecursive(fpath, action_cb);
    }
    else {
      fs.unlink(fpath, action_cb);
    }
  });
}

AppSrvTask.prototype.exec_list_files = function(model, action, params, options, action_cb){
  //list_files (path, matching, into, foreach_file) *** matching can be exact match, wildcard, or /regex/

  var _this = this;

  var fpath = action.path;
  if(!fpath) return action_cb(new Error('list_files action missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  if(!action.foreach_file) return action_cb(new Error('list_files action missing "foreach_file" property'));
  if(!action.into) return action_cb(new Error('list_files action missing "into" property'));

  fs.readdir(fpath, function(err, files){
    if(err) return action_cb(err);
    options.exec_counter.push(0);
    async.eachSeries(files, function(filename, file_cb){
      //Check if file name matches patterns
      if(action.matching){
        var foundmatch = false;
        for(var i=0;i<action.matching.length;i++){
          var matchexpr = (action.matching[i]||'').toString();
          if(!matchexpr) continue;
          var matchrex = null;
          if(matchexpr[0]=='/'){
            //Regex match
            var endofrx = matchexpr.lastIndexOf('/');
            if(endofrx == 0) endofrx = matchexpr.length;
            var rxpattern = matchexpr.substr(1, endofrx - 1);
            var rxflags = matchexpr.substr(endofrx+1);
            var rx=RegExp(rxpattern, rxflags);
            if(filename.match(rx)) foundmatch = true;
          }
          else if(matchexpr.indexOf('*')>=0){
            //Wildcard match
            var wildparts = matchexpr.split('*');
            var rxstr = '^';
            _.each(wildparts, function(wildpart){
              rxstr += Helper.escapeRegEx(wildpart) + '.*';
            });
            rxstr += '$';
            var rx=RegExp(rxstr);
            if(filename.match(rx)) foundmatch = true;
          }
          else {
            //Equality
            if(filename == match) foundmatch = true;
          }
          if(foundmatch) break;
        }
        if(!foundmatch) return file_cb();
      }

      //Get file statistics
      var filepath = path.join(fpath, filename);
      fs.lstat(filepath, function(err, stats){
        if(err) return file_cb(err);
        if(stats.isDirectory()) return file_cb();

        //Add to parameters
        var actionparams = _.extend({}, params);
        _this.addParam(actionparams, [], action.into + '.path', filepath);
        _this.addParam(actionparams, [], action.into + '.filename', filename);
        
        //Execute Actions for the file
        options.exec_counter[options.exec_counter.length-1]++;
        _this.exec_actions(model, action.foreach_file, actionparams, options, file_cb);
      });
    }, function(err){
      options.exec_counter.pop();
      return action_cb(err);
    });
  });
}

AppSrvTask.prototype.exec_delete_file = function(model, action, params, options, action_cb){
  //delete_file (path)

  var _this = this;

  var fpath = action.path;
  if(!fpath) return action_cb(new Error('delete_file action missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  fs.lstat(fpath, function(err, stats){
    if (err && (err.code == 'ENOENT')) return action_cb();
    else if(err) return action_cb(err);
    else if(stats.isDirectory()) return action_cb(new Error('delete_file target path is a directory'));

    fs.unlink(fpath, function(err){
      return action_cb(err);
    });
  });
}

AppSrvTask.prototype.exec_copy_file = function(model, action, params, options, action_cb){
  //copy_file (path, dest, overwrite)

  var _this = this;

  var fpath = action.path;
  if(!fpath) return action_cb(new Error('copy_file action missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  var fdest = action.dest;
  if(!fdest) return action_cb(new Error('copy_file action missing "dest" property'));
  fdest = _this.replaceParams(params, fdest);
  if(!path.isAbsolute(fdest)) fdest = path.join(_this.jsh.Config.datadir, fdest);

  fs.lstat(fpath, function(err, stats){
    if (err && (err.code == 'ENOENT')) return action_cb(new Error('copy_file source path does not exist'));
    else if(err) return action_cb(err);
    else if(stats.isDirectory()) return action_cb(new Error('copy_file source path is a directory'));

    fs.lstat(fdest, function(err, stats){
      if (err && (err.code == 'ENOENT')){ /* OK - destination does not exist */ }
      else if(err) return action_cb(err);
      else if(stats.isDirectory()) return action_cb(new Error('copy_file destination path is a directory'));
      else if(!action.overwrite) return action_cb(new Error('copy_file target path already exists.  Use "overwrite" property to force overwrite'));
  
      HelperFS.copyFile(fpath, fdest, function(err){
        action_cb(err);
      });
    });
  });
}

AppSrvTask.prototype.exec_write_file = function(task, action, params, options, action_cb){
  //write_file (path, text, overwrite)

  var _this = this;

  var fpath = action.path;
  if(!fpath) return action_cb(new Error('write_file action missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  var ftext = action.text;
  if(!ftext) return action_cb(new Error('write_file action missing "text" property'));
  ftext = _this.replaceParams(params, ftext);

  fs.lstat(fpath, function(err, stats){
    if (err && (err.code == 'ENOENT')){ /* File not found - OK */ }
    else if(err) return action_cb(err);
    else if(stats.isDirectory()) return action_cb(new Error('write_file target path is a directory'));
    else if(!action.overwrite) return action_cb(new Error('write_file target path already exists.  Use "overwrite" property to force overwrite'));

    fs.writeFile(fpath, ftext, 'utf8', function(err){
      return action_cb(err);
    });
  });
}

AppSrvTask.prototype.exec_append_file = function(model, action, params, options, action_cb){
  //append_file (path, text)

  var _this = this;

  var fpath = action.path;
  if(!fpath) return action_cb(new Error('append_file action missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  var ftext = action.text;
  if(!ftext) return action_cb(new Error('append_file action missing "text" property'));
  ftext = _this.replaceParams(params, ftext);

  fs.lstat(fpath, function(err, stats){
    var file_exists = false;
    if (err && (err.code == 'ENOENT')){ /* File not found - OK */ }
    else if(err) return action_cb(err);
    else if(stats.isDirectory()) return action_cb(new Error('append_file target path is a directory'));
    else file_exists = true;

    fs.appendFile(fpath, ftext, (file_exists ? 'utf8' : {}), function(err){
      return action_cb(err);
    });
  });
}

AppSrvTask.prototype.exec_read_file = function(model, action, params, options, action_cb){
  //read_file (path, into, foreach_line)

  var _this = this;

  var fpath = action.path;
  if(!fpath) return action_cb(new Error('read_file action missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  if(action.foreach_line && !action.into) return action_cb(new Error('Action with "foreach_line" requires "into" property'));

  //Read CSV file
  var hasError = false;
  var hasReadable = false;
  var hasFinished = false;
  var f = fs.createReadStream(fpath, { encoding: 'utf8' });
  var dataBuffer = '';

  options.exec_counter.push(0);

  function processLine(line, line_cb){
    //Add to parameters
    var lineparams = _.extend({}, params);
    _this.addParam(lineparams, [], action.into + '.text', line);

    options.exec_counter[options.exec_counter.length-1]++;
    _this.exec_actions(model, action.foreach_line, lineparams, options, function(err){
      return line_cb(err);
    });
  }

  function processData(data_cb){ //Return true when no more to read
    if(hasError) return;

    //Check if more lines in buffer
    if(dataBuffer !== null){
      var nextLine = dataBuffer.indexOf('\n');
      var hasCR = false;
      if(nextLine >= 0){
        var line = '';
        if((nextLine >= 1) && (dataBuffer[nextLine-1]=='\r')) hasCR = true;
        if(hasCR) line = dataBuffer.substr(0, nextLine - 1);
        else line = dataBuffer.substr(0, nextLine);
        dataBuffer = dataBuffer.substr(nextLine + 1);
        processLine(line, data_cb);
        return;
      }
    }

    //Read from file
    var data = f.read();
    if(data === null){
      if(!hasFinished || (dataBuffer === null)){
        hasReadable = false;
        return true;
      }
      //Lines remaining in databuffer
      var line = dataBuffer;
      dataBuffer = null;
      processLine(line, data_cb);
      return;
    }
    dataBuffer += data;
    return data_cb();
  }

  function processDataHandler(err){
    if(hasError) return;
    if(err){
      hasError = true;
      f.destroy();
      options.exec_counter.pop();
      return action_cb(err);
    }
    else{
      if((processData(processDataHandler)===true) && hasFinished){
        options.exec_counter.pop();
        return action_cb();
      }
    }
  }

  f.on('readable', function () {
    if(!hasReadable && !hasError){
      hasReadable = true;
      processData(processDataHandler);
    }
  });
  f.on('end', function () {
    hasFinished = true;
    if(!hasReadable && !hasError){
      hasReadable = true;
      processData(processDataHandler);
    }
  });
}

AppSrvTask.prototype.getCSVSQLData = function(model, action, params, options, onrow, callback){
  var _this = this;

  var sql = action.sql;
  if(!sql) return callback(new Error('Action missing "sql" property - no SQL to execute'));

  //Generate array of parameters
  var sql_ptypes = _this.getParamTypes(params);
  var sql_params = _this.getParamValues(params);

  //Resolve database connection
  var dbid = action.db || 'default';
  if(!(dbid in _this.jsh.DB)) return callback(new Error('Database connection '+dbid+' not found'));
  var db = this.jsh.DB[dbid];
  
  var dbcontext = 'task' || action._DBContext || sql_params._DBContext;

  var dbtasks = {};
  dbtasks['action'] = function (callback) {
    //Execute SQL
    db.Recordset(dbcontext, sql, sql_ptypes, sql_params, options.trans[dbid], function (err, rslt, stats) {
      if (stats) stats.model = model;
      if (err) { err.model = model; err.sql = sql; _this.logParams(model, params); return callback(err, rslt, stats); }

      _.each(rslt, function(row){
        onrow(row);
      });
      return callback(err, rslt, stats);
    });
  }
  db.ExecTasks(dbtasks, function (err, rslt, stats) {
    return callback(err);
  });
}

AppSrvTask.prototype.exec_write_csv = function(model, action, params, options, action_cb){
  //write_csv (path, db, data, sql, overwrite, headers)
  //handle data: {}, [], [[]], [{}]
  //can't have both data and sql

  var _this = this;

  var fpath = action.path;
  if(!fpath) return action_cb(new Error('write_csv action missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  if((!action.data && !action.sql) || (action.data && action.sql)) return action_cb(new Error('write_csv action requires either "data" or "sql" property'));

  var fdata = null;
  if(action.data){
    fdata = action.data;
    if(!fdata) return action_cb(new Error('write_csv action missing "data" property'));
    fdata = _this.replaceParams(params, fdata);
  }

  fs.lstat(fpath, function(err, stats){
    if (err && (err.code == 'ENOENT')){ /* File not found - OK */ }
    else if(err) return action_cb(err);
    else if(stats.isDirectory()) return action_cb(new Error('write_csv target path is a directory'));
    else if(!action.overwrite) return action_cb(new Error('write_csv target path already exists.  Use "overwrite" property to force overwrite'));

    var hasError = false;

    var filestream = fs.createWriteStream(fpath, { flags: 'w', encoding: 'utf8' });
    filestream.on('error', function(err){
      if(hasError) return;
      hasError = true;
      return action_cb(err);
    });
    filestream.on('finish', function(){
      if(hasError) return;
      return action_cb();
    });

    var csv_options = { quotedString: true };
    if(action.headers) csv_options.header = true;
    if(action.fields){
      var columns = _.map(action.fields, function(field){ if(_.isString(field)) return field; return field.name });
      if(!_.isEmpty(columns)) action.columns = columns;
    }
    var csvwriter = csv.stringify(csv_options);
    csvwriter.on('error', function(err){
      if(hasError) return;
      hasError = true;
      return action_cb(err);
    });
    csvwriter.pipe(filestream);

    if(action.sql){
      _this.getCSVSQLData(model, action, params, options, function(row){
        csvwriter.write(row);
      }, function(err){
        if(err){
          hasError = true;
          return action_cb(err);
        }
        csvwriter.end();
      });
    }
    else {
      _.each(fdata, function(row){ csvwriter.write(row); });
      csvwriter.end();
    }
  });
}

AppSrvTask.prototype.exec_append_csv = function(model, action, params, options, action_cb){
  //append_csv (path, db, data, sql)

  var _this = this;

  var fpath = action.path;
  if(!fpath) return action_cb(new Error('append_csv action missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  if((!action.data && !action.sql) || (action.data && action.sql)) return action_cb(new Error('append_csv action requires either "data" or "sql" property'));

  var fdata = null;
  if(action.data){
    fdata = action.data;
    if(!fdata) return action_cb(new Error('append_csv action missing "data" property'));
    fdata = _this.replaceParams(params, fdata);
  }

  fs.lstat(fpath, function(err, stats){
    if (err && (err.code == 'ENOENT')){ /* File not found - OK */ }
    else if(err) return action_cb(err);
    else if(stats.isDirectory()) return action_cb(new Error('append_csv target path is a directory'));

    var hasError = false;

    var filestream = fs.createWriteStream(fpath, { flags: 'a', encoding: 'utf8' });
    filestream.on('error', function(err){
      if(hasError) return;
      hasError = true;
      return action_cb(err);
    });
    filestream.on('finish', function(){
      if(hasError) return;
      return action_cb();
    });

    var csv_options = { quotedString: true };
    if(action.headers) csv_options.header = true;
    if(action.fields){
      var columns = _.map(action.fields, function(field){ if(_.isString(field)) return field; return field.name });
      if(!_.isEmpty(columns)) action.columns = columns;
    }
    var csvwriter = csv.stringify(csv_options);
    csvwriter.on('error', function(err){
      if(hasError) return;
      hasError = true;
      return action_cb(err);
    });
    csvwriter.pipe(filestream);

    if(action.sql){
      _this.getCSVSQLData(model, action, params, options, function(row){
        csvwriter.write(row);
      }, function(err){
        if(err){
          hasError = true;
          return action_cb(err);
        }
        csvwriter.end();
      });
    }
    else {
      _.each(fdata, function(row){ csvwriter.write(row); });
      csvwriter.end();
    }
  });
}

AppSrvTask.prototype.exec_read_csv = function(model, action, params, options, action_cb){
  //read_csv (path, into, foreach_row, fields, headers)

  var _this = this;

  var fpath = action.path;
  if(!fpath) return action_cb(new Error('read_csv action missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  if(action.foreach_row && !action.into) return action_cb(new Error('Action with "foreach_row" requires "into" property'));

  //Read CSV file
  var column_headers = false;
  if(action.headers) column_headers = true;
  if(action.fields){
    column_headers = _.map(action.fields, function(field){ if(_.isString(field)) return field; return field.name });
  }
  var csvparser = csv.parse({ columns: column_headers, relax_column_count: true });
  var hasError = false;
  var hasReadable = false;
  var hasFinished = false;
  var f = fs.createReadStream(fpath);

  options.exec_counter.push(0);

  function processRow(row_cb){
    if(hasError) return;

    var row = csvparser.read();
    if(row===null){ hasReadable = false; return true; }

    //Validate
    var verrors = _this.validateFields(action, row);
    if(verrors) return row_cb(new Error('Error validating ' + action.into + ': ' + verrors + '\nData: ' + JSON.stringify(row)));

    //Add to parameters
    var rowparams = _.extend({}, params);
    for(var key in row){
      _this.addParam(rowparams, action.fields, action.into + '.' + key, row[key]);
    }

    options.exec_counter[options.exec_counter.length-1]++;
    _this.exec_actions(model, action.foreach_row, rowparams, options, function(err){
      return row_cb(err);
    });
  }

  function processRowHandler(err){
    if(hasError) return;
    if(err){
      hasError = true;
      f.destroy();
      options.exec_counter.pop();
      return action_cb(err);
    }
    else{
      if((processRow(processRowHandler)===true) && hasFinished){
        options.exec_counter.pop();
        return action_cb();
      }
    }
  }

  
  csvparser.on('readable', function () {
    if(!hasReadable && !hasError){
      hasReadable = true;
      processRow(processRowHandler);
    }
  });
  csvparser.on('finish', function () {
    hasFinished = true;
    if(!hasReadable && !hasError){
      hasReadable = true;
      if(processRow(processRowHandler)===true){
        options.exec_counter.pop();
        return action_cb();
      }
    }
  });
  f.pipe(csvparser);
}

AppSrvTask.prototype.exec_js = function(model, action, params, options, action_cb){
  //js (js, into, foreach)

  var _this = this;

  if(!action.js) return action_cb(new Error('JS action requires "js" property'));
  if(action.foreach && !action.into) return action_cb(new Error('Action with "foreach" requires "into" property'));

  var jsstr = '(function(){ ' + action.js.toString() + ' })();';
  var jsrslt = null;
  try{
    jsrslt = eval(jsstr);
  }
  catch(ex){
    if(ex) return action_cb(ex);
  }

  if(action.foreach){
    if((jsrslt === null) || (typeof jsrslt == 'undefined')){ }
    else{
      if(!_.isArray(jsrslt)) jsrslt = [jsrslt];

      options.exec_counter.push(0);
      async.eachSeries(jsrslt, function(row, row_cb){

        //Add to parameters
        var rowparams = _.extend({}, params);
        for(var key in row){
          _this.addParam(rowparams, action.fields, action.into + '.' + key, row[key]);
        }
        
        //Execute Actions
        options.exec_counter[options.exec_counter.length-1]++;
        _this.exec_actions(model, action.foreach, rowparams, options, row_cb);
      }, function(err){
        options.exec_counter.pop();
        return action_cb(err);
      });
      return;
    }
  }
  return action_cb();
}

AppSrvTask.prototype.exec_email = function(model, action, params, options, action_cb){
  //email (to, cc, bcc, subject, text, html, attachments)

  var _this = this;

  if((!action.email && !action.jsharmony_txt) || (action.email && action.jsharmony_txt)) return action_cb(new Error('email action requires either "email" or "jsharmony_txt" property'));

  if(action.email){
    var emailparams = _this.replaceParams(params, action.email);

    //Make sure to and subject exists
    if(!emailparams.to) return action_cb(new Error('email action missing "email.to" property'));
    if(!emailparams.subject) return action_cb(new Error('email action missing "email.subject" property'));

    //Add path to attachments
    if(emailparams && emailparams.attachments && emailparams.attachments.length){
      for(var i=0;i<emailparams.attachments.length;i++){
        var attachment = emailparams.attachments[i];
        if(attachment && attachment.path){
          if(!path.isAbsolute(attachment.path)) attachment.path = path.join(_this.jsh.Config.datadir, attachment.path);
        }
      }
    }

    //Send email
    if(!_this.jsh.SendEmail) return action_cb(new Error('jsHarmony SendEmail not configured'));
    _this.jsh.SendEmail(emailparams, function(){
      if(action_cb) action_cb();
    });
  }
  else if(action.jsharmony_txt){
    var emailparams = _this.replaceParams(params, action.jsharmony_txt);

    //Make sure to and subject exists
    if(!emailparams.txt_attrib) return action_cb(new Error('email action missing "jsharmony_txt.txt_attrib" property'));
    if(!emailparams.to) return action_cb(new Error('email action missing "jsharmony_txt.to" property'));

    //Add path to attachments
    if(emailparams && emailparams.attachments && emailparams.attachments.length){
      for(var i=0;i<emailparams.attachments.length;i++){
        var attachment = emailparams.attachments[i];
        if(attachment && attachment.path){
          if(!path.isAbsolute(attachment.path)) attachment.path = path.join(_this.jsh.Config.datadir, attachment.path);
        }
      }
    }

    var dataparams = _this.getParamValues(params);
    var dbcontext = 'task' || action._DBContext || dataparams._DBContext;

    //Send email
    _this.jsh.SendTXTEmail(dbcontext, emailparams.txt_attrib, emailparams.to, emailparams.cc, emailparams.bcc, emailparams.attachments, dataparams, function(err){
      if(action_cb) action_cb();
    });
  }
}

module.exports = exports = AppSrvTask;