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
var _ = require('lodash');
var Helper = require('./lib/Helper.js');

module.exports = exports = {};

function addFieldValidator(field, validator){
  if(!field.validation) field.validation = [];
  field.validation.push(validator);
}

exports.ParseTask = function(model){
  var _this = this;

  var task = model.task;
  if(!task) return;

  var params = {};
  _.each(model.fields, function(field){
    if(field.name) params[field.name] = true;
  });

  if(!('commands' in task)){ _this.LogInit_ERROR('Error loading' + model.id + ' task: Missing task.commands property'); return; }
  _.each(task.commands, function(command){ _this.ParseTaskCommand(model, command, params); });

};

exports.ParseTaskValidation = function(obj, desc){
  var _this = this;
  obj.xvalidate = new _this.XValidate();
  _.each(obj.fields, function(field){
    _.each(_this.getDefaultValidators(field, desc), function(validator){ addFieldValidator(field, validator); });
    field.actions = 'U';
    _.each(obj.fields, function(field){ _this.AddValidatorFuncs(obj.xvalidate, field, desc); });
  });
};

exports.getTaskCommandDesc = function(command, options){
  var rslt = JSON.stringify(_.pick(command,['exec','db','sql','path','into','overwrite','dest','sqldata','headers','cmd','subject','to','bcc','cc']));
  if(options && options.exec_counter) rslt += ' #' + options.exec_counter.join('-');
  return rslt;
};

exports.ParseTaskCommand = function(model, command, params){
  var _this = this;
  params = _.extend({}, params);

  _this.ParseTaskValidation(command, model.id);

  function parseChildCommands(commandType, childCommandProperty, variableDesc){
    if(command[childCommandProperty]){
      if(variableDesc){
        if(!command.into) _this.LogInit_ERROR('Error loading task ' + model.id + ': '+commandType+'.'+childCommandProperty+' requires '+commandType+'.into property to define the variable name for the '+variableDesc+' object');
        if(command.into in params) _this.LogInit_ERROR('Error loading task ' + model.id + ': '+commandType+'.into property would override an existing variable');
        params[command.into] = true;
      }
      _.each(command[childCommandProperty], function(command){ _this.ParseTaskCommand(model, command); });
    }
  }

  function validateCommandProperties(props){
    for(var key in command){
      if(key == 'exec') continue;
      if(key == 'xvalidate') continue;
      if(!_.includes(props, key)) _this.LogInit_ERROR('Invalid ' + command.exec + ' command property: ' + key + ' in command ' + _this.getTaskCommandDesc(command));
    }
  }

  if(command.exec == 'sql'){
    validateCommandProperties(['sql','db','into','foreach_row','fields']);
    if(command.sql) command.sql = Helper.ParseMultiLine(command.sql);
    parseChildCommands('sql', 'foreach_row', 'row');
  }
  else if(command.exec == 'sqltrans'){
    validateCommandProperties(['db','for']);
    parseChildCommands('sqltrans', 'for');
  }
  else if(command.exec == 'delete_folder'){
    validateCommandProperties(['path','recursive']);
  }
  else if(command.exec == 'create_folder'){
    validateCommandProperties(['path']);
  }
  else if(command.exec == 'move_folder'){
    validateCommandProperties(['path','dest']);
  }
  else if(command.exec == 'list_files'){
    validateCommandProperties(['path','matching','into','foreach_file']);
    if(command.matching && _.isString(command.matching)) command.matching = [command.matching];
    parseChildCommands('list_files', 'foreach_file', 'file');
  }
  else if(command.exec == 'delete_file'){
    validateCommandProperties(['path']);
  }
  else if(command.exec == 'copy_file'){
    validateCommandProperties(['path','dest','overwrite']);
  }
  else if(command.exec == 'move_file'){
    validateCommandProperties(['path','dest','overwrite']);
  }
  else if(command.exec == 'write_file'){
    validateCommandProperties(['path','text','overwrite']);
  }
  else if(command.exec == 'append_file'){
    validateCommandProperties(['path','text']);
  }
  else if(command.exec == 'read_file'){
    validateCommandProperties(['path','into','foreach_line']);
    parseChildCommands('read_file', 'foreach_line', 'line');
  }
  else if(command.exec == 'write_csv'){
    validateCommandProperties(['path','db','data','sql','headers','overwrite','fields','csv_options']);
    if(command.sql) command.sql = Helper.ParseMultiLine(command.sql);
    if(command.data){
      if(!_.isArray(command.data)) command.data = [command.data]; //{} => [{}]
      else if(!command.data.length || (!_.isArray(command.data[0]) && !_.isObject(command.data[0]))) command.data = [command.data]; //[] => [[]]
    }
  }
  else if(command.exec == 'append_csv'){
    validateCommandProperties(['path','db','data','sql','headers','fields','csv_options']);
    if(command.sql) command.sql = Helper.ParseMultiLine(command.sql);
    if(command.data){
      if(!_.isArray(command.data)) command.data = [command.data]; //{} => [{}]
      else if(!command.data.length || (!_.isArray(command.data[0]) && !_.isObject(command.data[0]))) command.data = [command.data]; //[] => [[]]
    }
  }
  else if(command.exec == 'read_csv'){
    validateCommandProperties(['path','into','foreach_row','headers','fields','pipe','csv_options']);
    parseChildCommands('read_csv', 'foreach_row', 'row');
  }
  else if(command.exec == 'shell'){
    validateCommandProperties(['path', 'params', 'cwd', 'into', 'foreach_stdio', 'foreach_stderr', 'foreach_stdio_line', 'foreach_stderr_line']);
    parseChildCommands('shell', 'foreach_stdio', 'stdio');
    if(command.into) delete params[command.into];
    parseChildCommands('shell', 'foreach_stdio_line', 'stdio');
    if(command.into) delete params[command.into];
    parseChildCommands('shell', 'foreach_stderr', 'stderr');
    if(command.into) delete params[command.into];
    parseChildCommands('shell', 'foreach_stderr_line', 'stderr');
  }
  else if(command.exec == 'log'){
    validateCommandProperties(['path', 'level', 'text']);
  }
  else if(command.exec == 'js'){
    validateCommandProperties(['js','into','foreach']);
    if(command.js) command.js = Helper.ParseMultiLine(command.js);
    parseChildCommands('js', 'foreach', 'item');
  }
  else if(command.exec == 'email'){
    validateCommandProperties(['email','jsharmony_txt']);
    if(command.email) for(let key in command.email){
      if(!_.includes(['to','cc','bcc','subject','text','html','attachments'], key)) _this.LogInit_ERROR('Invalid email command property: email.' + key + ' in command ' + _this.getTaskCommandDesc(command));
    }
    if(command.txt) for(let key in command.jsharmony_txt){
      if(!_.includes(['txt_attrib','to','cc','bcc','attachments'], key)) _this.LogInit_ERROR('Invalid email command property: txt.' + key + ' in command ' + _this.getTaskCommandDesc(command));
    }
  }
  else _this.LogInit_ERROR('Error loading task ' + model.id + ': Invalid command.exec "'+command.exec+'"');
};

exports.hasTask = function(req, modelid){
  var model = this.getModel(req, modelid);
  if(!model) return false;
  return !!model.task;
};