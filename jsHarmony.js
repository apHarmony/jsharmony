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
var ejs = require('ejs');
var fs = require('fs');
var path = require('path');
var url = require('url');
var crypto = require('crypto');
var querystring = require('querystring');
var XValidate = require('jsharmony-validate');
var ejsext = require('./lib/ejsext.js');
var Helper = require('./lib/Helper.js');
var HelperFS = require('./lib/HelperFS.js');
var AppSrv = require('./AppSrv.js');
var Init = require('./jsHarmony.init.js');
var XValidateBase = {};
for (var key in XValidate) { XValidateBase[key] = XValidate[key]; }
require('./lib/ext-validation.js')(XValidate);

var _ERROR = 1;
var _WARNING = 2;
var _INFO = 4;
var _DBTYPES = ['pgsql', 'mssql'];

function jsHarmony() {
  this.EJS = [];
  this.EJSGrid = '';
  this.EJSForm = '';
  this.Models = {};
  this.CustomControls = [];
  this.Config = {};
  this.Routes = {};
  this.Popups = {};
  this.Cache = {};
  this.SQL = {};
  //Constructor
  Init.validateGlobals();
  console.log('Loading models...');
  if (!_.isArray(global.modeldir)) global.modeldir = [global.modeldir];
  this.LoadSQL(path.dirname(module.filename) + '/sql/', global.dbconfig._driver.name);
  this.Cache['system.js'] = '';
  this.Cache['system.css'] = fs.readFileSync(path.dirname(module.filename)+'/jsHarmony.theme.css', 'utf8');
  for (var i = 0; i < global.modeldir.length; i++) {
    this.LoadModels(global.modeldir[i], '', global.dbconfig._driver.name);
    this.LoadModels(global.modeldir[i] + 'reports/', '_report_', global.dbconfig._driver.name);
    this.ParseRoutes(global.modeldir[i]);
    if (fs.existsSync(global.modeldir[i] + 'js/')) this.Cache['system.js'] += '\r\n' + this.MergeFolder(global.modeldir[i] + 'js/');
    if (fs.existsSync(global.modeldir[i] + 'style/')) this.Cache['system.css'] += '\r\n' + this.MergeFolder(global.modeldir[i] + 'style/');
    this.LoadSQL(global.modeldir[i] + 'sql/', global.dbconfig._driver.name);
  }
  this.ParseInheritance();
  this.ParseEntities();
  this.ParsePopups();
  Init.ValidateConfig(this);
  this.map = this.Config.field_mapping;
  this.uimap = this.Config.ui_field_mapping;
  this.AppSrv = new AppSrv(this);
  /*
  var portstr = ' Port ';
  if(global.http_port && global.https_port) portstr += global.http_port + '/' + global.https_port;
  else if(global.http_port) port_str += global.http_port;
  else if(global.https_port) port_str += global.https_port;
  else portstr = '';
  */
  console.log('::jsHarmony Server ready::');
}

