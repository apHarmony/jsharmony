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
var _DBTYPES = ['pgsql', 'mssql', 'sqlite'];

function jsHarmony(options) {
  options = _.extend({ silent: false }, options);

  this.EJS = [];
  this.EJSGrid = '';
  this.EJSForm = '';
  this.Models = {}; //Do not access this directly - use getModel, hasModel
  this.CustomControls = [];
  this.Config = {
    system_settings: {
      automatic_bindings: true,
      automatic_datalocks: true,
      automatic_parameters: true
    }
  };
  this.Popups = {};
  this.Cache = {};
  this.SQL = {};
  this.SQLScripts = {};
  this.CustomDataTypes = {};
  this._IMAGEMAGICK_FIELDS = [];
  //Constructor
  Init.validateGlobals();
  if(!options.silent) console.log('Loading models...');
  this.LoadSQL(path.dirname(module.filename) + '/sql/', global.dbconfig._driver.name, 'jsharmony');
  this.Cache['system.js'] = '';
  this.Cache['system.css'] = fs.readFileSync(path.dirname(module.filename)+'/jsHarmony.theme.css', 'utf8');
  for (var i = 0; i < global.modeldir.length; i++) {
    var modeldir = global.modeldir[i];
    this.LoadModels(modeldir.path, modeldir, '', global.dbconfig._driver.name);
    this.LoadModels(modeldir.path + 'reports/', modeldir, '_report_', global.dbconfig._driver.name);
    if (fs.existsSync(modeldir.path + 'js/')) this.Cache['system.js'] += '\r\n' + this.MergeFolder(modeldir.path + 'js/');
    if (fs.existsSync(modeldir.path + 'style/')) this.Cache['system.css'] += '\r\n' + this.MergeFolder(modeldir.path + 'style/');
    this.LoadSQL(modeldir.path + 'sql/', global.dbconfig._driver.name, modeldir.component);
  }
  this.ParseMacros();
  this.ParseDeprecated();
  this.ParseInheritance();
  this.ParseEntities();
  this.ParsePopups();
  Init.ValidateConfig(this);
  this.map = this.Config.field_mapping;
  this.uimap = this.Config.ui_field_mapping;
  jsHarmony.AddSQLParams(this.SQL, this.map, 'jsh.map.');
  this.AppSrv = new AppSrv(this);
  /*
  var portstr = ' Port ';
  if(global.http_port && global.https_port) portstr += global.http_port + '/' + global.https_port;
  else if(global.http_port) port_str += global.http_port;
  else if(global.https_port) port_str += global.https_port;
  else portstr = '';
  */
 if(!options.silent) console.log('::jsHarmony Server ready::');
}

