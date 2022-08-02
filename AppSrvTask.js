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
var spawn = require('child_process').spawn;

//Task Logger
function AppSrvTaskLogger(jsh, task) {
  var _this = this;
  this.jsh = jsh;
  this.task = task;

  this.isSendingEmail = false;

  var rslt = function(model, loglevel, msg){ return _this.log(model, loglevel, msg); };
  rslt.debug = function(model, msg){ _this.log(model, 'debug', msg); };
  rslt.info = function(model, msg){ _this.log(model, 'info', msg); };
  rslt.warning = function(model, msg){ _this.log(model, 'warning', msg); };
  rslt.error = function(model, msg){ _this.log(model, 'error', msg); };

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
      if(_this.task) logfile = _this.task.replaceParams(_this.task.fieldParams, logfile);
      logfile = Helper.ReplaceAll(logfile, '%YYYY', Helper.pad(curdt.getFullYear(),'0',4));
      logfile = Helper.ReplaceAll(logfile, '%MM', Helper.pad(curdt.getMonth()+1,'0',2));
      logfile = Helper.ReplaceAll(logfile, '%DD', Helper.pad(curdt.getDate(),'0',2));

      if(!path.isAbsolute(logfile)) logfile = path.join(_this.jsh.Config.logdir, logfile);

      _this.jsh.Log[loglevel](msg, { logfile: logfile });
    });

    if(loglevel == 'error'){
      _.each(model.task.onerror, function(errorcommand){
        if(errorcommand.email){
          //Send email on error
          _this.sendErrorEmail(model.task, errorcommand.email, msg);
        }
      });
    }
  }
};

AppSrvTaskLogger.prototype.sendErrorEmail = function(model, email_params, txt){
  var _this = this;

  var email_to = email_params.to || _this.jsh.Config.error_email;
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
  });
};

//Task Server
function AppSrvTask(appsrv) {
  this.AppSrv = appsrv;
  this.jsh = appsrv.jsh;
  this.fieldParams = {};

  this.log = new AppSrvTaskLogger(this.jsh, this);
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
};

AppSrvTask.prototype.getParamValues = function(params){
  var rslt = {};
  for(var pname in params){
    rslt[pname] = params[pname].value;
  }
  return rslt;
};

AppSrvTask.prototype.getParamTypes = function(params){
  var rslt = [];
  for(var pname in params){
    rslt.push(params[pname].type);
  }
  return rslt;
};

AppSrvTask.prototype.addParam = function(params, fields, key, value){
  if(key in params) throw new Error('Parameter already defined: ' + key);
  params[key] = { name: key, value: value, type: this.getParamType(fields, key, value) };
};

AppSrvTask.prototype.logParams = function(model, params){
  var rslt = JSON.stringify(this.getParamValues(params),null,4);
  this.log.debug(model, model.id + ': Params ' + rslt);
};

AppSrvTask.prototype.drainLocals = function(commandLocals, command_cb){
  if(!commandLocals || !commandLocals.length) return command_cb();
  async.eachSeries(commandLocals, function(locals, locals_cb){
    if(!locals || !locals.queue) return locals_cb();
    locals.queue.drain(command_cb);
  }, command_cb);
};

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
  };

  if (!this.jsh.hasTask(req, modelid)) return callback(new Error('Error: Task Model ' + modelid + ' is not defined.'));
  model = this.jsh.getModel(req, modelid);
  var task = model.task;

  var verrors = this.validateFields(task, taskparams);
  if(verrors) return callback(new Error('Task parameter errors: ' + verrors));

  var params = {};
  _this.fieldParams = {};
  for(var key in taskparams){
    _this.addParam(params, model.fields, key, taskparams[key]);
    _this.addParam(_this.fieldParams, model.fields, key, taskparams[key]);
  }

  this.log.info(model, 'Running task: ' + model.id);

  if(dbcontext && !taskparams._DBContext) _this.addParam(params, [], '_DBContext', dbcontext);

  var options = {
    trans: { },
    exec_counter: [],
  };

  this.exec_commands(model, task.commands, null, params, options, callback);
};

AppSrvTask.prototype.exec_commands = function (model, commands, commandLocals, params, options, callback) {
  var _this = this;
  var rslt = _this.getParamValues(params);
  options.exec_counter.push(0);
  if(commandLocals && !commandLocals.length){ for(var i=0;i<commands.length;i++){ commandLocals.push({}); } }
  async.eachOfSeries(commands, function(command, idx, command_cb){
    var operation_type = command.exec;
    var standard_operations = [
      'sql','sqltrans',
      'create_folder','move_folder','delete_folder','list_files',
      'delete_file','copy_file','move_file','write_file','append_file','read_file',
      'write_csv','append_csv','read_csv',
      'js','shell','email','log',
    ];
    options.exec_counter[options.exec_counter.length-1]++;
    if(command.batch && (commandLocals && commandLocals[idx] && commandLocals[idx].queue && (commandLocals[idx].queue.items.length > 0))){ /* Do nothing */ }
    else {
      _this.log.debug(model, model.id + ': ' + _this.jsh.getTaskCommandDesc(command, options));
    }
    if(_.includes(standard_operations, operation_type)){
      var orig_locals = options.locals;
      options.locals = undefined;
      if(commandLocals) options.locals = commandLocals[idx];
      try{
        _this['exec_'+operation_type](model, command, params, options, command_cb);
        options.locals = orig_locals;
      }
      catch(ex){
        options.locals = orig_locals;
        return command_cb(ex);
      }
    }
    else return command_cb(new Error('operation.exec "' + operation_type + '" not supported'));
  }, function(err){
    if(err) _this.jsh.Log.error('Error executing task ' + model.id + ': ' + err.toString());
    options.exec_counter.pop();
    callback(err, rslt);
  });
};