/*******************
|    LOAD MODELS   |
*******************/
jsHarmony.prototype.setModels = function (models) { this.Models = models; }
jsHarmony.prototype.LoadModels = function (modeldir, prefix, dbtype) {
  var _this = this;
  if (typeof prefix == 'undefined') prefix = '';
  if (typeof dbtype == 'undefined') dbtype = '';
  if(!fs.existsSync(modeldir)){ LogEntityError(_ERROR, 'Model folder ' + modeldir + ' not found'); return; }
  var fmodels = fs.readdirSync(modeldir);
  for (var i in fmodels) {
    var fname = modeldir + fmodels[i];
    if (fname.indexOf('.json', fname.length - 5) == -1) continue;
    if (fmodels[i] == '_canonical.json') continue;
    var modelname = prefix + fmodels[i].replace('.json', '');
    if (dbtype && (fname.indexOf('.' + dbtype + '.') < 0)) {
      var found_other_dbtype = false;
      _.each(_DBTYPES, function (odbtype) { if (fname.indexOf('.' + odbtype + '.') >= 0) found_other_dbtype = true; });
      if (found_other_dbtype) continue;
    }
    else modelname = prefix + fmodels[i].replace('.' + dbtype + '.', '.').replace('.json', '');
    LogEntityError(_INFO, 'Loading ' + modelname);
    var ftext = Helper.JSONstrip(fs.readFileSync(fname, 'utf8'));
    try {
      var model = JSON.parse(ftext);
    }
    catch (ex) {
      console.error("-------------------------------------------");
      console.error("FATAL ERROR Parsing Model " + modelname + " in " + fname);
      console.log(ex.name + ': "' + ex.message + '"');
      try {
        require('jsonlint').parse(ftext);
      }
      catch (ex2) {
        console.log(ex2);
      }
      console.error("-------------------------------------------");
      process.exit(8);
      throw (ex);
    }
    if (modelname == '_controls') {
      for (var c in model) this.CustomControls[c] = model[c];
    }
    else if (modelname == '_config') {
      var col = ['default_buttons', 'field_mapping', 'ui_field_mapping', 'datalocks', 'salts', 'passwords'];
      for (var c in model) {
        if (_.includes(col, c)) {
          if (!(c in this.Config)) this.Config[c] = {};
          for (var cc in model[c]) this.Config[c][cc] = model[c][cc];
        }
        else this.Config[c] = model[c];
      }
    }
    else if (modelname == '_routes') {
      for (var r in model) this.Routes[r] = model[r];
    }
    else {
      if (!('layout' in model) && !('inherits' in model)) {
        //Parse file as multiple-model file
        _.each(model, function (submodel, submodelname) {
          LogEntityError(_INFO, 'Loading sub-model ' + submodelname);
          _this.AddModel(modeldir, submodelname, submodel);
        });
      }
      else this.AddModel(modeldir, modelname, model);
    }
  }
}
jsHarmony.prototype.MergeFolder = function (dir) {
  var _this = this;
  var f = {};
  if (fs.existsSync(dir)) f = fs.readdirSync(dir);
  else return '';
  var rslt = '';
  f.sort(function (a, b) {
    var abase = a;
    var bbase = b;
    var a_lastdot = a.lastIndexOf('.');
    var b_lastdot = b.lastIndexOf('.');
    if (a_lastdot > 0) abase = a.substr(0, a_lastdot);
    if (b_lastdot > 0) bbase = b.substr(0, b_lastdot);
    if (abase == bbase) return a > b;
    return abase > bbase;
  });
  for (var i in f) {
    var fname = dir + f[i];
    LogEntityError(_INFO, 'Loading ' + fname);
    var ftext = fs.readFileSync(fname, 'utf8');
    rslt += ftext + '\r\n';
  }
  return rslt;
}
jsHarmony.prototype.LoadSQL = function (dir, type) {
  var _this = this;
  var f = {};
  if (fs.existsSync(dir)) f = fs.readdirSync(dir);
  else return;
  f.sort(function (a, b) {
    var abase = a;
    var bbase = b;
    var a_lastdot = a.lastIndexOf('.');
    var b_lastdot = b.lastIndexOf('.');
    if (a_lastdot > 0) abase = a.substr(0, a_lastdot);
    if (b_lastdot > 0) bbase = b.substr(0, b_lastdot);
    if (abase == bbase) return a > b;
    return abase > bbase;
  });
  var found_sqlids = {};
  for (var i in f) {
    var fname = dir + f[i];
    if (type && (fname.indexOf('.' + type + '.') < 0)) {
      var found_other_dbtype = false;
      _.each(_DBTYPES, function (dbtype) { if (fname.indexOf('.' + dbtype + '.') >= 0) found_other_dbtype = true; });
      if (found_other_dbtype) continue;
    }
    LogEntityError(_INFO, 'Loading ' + fname);
    //Parse text
    var ftext = Helper.JSONstrip(fs.readFileSync(fname, 'utf8'));
    var sql = {};
    try {
      sql = JSON.parse(ftext);
    }
    catch (ex) {
      console.error("-------------------------------------------");
      console.error("FATAL ERROR Parsing SQL " + fname);
      console.log(ex.name + ': "' + ex.message + '"');
      try {
        require('jsonlint').parse(ftext);
      }
      catch (ex2) {
        console.log(ex2);
      }
      console.error("-------------------------------------------");
      process.exit(8);
      throw (ex);
    }
    for (var sqlid in sql) {
      if (sqlid in found_sqlids) { LogEntityError(_ERROR, 'Duplicate SQL ' + sqlid + ' in ' + found_sqlids[sqlid] + ' and ' + fname); }
      found_sqlids[sqlid] = fname;
      var sqlval = Helper.ParseMultiLine(sql[sqlid]);
      _this.SQL[sqlid] = sqlval;
    }
  }
}
jsHarmony.prototype.AddModel = function (modeldir, modelname, model) {
  model['id'] = modelname;
  model['idmd5'] = crypto.createHash('md5').update(global.frontsalt + model.id).digest('hex');
  model['access_models'] = {};
  model['_inherits'] = [];
  if ('access' in model) model['access_models'][modelname] = model.access;
  //if (modelname in this.Models) throw new Error('Cannot add ' + modelname + '.  The model already exists.')
  //Load JS
  var jsfname = (modeldir + modelname + '.js');
  if (fs.existsSync(jsfname)) {
    var newjs = fs.readFileSync(jsfname, 'utf8');
    if ('js' in model) newjs += "\r\n" + model.js;
    model['js'] = newjs;
  }
  //Load EJS
  var ejsfname = (modeldir + modelname + '.ejs');
  if (fs.existsSync(ejsfname)) {
    var newejs = fs.readFileSync(ejsfname, 'utf8');
    if ('ejs' in model) newejs += "\r\n" + model.ejs;
    model['ejs'] = newejs;
  }
  if (!('helpid' in model) && !('inherits' in model)) model.helpid = modelname;
  var jsonroutefname = (modeldir + modelname + '.onroute.js');
  if (fs.existsSync(jsonroutefname)) {
    var newjs = fs.readFileSync(jsonroutefname, 'utf8');
    if ('onroute' in model) newjs += "\r\n" + model.onroute;
    model['onroute'] = newjs;
  }
  if ('onroute' in model) model.onroute = (new Function('routetype', 'req', 'res', 'callback', 'require', 'jsh', 'modelid', model.onroute));
  this.Models[modelname] = model;
}
jsHarmony.prototype.ParseInheritance = function () {
  var _this = this;
  var foundinheritance = true;
  while (foundinheritance) {
    foundinheritance = false;
    _.forOwn(this.Models, function (model) {
      if ('inherits' in _this.Models[model.id]) {
        foundinheritance = true;
        if (!(model.inherits in _this.Models)) throw new Error('Model ' + model.id + ' parent model does not exist.');
        if (model.inherits == model.id) throw new Error('Model ' + model.id + ' cyclic inheritance.')
        var parentmodel = _this.Models[model.inherits];
        var parentinheritance = parentmodel.inherits;
        if (typeof parentinheritance !== 'undefined') return;
        parentmodel = JSON.parse(JSON.stringify(parentmodel)); //Deep clone
        model._inherits = parentmodel._inherits.concat([model.inherits]);
        //Merge Models
        //Extend this to enable delete existing values by making them NULL
        //Extend this to enable merging arrays, like "button", "fields", "roles" using key, other arrays just overwrite
        
        var mergedprops = {};
        EntityPropMerge(mergedprops, 'fields', model, parentmodel, function (newval, oldval) {
          var modelfields = _.map(newval, 'name');
          var rslt = newval.slice(0);
          _.each(oldval, function (field) {
            if ((typeof field.name != 'undefined') && (field.name)) {
              var modelfield = _.find(rslt, function (mfield) { return mfield.name == field.name; });
            }
            if (typeof modelfield !== 'undefined') {
              rslt.splice(rslt.indexOf(modelfield), 1);
              if (!('__REMOVEFIELD__' in modelfield)) {
                //oldfield = field, newfield = modelfield
                var newfield = _.merge({}, field, modelfield);
                if ('validate' in modelfield) newfield.validate = modelfield.validate;
                EntityPropMerge(newfield, 'roles', modelfield, field, function (newval, oldval) { return _.merge({}, oldval, newval) });
                rslt.push(newfield);
              }
            }
            else {
              if (!('__REMOVEFIELD__' in field)) {
                rslt.push(field);
              }
            }
          });
          for (var i = 0; i < rslt.length; i++) {
            if ('__REMOVEFIELD__' in rslt[i]) {
              rslt.splice(i, 1);
              i--;
            }
          }
          return rslt;
        });
        //Create a clone of parent model instead of object reference
        if (('fields' in parentmodel) && !('fields' in model)) model.fields = parentmodel.fields.slice(0);
        EntityPropMerge(mergedprops, 'roles', model, parentmodel, function (newval, oldval) { return _.merge({}, oldval, newval) });
        EntityPropMerge(mergedprops, 'pagesettings', model, parentmodel, function (newval, oldval) { return _.merge({}, oldval, newval) });
        EntityPropMerge(mergedprops, 'tabs', model, parentmodel, function (newval, oldval) {
          var rslt = _.extend({}, oldval, newval)
          if (rslt) _.each(rslt, function (v, k) { if (v === null) delete rslt[k]; });
          return rslt;
        });
        EntityPropMerge(mergedprops, 'reportdata', model, parentmodel, function (newval, oldval) { return _.extend({}, oldval, newval); });
        EntityPropMerge(mergedprops, 'js', model, parentmodel, function (newval, oldval) { return oldval + "\r\n" + newval; });
        
        //Merge Everything Else
        _this.Models[model.id] = _.extend({}, parentmodel, model);
        //Restore Merged Properties
        _.each(mergedprops, function (val, key) { _this.Models[model.id][key] = val; });
        for (var prop in _this.Models[model.id]) { if (_this.Models[model.id][prop] == '__REMOVEPROPERTY__') { delete _this.Models[model.id][prop]; } }
        delete _this.Models[model.id].inherits;
      }
    });
  }
}
function EntityPropMerge(mergedprops, prop, model, parent, mergefunc) {
  if ((prop in model) && (prop in parent)) mergedprops[prop] = mergefunc(model[prop], parent[prop]);
}
function LogEntityError(severity, msg) {
  if ((global.debug_params.jsh_error_level & severity) > 0) {
    switch (severity) {
      case _ERROR: console.log("ERROR: " + msg); break;
      case _WARNING: console.log("WARNING: " + msg); break;
      default: global.log(msg); break;
    }
    if (!global.app_errors) global.app_errors = [];
    global.app_errors.push(msg);
  }
}
function LogDeprecated(msg) {
  if (global.debug_params.hide_deprecated) return;
  console.log('**DEPRECATED** ' + msg);
}
jsHarmony.prototype.ParseEntities = function () {
  var _this = this;
  var base_controls = ["label", "html", "textbox", "dropdown", "date", "textarea", "hidden", "subform", "html", "password", "file_upload", "file_download", "button", "linkbutton", "tree", "checkbox"];
  _.forOwn(this.Models, function (model) {
    model.xvalidate = new XValidate();
    if (!('table' in model)) LogEntityError(_WARNING, 'Model ' + model.id + ' missing table');
    if (!('access' in model)) LogEntityError(_WARNING, 'Model ' + model.id + ' missing access');
    //Add Model caption if not set
    if (!('caption' in model)) { model.caption = ['', model.id, model.id]; LogEntityError(_WARNING, 'Model ' + model.id + ' missing caption'); }
    if (!('ejs' in model)) model.ejs = '';
    if ('sort' in model) {
      if (model.sort && model.sort.length) {
        for (var i = 0; i < model.sort.length; i++) {
          if (!_.isString(model.sort[i])) {
            var j = 0;
            for (var f in model.sort[i]) {
              var sortval = '';
              var dir = model.sort[i][f].toLowerCase();
              if (dir == 'asc') sortval = '^' + f;
              else if (dir == 'desc') sortval = 'v' + f;
              else LogEntityError(_ERROR, model.id + ': Invalid sort direction for ' + f);
              model.sort.splice(i + 1 + j, 0, sortval);
              j++;
            }
            model.sort.splice(i, 1);
          }
        }
      }
    }
    var foundkey = false;
    var fieldnames = [];
    _.each(model.fields, function (field) {
      if (field.name === '') delete field.name;
      if (!('access' in field)) {
        field.access = '';
        if ((field.control == 'html') || (field.control == 'button')) field.access = 'B';
        else {
          LogEntityError(_WARNING, 'Model ' + model.id + ' Field ' + (field.name || field.caption || JSON.stringify(field)) + ' missing access.');
        }
      }
      if (!('caption' in field) && ('name' in field)) {
        if (('control' in field) && (field.control == 'hidden')) field.caption = '';
        else field.caption = field.name;
      }
      if ('name' in field) {
        //if (_.includes(fieldnames, field.name)) { throw new Error("Duplicate field " + field.name + " in model " + model.id + "."); }
        if (_.includes(fieldnames, field.name)) { LogEntityError(_ERROR, "Duplicate field " + field.name + " in model " + model.id + "."); }
        fieldnames.push(field.name);
      }
      if ('key' in field) { field.access += 'K'; foundkey = true; }
      if (field.controlparams) {
        if (field.controlparams.CODEVal) { field.controlparams.codeval = field.controlparams.CODEVal; delete field.controlparams.CODEVal; }
        if ('codeval' in field.controlparams) LogDeprecated(model.id + ' > ' + field.name + ': The controlparams codeval attribute has been deprecated - use "popuplov":{...}');
        if ('popupstyle' in field.controlparams) LogDeprecated(model.id + ' > ' + field.name + ': The controlparams popupstyle attribute has been deprecated - use "popuplov":{...}');
        if ('popupiconstyle' in field.controlparams) LogDeprecated(model.id + ' > ' + field.name + ': The controlparams popupiconstyle attribute has been deprecated - use "popuplov":{...}');
        if ('popup_copy_results' in field.controlparams) LogDeprecated(model.id + ' > ' + field.name + ': The controlparams popup_copy_results attribute has been deprecated - use "popuplov":{...}');
        if ('base_readonly' in field.controlparams) LogDeprecated(model.id + ' > ' + field.name + ': The controlparams base_readonly attribute has been deprecated - use "popuplov":{...}');
        if ('onpopup' in field.controlparams) LogDeprecated(model.id + ' > ' + field.name + ': The controlparams onpopup attribute has been deprecated - use "popuplov":{...}');
      }
      if ('popuplov' in field) {
        var has_own = false;
        if (field.popuplov.CODEVal) { field.popuplov.codeval = field.popuplov.CODEVal; delete field.popuplov.CODEVal; }
        _.forOwn(field.popuplov, function (val, key) {
          has_own = true;
          if (!('controlparams' in field)) field.controlparams = {};
          if (key == 'target') field.target = field.popuplov.target;
          else if (key == 'codeval') field.controlparams.codeval = field.popuplov.codeval;
          else if (key == 'popupstyle') field.controlparams.popupstyle = field.popuplov.popupstyle;
          else if (key == 'popupiconstyle') field.controlparams.popupiconstyle = field.popuplov.popupiconstyle;
          else if (key == 'popup_copy_results') field.controlparams.popup_copy_results = field.popuplov.popup_copy_results;
          else if (key == 'base_readonly') field.controlparams.base_readonly = field.popuplov.base_readonly;
          else if (key == 'onpopup') field.controlparams.onpopup = field.popuplov.onpopup;
        });
      }
      if ('control' in field) {
        //Parse and apply Custom Controls
        while (base_controls.indexOf(field.control) < 0) {
          if (!(field.control in _this.CustomControls)) throw new Error("Control not defined: " + field.control + " in " + model.id + ": " + JSON.stringify(field));
          var customcontrol = _this.CustomControls[field.control];
          for (var prop in customcontrol) {
            if (!(prop in field)) field[prop] = customcontrol[prop];
            else if (prop == "controlclass") field[prop] = field[prop] + " " + customcontrol[prop];
          }
          if (!('_orig_control' in field)) field['_orig_control'] = [];
          field._orig_control.push(field.control);
          field.control = customcontrol.control;
        }
        if ((field.control == 'subform') && !('bindings' in field)) LogEntityError(_WARNING, 'Model ' + model.id + ' subform ' + field.name + ' missing binding.');
      }
      //Add Default Datatype Validation
      if ('type' in field) {
        switch (field.type.toUpperCase()) {
          case 'NVARCHAR':
            LogDeprecated(model.id + ' > ' + field.name + ': The NVARCHAR type has been deprecated - use VARCHAR');
            field.type = 'varchar';
            break;
          case 'DATETIME2':
            LogDeprecated(model.id + ' > ' + field.name + ': The DATETIME2 type has been deprecated - use DATETIME');
            field.type = 'datetime';
            break;
        }
        switch (field.type.toUpperCase()) {
          case 'VARCHAR':
          case 'CHAR':
            if ('length' in field) AddValidation(field, 'MaxLength:' + field.length);
            break;
          case 'BIT':
          case 'BIGINT':
          case 'INT':
          case 'SMALLINT':
            AddValidation(field, 'IsNumeric'); break;
          case 'DECIMAL':
            AddValidation(field, 'IsDecimal'); break;
          case 'DATE':
          case 'DATETIME':
            AddValidation(field, 'IsDate'); break;
          case 'TIME':
            AddValidation(field, 'IsTime'); break;
          case 'ENCASCII':
            if ('length' in field) AddValidation(field, 'MaxLength:' + (field.length - 1));
            break;
          case 'HASH':
            break;
          case 'FILE':
            if (!field.controlparams || !field.controlparams.data_folder) { LogEntityError(_ERROR, 'Model ' + model.id + ' Field ' + (field.name || '') + ' missing data_folder'); }
            HelperFS.createFolderIfNotExists(global.datadir + field.controlparams.data_folder, function () { });
            break;
          default:
            LogEntityError(_ERROR, 'Model ' + model.id + ' Field ' + field.name + ' Invalid data type ' + field.type);
            //throw new Error('Data type ' + field.type + ' not recognized');
        }
      }
      //Add Validation Functions
      model.xvalidate.AddValidator('_obj.' + field.name, field.caption, field.access, _this.GetValidatorFuncs(field), field.roles);
    });
    if (!foundkey) LogEntityError(_WARNING, 'Model ' + model.id + ' missing key');
    ParseAccessModels(_this, model, model.id, model.access);
    
    //**DEPRECATED MESSAGES**
    if (model.fields) _.each(model.fields, function (field) {
      if (field.access && Helper.access(field.access, 'C')) LogDeprecated(model.id + ' > ' + field.name + ': Access \'C\' has been deprecated - use breadcrumbs.sql_params');
      if ('hidden' in field) LogDeprecated(model.id + ' > ' + field.name + ': The hidden attribute has been deprecated - use "control":"hidden"');
      if ('html' in field) LogDeprecated(model.id + ' > ' + field.name + ': The html attribute has been deprecated - use "control":"html"');
      if ('lovkey' in field) LogDeprecated(model.id + ' > ' + field.name + ': The lovkey attribute has been deprecated');
    });
    
    //Convert mutli-line variables to single string
    var multi_to_single = function (obj, arr) {
      _.each(arr, function (p) { if (p in obj) obj[p] = Helper.ParseMultiLine(obj[p]); });
    }
    multi_to_single(model, ['js', 'sqlselect', 'sqldownloadselect', 'sqlinsert', 'sqlinsertencrypt', 'sqlupdate', 'sqldelete', 'sqlexec', 'sqlwhere', 'oninit', 'onload', 'onloadimmediate', 'oninsert', 'onvalidate', 'onupdate', 'ondestroy', 'oncommit']);
    if (model.breadcrumbs) multi_to_single(model.breadcrumbs, ['sql']);
    if (model.fields) _.each(model.fields, function (field) {
      multi_to_single(field, ['onchange', 'sqlselect', 'sqlupdate', 'sqlwhere', 'sql_sort', 'sql_search', 'sql_search_sound']);
      if (field.lov) multi_to_single(field.lov, ['sql', 'sql2', 'sqlmp', 'sqlselect']);
      if (field.controlparams) multi_to_single(field.controlparams, ['onpopup']);
    });
    
    
    //Automatically add lovkey based on lov.sqlparams
    if (model.fields) _.each(model.fields, function (field) {
      if (field.lov && field.lov.sql_params) {
        _.each(field.lov.sql_params, function (sql_param) {
          //Get field
          var sql_param_field = AppSrv.prototype.getFieldByName(model.fields, sql_param);
          if (!sql_param_field) LogEntityError(_ERROR, model.id + ' > ' + field.name + ': LOV sql param "' + sql_param + '" is not defined as a field');
          else if (!sql_param_field.key && !Helper.access(sql_param_field.access, 'F') && !sql_param_field.lovkey) { sql_param_field.lovkey = 1; }
        });
      }
    });
    
    //Automatically add C (breadcrumb parameter) based on lov.sqlparams
    if (model.breadcrumbs && model.breadcrumbs.sql_params && !model.fields) LogEntityError(_ERROR, model.id + ': Cannot use breadcrumb sql params without any fields defined.');
    else if (model.fields && model.breadcrumbs && model.breadcrumbs.sql_params) _.each(model.breadcrumbs.sql_params, function (sql_param) {
      var sql_param_field = AppSrv.prototype.getFieldByName(model.fields, sql_param);
      if (!sql_param_field) LogEntityError(_ERROR, model.id + ' > ' + field.name + ': Breadcrumb sql param "' + sql_param + '" is not defined as a field');
      else if (!Helper.access(sql_param_field.access, 'C')) { if (!sql_param_field.access) sql_param_field_access = ''; sql_param_field.access += 'C'; }
    });

    //Automatically add C based on default fields
    if(model.fields){
      var default_params = [];
      _.each(model.fields,function(field){ if(field.default && field.default.sql_params) default_params = _.union(default_params,field.default.sql_params); });
      _.each(default_params,function(sql_param){
        var sql_param_field = AppSrv.prototype.getFieldByName(model.fields, sql_param);
        if (!sql_param_field) LogEntityError(_ERROR, model.id + ' > ' + field.name + ': Default sql param "' + sql_param + '" is not defined as a field');
        else if (!Helper.access(sql_param_field.access, 'C')) { if (!sql_param_field.access) sql_param_field_access = ''; sql_param_field.access += 'C'; }
      });
    }
    
    //Validate Model and Field Parameters
    var _v_model = [
      'comment', 'layout', 'title', 'table', 'access', 'roles', 'caption', 'sort',
      'samplerepeat', 'topmenu', 'id', 'idmd5', 'access_models', '_inherits', 'helpid', 'querystring', 'buttons', 'xvalidate',
      'pagesettings', 'pageheader', 'headerheight', 'pagefooter', 'zoom', 'reportdata', 'description', 'template', 'fields', 'jobqueue',
      'hide_system_buttons', 'grid_expand_filter', 'grid_rowcount', 'nogridadd', 'reselectafteredit', 'newrowposition', 'commitlevel', 'validationlevel',
      'grid_require_filter', 'rowstyle', 'rowclass', 'rowlimit', 'disableautoload',
      'oninit', 'oncommit', 'onload', 'oninsert', 'onupdate', 'onvalidate', 'ondestroy',
      'js', 'ejs', 'dberrors', 'tablestyle', 'popup', 'onloadimmediate', 'sqlwhere', 'breadcrumbs', 'tabpos', 'tabs', 'tabpanelstyle',
      'nokey', 'unbound', 'duplicate', 'sqlselect', 'sqlinsert', 'sqldelete', 'sqlexec', 'sqlexec_comment', 'sqltype', 'onroute', 'tabcode', 'noresultsmessage',
      //Report Parameters
      'subheader', 'footerheight', 'headeradd',
    ];
    var _v_field = [
      'name', 'type', 'access', 'control', 'caption', 'length', 'sample', 'validate', 'controlstyle', 'key', 'serverejs','roles','static','cellclass',
      'controlclass', 'value', 'onclick', 'datalock', 'hidden', 'link', 'nl', 'lov', 'captionstyle', 'disable_sort', 'disable_search', 'disable_search_all', 'cellstyle', 'captionclass',
      'caption_ext', '_orig_control', 'format', 'eol', 'target', 'bindings', 'default', 'controlparams', 'popuplov', 'virtual', 'precision', 'password', 'hash', 'salt', 'unbound',
      'sqlselect', 'sqlupdate', 'sql_sort', 'sqlwhere', 'sql_search_sound', 'sql_search', 'onchange', 'lovkey', 'readonly', 'html', '__REMOVEFIELD__'
    ];
    var _v_controlparams = [
      'value_true', 'value_false', 'value_hidden', 'codeval', 'popupstyle', 'popupiconstyle', 'popup_copy_results', 'onpopup', 'dateformat', 'base_readonly',
      'download_button', 'preview_button', 'upload_button', 'delete_button', 'data_folder', 'sqlparams',
      'image', 'thumbnails', 'expand_all', 'item_context_menu'
    ];
    var _v_popuplov = ['target', 'codeval', 'popupstyle', 'popupiconstyle', 'popup_copy_results', 'onpopup', 'popup_copy_results', 'onpopup', 'base_readonly'];
    //lov
    var existing_targets = [];
    for (var f in model) { if (f.substr(0, 7) == 'comment') continue; if (!_.includes(_v_model, f)) LogEntityError(_ERROR, model.id + ': Invalid field: ' + f); }
    var no_B = true;
    var no_key = true;
    if (model.fields) _.each(model.fields, function (field) {
      if (Helper.access(field.access, 'B') && (field.control != 'html') && (field.control != 'subform') && (field.control != 'button')) no_B = false;
      if (field.key) no_key = false;
      if (field.hidden) { field.control = 'hidden'; }
      for (var f in field) {
        if (f.substr(0, 7).toLowerCase() == 'comment') continue; if (!_.includes(_v_field, f)) LogEntityError(_ERROR, model.id + ' > ' + field.name + ': Invalid field property: ' + f);
      }
      if (field.controlparams) {
        for (var f in field.controlparams) { if (!_.includes(_v_controlparams, f)) LogEntityError(_ERROR, model.id + ' > ' + field.name + ': Invalid controlparams: ' + f); }
      }
      if (field.popuplov) {
        for (var f in field.popuplov) { if (!_.includes(_v_popuplov, f)) LogEntityError(_ERROR, model.id + ' > ' + field.name + ': Invalid popuplov parameter: ' + f); }
      }
      if ((field.control == 'label') && Helper.access(field.access, 'IUD')) LogEntityError(_ERROR, model.id + ' > ' + field.name + ': Label can only have access B');
      //Check unique target
      if (field.target) {
        if (!_.includes(existing_targets, field.target)) existing_targets.push(field.target);
        else LogEntityError(_ERROR, model.id + ' > ' + field.name + ': Duplicate target - each field target must be unique within a model');
      }
    });
    if (no_B && model.breadcrumbs && model.breadcrumbs.sql) {
      LogEntityError(_ERROR, model.id + ': No fields set to B (Browse) access.  Form databinding will be disabled client-side, and breadcrumbs sql will not execute.');
    }
    if (no_key && !model.nokey && !model.unbound && ((model.layout == 'form') || (model.layout == 'form-m'))) {
      LogEntityError(_ERROR, model.id + ': No key is defined.  Use nokey or unbound attributes if intentional.');
    }
  });
  
  //Check Parent / Child Relationships for Potentially Missing "F" keys
  _.forOwn(_this.Models, function (model) {
    if (model.tabs) {
      for (var tabname in model.tabs) {
        var tab = model.tabs[tabname];
        var tabmodel = _this.Models[tab.target];
        for (var binding_child in tab.bindings) {
          if (!tabmodel) { continue; }
          if (!tabmodel.fields) LogEntityError(_ERROR, model.id + ' > Tab ' + tabname + ': Target model has no fields for binding');
          var binding_child_field = AppSrv.prototype.getFieldByName(tabmodel.fields, binding_child);
          if (!binding_child_field) LogEntityError(_ERROR, model.id + ' > Tab ' + tabname + ': Bound field "' + binding_child + '" is not defined in the target model "' + tab.target + '"');
          else if (!Helper.access(binding_child_field.access, 'F') && !binding_child_field.key) LogEntityError(_ERROR, model.id + ' > Tab ' + tabname + ': Bound field "' + binding_child + '" in target model "' + tab.target + '" missing F access');
        }
      }
    }
  });
};
//This is not used for now.  Models are granted access on an individual basis to enforce security restrictions
function ParseAccessModels(jsh, model, srcmodelid, srcaccess) {
  if ('tabs' in model) for (var tabname in model.tabs) {
    var tab = model.tabs[tabname];
    if (!_.isObject(tab)) { LogEntityError(_ERROR, model.id + ' > Tab ' + tabname + ': Invalid tab format'); return }
    if (!('target' in tab)) { LogEntityError(_ERROR, model.id + ' > Tab ' + tabname + ': Invalid tab format - missing target'); return }
    if (!('bindings' in tab)) { LogEntityError(_ERROR, model.id + ' > Tab ' + tabname + ': Invalid tab format - missing bindings'); return }
    if (!(tab.target in jsh.Models)) { LogEntityError(_ERROR, model.id + ' > Tab ' + tabname + ': Target model "' + tab.target + '" not found'); return }
    var tmodel = jsh.Models[tab.target];
    tmodel.access_models[srcmodelid] = srcaccess;
    ParseAccessModels(jsh, tmodel, srcmodelid, srcaccess);
  }
  if ('duplicate' in model) {
    if (!(model.duplicate.target in jsh.Models)) { LogEntityError(_WARNING, 'Invalid duplicate model ' + model.duplicate + ' in ' + model.id); return }
    var tmodel = jsh.Models[model.duplicate.target];
    tmodel.access_models[srcmodelid] = srcaccess;
    ParseAccessModels(jsh, tmodel, srcmodelid, srcaccess);
  }
  _.each(model.fields, function (field) {
    if (('target' in field) && ((field.control == 'subform') || (field.popuplov))) {
      if (!(field.target in jsh.Models)) { LogEntityError(_WARNING, 'Invalid ' + field.control + ' target model ' + field.target + ' in ' + model.id); return }
      var tmodel = jsh.Models[field.target];
      tmodel.access_models[srcmodelid] = srcaccess;
      ParseAccessModels(jsh, tmodel, srcmodelid, srcaccess);
    }
  });
};
jsHarmony.prototype.ParseRoutes = function (modeldir) {
  var _this = this;
  _.each(_this.Routes, function (route, routename) {
    LogEntityError(_INFO, 'Loading route ' + routename);
    _this.AddModel(modeldir, routename, route);
  });
};
jsHarmony.prototype.ParsePopups = function () {
  var _this = this;
  _.forOwn(this.Models, function (model) {
    if (model.popup) {
      if (_.isArray(model.popup) && (model.popup.length == 2)) {
        _this.Popups[model.idmd5] = [model.popup[0], model.popup[1]];
      }
    }
  });
}
function AddValidation(field, validator) {
  if (!('validate' in field)) field.validate = [];
  field.validate.push(validator);
}