/*******************
|    LOAD MODELS   |
*******************/
jsHarmony.prototype.setModels = function (models) { this.Models = models; }
jsHarmony.prototype.LoadModels = function (modelbasedir, modeldir, prefix, dbtype) {
  var _this = this;
  if (typeof prefix == 'undefined') prefix = '';
  if (typeof dbtype == 'undefined') dbtype = '';
  if(!fs.existsSync(modelbasedir)){ LogEntityError(_ERROR, 'Model folder ' + modelbasedir + ' not found'); return; }
  var fmodels = fs.readdirSync(modelbasedir);
  for (var i in fmodels) {
    var fname = modelbasedir + fmodels[i];
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
      var col = ['default_buttons', 'field_mapping', 'ui_field_mapping', 'datalocks', 'salts', 'passwords', 'macros', 'model_groups', 'dynamic_bindings'];
      _.each(col, function(c){ if(!(c in _this.Config)) _this.Config[c] = {}; });
      for (var c in model) {
        if(c=='datalocks') _.merge(this.Config[c],model[c]);
        else if (_.includes(col, c)) {
          for (var cc in model[c]) this.Config[c][cc] = model[c][cc];
        }
        else if(c=='system_settings') _.extend(this.Config[c],model[c]);
        else this.Config[c] = model[c];
      }
    }
    else {
      if (!('layout' in model) && !('inherits' in model)) {
        //Parse file as multiple-model file
        _.each(model, function (submodel, submodelname) {
          submodelname = prefix + submodelname;
          LogEntityError(_INFO, 'Loading sub-model ' + submodelname);
          _this.AddModel(submodelname, submodel, prefix, fname, modeldir);
        });
      }
      else this.AddModel(modelname, model, prefix, fname, modeldir);
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
jsHarmony.AddSQLParams = function(SQL, items, prefix){
  if(!items) return;
  for(var key in items){
    var fullkey = prefix + key;
    if(fullkey in SQL) continue;
    SQL[fullkey] = items[key];
  }
}
jsHarmony.prototype.LoadSQL = function (dir, type, component) {
  var rslt = jsHarmony.LoadSQL(dir, type, component);
  for(var sqlid in rslt.SQL) this.SQL[sqlid] = rslt.SQL[sqlid];
  for(var datatypeid in rslt.CustomDataTypes) this.CustomDataTypes[datatypeid] = rslt.CustomDataTypes[datatypeid];
  this.SQLScripts = _.merge(this.SQLScripts, rslt.SQLScripts);
}
function LoadSQLFiles(dir, options){
  options = _.extend({ ignoreDirectories: true, filterType: '' },options||{});
  if (!fs.existsSync(dir)) return [];
  var d = fs.readdirSync(dir);
  d.sort(function (a, b) {
    var abase = a;
    var bbase = b;
    var a_lastdot = a.lastIndexOf('.');
    var b_lastdot = b.lastIndexOf('.');
    if (a_lastdot > 0) abase = a.substr(0, a_lastdot);
    if (b_lastdot > 0) bbase = b.substr(0, b_lastdot);
    if (abase == bbase) return a > b;
    return abase > bbase;
  });
  var rslt = [];
  for (var i=0; i<d.length; i++) {
    var fname = dir + d[i];
    var fstat = fs.lstatSync(fname);
    var fobj = {
      name: d[i],
      path: fname,
      type: (fstat.isDirectory()?'folder':'file')
    };
    
    //Ignore directories
    if(fstat.isDirectory()){
      if(options.ignoreDirectories){
        continue;
      }
      else {
        if (options.filterType && (fname!=options.filterType)) {
          var found_other_dbtype = false;
          _.each(_DBTYPES, function (dbtype) { if (fname==dbtype) found_other_dbtype = true; });
          if (found_other_dbtype){
            continue;
          }
        }
      }
    }

    if (options.filterType && (fname.indexOf('.' + options.filterType + '.') < 0)) {
      var found_other_dbtype = false;
      _.each(_DBTYPES, function (dbtype) { if (fname.indexOf('.' + dbtype + '.') >= 0) found_other_dbtype = true; });
      if (found_other_dbtype){
        continue;
      }
    }

    rslt.push(fobj);
  }
  return rslt;
}
jsHarmony.LoadSQL = function (dir, type, component, rslt) {
  if(!rslt) rslt = {};
  if(!rslt.CustomDataTypes) rslt.CustomDataTypes = {};
  if(!rslt.SQL) rslt.SQL = {};
  if(!rslt.SQLScripts) rslt.SQLScripts = { };
  
  var _this = this;
  var d = LoadSQLFiles(dir, { ignoreDirectories: true, filterType: type });


  //Load Base SQL files
  if(d.length){
    var found_sqlids = {};

    for (var i=0; i<d.length; i++) {
      var fpath = d[i].path;

      LogEntityError(_INFO, 'Loading ' + fpath);
      //Parse text
      var ftext = Helper.JSONstrip(fs.readFileSync(fpath, 'utf8'));
      var sql = {};
      try {
        sql = JSON.parse(ftext);
      }
      catch (ex) {
        console.error("-------------------------------------------");
        console.error("FATAL ERROR Parsing SQL " + fpath);
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
      if(path.basename(fpath).toLowerCase() == ('datatypes.'+type+'.json')){
        for (var datatypeid in sql) {
          rslt.CustomDataTypes[datatypeid] = sql[datatypeid];
        }
      }
      else{
        for (var sqlid in sql) {
          if (sqlid in found_sqlids) { LogEntityError(_ERROR, 'Duplicate SQL ' + sqlid + ' in ' + found_sqlids[sqlid] + ' and ' + fpath); }
          found_sqlids[sqlid] = fpath;
          var sqlval = sql[sqlid];
          if(sqlval && sqlval.params){
            //SQL Function
            if(sqlval.sql) sqlval.sql = Helper.ParseMultiLine(sqlval.sql);
            if(sqlval.exec) sqlval.exec = Helper.ParseMultiLine(sqlval.exec);
          }
          else sqlval = Helper.ParseMultiLine(sqlval);
          rslt.SQL[sqlid] = sqlval;
        }
      }
    }
  }

  //Load SQL Scripts
  var scriptsdir = dir+'scripts/';
  d = LoadSQLFiles(scriptsdir, { ignoreDirectories: false, filterType: type });
  if(component && (d.length > 0)){
    var scripts = {};

    //Process folders
    for(var i=0;i<d.length;i++){
      if(d[i].type=='folder'){
        var subdname = d[i].name;
        var subd1 = LoadSQLFiles(scriptsdir+subdname+'/', { ignoreDirectories: true, filterType: type });
        var subd2 = LoadSQLFiles(scriptsdir+subdname+'/'+type+'/', { ignoreDirectories: true, filterType: type });
        var subd = subd1.concat(subd2);
        scripts[subdname] = {};
        for(var j=0;j<subd.length;j++){
          var fname = subd[j].name;
          if(!(fname in subd[j])) scripts[subdname][fname] = '';
          else scripts[subdname][fname] += "\r\n";
          scripts[subdname][fname] += fs.readFileSync(subd[j].path, 'utf8');
        }
      }
    }

    //Process files
    for(var i=0;i<d.length;i++){
      if(d[i].type=='file'){
        scripts[d[i].name] = fs.readFileSync(d[i].path, 'utf8')
      }
    }

    //Post-process - extract prefix if in aaa.bbb.sql format
    function processScriptPrefix(node){
      for(var key in node){
        var val = node[key];
        if(_.isString(val)){
          //File has as least two periods
          if(key.indexOf(".",key.indexOf(".")+1)>=0){
            var prefix = key.substr(0,key.indexOf("."));
            var newkey = key.substr(key.indexOf(".")+1);
            if(prefix && newkey){
              if(!(prefix in node)) node[prefix] = {};
              if(_.isString(node[prefix])) node[prefix] = { prefix: node[prefix] };
              //Move node to element with prefix
              if(!(newkey in node[prefix])) node[prefix][newkey] = '';
              else node[prefix][newkey] += "\r\n";
              node[prefix][newkey] += val;
              if(_.isString(node[key])) delete node[key];
            }
          }
        }
      }
      for(var key in node){
        var val = node[key];
        if(!_.isString(val)) processScriptPrefix(val);
      }
    }
    processScriptPrefix(scripts);

    rslt.SQLScripts[component] = scripts;
  }

  return rslt;
}
jsHarmony.prototype.AddModel = function (modelname, model, prefix, modelpath, modeldir) {
  if(!prefix) prefix = '';
  model['id'] = modelname;
  model['idmd5'] = crypto.createHash('md5').update(global.frontsalt + model.id).digest('hex');
  model['access_models'] = {};
  model['_inherits'] = [];
  if(!model.path && modelpath) model.path = modelpath;
  if(!model.component && modeldir && modeldir.component)  model.component = modeldir.component;
  if ('actions' in model) model['access_models'][modelname] = model.actions;
  if (('inherits' in model) && (model.inherits.indexOf(prefix)!=0)) model.inherits = prefix + model.inherits;
  //if (modelname in this.Models) throw new Error('Cannot add ' + modelname + '.  The model already exists.')
  var modelbasedir = '';
  if(model.path) modelbasedir = path.dirname(model.path) + '/';
  if(modelbasedir){
    //Load JS
    var jsfname = (modelbasedir + modelname.substr(prefix.length) + '.js');
    if (fs.existsSync(jsfname)) {
      var newjs = fs.readFileSync(jsfname, 'utf8');
      if ('js' in model) newjs += "\r\n" + model.js;
      model['js'] = newjs;
    }
    //Load EJS
    var ejsfname = (modelbasedir + modelname.substr(prefix.length) + '.ejs');
    if(prefix=='_report_') ejsfname = (modelbasedir + modelname.substr(prefix.length) + '.form.ejs');
    if (fs.existsSync(ejsfname)) {
      var newejs = fs.readFileSync(ejsfname, 'utf8');
      if ('ejs' in model) newejs += "\r\n" + model.ejs;
      model['ejs'] = newejs;
    }
    var jsonroutefname = (modelbasedir + modelname.substr(prefix.length) + '.onroute.js');
    if (fs.existsSync(jsonroutefname)) {
      var newjs = fs.readFileSync(jsonroutefname, 'utf8');
      if ('onroute' in model) newjs += "\r\n" + model.onroute;
      model['onroute'] = newjs;
    }
  }
  if (!('helpid' in model) && !('inherits' in model)) model.helpid = modelname;
  if ('onroute' in model) model.onroute = (new Function('routetype', 'req', 'res', 'callback', 'require', 'jsh', 'modelid', 'params', model.onroute));
  this.Models[modelname] = model;
}
jsHarmony.prototype.ParseInheritance = function () {
  var _this = this;
  var foundinheritance = true;
  //Add model groups
  _.forOwn(this.Models, function (model) {
    if(!model.groups) model.groups = [];
    if(!_.isArray(model.groups)) throw new Error(modelname + ': model.groups must be an array');
    for(var modelgroup in _this.Config.model_groups){
      if(_.includes(_this.Config.model_groups[modelgroup],model.id)) model.groups.push(modelgroup);
    }
  });
  while (foundinheritance) {
    foundinheritance = false;
    _.forOwn(this.Models, function (model) {
      if ('inherits' in _this.Models[model.id]) {
        foundinheritance = true;
        if (!(model.inherits in _this.Models)) throw new Error('Model ' + model.id + ' parent model does not exist.');
        if (model.inherits == model.id) throw new Error('Model ' + model.id + ' cyclic inheritance.')
        var parentmodel = _this.Models[model.inherits];
        var origparentmodel = parentmodel;
        var parentinheritance = parentmodel.inherits;
        if (typeof parentinheritance !== 'undefined') return;
        parentmodel = JSON.parse(JSON.stringify(parentmodel)); //Deep clone
        if(origparentmodel.onroute) parentmodel.onroute = origparentmodel.onroute;
        model._inherits = parentmodel._inherits.concat([model.inherits]);

        //Add Parent Model Groups
        model.groups = _.union(parentmodel.groups, model.groups);

        //Merge Models
        //Extend this to enable delete existing values by making them NULL
        //Extend this to enable merging arrays, like "button", "fields", "roles" using key, other arrays just overwrite
        
        var mergedprops = {};
        EntityPropMerge(mergedprops, 'fields', model, parentmodel, function (newval, oldval) {
          return MergeModelArray(newval, oldval, function(newItem, oldItem, rsltItem){
            if ('validate' in newItem) rsltItem.validate = newItem.validate;
            EntityPropMerge(rsltItem, 'roles', newItem, oldItem, function (newval, oldval) { return _.merge({}, oldval, newval) });
          });
        });
        //Create a clone of parent model instead of object reference
        if (('fields' in parentmodel) && !('fields' in model)) model.fields = parentmodel.fields.slice(0);
        EntityPropMerge(mergedprops, 'roles', model, parentmodel, function (newval, oldval) { return _.merge({}, oldval, newval) });
        EntityPropMerge(mergedprops, 'pagesettings', model, parentmodel, function (newval, oldval) { return _.merge({}, oldval, newval) });
        EntityPropMerge(mergedprops, 'tabs', model, parentmodel, function (newval, oldval) {
          return MergeModelArray(newval, oldval);
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
function MergeModelArray(newval, oldval, eachItem){
  var modelfields = _.map(newval, 'name');
  try{
    var rslt = newval.slice(0);
  }
  catch(ex){
    console.log(ex);
    console.log(newval);
    throw(ex);
  }
  _.each(oldval, function (field) {
    if ((typeof field.name != 'undefined') && (field.name)) {
      var modelfield = _.find(rslt, function (mfield) { return mfield.name == field.name; });
    }
    if (typeof modelfield !== 'undefined') {
      rslt.splice(rslt.indexOf(modelfield), 1);
      if (!('__REMOVE__' in modelfield)) {
        //oldfield = field, newfield = modelfield
        var newfield = _.merge({}, field, modelfield);
        if(eachItem) eachItem(modelfield, field, newfield);
        rslt.push(newfield);
      }
    }
    else {
      if (!('__REMOVE__' in field)) {
        rslt.push(field);
      }
    }
  });
  SortModelArray(rslt);
  for (var i = 0; i < rslt.length; i++) {
    if ('__REMOVE__' in rslt[i]) {
      rslt.splice(i, 1);
      i--;
    }
  }
  return rslt;
}
function SortModelArray(fields){
  var cnt = 0;
  do {
    cnt = 0;
    for( var i = 0; i < fields.length; i++) {
      var field = fields[i];
      var newidx = -1;
      if('__AFTER__' in field){
        //Get position of new index
        if(field['__AFTER__']=='__START__') newidx = 0;
        else if(field['__AFTER__']=='__END__') newidx = fields.length - 1;
        else {
          for(var j = 0; j < fields.length; j++){
            if(fields[j].name == field['__AFTER__']){ 
              if(j > i) newidx = j + 1;
              else newidx = j; 
              break; 
            }
          }
        }
        if(newidx >= 0){
          cnt++;
          delete field['__AFTER__'];
          if(newidx != i){
            fields.splice(i, 1);
            if(newidx > i) newidx--;
            fields.splice(newidx, 0, field);
            if(newidx > i) i--;
          }
        }
      }
    }
  } while(cnt > 0);
}
function LogDeprecated(msg) {
  if (global.debug_params.hide_deprecated) return;
  console.log('**DEPRECATED** ' + msg);
}
jsHarmony.prototype.TestImageMagick  = function(strField){
  var _this = this;
  _this._IMAGEMAGICK_FIELDS.push(strField); 
  if(_this._IMAGEMAGICK_FIELDS.length > 1) return;
  var imagick = require('gm').subClass({ imageMagick: true });
  if(global.jshSettings && global.jshSettings.ignore_imagemagick) return;
  imagick(100,100,'white').setFormat('PNG').toBuffer(function(err,b){
    if(err) LogEntityError(_ERROR, 'Please install ImageMagick.  Used by: ' + _.uniq(_this._IMAGEMAGICK_FIELDS).join(', '));
  });
}
jsHarmony.prototype.ParseDeprecated = function () {
  _.forOwn(this.Models, function (model) {
    //Convert tabs to indexed format, if necessary
    if(model.tabs){
      if(!_.isArray(model.tabs)){
        LogDeprecated(model.id + ': Defining tabs as an associative array has been deprecated.  Please convert to the indexed array syntax [{ "name": "TABNAME" }]');
        var new_tabs = [];
        for (var tabname in model.tabs) {
          if(!model.tabs[tabname]) model.tabs[tabname] = { '__REMOVE__': 1 };
          if(!model.tabs[tabname].name) model.tabs[tabname].name = tabname;
          new_tabs.push(model.tabs[tabname]);
        }
        model.tabs = new_tabs;
      }
    }
  });
}
jsHarmony.prototype.ParseEntities = function () {
  var _this = this;
  var base_controls = ["label", "html", "textbox", "textzoom", "dropdown", "date", "textarea", "hidden", "subform", "html", "password", "file_upload", "file_download", "button", "linkbutton", "tree", "checkbox"];
  var base_datatypes = ['DATETIME','VARCHAR','CHAR','BOOLEAN','BIGINT','INT','SMALLINT','TINYINT','DECIMAL','FLOAT','DATE','DATETIME','TIME','ENCASCII','HASH','FILE','BINARY'];
  var all_keys = {};
  var all_lovs = {};
  _.forOwn(this.Models, function (model) {
    _.each(model.fields, function (field) {
      if(field.name){
        if(field.key){
          if(!(field.name in all_keys)) all_keys[field.name] = [];
          all_keys[field.name].push(model.id);
        }
        if((field.lov && (field.lov.sql||field.lov.sql2||field.lov.sqlmp||field.lov.sqlselect))||(field.popuplov)){
          if(!(field.name in all_lovs)) all_lovs[field.name] = [];
          all_lovs[field.name].push(model.id);
        }
      }
    });
  });
  _.forOwn(this.Models, function (model) {
    model.xvalidate = new XValidate();
    if ('sites' in model) LogEntityError(_WARNING, 'Model ' + model.id + ' had previous "sites" attribute - overwritten by system value');
    model.sites = Helper.GetRoleSites(model.roles);
    if (!('table' in model)) LogEntityError(_WARNING, 'Model ' + model.id + ' missing table');
    if (!('actions' in model)) LogEntityError(_WARNING, 'Model ' + model.id + ' missing actions');
    //Add Model caption if not set
    if (!('caption' in model)) { model.caption = ['', model.id, model.id]; LogEntityError(_WARNING, 'Model ' + model.id + ' missing caption'); }
    if (!('title' in model)){
      if((model.layout == 'grid') || (model.layout == 'multisel')) model.title = model.caption[2];
      model.title = model.caption[1];
    }
    if (!('ejs' in model)) model.ejs = '';
    if (!('templates' in model)) model.templates = {};
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
      if (!('actions' in field)) {
        field.actions = '';
        if ((field.control == 'html') || (field.control == 'button')) field.actions = 'B';
        else {
          LogEntityError(_WARNING, 'Model ' + model.id + ' Field ' + (field.name || field.caption || JSON.stringify(field)) + ' missing access.');
        }
      }
      if (!('caption' in field) && ('name' in field)) {
        if (('control' in field) && (field.control == 'hidden')) field.caption = '';
        else field.caption = field.name;
      }
      if(!('datatype_config' in field)) field.datatype_config = {};
      if ('name' in field) {
        //if (_.includes(fieldnames, field.name)) { throw new Error("Duplicate field " + field.name + " in model " + model.id + "."); }
        if (_.includes(fieldnames, field.name)) { LogEntityError(_ERROR, "Duplicate field " + field.name + " in model " + model.id + "."); }
        fieldnames.push(field.name);
      }
      if (field.key) { 
        field.actions += 'K'; 
        foundkey = true; 
        if(Helper.access(field.actions, 'F') || field.foreignkey){ LogEntityError(_WARNING, model.id + ' > ' + field.name + ': Key field should not also have foreignkey attribute.'); }
      }
      if ('__REMOVEFIELD__' in field){ 
        LogDeprecated(model.id + ' > ' + field.name + ': __REMOVEFIELD__ has been deprecated.  Please use __REMOVE__ instead.'); 
        field.__REMOVE__ = field.__REMOVEFIELD__;
        delete field.__REMOVEFIELD__;
      }
      if (field.controlparams) {
        if (field.controlparams.CODEVal) { field.controlparams.codeval = field.controlparams.CODEVal; delete field.controlparams.CODEVal; }
        if ('codeval' in field.controlparams) LogDeprecated(model.id + ' > ' + field.name + ': The controlparams codeval attribute has been deprecated - use "popuplov":{...}');
        if ('popupstyle' in field.controlparams) LogDeprecated(model.id + ' > ' + field.name + ': The controlparams popupstyle attribute has been deprecated - use "popuplov":{...}');
        if ('popupiconstyle' in field.controlparams) LogDeprecated(model.id + ' > ' + field.name + ': The controlparams popupiconstyle attribute has been deprecated - use "popuplov":{...}');
        if ('popup_copy_results' in field.controlparams) LogDeprecated(model.id + ' > ' + field.name + ': The controlparams popup_copy_results attribute has been deprecated - use "popuplov":{...}');
        if ('base_readonly' in field.controlparams) LogDeprecated(model.id + ' > ' + field.name + ': The controlparams base_readonly attribute has been deprecated - use "popuplov":{...}');
        if ('onpopup' in field.controlparams) LogDeprecated(model.id + ' > ' + field.name + ': The controlparams onpopup attribute has been deprecated - use "popuplov":{...}');
        if ('image' in field.controlparams && (field.controlparams.image.resize || field.controlparams.image.crop)) _this.TestImageMagick(model.id + ' > ' + field.name);
        if ('thumbnails' in field.controlparams) _.each(field.controlparams.thumbnails,function(thumbnail){ if(thumbnail.resize || thumbnail.crop) _this.TestImageMagick(model.id + ' > ' + field.name); });
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
      //Add foreign keys
      if(!field.key){
        if(!Helper.access(field.actions, 'F')){
          if(_this.Config.system_settings.automatic_parameters){
            var add_foreignkey = false;
            //Disabled this check, because lov's with "nodatalock" should not be tagged with the foreign key
            //if (('control' in field) && ((field.lov && (field.lov.sql||field.lov.sql2||field.lov.sqlmp||field.lov.sqlselect))||(field.popuplov))){ add_foreignkey = 'lov'; }
            //Check if the field is in the list of key fields
            if (field.name && (field.name in all_keys)){ add_foreignkey = 'key'; }
            //Do not add foreign keys for Multisel LOV
            if ((model.layout=='multisel') && field.lov) add_foreignkey = false;
            if(add_foreignkey){
              if(!field.foreignkey) LogEntityError(_INFO, 'Adding foreign key : ' + model.id + ' > ' + field.name + ' || ' + add_foreignkey); //_INFO
              field.foreignkey = 1;
            }
          }
          if (field.foreignkey) { field.actions += 'F'; }
        }
        else if(Helper.access(field.actions, 'F')){
          LogDeprecated(model.id + ' > ' + field.name + ': "F" access is deprecated.  Please use foreignkey instead, or automatic parameters.');
          field.foreignkey = 1;
        }
      }

      if (('type' in field) && (field.type in _this.CustomDataTypes)) {
        while(field.type in _this.CustomDataTypes){
          var fieldtype = field.type;
          var datatype = _this.CustomDataTypes[fieldtype];
          for (var prop in datatype) {
            if(!(prop in field) || (prop=='type')) field[prop] = datatype[prop];
            else if(prop=='datatype_config'){
              for(var subprop in datatype.datatype_config){
                if(!(subprop in field.datatype_config)) field.datatype_config[subprop] = datatype.datatype_config[subprop];
              }
            }
          }
          if(field.type==fieldtype) break;
        }
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
        if(!_.includes(base_datatypes,field.type.toUpperCase())){
          LogEntityError(_ERROR, 'Model ' + model.id + ' Field ' + field.name + ' Invalid data type ' + field.type);
          //throw new Error('Data type ' + field.type + ' not recognized');
        }
        if (field.sql_from_db) field.sql_from_db = _this.parseFieldExpression(field, field.sql_from_db, {}, { ejs:true });
        if (field.sql_to_db) field.sql_to_db = _this.parseFieldExpression(field, field.sql_to_db, {}, { ejs:true });
        var has_datatype_validator = false;
        if (field.datatype_config){
          if(field.datatype_config.override_length){
            field.datatype_config.orig_length = field.length;
            field.length = field.datatype_config.override_length;
          }
          if(field.datatype_config.validate){
            has_datatype_validator = true;
            for(var i=0;i<field.datatype_config.validate.length;i++){
              var validator = _this.parseFieldExpression(field, field.datatype_config.validate[i], {}, { ejs: true });
              if(validator) AddValidation(field, validator);
            }
          }
        }
        if(!has_datatype_validator){
          switch (field.type.toUpperCase()) {
            case 'VARCHAR':
            case 'CHAR':
              if (('length' in field) && (field.length >= 0)) AddValidation(field, 'MaxLength:' + field.length);
              break;
            case 'BOOLEAN':
              break;
            case 'BIGINT':
            case 'INT':
            case 'SMALLINT':
              AddValidation(field, 'IsNumeric'); break;
            case 'TINYINT':
              AddValidation(field, 'MaxValue:255');
              AddValidation(field, 'IsNumeric:true');
              break;
            case 'DECIMAL':
              AddValidation(field, 'IsDecimal'); break;
            case 'FLOAT':
              AddValidation(field, 'IsFloat'); break;
            case 'DATE':
            case 'DATETIME':
              AddValidation(field, 'IsDate'); break;
            case 'TIME':
              AddValidation(field, 'IsTime'); break;
            case 'ENCASCII':
              if (('length' in field) && (field.length >= 0)) AddValidation(field, 'MaxLength:' + (field.length - 1));
              break;
            case 'HASH':
              break;
            case 'FILE':
              if (!field.controlparams || !field.controlparams.data_folder) { LogEntityError(_ERROR, 'Model ' + model.id + ' Field ' + (field.name || '') + ' missing data_folder'); }
              HelperFS.createFolderIfNotExists(global.datadir + field.controlparams.data_folder, function () { });
              break;
            case 'BINARY':
              var flen = -1;
              if (('length' in field) && (field.length >= 0)) flen = field.length;
              AddValidation(field, 'IsBinary:'+field.length);
              break;
          }
        }
      }
    });
    if (!foundkey) LogEntityError(_WARNING, 'Model ' + model.id + ' missing key');
    
    //**DEPRECATED MESSAGES**
    if (model.fields) _.each(model.fields, function (field) {
      if (field.actions && Helper.access(field.actions, 'C')) LogDeprecated(model.id + ' > ' + field.name + ': Access \'C\' has been deprecated - use breadcrumbs.sql_params');
      if ('hidden' in field) LogDeprecated(model.id + ' > ' + field.name + ': The hidden attribute has been deprecated - use "control":"hidden"');
      if ('html' in field) LogDeprecated(model.id + ' > ' + field.name + ': The html attribute has been deprecated - use "control":"html"');
      if ('lovkey' in field) LogDeprecated(model.id + ' > ' + field.name + ': The lovkey attribute has been deprecated');
    });
    
    //Convert mutli-line variables to single string
    ParseMultiLineProperties(model, ['js', 'sqlselect', 'sqldownloadselect', 'sqlinsert', 'sqlinsertencrypt', 'sqlupdate', 'sqldelete', 'sqlexec', 'sqlwhere', 'oninit', 'onload', 'onloadimmediate', 'oninsert', 'onvalidate', 'onupdate', 'ondestroy', 'oncommit']);
    if (model.breadcrumbs) ParseMultiLineProperties(model.breadcrumbs, ['sql']);
    if (model.fields) _.each(model.fields, function (field) {
      ParseMultiLineProperties(field, ['onchange', 'sqlselect', 'sqlupdate', 'sqlinsert', 'sqlwhere', 'sql_sort', 'sql_search', 'sql_search_sound', 'value']);
      if (field.lov) ParseMultiLineProperties(field.lov, ['sql', 'sql2', 'sqlmp', 'sqlselect']);
      if (field.controlparams) ParseMultiLineProperties(field.controlparams, ['onpopup']);
    });
    
    //Apply default actions to buttons
    _.each(model.buttons, function(button){
      if(!('actions' in button)) button.actions = 'BIU';
    });

    //Automatically add sql_params based on SQL
    if(_this.Config.system_settings.automatic_parameters){
      //1. Add fkeys
      //2. Parse sql title, and add any params, if sql_params are not defined
      if (model.fields) _.each(model.fields, function (field) {
        _this.AddSqlParams(model, field.lov, ['sql','sql2','sqlmp']);
        _this.AddSqlParams(model, field.default);
      });
      _this.AddSqlParams(model, model.breadcrumbs);
      if(model.title){
        _this.AddSqlParams(model, model.title);
        _this.AddSqlParams(model, model.title.add);
        _this.AddSqlParams(model, model.title.edit);
      }
    }
    
    //Automatically add lovkey based on lov.sqlparams
    if (model.fields) _.each(model.fields, function (field) {
      if (field.lov && field.lov.sql_params) {
        _.each(field.lov.sql_params, function (sql_param) {
          //Get field
          var sql_param_field = AppSrv.prototype.getFieldByName(model.fields, sql_param);
          if (!sql_param_field) LogEntityError(_ERROR, model.id + ' > ' + field.name + ': LOV sql param "' + sql_param + '" is not defined as a field');
          else if (!sql_param_field.key && !sql_param_field.lovkey) { sql_param_field.lovkey = 1; }
        });
      }
      //Add C for any LOV field that can be used in truncate_lov
      if(field.lov){
        if((model.layout=='form')||(model.layout=='form-m')||(model.layout=='exec')){
          if(!field.always_editable_on_insert && Helper.access(model.actions, 'I') && Helper.access(field.actions, 'I')){
            if(field.lov.sql||field.lov.sql2||field.lov.sqlmp||field.lov.sqlselect){
              if (!Helper.access(field.actions, 'C')) { if (!field.actions) field.actions = ''; field.actions += 'C'; }
            }
          }
        }
      }
    });
    
    //Automatically add C (breadcrumb parameter) for breadcrumb and title sql_params
    _this.AddSqlParamsFieldFlags(model, model.breadcrumbs, 'Breadcrumb');
    if(model.title){
      _this.AddSqlParamsFieldFlags(model, model.title, 'Title');
      _this.AddSqlParamsFieldFlags(model, model.title.add, 'Title.Add');
      _this.AddSqlParamsFieldFlags(model, model.title.edit, 'Title.Edit');
    }

    //Automatically add C based on default fields
    if(model.fields){
      var default_params = [];
      _.each(model.fields,function(field){ if(field.default && field.default.sql_params) default_params = _.union(default_params,field.default.sql_params); });
      _.each(default_params,function(sql_param){
        var sql_param_field = AppSrv.prototype.getFieldByName(model.fields, sql_param);
        if (!sql_param_field) LogEntityError(_ERROR, model.id + ' > ' + field.name + ': Default sql param "' + sql_param + '" is not defined as a field');
        else if (!Helper.access(sql_param_field.actions, 'C')) { if (!sql_param_field.actions) sql_param_field.actions = ''; sql_param_field.actions += 'C'; }
      });
    }

    //Automatically add bindings
    if(_this.Config.system_settings.automatic_bindings){
      if(('nokey' in model) && (model.nokey)){ }
      else{
        if ('tabs' in model) for (var i=0;i<model.tabs.length;i++) {
          var tab = model.tabs[i]; //tab.target, tab.bindings
          _this.AddBindings(model, tab, 'Tab '+(tab.name||''));
        }
        if ('duplicate' in model) {
          var duplicate = model.duplicate; //duplicate.target, duplicate,bindings
          _this.AddBindings(model, model.duplicate, "Duplicate action");
        }
        _.each(model.fields, function (field) {
          if (field.control == 'subform') {
            _this.AddBindings(model, field, 'Subform '+field.name);
          }
        });
      }
    }

    //Validate Model and Field Parameters
    var _v_model = [
      'comment', 'layout', 'title', 'table', 'actions', 'roles', 'caption', 'sort', 'dev', 'sites',
      'samplerepeat', 'topmenu', 'id', 'idmd5', 'access_models', '_inherits', 'groups', 'helpid', 'querystring', 'buttons', 'xvalidate',
      'pagesettings', 'pageheader', 'pageheaderjs', 'headerheight', 'pagefooter', 'pagefooterjs', 'zoom', 'reportdata', 'description', 'template', 'fields', 'jobqueue',
      'hide_system_buttons', 'grid_expand_filter', 'grid_rowcount', 'nogridadd', 'reselectafteredit', 'newrowposition', 'commitlevel', 'validationlevel',
      'grid_require_filter', 'grid_save_before_update', 'rowstyle', 'rowclass', 'rowlimit', 'disableautoload',
      'oninit', 'oncommit', 'onload', 'oninsert', 'onupdate', 'onvalidate', 'onloadstate', 'onrowbind', 'ondestroy',
      'js', 'ejs', 'dberrors', 'tablestyle', 'formstyle', 'popup', 'onloadimmediate', 'sqlwhere', 'breadcrumbs', 'tabpos', 'tabs', 'tabpanelstyle',
      'nokey', 'nodatalock', 'unbound', 'duplicate', 'sqlselect', 'sqlupdate', 'sqlinsert', 'sqldelete', 'sqlexec', 'sqlexec_comment', 'sqltype', 'onroute', 'tabcode', 'noresultsmessage', 'bindings',
      'path', 'component', 'templates',
      //Report Parameters
      'subheader', 'footerheight', 'headeradd',
    ];
    var _v_field = [
      'name', 'type', 'actions', 'control', 'caption', 'length', 'sample', 'validate', 'controlstyle', 'key', 'foreignkey', 'serverejs', 'roles', 'static', 'cellclass',
      'controlclass', 'value', 'onclick', 'datalock', 'hidden', 'link', 'nl', 'lov', 'captionstyle', 'disable_sort', 'disable_search', 'disable_search_all', 'cellstyle', 'captionclass',
      'caption_ext', '_orig_control', 'format', 'eol', 'target', 'bindings', 'default', 'controlparams', 'popuplov', 'virtual', 'always_editable_on_insert', 'precision', 'password', 'hash', 'salt', 'unbound',
      'sqlselect', 'sqlupdate', 'sqlinsert','sql_sort', 'sqlwhere', 'sql_search_sound', 'sql_search', 'onchange', 'lovkey', 'readonly', 'html', '__REMOVE__', '__AFTER__',
      'sql_from_db','sql_to_db','sql_search_to_db','datatype_config'
    ];
    var _v_controlparams = [
      'value_true', 'value_false', 'value_hidden', 'codeval', 'popupstyle', 'popupiconstyle', 'popup_copy_results', 'onpopup', 'dateformat', 'base_readonly',
      'download_button', 'preview_button', 'upload_button', 'delete_button', 'data_folder', 'sqlparams',
      'image', 'thumbnails', 'expand_all', 'item_context_menu'
    ];
    var _v_popuplov = ['target', 'codeval', 'popupstyle', 'popupiconstyle', 'popup_copy_results', 'onpopup', 'popup_copy_results', 'onpopup', 'base_readonly'];
    var _v_lov = ['sql', 'sql2', 'sqlmp', 'UCOD', 'UCOD2', 'GCOD', 'GCOD2', 'schema', 'blank', 'parent', 'parents', 'datalock', 'sql_params', 'sqlselect', 'always_get_full_lov', 'nodatalock', 'showcode'];
    //lov
    var existing_targets = [];
    for (var f in model) { if (f.substr(0, 7) == 'comment') continue; if (!_.includes(_v_model, f)) LogEntityError(_ERROR, model.id + ': Invalid model property: ' + f); }
    var no_B = true;
    var no_key = true;
    if (model.fields) _.each(model.fields, function (field) {
      if (Helper.access(field.actions, 'B') && (field.control != 'html') && (field.control != 'subform') && (field.control != 'button')) no_B = false;
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
      if (field.lov) {
        for (var f in field.lov) { if (!_.includes(_v_lov, f)) LogEntityError(_ERROR, model.id + ' > ' + field.name + ': Invalid lov parameter: ' + f); }
      }
      if ((field.control == 'label') && Helper.access(field.actions, 'IUD')) LogEntityError(_ERROR, model.id + ' > ' + field.name + ': Label can only have action B');
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

    //Generate Validators
    _.each(model.fields, function (field) {
      model.xvalidate.AddValidator('_obj.' + field.name, field.caption, field.actions, _this.GetValidatorFuncs(field.validate), field.roles);
    });
  });

  //Validate and parse _config datalocks
  var validDatalocks = true;
  if(_this.Config.datalocks) for(var siteid in _this.Config.datalocks){
    var sitedatalocks = _this.Config.datalocks[siteid];
    if(_.isString(sitedatalocks)){ LogEntityError(_ERROR, 'Invalid datalocks syntax in _config for site: '+siteid); validDatalocks = false; }
    else{
      for(var datalockid in sitedatalocks){
        if(_.isString(sitedatalocks[datalockid])){ LogEntityError(_ERROR, 'Invalid datalocks syntax in _config for site: '+siteid+', datalock: '+datalockid); validDatalocks = false; }
        else ParseMultiLineProperties(sitedatalocks[datalockid],_.keys(sitedatalocks[datalockid]));
      }
    }
  }
  
  //Validate Parent/Child Bindings and generate list of Foreign Keys
  var all_foreignkeys = {};
  _.forOwn(_this.Models, function (model) {

    //Verify bindings are set up properly
    ParseAccessModels(_this, model, model.id, model.actions);

    //Check Parent / Child Relationships for Potentially Missing Foreign keys  
    if (model.tabs) {
      for (var i=0; i<model.tabs.length; i++) {
        var tab = model.tabs[i];
        var tabname = tab.name;
        var tabmodel = _this.Models[tab.target];
        if(!('actions' in tab)) tab.actions='*';
        for (var binding_child in tab.bindings) {
          if (!tabmodel) { continue; }
          if (!tabmodel.fields) LogEntityError(_ERROR, model.id + ' > Tab ' + tabname + ': Target model has no fields for binding');
          var binding_child_field = AppSrv.prototype.getFieldByName(tabmodel.fields, binding_child);
          if (!binding_child_field) LogEntityError(_ERROR, model.id + ' > Tab ' + tabname + ': Bound field "' + binding_child + '" is not defined in the target model "' + tab.target + '"');
          else if (!Helper.access(binding_child_field.actions, 'F') && !binding_child_field.key) LogEntityError(_ERROR, model.id + ' > Tab ' + tabname + ': Bound field "' + binding_child + '" in target model "' + tab.target + '" missing F access');
        }
      }
    }
    
    //Generate list of foreign keys
    _.each(model.fields, function (field) {
      if(field.name){
        if(field.foreignkey){
          if(!(field.name in all_foreignkeys)) all_foreignkeys[field.name] = [];
          all_foreignkeys[field.name].push(model.id);
        }
      }
    });
  });

  //Validate Datalocks
  if(validDatalocks) _.forOwn(_this.Models, function (model) {
    var datalockSearchOptions = {};
    if(global.jshSettings.case_insensitive_datalocks) datalockSearchOptions.caseInsensitive = true;

    for(var siteid in _this.Config.datalocks){
      if((siteid=='main') || (model.roles && model.roles[siteid] && !_.isString(model.roles[siteid]))){
        for(var datalockid in _this.Config.datalocks[siteid]){

          function skip_datalock(element, datalockid, datalockSearchOptions){ return (element && element.nodatalock && (Helper.arrayIndexOf(element.nodatalock,datalockid,datalockSearchOptions) >= 0)); }

          //----------------------

          var skip_datalock_model = skip_datalock(model, datalockid, datalockSearchOptions);
          var skip_datalock_title = skip_datalock(model.title, datalockid, datalockSearchOptions);
          var skip_datalock_title_add = model.title && skip_datalock(model.title.add, datalockid, datalockSearchOptions);
          var skip_datalock_title_edit = model.title && skip_datalock(model.title.edit, datalockid, datalockSearchOptions);

          if(skip_datalock_model) continue;

          //Check if datalocks are missing from any SQL statements that require them
          if(model.title){
            if(!skip_datalock_title) _this.CheckDatalockSQL(model, model.title.sql, 'Title');
            if(model.title.add && !skip_datalock_title_add) _this.CheckDatalockSQL(model, model.title.add.sql, 'Title.Add');
            if(model.title.edit && !skip_datalock_title_edit) _this.CheckDatalockSQL(model, model.title.edit.sql, 'Title.Edit');
          }
          //Do not require breadcrumb datalocks, because in order to access them, the keys / foreign keys already need to be validated anyway
          //if(model.breadcrumbs) _this.CheckDatalockSQL(model, model.breadcrumbs.sql, 'Breadcrumbs');
          _.each(['sqlselect','sqlinsert','sqlupdate','sqldelete','sqlexec','sqlrowcount','sqldownloadselect','sqlinsertencrypt'],
            function(sqlkey){ _this.CheckDatalockSQL(model, model[sqlkey], sqlkey); });

          _.each(model.fields, function (field) {
            var skip_datalock_lov = skip_datalock(field.lov, datalockid, datalockSearchOptions);
            var skip_datalock_default = skip_datalock(field.default, datalockid, datalockSearchOptions);

            //Check if datalocks are missing from any SQL statements that require them
            if(field.lov && !skip_datalock_lov) _.each(['sql','sql2','sqlmp'],function(sqlkey){
              if(field.lov[sqlkey]){
                _this.CheckDatalockSQL(model, field.lov[sqlkey], field.name + ' > ' + sqlkey);
                if(!field.lov.datalock || !Helper.arrayItem(field.lov.datalock,datalockid,datalockSearchOptions)) LogEntityError(_ERROR, model.id + ' > ' + field.name + ' > ' + sqlkey + ': Missing datalock '+siteid+'::'+datalockid+' on lov');
              }
            });
            if(field.default && !skip_datalock_default){
              if(field.default.sql){
                _this.CheckDatalockSQL(model, field.default.sql, field.name + ' > Default');
                if(!field.default.datalock || !Helper.arrayItem(field.default.datalock,datalockid,datalockSearchOptions)) LogEntityError(_ERROR, model.id + ' > ' + field.name + ': Missing datalock '+siteid+'::'+datalockid+' on default');
              }
            }

            //If datalock exists, continue to next field
            if(field.datalock && Helper.arrayItem(field.datalock,datalockid,datalockSearchOptions)) return;
            //Do not require datalocks on Multisel LOV
            if ((model.layout=='multisel') && field.lov) return;

            //Auto-add datalocks
            if(_this.Config.system_settings.automatic_datalocks){
              //Check if any KFC field is missing a datalock
              if(field.key) _this.AddFieldDatalock(model, field, siteid, datalockid, datalockSearchOptions);
              else if(field.foreignkey) _this.AddFieldDatalock(model, field, siteid, datalockid, datalockSearchOptions);
              else if(Helper.access(field.actions, 'C')) _this.AddFieldDatalock(model, field, siteid, datalockid, datalockSearchOptions);
              //Lovkey parameters in multisel
              else if((model.layout=='multisel') && field.lovkey) _this.AddFieldDatalock(model, field, siteid, datalockid, datalockSearchOptions);
              //Check if any custom LOV is missing a datalock
              else if(!skip_datalock_lov && ((field.lov && (field.lov.sql||field.lov.sql2||field.lov.sqlmp||field.lov.sqlselect))||(field.popuplov))) _this.AddFieldDatalock(model, field, siteid, datalockid, datalockSearchOptions);
              //Any key fields + any fields defined as foreign keys elsewhere + any LOVs
              else if(_.includes(all_keys, field.name)) _this.AddFieldDatalock(model, field, siteid, datalockid, datalockSearchOptions);
              else if(_.includes(all_foreignkeys, field.name)) _this.AddFieldDatalock(model, field, siteid, datalockid, datalockSearchOptions);
              else if(_.includes(all_lovs, field.name)) _this.AddFieldDatalock(model, field, siteid, datalockid, datalockSearchOptions);
              //Any Exec / U fields with a datalock defined
              if ((model.layout=='exec') && Helper.access(field.actions, 'U') && Helper.arrayItem(_this.Config.datalocks[siteid][datalockid],field.name,datalockSearchOptions)) _this.AddFieldDatalock(model, field, siteid, datalockid, datalockSearchOptions);

              //If datalock was added, continue to next field
              if(field.datalock && Helper.arrayItem(field.datalock,datalockid,datalockSearchOptions)) return;
            }

            //Check if any KFC field is missing a datalock
            if(field.key) LogEntityError(_ERROR, model.id + ' > ' + field.name + ': Missing datalock on key '+siteid+'::'+datalockid);
            else if(field.foreignkey) LogEntityError(_ERROR, model.id + ' > ' + field.name + ': Missing datalock on foreign key '+siteid+'::'+datalockid);
            else if(Helper.access(field.actions, 'C')) LogEntityError(_ERROR, model.id + ' > ' + field.name + ': Missing datalock on sql param '+siteid+'::'+datalockid);
            //Lovkey parameters in multisel
            else if((model.layout=='multisel') && field.lovkey) LogEntityError(_ERROR, model.id + ' > ' + field.name + ': Missing datalock on multisel lovkey '+siteid+'::'+datalockid);
            //Check if any custom LOV is missing a datalock
            else if(!skip_datalock_lov && ((field.lov && (field.lov.sql||field.lov.sql2||field.lov.sqlmp||field.lov.sqlselect))||(field.popuplov))) LogEntityError(_ERROR, model.id + ' > ' + field.name + ': Missing datalock on lov '+siteid+'::'+datalockid);
          });

        }
      }
    }
  });  
};

function ParseMultiLineProperties(obj, arr) {
  _.each(arr, function (p) { if (p in obj) obj[p] = Helper.ParseMultiLine(obj[p]); });
}

jsHarmony.prototype.AddSqlParams = function(model, element, props){
  var _this = this;
  if(!props) props = ['sql'];
  if(!element) return;
  var sql = '';
  _.each(props, function(prop){ 
    if(element[prop]) sql += AppSrv.prototype.getSQL(element[prop], _this)+' '; 
  });
  sql = sql.trim();
  if (sql && !('sql_params' in element)) {
    var params = AppSrv.prototype.getSQLParameters(sql, model.fields, _this);
    if(params.length){
      for(var i=0;i<params.length;i++){
        var pfield = AppSrv.prototype.getFieldByName(model.fields, params[i]);
        if (!Helper.access(pfield.actions, 'F') && !pfield.key){ pfield.actions += 'F'; }
      }
      element.sql_params = params;
    }
  }
}

jsHarmony.prototype.AddSqlParamsFieldFlags = function(model, element, desc){
  if (element && element.sql_params && !model.fields) LogEntityError(_ERROR, model.id + ': Cannot use '+desc+' sql_params without any fields defined.');
  else if (model.fields && element && element.sql_params) _.each(element.sql_params, function (sql_param) {
    var sql_param_field = AppSrv.prototype.getFieldByName(model.fields, sql_param);
    if (!sql_param_field) LogEntityError(_ERROR, model.id + ' > ' + sql_param + ': '+desc+' sql param "' + sql_param + '" is not defined as a field');
    else if (!Helper.access(sql_param_field.actions, 'C')) { if (!sql_param_field.actions) sql_param_field.actions = ''; sql_param_field.actions += 'C'; }
  });
}

jsHarmony.prototype.CheckDatalockSQL = function(model, sql, desc){
  if(!sql) return;
  if (!(sql.indexOf('%%%DATALOCKS%%%') >= 0)) LogEntityError(_ERROR, model.id + ' > ' + desc + ': SQL missing %%%DATALOCKS%%% in query');
}

jsHarmony.prototype.AddFieldDatalock = function(model, field, siteid, datalockid, datalockSearchOptions){
  var datalocks = this.Config.datalocks[siteid][datalockid];
  var datalockquery = Helper.arrayKey(datalocks,field.name,datalockSearchOptions);
  if(datalockquery){
    if(!field.datalock) field.datalock = {};
    field.datalock[datalockid] = datalockquery;
  }
  else LogEntityError(_ERROR, model.id + ' > ' + field.name + ': Could not auto-add datalock - please define in _config.datalocks.'+siteid+'.'+datalockid+'.'+field.name);
}

jsHarmony.prototype.AddBindings = function(model, element, elementname, options){
  //bindType: parentKey, childKey, nonKeyFields
  options = _.extend({ bindType: 'parentKey', additionalFields: [], req: null }, options);
  var _this = this;
  if('bindings' in element) return;

  //Parse target model
  if (!('target' in element)) { LogEntityError(_ERROR, model.id + ' > ' + elementname + ' Bindings: Missing target'); return }
  if (!(element.target in _this.Models)) { LogEntityError(_ERROR, model.id + ' > ' + elementname + ': Target model "' + element.target + '" not found'); return }
  var tmodel = _this.getModel(options.req, element.target);

  //Get keys in parent model
  var parentKeys = AppSrv.prototype.getKeyNames(model.fields);
  if(!parentKeys.length) { LogEntityError(_ERROR, model.id + ' > ' + elementname + ' Bindings: Parent model has no key'); return; }

  //Check for dynamic bindings
  var bindings = {};
  var found_bindings = false;
  for(var modelgroup in this.Config.dynamic_bindings){
    if(!this.isInModelGroup(tmodel.id, modelgroup)) continue;
    found_bindings = true;
    var dynamic_binding = this.Config.dynamic_bindings[modelgroup];
    //Apply dynamic bindings
    for(var childKey in dynamic_binding){
      var parentField = dynamic_binding[childKey];
      if(!_.isString(parentField)){
        for(var parentFieldCondition in dynamic_binding[childKey]){
          if(parentFieldCondition.substr(0,4)=='key:'){
            if(_.includes(parentKeys,parentFieldCondition.substr(4))) parentField = dynamic_binding[childKey][parentFieldCondition];
          }
          else { LogEntityError(_ERROR, model.id + ' > ' + elementname + ' Bindings: Invalid condition for '+childKey+': '+parentFieldCondition); return; }
        }
      }
      if(_.isString(parentField)){
        if(parentField=='key'){
          if(parentKeys.length != 1) { LogEntityError(_ERROR, model.id + ' > ' + elementname + ' Bindings: Must have one key in the parent model when dynamically binding '+childKey+' to "key"'); return } 
          parentField = parentKeys[0];
        }
        bindings[childKey] = parentField;
      }
    }
  }

  //If bindings not found
  if(!found_bindings){ 
    if(options.bindType=='nonKeyFields'){
      //Match all child fields that are not keys (for add operations)
      _.each(tmodel.fields, function(childField){
        if(childField.key) return;
        var field = null;
        //Don't bind to parent fields if the parent is a grid
        if((model.layout == 'form') || (model.layout == 'form-m') || (model.layout == 'exec')){
          field = AppSrv.prototype.getFieldByName(model.fields, childField.name);
        }
        if(field || _.includes(options.additionalFields,childField.name)){
          bindings[childField.name] = childField.name;
        }
      });
    }
    else if(options.bindType=='childKey'){
      //Match parent keys with child fields
      var childKeys = AppSrv.prototype.getKeyNames(tmodel.fields);
      _.each(childKeys, function(childKey){
        var field = AppSrv.prototype.getFieldByName(model.fields, childKey);
        if(!field) { LogEntityError(_ERROR, model.id + ' > ' + elementname + ' Bindings: Key '+childKey+' not found in parent form.  Explicitly define bindings if necessary.'); return; }
        bindings[field.name] = childKey;
      });
    }
    else{
      //Match parent keys with child fields
      _.each(parentKeys, function(parentKey){
        var field = AppSrv.prototype.getFieldByName(tmodel.fields, parentKey);
        if(!field) { LogEntityError(_ERROR, model.id + ' > ' + elementname + ' Bindings: Key '+parentKey+' not found in target form.  Explicitly define bindings if necessary.'); return; }
        bindings[field.name] = parentKey;
      });
    }
  }

  element.bindings = bindings;
  return bindings;
}

jsHarmony.prototype.isInModelGroup = function(modelid, modelgroupid){
  if(!(modelid in this.Models)) throw new Error('Invalid modelid: '+modelid);
  if(modelid==modelgroupid) return true;
  if(_.includes(this.Models[modelid].groups, modelgroupid)) return true;
  if(_.includes(this.Models[modelid]._inherits, modelgroupid)) return true;
  return false;
}

function ParseAccessModels(jsh, model, srcmodelid, srcaccess) {

  function validateSiteAccess(model, tmodel, prefix, suffix, roles){
    var childSites = _.intersection(model.sites, tmodel.sites);
    var parentSites = model.sites;
    if(roles){
      var roleSites = Helper.GetRoleSites(roles);
      childSites = _.intersection(childSites, roleSites);
      parentSites = _.intersection(parentSites, roleSites);
    }
    if(childSites.length != parentSites.length){
      LogEntityError(_ERROR, (prefix||'') + 'Target model "' + tmodel.id + '" not defined for site: '+_.difference(model.sites, _.intersection(model.sites, tmodel.sites)).join(', ') +(suffix?' in link expression "'+suffix+'"':'')); return
    }
  }

  function validateSiteLinks(model, link, prefix, suffix, roles){
    if(!link) return;
    var linkTarget = jsh.parseLink(link);
    if(!linkTarget.modelid) return;
    if(linkTarget.modelid.substr(0,3)=='js:') return;
    if (!(linkTarget.modelid in jsh.Models)) { LogEntityError(_ERROR, (prefix||'') + 'Link Target model "' + linkTarget.modelid + '" not found'+(suffix?' in link expression "'+suffix+'"':'')); return }
    var linkModel = jsh.Models[linkTarget.modelid];
    validateSiteAccess(model, linkModel, prefix, suffix, roles);
  }

  //-----------------------

  if ('tabs' in model) for (var i=0;i<model.tabs.length;i++) {
    var tab = model.tabs[i];
    var tabname = tab.name;
    if (!_.isObject(tab)) { LogEntityError(_ERROR, model.id + ' > Tab ' + tabname + ': Invalid tab format'); return }
    if (!('name' in tab)) { LogEntityError(_ERROR, model.id + ' > Tab ' + tabname + ': Invalid tab format - missing name'); return }
    if (!('target' in tab)) { LogEntityError(_ERROR, model.id + ' > Tab ' + tabname + ': Invalid tab format - missing target'); return }
    if (!('bindings' in tab)) { LogEntityError(_ERROR, model.id + ' > Tab ' + tabname + ': Invalid tab format - missing bindings'); return }
    if (!(tab.target in jsh.Models)) { LogEntityError(_ERROR, model.id + ' > Tab ' + tabname + ': Target model "' + tab.target + '" not found'); return }
    if (tab.roles) {
      if(_.isArray(tab.roles)) tab.roles = { "main": tab.roles };
      for(var siteid in tab.roles){
        if(!_.isArray(tab.roles[siteid])) { LogEntityError(_ERROR, model.id + ' > Tab ' + tabname + ': Invalid tab roles format - please use { "siteid": ["role1", "role2"] }'); return }
        //Convert tab roles into standard roles format "role":"perm"
        var rolesObj = {};
        for(var j=0;j<tab.roles[siteid].length;j++) rolesObj[tab.roles[siteid][j]] = 'B';
        tab.roles[siteid] = rolesObj;
      }
    }
    var tmodel = jsh.Models[tab.target];
    tmodel.access_models[srcmodelid] = srcaccess;
    validateSiteAccess(model, tmodel, model.id + ' > Tab ' + tabname + ': ', '', tab.roles);
    ParseAccessModels(jsh, tmodel, srcmodelid, srcaccess);
  }
  if ('duplicate' in model) {
    if (!(model.duplicate.target in jsh.Models)) { LogEntityError(_WARNING, 'Invalid duplicate model ' + model.duplicate + ' in ' + model.id); return }
    var tmodel = jsh.Models[model.duplicate.target];
    tmodel.access_models[srcmodelid] = srcaccess;
    validateSiteAccess(model, tmodel, model.id + ' > Duplicate model ' + model.duplicate + ': ', '');
    validateSiteLinks(model, model.duplicate.link, model.id + ' > Duplicate model ' + model.duplicate + ' link: ', model.duplicate.link);
    ParseAccessModels(jsh, tmodel, srcmodelid, srcaccess);
  }
  _.each(model.buttons, function (button) {
    validateSiteLinks(model, button.link, model.id + ' > Button link: ', button.link, button.roles);
  });
  _.each(model.fields, function (field) {
    if (('target' in field) && ((field.control == 'subform') || (field.popuplov))) {
      if (!(field.target in jsh.Models)) { LogEntityError(_WARNING, 'Invalid ' + field.control + ' target model ' + field.target + ' in ' + model.id); return }
      var tmodel = jsh.Models[field.target];
      tmodel.access_models[srcmodelid] = srcaccess;
      validateSiteAccess(model, tmodel, model.id + ' > ' + field.control + ': ', '', field.roles);
      validateSiteLinks(model, field.link, model.id + ' > ' + field.control + ' link: ', field.link, field.roles);
      ParseAccessModels(jsh, tmodel, srcmodelid, srcaccess);
    }
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
jsHarmony.prototype.ParseMacros = function() {
  var _this = this;
  if(!_this.Config.macros) _this.Config.macros = {};
  var macros = _this.Config.macros;
  macros['merge'] = function(){
    var args = Array.from(arguments);
    args.unshift({});
    return _.extend.apply(_,args);
  }
  var macroids = {};
  if(!macros) return;
  //Parse js functions
  for(var macroid in macros){
    var macro = macros[macroid];
    if(_.isString(macro) && (macro.substr(0,3)=='js:')){
      try{ macros[macroid] = eval('['+macro.substr(3)+']')[0]; }
      catch(ex){ LogEntityError(_ERROR, 'Macro: '+macroid+', error parsing function. '+ex.toString()); }
    }
    macroids['#'+macroid] = true;
  }
  //Execute macro (get replacement value)
  function evalMacro(macro, params){
    if(params) for(var i=0;i<params.length;i++){
      var xval = parseObject(params[i]);
      if(xval) params[i] = xval();
    }
    if(_.isFunction(macro)) return macro.apply(_this, params);
    return macro;
  }
  //Parse objects and apply macros
  function parseObject(obj){
    if(!obj) return;
    else if(_.isNumber(obj)) return;
    else if(_.isBoolean(obj)) return;
    else if(_.isString(obj)){
      if(obj in macroids) return function(){ return evalMacro(macros[obj.substr(1)]); }
    }
    else if(_.isArray(obj) && (obj.length > 0)){
      if(obj[0] in macroids){
        return function(){ return evalMacro(macros[obj[0].substr(1)], obj.splice(1)); }
      }
      else{
        for(var i=0;i<obj.length;i++){
          var xval = parseObject(obj[i]);
          if(xval) obj[i] = xval();
        }
      }
    }
    else{
      var numkeys = 0;
      var lastkey = null;
      for(var key in obj){
        numkeys++;
        lastkey = key;
        var xval = parseObject(obj[key]);
        if(xval) obj[key] = xval();
      }
      if((numkeys==1) && (lastkey in macroids)){
        return function(){ return _.extend({},evalMacro(macros[lastkey.substr(1)]),obj[lastkey]); }
      }
    }
  }
  parseObject(_this.Config);
  parseObject(_this.CustomControls);
  parseObject(_this.Models);
}



/************************
|    MANAGE EJS FILES   |
************************/
jsHarmony.prototype.getEJS = function (f, onError) {
  if (!(f in this.EJS)) this.EJS[f] = this.LoadEJS(f, onError);
  this.EJS[f] = this.LoadEJS(f, onError); //Disable caching
  return this.EJS[f];
}

jsHarmony.prototype.getEJSFilename = function (f) {
  var appDir = path.dirname(require.main.filename);
  var jshDir = path.dirname(module.filename);
  var fpath = '';
  if (f.indexOf('reports/') == 0) {
    for (var i = global.modeldir.length - 1; i >= 0; i--) {
      fpath = global.modeldir[i].path + f + '.ejs';
      if (fs.existsSync(fpath)) return fpath;
    }
  }
  fpath = appDir + '/views/' + f + '.ejs';
  if (fs.existsSync(fpath)) return fpath;
  for (var i = global.modeldir.length - 1; i >= 0; i--) {
    fpath = global.modeldir[i].path + '../views/' + f + '.ejs';
    if (fs.existsSync(fpath)) return fpath;
  }
  var fpath = jshDir + '/views/' + f + '.ejs';
  if (fs.existsSync(fpath)) return fpath;
  fpath = appDir + '/views/' + f + '.ejs';
  return fpath;
}

jsHarmony.prototype.LoadEJS = function (f, onError) {
  var fpath = this.getEJSFilename(f);
  if (!fs.existsSync(fpath)) { 
    var errmsg = "EJS path not found: " + f + " at " + fpath;
    if(onError) onError(errmsg);
    else LogEntityError(_ERROR, errmsg);
    return null; 
  }
  return fs.readFileSync(fpath, 'utf8')
}

/*******************
|    RENDER HTML   |
*******************/
jsHarmony.prototype.RenderListing = function () {
  var rslt = '<br/>&nbsp;';
  var components = { 'Local':[] };
  for (var modelid in this.Models) {
    var component = this.Models[modelid].component||'Local';
    if(!(component in components)) components[component] = [];
    components[component].push(modelid);
  }
  var has_models = false;
  for(var component in components){
    var modelids = components[component];
    modelids.sort();
    if(!modelids.length) continue;
    else has_models = true;
    rslt += '<h2>'+component+'</h2>';
    rslt += '<ul>';
    for (var i = 0; i < modelids.length; i++) {
      var modelid = modelids[i];
      rslt += '<li><a href="' + modelid + '" target="_blank">' + modelid + '</a></li>';
    }
    rslt += '</ul>';
  }
  if(!has_models) rslt += 'No models found';
  return rslt;
}

jsHarmony.prototype.getModelLinkOnClick = function (tgtmodelid, req, link_target) {
  if (!tgtmodelid) tgtmodelid = req.TopModel;
  if (!this.hasModel(req, tgtmodelid)) return '';
  var model = this.getModel(req, tgtmodelid);
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
    var rsltbtn = {};
    if (ptarget.action in _this.Config.default_buttons) {
      rsltbtn = _.merge(rsltbtn, _this.Config.default_buttons[ptarget.action]);
    }
    rsltbtn = _.merge(rsltbtn, button);
    if(!('icon' in rsltbtn) && !('text' in rsltbtn)) rsltbtn.icon = 'ok';
    rslt.push(rsltbtn);
  });
  return rslt;
}

jsHarmony.prototype.getAuxFields = function (req, res, model) {
  var firstsort = (('sort' in model)?model['sort'][0].substring(1):'');
  var rslt = [];
  if (typeof model.fields == 'undefined') return rslt;
  for (var i = 0; i < model.fields.length; i++) {
    rslt.push({});
    if (('link' in model.fields[i]) && (model.fields[i].link) && 
        (model.fields[i].link != 'select') && 
        (model.fields[i].link.substr(0, 3) != 'js:')) {
      var link = model.fields[i]['link'];
      var ptarget = this.parseLink(link);
      if (!this.hasModel(req, ptarget.modelid)) throw new Error("Link Model " + ptarget.modelid + " not found.");
      var link_model = this.getModel(req, ptarget.modelid);
      if (!Helper.HasModelAccess(req, link_model, 'BIU')) { rslt[i]['link_onclick'] = "XExt.Alert('You do not have access to this form.');return false;"; }
      else {
        if(ptarget.action=='download'){
          rslt[i]['link_onclick'] = "var url = $(this).attr('href') + '?format=js'; $('#xfileproxy').prop('src', url); return false;";
        }
        else if ('popup' in link_model) {
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
    else if (target.indexOf('download:') == 0) { action = 'download'; modelid = target.substring(9); }
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
            else{ 
              if(action == 'download') keys[keydata[0]] = '';
              else keys[keydata[0]] = keydata[0];
            }
          });
        }
      }
    }
  }
  return { 'action': action, 'modelid': modelid, 'keys': keys, 'tabs': tabs };
}

jsHarmony.prototype.parseFieldExpression = function(field, exp, params, options){
  if(!params) params = {};
  if(!options) options = {};
  var rslt = exp;
  var rparams = {};
  if(field.datatype_config && field.datatype_config.defaults) rparams = field.datatype_config.defaults;
  rparams.FIELD = field.name;
  for(var p in params) rparams[p] = params[p];
  if(('precision' in field) && _.isArray(field.precision) && (field.precision.length==2)){
    rparams.PREC_H = field.precision[0];
    rparams.PREC_L = field.precision[1];
  }
  else if(('precision' in field) && _.isInteger(field.precision)){
    rparams.PREC = field.precision;
  }
  if('length' in field) rparams.LENGTH = field.length;
  if(field.datatype_config && field.datatype_config.orig_length) rparams.LENGTH = field.datatype_config.orig_length;

  for(var rparam in rparams) rslt = Helper.ReplaceAll(rslt, '%%%'+rparam+'%%%', rparams[rparam]);

  if(options.ejs && (rslt.indexOf('<%') >= 0)){ 
    rslt = ejs.render(rslt, rparams); 
  }

  return rslt;
}

jsHarmony.prototype.getURL = function (req, target, tabs, fields, bindings, keys) {
  var ptarget = this.parseLink(target);
  var modelid = ptarget.modelid;
  var action = ptarget.action;
  if (modelid == '') modelid = req.TopModel;
  if (!this.hasModel(req, modelid)) throw new Error('Model ' + modelid + ' not found');
  var tmodel = this.getModel(req, modelid);
  if (!Helper.HasModelAccess(req, tmodel, 'BIU')) return "";
  tabs = typeof tabs !== 'undefined' ? tabs : new Object();
  var rslt = req.baseurl + modelid;
  if(req.curtabs) for(var xmodelid in req.curtabs){
    if(this.hasModel(req, xmodelid)){
      if(!(xmodelid in tabs)) { tabs[xmodelid] = req.curtabs[xmodelid]; }
    }
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

  //Handle download action
  if(action=='download'){
    var keyfield = '';
    var fieldname = '';
    if (typeof fields !== 'undefined') {
      if (_.size(ptarget.keys) > 0) {
        //Set keyfield, fieldname based on link parameters
        var ptargetkeys = _.keys(ptarget.keys);
        if(ptargetkeys.length > 1) throw new Error('Error parsing link target "' + target + '".  Multiple keys not currently supported for file downloads.');
        fieldname = ptargetkeys[0];
        keyfield = ptarget.keys[fieldname];
      }
      //Otherwise, auto-generate keyfield, fieldname based on model
      _.each(tmodel.fields,function(f){
        if(f.key && !keyfield){
          var found_field = false;
          _.each(fields,function(fsrc){ if(fsrc.name==f.name) found_field = true; });
          if(!found_field) throw new Error('Error parsing link target "' + target + '".  Target key field '+f.name+' not found in source data.');
          keyfield = f.name;
        }
        if((f.type=='file') && !fieldname){
          fieldname = f.name;
        }
      });
    }
    if(!keyfield) throw new Error('Error parsing link target "' + target + '".  Download key id not defined.');
    if(!fieldname) throw new Error('Error parsing link target "' + target + '".  Download field name not defined.');
    rslt = req.baseurl + '_dl/' + modelid + '/<#=data[j][\'' + keyfield + '\']#>/' + fieldname;
    return rslt;
  }

  //Add keys
  if ((action == 'edit') || (action == 'add') || (action == 'select')) {
    if (action == 'select') { rsltoverride = '#select'; }
    if (typeof fields !== 'undefined') {
      //Get keys
      if (_.size(ptarget.keys) > 0) {
        var ptargetkeys = _.keys(ptarget.keys);
        for (var i = 0; i < ptargetkeys.length; i++) {
          delete q[ptargetkeys[i]];
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
          if (field.key) {
            delete q[field['name']];
            rsltparams += '&amp;' + field['name'] + '=<#=data[j][\'' + field['name'] + '\']#>';
          }
        });
      }
    }
  }
  if (typeof bindings !== 'undefined') {
    _.each(bindings, function (binding, bindingid) {
      //Evaluate bindings
      delete q[bindingid];
      rsltparams += '&amp;' + bindingid + '=<#=LiteralOrCollection(' + JSON.stringify(binding).replace(/"/g, '&quot;') + ',data)#>';
    });
  }
  if (rsltoverride) return rsltoverride;
  if (!_.isEmpty(q)) rsltparams = querystring.stringify(q, '&amp;') + rsltparams;
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
    if (!this.hasModel(req, ptarget.modelid)) throw new Error("Link Model " + ptarget.modelid + " not found.");
    if (!Helper.HasModelAccess(req, this.getModel(req, ptarget.modelid), 'BIU')) return "XExt.Alert('You do not have access to this form.');return false;";
    if ((model.layout == 'form') || (model.layout == 'form-m') || (model.layout == 'exec')) {
      seturl += "url=XExt.ReplaceAll(url,'data[j]','data'); var xform = window['xform_" + model.id + "']; if(xform && xform.Data && !xform.Data.Commit()) return false; url = ParseEJS(url,'" + model.id + "'); ";
    }
    var link_model = this.getModel(req, ptarget.modelid);
    if(ptarget.action=='download'){
      rslt = "url += '?format=js'; $('#xfileproxy').prop('src', url); return false;";
    }
    else if ('popup' in link_model) {
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
jsHarmony.prototype.getModelClone = function(req, modelid, options){
  if(!options) options = {};
  var model;
  if(options.cloneLocal) model = this.getModel(req, modelid);
  else model = this.getModel(undefined, modelid);

  if(!model) return model;
  //return JSON.parse(JSON.stringify(model));
  return _.cloneDeep(model);
}
jsHarmony.prototype.getModel = function(req, modelid) {
  if(req){
    if(req.jshlocal && (modelid in req.jshlocal.Models)) return req.jshlocal.Models[modelid];
  }
  return this.Models[modelid];
}
jsHarmony.prototype.hasModel = function(req, modelid){
  //if(!req){ }
  return (modelid in this.Models);
}
jsHarmony.prototype.getTabs = function (req) {
  var curtabs = {};
  if (typeof req.query['tabs'] != 'undefined') {
    var tabs = JSON.parse(req.query['tabs']);
    for (var xmodelid in tabs) {
      if (this.hasModel(req, xmodelid)) {
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
jsHarmony.prototype.GetValidatorFuncs = function (validators) {
  var rslt = [];
  _.each(validators, function (validator) {
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