AppSrvTask.prototype.validateFields = function(obj, values){
  if(!obj.xvalidate) return '';
  var verrors = _.merge({}, obj.xvalidate.Validate('U', values||{}));
  if (!_.isEmpty(verrors)) { return verrors[''].join('\n'); }
  return '';
};

AppSrvTask.prototype.replaceParams = function(params, val){
  if(!val) return val;
  var _this = this;
  //Traverse val
  if(_.isString(val)){
    if(val.substr(0,3)=='js:'){
      val = Helper.JSEval(val.substr(3), _this, {
        jsh: _this.jsh
      });
    }
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
};

AppSrvTask.prototype.exec_sqltrans = function(model, command, params, options, command_cb){
  //sqltrans (db, for)

  var _this = this;

  //Resolve database connection
  var dbid = command.db || 'default';
  if(!(dbid in _this.jsh.DB)) return command_cb(new Error('Database connection '+dbid+' not found'));
  var db = this.jsh.DB[dbid];

  //Make sure a transaction with the same dbid is not already in progress
  if(dbid in options.trans) return command_cb(new Error('Database connection '+dbid+' already has a transaction in progress.  Nested task transactions are not supported.'));

  var dbtasks = {};
  dbtasks['commands'] = function (dbtrans, callback) {
    //Add transaction to options
    var transOptions = _.extend({}, options);
    transOptions.trans = _.extend({}, transOptions.trans);
    transOptions.trans[dbid] = dbtrans;

    //Execute Commands
    _this.exec_commands(model, command.for, null, params, transOptions, function(err){
      return callback(err);
    });
  };
  db.ExecTransTasks(dbtasks, function (err, rslt, stats) {
    return command_cb(err);
  });
};

AppSrvTask.prototype.exec_sql = function(model, command, params, options, command_cb){
  //sql (sql, db, into, foreach_row, fields, batch)

  var _this = this;

  var sql = command.sql;
  if(!sql) return command_cb(new Error('SQL command missing "sql" property - no SQL to execute'));

  if(command.foreach_row && !command.into) return command_cb(new Error('Command with "foreach_row" requires "into" property'));
  if(command.batch && !options.locals) return command_cb(new Error('Batch commands must be executed within a loop'));
  if(command.batch && command.foreach_row) return command_cb(new Error('Batch commands cannot be used with foreach'));

  var commandLocals = [];

  //Generate array of parameters
  var sql_ptypes = _this.getParamTypes(params);
  var sql_params = _this.getParamValues(params);

  //Resolve database connection
  var dbid = command.db || 'default';
  if(!(dbid in _this.jsh.DB)) return command_cb(new Error('Database connection '+dbid+' not found'));
  var db = this.jsh.DB[dbid];
  
  var dbcontext = 'task' || command._DBContext || sql_params._DBContext;

  if(command.batch){
    //Execute batch queue
    if(!options.locals.queue) options.locals.queue = new Helper.gather(function(sqls, gather_cb){
      if(!sqls.length) return gather_cb();
      var dbtasks = {};
      dbtasks['command'] = function (callback) {
        //Execute SQL
        db.Recordset(dbcontext, sqls.join(' '), [], {}, options.trans[dbid], function (err, rslt, stats) {
          if (stats) stats.model = model;
          if (err) { err.model = model; err.sql = sql; _this.logParams(model, params); return callback(err, rslt, stats); }
          callback(err, rslt, stats);
        });
      };
      db.ExecTasks(dbtasks, function (err, rslt, stats) {
        return gather_cb(err);
      });
    }, { length: command.batch });

    sql = db.applySQLParams(sql, sql_ptypes, sql_params).trim();
    if(!Helper.endsWith(sql, ';')) sql += ';';
    options.locals.queue.push(sql, command_cb);
  }
  else {
    //Execute single command
    var dbtasks = {};
    dbtasks['command'] = function (callback) {
      //Execute SQL
      db.Recordset(dbcontext, sql, sql_ptypes, sql_params, options.trans[dbid], function (err, rslt, stats) {
        if (stats) stats.model = model;
        if (err) { err.model = model; err.sql = sql; _this.logParams(model, params); return callback(err, rslt, stats); }

        Helper.execif(command.foreach_row && rslt,
          function(f){
            if(command.foreach_row && rslt){
              options.exec_counter.push(0);
              async.eachSeries(rslt, function(row, row_cb){
                //Validate
                var verrors = _this.validateFields(command, row);
                if(verrors) return row_cb(new Error('Error validating ' + command.into + ': ' + verrors + '\nData: ' + JSON.stringify(row)));

                //Add to parameters
                var rowparams = _.extend({}, params);
                for(var key in row){
                  _this.addParam(rowparams, command.fields, command.into + '.' + key, row[key]);
                }

                //Add null for empty columns
                _.each(command.fields, function(field){
                  var fieldName = (_.isString(field) ? field : field.name);
                  if(!fieldName) return;
                  var paramName = command.into + '.' + fieldName;
                  if(!(paramName in rowparams)){
                    _this.addParam(rowparams, command.fields, paramName, null);
                  }
                });
                
                //Execute Commands
                options.exec_counter[options.exec_counter.length-1]++;
                _this.exec_commands(model, command.foreach_row, commandLocals, rowparams, options, row_cb);
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
    };
    db.ExecTasks(dbtasks, function (err, rslt, stats) {
      if(err) return command_cb(err);
      return _this.drainLocals(commandLocals, command_cb);
    });
  }
};

AppSrvTask.prototype.exec_create_folder = function(model, command, params, options, command_cb){
  //create_folder (path)

  var _this = this;

  var fpath = command.path;
  if(!fpath) return command_cb(new Error('create_folder command missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  HelperFS.createFolderIfNotExists(fpath, command_cb);
};

AppSrvTask.prototype.exec_move_folder = function(model, command, params, options, command_cb){
  //move_folder (path, dest)

  var _this = this;

  var fpath = command.path;
  if(!fpath) return command_cb(new Error('move_folder command missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  var fdest = command.dest;
  if(!fdest) return command_cb(new Error('move_folder command missing "dest" property'));
  fdest = _this.replaceParams(params, fdest);
  if(!path.isAbsolute(fdest)) fdest = path.join(_this.jsh.Config.datadir, fdest);

  fs.lstat(fpath, function(err, stats){
    if (err && (err.code == 'ENOENT')) return command_cb(new Error('move_folder source path does not exist'));
    else if(err) return command_cb(err);
    else if(!stats.isDirectory()) return command_cb(new Error('move_folder source path is not a directory'));

    fs.lstat(fdest, function(err, stats){
      if (err && (err.code == 'ENOENT')){ /* OK - destination does not exist */ }
      else if(err) return command_cb(err);
      else return command_cb(new Error('move_folder destination path already exists'));
  
      fs.rename(fpath, fdest, function(err){
        command_cb(err);
      });
    });
  });
};

AppSrvTask.prototype.exec_delete_folder = function(model, command, params, options, command_cb){
  //delete_folder (path, recursive)

  var _this = this;

  var fpath = command.path;
  if(!fpath) return command_cb(new Error('delete_folder command missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  fs.exists(fpath, function(exists){
    if(!exists) return command_cb();

    if(command.recursive){
      HelperFS.rmdirRecursive(fpath, command_cb);
    }
    else {
      fs.unlink(fpath, command_cb);
    }
  });
};

AppSrvTask.prototype.exec_list_files = function(model, command, params, options, command_cb){
  //list_files (path, matching, into, foreach_file) *** matching can be exact match, wildcard, or /regex/

  var _this = this;

  var fpath = command.path;
  if(!fpath) return command_cb(new Error('list_files command missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  if(!command.foreach_file) return command_cb(new Error('list_files command missing "foreach_file" property'));
  if(!command.into) return command_cb(new Error('list_files command missing "into" property'));

  var commandLocals = [];
  fs.readdir(fpath, function(err, files){
    if(err) return command_cb(err);
    options.exec_counter.push(0);
    async.eachSeries(files, function(filename, file_cb){
      //Check if file name matches patterns
      if(command.matching){
        var foundmatch = false;
        for(var i=0;i<command.matching.length;i++){
          var matchexpr = (command.matching[i]||'').toString();
          if(!matchexpr) continue;
          if(matchexpr[0]=='/'){
            //Regex match
            var endofrx = matchexpr.lastIndexOf('/');
            if(endofrx == 0) endofrx = matchexpr.length;
            var rxpattern = matchexpr.substr(1, endofrx - 1);
            var rxflags = matchexpr.substr(endofrx+1);
            let rx=RegExp(rxpattern, rxflags);
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
            let rx=RegExp(rxstr);
            if(filename.match(rx)) foundmatch = true;
          }
          else {
            //Equality
            if(filename == matchexpr) foundmatch = true;
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
        var commandparams = _.extend({}, params);
        _this.addParam(commandparams, [], command.into + '.path', filepath);
        _this.addParam(commandparams, [], command.into + '.filename', filename);
        
        //Execute Commands for the file
        options.exec_counter[options.exec_counter.length-1]++;
        _this.exec_commands(model, command.foreach_file, commandLocals, commandparams, options, file_cb);
      });
    }, function(err){
      options.exec_counter.pop();
      if(err) return command_cb(err);
      return _this.drainLocals(commandLocals, command_cb);
    });
  });
};

AppSrvTask.prototype.exec_delete_file = function(model, command, params, options, command_cb){
  //delete_file (path)

  var _this = this;

  var fpath = command.path;
  if(!fpath) return command_cb(new Error('delete_file command missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  fs.lstat(fpath, function(err, stats){
    if (err && (err.code == 'ENOENT')) return command_cb();
    else if(err) return command_cb(err);
    else if(stats.isDirectory()) return command_cb(new Error('delete_file target path is a directory'));

    fs.unlink(fpath, function(err){
      return command_cb(err);
    });
  });
};

AppSrvTask.prototype.exec_copy_file = function(model, command, params, options, command_cb){
  //copy_file (path, dest, overwrite)

  var _this = this;

  var fpath = command.path;
  if(!fpath) return command_cb(new Error('copy_file command missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  var fdest = command.dest;
  if(!fdest) return command_cb(new Error('copy_file command missing "dest" property'));
  fdest = _this.replaceParams(params, fdest);
  if(!path.isAbsolute(fdest)) fdest = path.join(_this.jsh.Config.datadir, fdest);

  fs.lstat(fpath, function(err, stats){
    if (err && (err.code == 'ENOENT')) return command_cb(new Error('copy_file source path does not exist'));
    else if(err) return command_cb(err);
    else if(stats.isDirectory()) return command_cb(new Error('copy_file source path is a directory'));

    fs.lstat(fdest, function(err, stats){
      if (err && (err.code == 'ENOENT')){ /* OK - destination does not exist */ }
      else if(err) return command_cb(err);
      else if(stats.isDirectory()) return command_cb(new Error('copy_file destination path is a directory'));
      else if(!command.overwrite) return command_cb(new Error('copy_file destination path already exists.  Use "overwrite" property to force overwrite'));
  
      HelperFS.copyFile(fpath, fdest, function(err){
        command_cb(err);
      });
    });
  });
};

AppSrvTask.prototype.exec_move_file = function(model, command, params, options, command_cb){
  //move_file (path, dest, overwrite)

  var _this = this;

  var fpath = command.path;
  if(!fpath) return command_cb(new Error('move_file command missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  var fdest = command.dest;
  if(!fdest) return command_cb(new Error('move_file command missing "dest" property'));
  fdest = _this.replaceParams(params, fdest);
  if(!path.isAbsolute(fdest)) fdest = path.join(_this.jsh.Config.datadir, fdest);

  fs.lstat(fpath, function(err, stats){
    if (err && (err.code == 'ENOENT')) return command_cb(new Error('move_file source path does not exist'));
    else if(err) return command_cb(err);
    else if(stats.isDirectory()) return command_cb(new Error('move_file source path is a directory'));

    fs.lstat(fdest, function(err, stats){
      if (err && (err.code == 'ENOENT')){ /* OK - destination does not exist */ }
      else if(err) return command_cb(err);
      else if(stats.isDirectory()) return command_cb(new Error('move_file destination path is a directory'));
      else if(!command.overwrite) return command_cb(new Error('move_file destination path already exists.  Use "overwrite" property to force overwrite'));
  
      fs.rename(fpath, fdest, function(err){
        command_cb(err);
      });
    });
  });
};

AppSrvTask.prototype.exec_write_file = function(task, command, params, options, command_cb){
  //write_file (path, text, overwrite)

  var _this = this;

  var fpath = command.path;
  if(!fpath) return command_cb(new Error('write_file command missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  var ftext = command.text;
  if(!ftext) return command_cb(new Error('write_file command missing "text" property'));
  ftext = _this.replaceParams(params, ftext);

  fs.lstat(fpath, function(err, stats){
    if (err && (err.code == 'ENOENT')){ /* File not found - OK */ }
    else if(err) return command_cb(err);
    else if(stats.isDirectory()) return command_cb(new Error('write_file target path is a directory'));
    else if(!command.overwrite) return command_cb(new Error('write_file target path already exists.  Use "overwrite" property to force overwrite'));

    fs.writeFile(fpath, ftext, 'utf8', function(err){
      return command_cb(err);
    });
  });
};

AppSrvTask.prototype.exec_append_file = function(model, command, params, options, command_cb){
  //append_file (path, text)

  var _this = this;

  var fpath = command.path;
  if(!fpath) return command_cb(new Error('append_file command missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  var ftext = command.text;
  if(!ftext) return command_cb(new Error('append_file command missing "text" property'));
  ftext = _this.replaceParams(params, ftext);

  fs.lstat(fpath, function(err, stats){
    var file_exists = false;
    if (err && (err.code == 'ENOENT')){ /* File not found - OK */ }
    else if(err) return command_cb(err);
    else if(stats.isDirectory()) return command_cb(new Error('append_file target path is a directory'));
    else file_exists = true;

    fs.appendFile(fpath, ftext, (file_exists ? 'utf8' : {}), function(err){
      return command_cb(err);
    });
  });
};

AppSrvTask.prototype.exec_read_file = function(model, command, params, options, command_cb){
  //read_file (path, into, foreach_line)

  var _this = this;

  var fpath = command.path;
  if(!fpath) return command_cb(new Error('read_file command missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  if(command.foreach_line && !command.into) return command_cb(new Error('Command with "foreach_line" requires "into" property'));

  //Read CSV file
  var hasError = false;
  var hasReadable = false;
  var hasFinished = false;
  var f = fs.createReadStream(fpath, { encoding: 'utf8' });
  var dataBuffer = '';

  options.exec_counter.push(0);
  var commandLocals = [];

  function processLine(line, line_cb){
    //Add to parameters
    var lineparams = _.extend({}, params);
    _this.addParam(lineparams, [], command.into + '.text', line);

    options.exec_counter[options.exec_counter.length-1]++;
    _this.exec_commands(model, command.foreach_line, commandLocals, lineparams, options, function(err){
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
        let line = '';
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
      let line = dataBuffer;
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
      return command_cb(err);
    }
    else{
      if((processData(processDataHandler)===true) && hasFinished){
        options.exec_counter.pop();
        return _this.drainLocals(commandLocals, command_cb);
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
};

AppSrvTask.prototype.getCSVSQLData = function(model, command, params, options, onrow, callback){
  var _this = this;

  var sql = command.sql;
  if(!sql) return callback(new Error('Command missing "sql" property - no SQL to execute'));

  //Generate array of parameters
  var sql_ptypes = _this.getParamTypes(params);
  var sql_params = _this.getParamValues(params);

  //Resolve database connection
  var dbid = command.db || 'default';
  if(!(dbid in _this.jsh.DB)) return callback(new Error('Database connection '+dbid+' not found'));
  var db = this.jsh.DB[dbid];
  
  var dbcontext = 'task' || command._DBContext || sql_params._DBContext;

  var dbtasks = {};
  dbtasks['command'] = function (callback) {
    //Execute SQL
    db.Recordset(dbcontext, sql, sql_ptypes, sql_params, options.trans[dbid], function (err, rslt, stats) {
      if (stats) stats.model = model;
      if (err) { err.model = model; err.sql = sql; _this.logParams(model, params); return callback(err, rslt, stats); }

      _.each(rslt, function(row){
        onrow(row);
      });
      return callback(err, rslt, stats);
    });
  };
  db.ExecTasks(dbtasks, function (err, rslt, stats) {
    return callback(err);
  });
};

AppSrvTask.prototype.exec_write_csv = function(model, command, params, options, command_cb){
  //write_csv (path, db, data, sql, overwrite, fields, headers, csv_options)
  //handle data: {}, [], [[]], [{}]
  //can't have both data and sql

  var _this = this;

  var fpath = command.path;
  if(!fpath) return command_cb(new Error('write_csv command missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  if((!command.data && !command.sql) || (command.data && command.sql)) return command_cb(new Error('write_csv command requires either "data" or "sql" property'));

  var fdata = null;
  if(command.data){
    fdata = command.data;
    if(!fdata) return command_cb(new Error('write_csv command missing "data" property'));
    fdata = _this.replaceParams(params, fdata);
  }

  fs.lstat(fpath, function(err, stats){
    if (err && (err.code == 'ENOENT')){ /* File not found - OK */ }
    else if(err) return command_cb(err);
    else if(stats.isDirectory()) return command_cb(new Error('write_csv target path is a directory'));
    else if(!command.overwrite) return command_cb(new Error('write_csv target path already exists.  Use "overwrite" property to force overwrite'));

    var hasError = false;

    var filestream = fs.createWriteStream(fpath, { flags: 'w', encoding: 'utf8' });
    filestream.on('error', function(err){
      if(hasError) return;
      hasError = true;
      return command_cb(err);
    });
    filestream.on('finish', function(){
      if(hasError) return;
      return command_cb();
    });

    var csv_options = { quotedString: true };
    if(command.headers) csv_options.header = true;
    if(command.fields){
      var columns = _.map(command.fields, function(field){ if(_.isString(field)) return field; return field.name; });
      if(!_.isEmpty(columns)) command.columns = columns;
    }
    csv_options = _.extend(csv_options, (command.csv_options || {}));
    var csvwriter = csv.stringify(csv_options);
    csvwriter.on('error', function(err){
      if(hasError) return;
      hasError = true;
      return command_cb(err);
    });
    csvwriter.pipe(filestream);

    if(command.sql){
      _this.getCSVSQLData(model, command, params, options, function(row){
        csvwriter.write(row);
      }, function(err){
        if(err){
          hasError = true;
          return command_cb(err);
        }
        csvwriter.end();
      });
    }
    else {
      _.each(fdata, function(row){ csvwriter.write(row); });
      csvwriter.end();
    }
  });
};

AppSrvTask.prototype.exec_append_csv = function(model, command, params, options, command_cb){
  //append_csv (path, db, data, sql, fields, headers, csv_options)

  var _this = this;

  var fpath = command.path;
  if(!fpath) return command_cb(new Error('append_csv command missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  if((!command.data && !command.sql) || (command.data && command.sql)) return command_cb(new Error('append_csv command requires either "data" or "sql" property'));

  var fdata = null;
  if(command.data){
    fdata = command.data;
    if(!fdata) return command_cb(new Error('append_csv command missing "data" property'));
    fdata = _this.replaceParams(params, fdata);
  }

  fs.lstat(fpath, function(err, stats){
    if (err && (err.code == 'ENOENT')){ /* File not found - OK */ }
    else if(err) return command_cb(err);
    else if(stats.isDirectory()) return command_cb(new Error('append_csv target path is a directory'));

    var hasError = false;

    var filestream = fs.createWriteStream(fpath, { flags: 'a', encoding: 'utf8' });
    filestream.on('error', function(err){
      if(hasError) return;
      hasError = true;
      return command_cb(err);
    });
    filestream.on('finish', function(){
      if(hasError) return;
      return command_cb();
    });

    var csv_options = { quotedString: true };
    if(command.headers) csv_options.header = true;
    if(command.fields){
      var columns = _.map(command.fields, function(field){ if(_.isString(field)) return field; return field.name; });
      if(!_.isEmpty(columns)) command.columns = columns;
    }
    csv_options = _.extend(csv_options, (command.csv_options || {}));
    var csvwriter = csv.stringify(csv_options);
    csvwriter.on('error', function(err){
      if(hasError) return;
      hasError = true;
      return command_cb(err);
    });
    csvwriter.pipe(filestream);

    if(command.sql){
      _this.getCSVSQLData(model, command, params, options, function(row){
        csvwriter.write(row);
      }, function(err){
        if(err){
          hasError = true;
          return command_cb(err);
        }
        csvwriter.end();
      });
    }
    else {
      _.each(fdata, function(row){ csvwriter.write(row); });
      csvwriter.end();
    }
  });
};

AppSrvTask.prototype.exec_read_csv = function(model, command, params, options, command_cb){
  //read_csv (path, into, foreach_row, fields, headers, pipe, csv_options)

  var _this = this;

  var fpath = command.path;
  if(!fpath) return command_cb(new Error('read_csv command missing "path" property'));
  fpath = _this.replaceParams(params, fpath);
  if(!path.isAbsolute(fpath)) fpath = path.join(_this.jsh.Config.datadir, fpath);

  if(command.foreach_row && !command.into) return command_cb(new Error('Command with "foreach_row" requires "into" property'));

  //Read CSV file
  var column_headers = false;
  if(command.headers) column_headers = true;
  if(command.fields){
    column_headers = _.map(command.fields, function(field){ if(_.isString(field)) return field; return field.name; });
  }
  var csv_options = command.csv_options || {};
  var csvparser = csv.parse(_.extend({ columns: column_headers, relax_column_count: true }, csv_options));
  var hasError = false;
  var hasReadable = false;
  var hasFinished = false;
  var f = fs.createReadStream(fpath);
  if(command.pipe){
    var fpipe = Helper.JSEval(command.pipe, _this, {
      jsh: _this.jsh
    });
    f = f.pipe(fpipe);
  }

  options.exec_counter.push(0);
  var rowcnt = 0;
  var commandLocals = [];

  function processRow(row_cb){
    if(hasError) return;
    rowcnt++;

    var row = csvparser.read();
    if(row===null){ hasReadable = false; return true; }

    //Validate
    var verrors = _this.validateFields(command, row);
    if(verrors) return row_cb(new Error('Error validating ' + command.into + ': ' + verrors + '\nData: ' + JSON.stringify(row)));

    //Add to parameters
    var rowparams = _.extend({}, params);
    for(var key in row){
      _this.addParam(rowparams, command.fields, command.into + '.' + key, row[key]);
    }
    //Add null for empty columns
    _.each(command.fields, function(field){
      var fieldName = (_.isString(field) ? field : field.name);
      if(!fieldName) return;
      var paramName = command.into + '.' + fieldName;
      if(!(paramName in rowparams)){
        _this.addParam(rowparams, command.fields, paramName, null);
      }
    });

    options.exec_counter[options.exec_counter.length-1]++;
    _this.exec_commands(model, command.foreach_row, commandLocals, rowparams, options, function(err){
      Helper.execif(rowcnt%10==0, function(f){
        setTimeout(f,1);
      }, function(){
        return row_cb(err);
      });
    });
  }

  function processRowHandler(err){
    if(hasError) return;
    if(err){
      hasError = true;
      f.destroy();
      options.exec_counter.pop();
      return command_cb(err);
    }
    else{
      if((processRow(processRowHandler)===true) && hasFinished){
        options.exec_counter.pop();
        return _this.drainLocals(commandLocals, command_cb);
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
        return _this.drainLocals(commandLocals, command_cb);
      }
    }
  });
  f.pipe(csvparser);
};

AppSrvTask.prototype.exec_js = function(model, command, params, options, command_cb){
  //js (js, into, foreach)

  var _this = this;
  var jsh = this.jsh;

  if(!command.js) return command_cb(new Error('JS command requires "js" property'));
  if(command.foreach && !command.into) return command_cb(new Error('Command with "foreach" requires "into" property'));

  var jsstr = '(function(){ ' + _this.replaceParams(params, command.js.toString()) + ' })();';
  var jsrslt = null;
  var commandLocals = [];
  try{
    jsrslt = eval(jsstr);
  }
  catch(ex){
    jsh.Log.info('Error executing: '+jsstr);
    if(ex) return command_cb(ex);
  }

  Helper.execif((jsrslt && jsrslt.then && jsrslt.catch),
    function(f){
      jsrslt
        .then(function(rslt){ jsrslt = rslt; f(); })
        .catch(function(err){ return command_cb(err); });
    },
    function(){
      if(command.foreach){
        if((jsrslt === null) || (typeof jsrslt == 'undefined')){ /* Do nothing */ }
        else{
          if(!_.isArray(jsrslt)) jsrslt = [jsrslt];
    
          options.exec_counter.push(0);
          async.eachSeries(jsrslt, function(row, row_cb){
    
            //Add to parameters
            var rowparams = _.extend({}, params);
            for(var key in row){
              _this.addParam(rowparams, [], command.into + '.' + key, row[key]);
            }
            
            //Execute Commands
            options.exec_counter[options.exec_counter.length-1]++;
            _this.exec_commands(model, command.foreach, commandLocals, rowparams, options, row_cb);
          }, function(err){
            options.exec_counter.pop();
            if(err) return command_cb(err);
            return _this.drainLocals(commandLocals, command_cb);
          });
          return;
        }
      }
      return _this.drainLocals(commandLocals, command_cb);
    }
  );

  
};

AppSrvTask.prototype.exec_shell = function(model, command, params, options, command_cb){
  //shell (path, params, cwd, into, foreach_stdio, foreach_stdio_line, foreach_stderr, foreach_stderr_line)

  var _this = this;

  if(!command.path) return command_cb(new Error('Shell command requires "path" property'));
  var cmdpath = _this.replaceParams(params, command.path);

  if(command.foreach_stdio && !command.into) return command_cb(new Error('Command with "foreach_stdio" requires "into" property'));
  if(command.foreach_stdio_line && !command.into) return command_cb(new Error('Command with "foreach_stdio_line" requires "into" property'));
  if(command.foreach_stderr && !command.into) return command_cb(new Error('Command with "foreach_stderr" requires "into" property'));
  if(command.foreach_stderr_line && !command.into) return command_cb(new Error('Command with "foreach_stderr_line" requires "into" property'));

  var cmdparams = [];
  if(command.params){
    cmdparams = _this.replaceParams(params, command.params);
  }

  var cwd = command.cwd;
  if(!cwd) cwd = _this.jsh.Config.datadir;
  else {
    cwd = _this.replaceParams(params, cwd);
    if(!path.isAbsolute(cwd)) cwd = path.join(_this.jsh.Config.datadir, cwd);
  }

  options.exec_counter.push(0);
  var hasError = false;
  var commandLocals = [];
  var pendingCallbacks = [];
  var cmd = spawn(cmdpath, cmdparams, { cwd: cwd });
  var curLine = '';
  var curLines = {
    'stdio': '',
    'stderr': '',
  };
  var lastLines = [];
  var MAX_LINES = 100;
  function appendLine(txt){
    curLine += txt;
    if((curLine.indexOf('\n')) >= 0){
      var lastLine = curLine.substr(0, curLine.lastIndexOf('\n'));
      curLine = curLine.substr(curLine.lastIndexOf('\n')+1);
      lastLines = lastLines.concat(lastLine.split('\n'));
      while(lastLines.length > MAX_LINES) lastLines.shift();
    }
    if(curLine.length > 500) curLine = curLine.substr(0, 497)+'...';
  }
  function commandError(err){
    hasError = true;
    options.exec_counter.pop();
    return command_cb(err);
  }
  function processLine(foreach_handler, foreach_line_handler, foreach_type, data){
    var isEOF = false;
    if(data && data.eof){
      data = '';
      isEOF = true;
    }
    if(!isEOF && foreach_handler){
      //Add parameter
      var shellparams = _.extend({}, params);
      _this.addParam(shellparams, [], command.into + '.' + foreach_type, (data||'').toString());
      _this.addParam(shellparams, [], command.into + '.' + foreach_type + '_raw', data);
      //Execute Commands
      options.exec_counter[options.exec_counter.length-1]++;
      pendingCallbacks.push(false);
      var callbackIdx = pendingCallbacks.length - 1;
      _this.exec_commands(model, foreach_handler, commandLocals, shellparams, options, function(err){
        if(hasError) return;
        if(err) return commandError(err);
        pendingCallbacks[callbackIdx] = true;
      });
    }
    if(foreach_line_handler){
      curLines[foreach_type] += (data||'').toString();
      if(isEOF || ((curLines[foreach_type].indexOf('\n')) >= 0)){
        var lastLine = '';
        if(isEOF){
          lastLine = curLines[foreach_type];
          curLines[foreach_type] = '';
        }
        else {
          lastLine = curLines[foreach_type].substr(0, curLines[foreach_type].lastIndexOf('\n'));
          curLines[foreach_type] = curLines[foreach_type].substr(curLines[foreach_type].lastIndexOf('\n')+1);
        }
        _.each(lastLine.split('\n'), function(line){
          var shellparams = _.extend({}, params);
          _this.addParam(shellparams, [], command.into + '.' + foreach_type, line);
          //Execute Commands
          options.exec_counter[options.exec_counter.length-1]++;
          pendingCallbacks.push(false);
          var callbackIdx = pendingCallbacks.length - 1;
          _this.exec_commands(model, foreach_line_handler, commandLocals, shellparams, options, function(err){
            if(hasError) return;
            if(err) return commandError(err);
            pendingCallbacks[callbackIdx] = true;
          });
        });
      }
    }
  }
  cmd.stdout.on('data',function(data){
    if(hasError) return;
    appendLine((data||'').toString());
    processLine(command.foreach_stdio, command.foreach_stdio_line, 'stdio', data);
  });
  cmd.stderr.on('data',function(data){
    if(hasError) return;
    appendLine((data||'').toString());
    processLine(command.foreach_stderr, command.foreach_stderr_line, 'stderr', data);
  });
  cmd.on('message',function(data){
    if(hasError) return;
    appendLine((data||'').toString());
    processLine(command.foreach_stdio, command.foreach_stdio_line, 'stdio', data);
  });
  cmd.on('error', function(err){
    if(hasError) return;
    return commandError(err);
  });
  cmd.on('close', function(code){
    if(hasError) return;
    //Close out the sdtout, stderr inputs
    processLine(command.foreach_stdio, command.foreach_stdio_line, 'stdio', { eof: true });
    if(hasError) return;
    processLine(command.foreach_stderr, command.foreach_stderr_line, 'stderr', { eof: true });
    if(hasError) return;
    //Handle exit code
    if(code){
      return commandError(new Error('Process exited with code '+code.toString()+': '+lastLines.join('\n')));
    }

    //Wait for all pending options to close
    Helper.waitUntil(
      function cond(){
        for(var i=0;i<pendingCallbacks.length;i++){ if(!pendingCallbacks[i]) return false; }
        return true;
      },
      function f(){
        if(hasError) return;
        options.exec_counter.pop();
        if(code){
          return command_cb(new Error('Process exited with code '+code.toString()+': '+lastLines.join('\n')));
        }
        return _this.drainLocals(commandLocals, command_cb);
      },
      function cancel(f){ return hasError; },
      1, //timeout
    );
  });
};

AppSrvTask.prototype.exec_log = function(model, command, params, options, command_cb){
  //log (path, level, text)

  var _this = this;

  var msg = command.text || '';
  msg = _this.replaceParams(params, msg);
  if(Helper.endsWith(msg, '\n')) msg = msg.substr(0, msg.length - 1);
  if(Helper.endsWith(msg, '\r')) msg = msg.substr(0, msg.length - 1);

  if(!command.level) command.level = 'info';
  if(!_.includes(['info','warning','error'], command.level)) throw new Error('Invalid loglevel: ' + command.level);

  if(!command.path){
    if(_.includes(['info','warning','error'], command.level)) _this.jsh.Log[command.level](msg);
  }
  else {
    var logfile = command.path;
    logfile = _this.replaceParams(params, logfile);

    var curdt = new Date();
    logfile = Helper.ReplaceAll(logfile, '%YYYY', Helper.pad(curdt.getFullYear(),'0',4));
    logfile = Helper.ReplaceAll(logfile, '%MM', Helper.pad(curdt.getMonth()+1,'0',2));
    logfile = Helper.ReplaceAll(logfile, '%DD', Helper.pad(curdt.getDate(),'0',2));

    if(!path.isAbsolute(logfile)) logfile = path.join(_this.jsh.Config.logdir, logfile);

    _this.jsh.Log[command.level](msg, { logfile: logfile });
  }

  return command_cb();
};

AppSrvTask.prototype.exec_email = function(model, command, params, options, command_cb){
  //email ( email: { to, cc, bcc, subject, text, html, attachments } )
  //email ( jsharmony_txt: { txt_attrib, to, cc, bcc, attachments } )

  var _this = this;

  if((!command.email && !command.jsharmony_txt) || (command.email && command.jsharmony_txt)) return command_cb(new Error('email command requires either "email" or "jsharmony_txt" property'));

  if(command.email){
    let emailparams = _this.replaceParams(params, command.email);

    //Make sure to and subject exists
    if(!emailparams.to) return command_cb(new Error('email command missing "email.to" property'));
    if(!emailparams.subject) return command_cb(new Error('email command missing "email.subject" property'));

    //Add path to attachments
    if(emailparams && emailparams.attachments && emailparams.attachments.length){
      for(let i=0;i<emailparams.attachments.length;i++){
        let attachment = emailparams.attachments[i];
        if(attachment && attachment.path){
          if(!path.isAbsolute(attachment.path)) attachment.path = path.join(_this.jsh.Config.datadir, attachment.path);
        }
      }
    }

    //Send email
    if(!_this.jsh.SendEmail) return command_cb(new Error('jsHarmony SendEmail not configured'));
    _this.jsh.SendEmail(emailparams, function(){
      if(command_cb) command_cb();
    });
  }
  else if(command.jsharmony_txt){
    let emailparams = _this.replaceParams(params, command.jsharmony_txt);

    //Make sure to and subject exists
    if(!emailparams.txt_attrib) return command_cb(new Error('email command missing "jsharmony_txt.txt_attrib" property'));
    if(!emailparams.to) return command_cb(new Error('email command missing "jsharmony_txt.to" property'));

    //Add path to attachments
    if(emailparams && emailparams.attachments && emailparams.attachments.length){
      for(let i=0;i<emailparams.attachments.length;i++){
        let attachment = emailparams.attachments[i];
        if(attachment && attachment.path){
          if(!path.isAbsolute(attachment.path)) attachment.path = path.join(_this.jsh.Config.datadir, attachment.path);
        }
      }
    }

    var dataparams = _this.getParamValues(params);
    var dbcontext = 'task' || command._DBContext || dataparams._DBContext;

    //Send email
    _this.jsh.SendTXTEmail(dbcontext, emailparams.txt_attrib, emailparams.to, emailparams.cc, emailparams.bcc, emailparams.attachments, dataparams, function(err){
      if(command_cb) command_cb();
    });
  }
};

module.exports = exports = AppSrvTask;