/************************
|    MANAGE EJS FILES   |
************************/
jsHarmony.prototype.getEJS = function (f) {
  if (!(f in this.EJS)) this.EJS[f] = this.LoadEJS(f);
  this.EJS[f] = this.LoadEJS(f); //Disable caching
  return this.EJS[f];
}

jsHarmony.prototype.getEJSFilename = function (f) {
  var appDir = path.dirname(require.main.filename);
  var jshDir = path.dirname(module.filename);
  var fpath = '';
  if (f.indexOf('reports/') == 0) {
    for (var i = global.modeldir.length - 1; i >= 0; i--) {
      fpath = global.modeldir[i] + f + '.ejs';
      if (fs.existsSync(fpath)) return fpath;
    }
  }
  fpath = appDir + '/views/' + f + '.ejs';
  if (fs.existsSync(fpath)) return fpath;
  for (var i = global.modeldir.length - 1; i >= 0; i--) {
    fpath = global.modeldir[i] + '../views/' + f + '.ejs';
    if (fs.existsSync(fpath)) return fpath;
  }
  var fpath = jshDir + '/views/' + f + '.ejs';
  if (fs.existsSync(fpath)) return fpath;
  fpath = appDir + '/views/' + f + '.ejs';
  return fpath;
}

jsHarmony.prototype.LoadEJS = function (f) {
  var fpath = this.getEJSFilename(f);
  if (!fs.existsSync(fpath)) { LogEntityError(_ERROR, "EJS path not found: " + f + " at " + fpath); return null; }
  return fs.readFileSync(fpath, 'utf8')
}

/*******************
|    RENDER HTML   |
*******************/
jsHarmony.prototype.RenderListing = function () {
  var rslt = '';
  var modelids = new Array();
  for (var modelid in this.Models) {
    modelids.push(modelid);
  }
  modelids.sort();
  rslt += '<ul>';
  for (var i = 0; i < modelids.length; i++) {
    var modelid = modelids[i];
    rslt += '<li><a href="' + modelid + '">' + modelid + '</a></li>';
  }
  rslt += '</ul>';
  return rslt;
}

jsHarmony.prototype.getModelLinkOnClick = function (tgtmodelid, req, link_target) {
  if (!tgtmodelid) tgtmodelid = req.TopModel;
  if (!(tgtmodelid in this.Models)) return '';
  var model = this.Models[tgtmodelid];
  //ParseEJS if necessary
  if (link_target && (link_target.substr(0, 8) == 'savenew:')) {
    return "XForm_SaveNew(href);return false;";
  }
  else if ('popup' in model) {
    return (" window.open(href,'_blank','width=" + model['popup'][0] + ",height=" + model['popup'][1] + ",resizable=1,scrollbars=1');return false;");
  }
  return "";
};

/*************************
|    HELPER FUNCTIONS    |
*************************/
jsHarmony.prototype.parseButtons = function (buttons) {
  if (!('default_buttons' in this.Config)) return buttons;
  var _this = this;
  var rslt = [];
  _.each(buttons, function (button) {
    if (!('link' in button)) throw new Error('Cannot have button without link.');
    var ptarget = _this.parseLink(button['link']);
    if (ptarget.action in _this.Config.default_buttons) {
      var rsltbtn = {};
      rslt.push(_.merge(rsltbtn, _this.Config.default_buttons[ptarget.action], button));
    }
    else rslt.push(button);
  });
  return rslt;
}

jsHarmony.prototype.getAuxFields = function (req, res, model) {
  var firstsort = (('sort' in model)?model['sort'][0].substring(1):'');
  var rslt = [];
  if (typeof model.fields == 'undefined') return rslt;
  for (var i = 0; i < model.fields.length; i++) {
    rslt.push({});
    if (('link' in model.fields[i]) && (model.fields[i].link) && (model.fields[i].link != 'select') && (model.fields[i].link.substr(0, 3) != 'js:')) {
      var link = model.fields[i]['link'];
      var ptarget = this.parseLink(link);
      if (!(ptarget.modelid in this.Models)) throw new Error("Link Model " + ptarget.modelid + " not found.");
      if (!Helper.HasModelAccess(req, this.Models[ptarget.modelid], 'BIU')) { rslt[i]['link_onclick'] = "XExt.Alert('You do not have access to this form.');return false;"; }
      else {
        var link_model = this.Models[ptarget.modelid];
        if ('popup' in link_model) {
          rslt[i]['link_onclick'] = "window.open($(this).attr('href'),'_blank','width=" + link_model['popup'][0] + ",height=" + link_model['popup'][1] + ",resizable=1,scrollbars=1');return false;";
        }
      }
    }
    rslt[i].sortclass = ((model.fields[i].name == firstsort)?((model['sort'][0].substring(0, 1) == '^')?'sortAsc':'sortDesc'):'');
  }
  return rslt;
}

jsHarmony.prototype.parseLink = function (target) {
  var action = '';
  var modelid = '';
  var keys = {};
  var tabs = null;
  if (typeof target != 'undefined') {
    if (target.indexOf('edit:') == 0) { action = 'edit'; modelid = target.substring(5); }
    else if (target.indexOf('add:') == 0) { action = 'add'; modelid = target.substring(4); }
    else if (target.indexOf('savenew:') == 0) { action = 'add'; modelid = target.substring(8); }
    else if (target.indexOf('select:') == 0) { action = 'select'; modelid = target.substring(7); }
    else modelid = target;
    
    if (modelid.indexOf('&') >= 0) {
      var opt = modelid.split('&');
      modelid = opt[0];
      for (var i = 1; i < opt.length; i++) {
        if (Helper.beginsWith(opt[i], 'tabs=')) tabs = opt[i].substr(5);
        else {
          var keystr = opt[i];
          prekeys = keystr.split(',');
          _.each(prekeys, function (val) {
            var keydata = val.split('=');
            if (keydata.length > 1) keys[keydata[0]] = keydata[1];
            else keys[keydata[0]] = keydata[0];
          });
        }
      }
    }
  }
  return { 'action': action, 'modelid': modelid, 'keys': keys, 'tabs': tabs };
}

jsHarmony.prototype.getURL = function (req, target, tabs, fields, bindings, keys) {
  var ptarget = this.parseLink(target);
  var modelid = ptarget.modelid;
  var action = ptarget.action;
  if (modelid == '') modelid = req.TopModel;
  if (!(modelid in this.Models)) throw new Error('Model ' + modelid + ' not found');
  if (!Helper.HasModelAccess(req, this.Models[modelid], 'BIU')) return "";
  tabs = typeof tabs !== 'undefined' ? tabs : new Object();
  var rslt = req.baseurl + modelid;
  for (var xmodelid in this.Models) {
    var xmodel = this.Models[xmodelid];
    if (!(xmodelid in tabs) && ('curtabs' in req) && (xmodelid in req.curtabs)) { tabs[xmodelid] = req.curtabs[xmodelid]; }
  }
  var q = {};
  if (typeof fields == 'undefined') {
    //if modelid = currentmodelid  (changing tab)
    if (req.TopModel == modelid) {
      _.extend(q, req.query); //Copy all parameters
    }
  }
  if (action != '') q['action'] = action;
  if (Helper.Size(tabs) > 0) {
    if (req.TopModel == modelid) {
      q['tabs'] = JSON.stringify(tabs);
    }
  }
  if (ptarget.tabs) {
    q['tabs'] = ptarget.tabs;
  }
  var rsltparams = '';
  var rsltoverride = '';
  if (!_.isEmpty(q)) rsltparams += querystring.stringify(q, '&amp;')
  //Add keys
  if ((action == 'edit') || (action == 'add') || (action == 'select')) {
    if (action == 'select') { rsltoverride = '#select'; }
    if (typeof fields !== 'undefined') {
      //Get keys
      if (_.size(ptarget.keys) > 0) {
        var ptargetkeys = _.keys(ptarget.keys);
        for (var i = 0; i < ptargetkeys.length; i++) {
          rsltparams += '&amp;' + ptargetkeys[i] + '=<#=data[j][\'' + ptarget.keys[ptargetkeys[i]] + '\']#>';
          /* Commented out for Amber COMH_CDUP form, so that C_ID=X1 would work
          for (var j = 0; j < fields.length; j++) {
            var field = fields[j];
            if (!('name' in field)) continue;
            if (field.name == ptargetkeys[i]) {
              rslt += '&amp;' + field['name'] + '=<#=data[j][\'' + ptarget.keys[ptargetkeys[i]] + '\']#>';
            }
          }*/
        }
      }
      else {
        _.each(fields, function (field) {
          if ('key' in field) {
            rsltparams += '&amp;' + field['name'] + '=<#=data[j][\'' + field['name'] + '\']#>';
          }
        });
      }
    }
  }
  if (typeof bindings !== 'undefined') {
    _.each(bindings, function (binding, bindingid) {
      //Evaluate bindings
      rsltparams += '&amp;' + bindingid + '=<#=LiteralOrCollection(' + JSON.stringify(binding).replace(/"/g, '&quot;') + ',data)#>';
    });
  }
  if (rsltoverride) return rsltoverride;
  if (rsltparams) {
    if (rsltparams.indexOf('&amp;') == 0) rsltparams = rsltparams.substring(5);
    rslt += '?' + rsltparams;
  }
  return rslt;
}
jsHarmony.prototype.getURL_onclick = function (req, field, model) {
  var seturl = "var url = $(this).attr('data-url'); ";
  var rslt = "XExt.navTo(url); return false;";
  if ('link' in field) {
    var link = field.link;
    var ptarget = this.parseLink(link);
    if (!(ptarget.modelid in this.Models)) throw new Error("Link Model " + ptarget.modelid + " not found.");
    if (!Helper.HasModelAccess(req, this.Models[ptarget.modelid], 'BIU')) return "XExt.Alert('You do not have access to this form.');return false;";
    if ((model.layout == 'form') || (model.layout == 'form-m') || (model.layout == 'exec')) {
      seturl += "url=XExt.ReplaceAll(url,'data[j]','data'); url = ParseEJS(url,'" + model.id + "'); ";
    }
    var link_model = this.Models[ptarget.modelid];
    if ('popup' in link_model) {
      rslt = "window.open(url,'_blank','width=" + link_model.popup[0] + ",height=" + link_model.popup[1] + ",resizable=1,scrollbars=1');return false;";
    }
  }
  return seturl + rslt;
}
jsHarmony.prototype.getModelID = function (req) {
  var modelid = '';
  if (typeof req.query['e'] != 'undefined') { modelid = req.query['e']; }
  else {
    if ('routes' in this.Config) {
      var routes = this.Config['routes'];
      var urlpath = url.parse(req.originalUrl).pathname;
      if (urlpath in routes) {
        modelid = routes[urlpath];
      }
    }
  }
  return modelid;
};
jsHarmony.prototype.getTabs = function (req) {
  var curtabs = {};
  if (typeof req.query['tabs'] != 'undefined') {
    var tabs = JSON.parse(req.query['tabs']);
    for (var xmodelid in tabs) {
      if (xmodelid in this.Models) {
        curtabs[xmodelid] = tabs[xmodelid];
      }
    }
  }
  return curtabs;
};
jsHarmony.prototype.GetValidatorClientStr = function (field) {
  var rslt = [];
  _.each(field.validate, function (validator) {
    var vname = validator;
    if (vname.indexOf('DB') == 0) return;
    var vparams = '';
    var vsplit = vname.indexOf(':');
    if (vsplit > 0) { vparams = vname.substr(vsplit + 1); vname = vname.substr(0, vsplit); }
    if (!(('_v_' + vname) in XValidateBase)) return; //Ignore ext_validation functions
    rslt.push('XValidate._v_' + vname + '(' + vparams + ')');
  });
  return rslt.join(',');
};
jsHarmony.prototype.GetValidatorFuncs = function (field) {
  var rslt = [];
  _.each(field.validate, function (validator) {
    var vname = validator;
    var vparams = '';
    var vsplit = vname.indexOf(':');
    if (vsplit > 0) { vparams = vname.substr(vsplit + 1); vname = vname.substr(0, vsplit); }
    rslt.push(eval('XValidate._v_' + vname + '(' + vparams + ')'));
  });
  return rslt;
};
jsHarmony.Gen404 = function (req, res) {
  res.status(404);
  if (req.accepts('html')) { res.render(HelperFS.getView(req, '404', { disable_override: true }), { url: req.url }); return; }
  if (req.accepts('json')) { res.send({ error: 'Not found' }); return; }
  res.type('txt').send('Not found');
}
jsHarmony.prototype.getBaseJS = function (req, jsh) {
  var rslt = '';
  rslt += '_debug = ' + (req.jshconfig.show_system_errors?'true':'false') + ';';
  rslt += '_BASEURL = \'' + req.baseurl + '\';';
  rslt += 'forcequery = ' + JSON.stringify(req.forcequery) + ';';
  rslt += 'home_url = ' + JSON.stringify(global.home_url) + ';';
  rslt += 'jshuimap = ' + JSON.stringify(jsh.uimap) + ';';
  if (req.isAuthenticated) {
    if (global.google_settings && global.google_settings.API_KEY) rslt += 'window.google_api_key = ' + JSON.stringify(global.google_settings.API_KEY) + ';';
  }
  return rslt;
}
jsHarmony.prototype.SetJobProc = function(JobProc){ this.AppSrv.jobproc = new JobProc(this.AppSrv); }
jsHarmony.prototype.Auth = require('./lib/Auth.js');
jsHarmony.Auth = jsHarmony.prototype.Auth;
jsHarmony.prototype.Redirect302 = Helper.Redirect302;
jsHarmony.prototype.RenderLogin = require('./render/RenderLogin.js');
jsHarmony.prototype.RenderLoginForgotPassword = require('./render/RenderLoginForgotPassword.js');
jsHarmony.prototype.RenderLoginForgotPasswordReset = require('./render/RenderLoginForgotPasswordReset.js');
jsHarmony.prototype.RenderLogout = require('./render/RenderLogout.js');
jsHarmony.prototype.RenderTemplate = require('./render/RenderTemplate.js');
jsHarmony.Init = Init;
jsHarmony.App = Init.App;
jsHarmony.Run = Init.Run;
jsHarmony.lib = {};
jsHarmony.lib.Helper = Helper;
jsHarmony.lib.HelperFS = HelperFS;
jsHarmony.typename = 'jsHarmony';

module.exports = jsHarmony;