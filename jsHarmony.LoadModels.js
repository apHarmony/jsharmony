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
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var XValidate = require('jsharmony-validate');
require('./lib/ext-validation.js')(XValidate);
var Helper = require('./lib/Helper.js');
var HelperFS = require('./lib/HelperFS.js');
var jsHarmonyCodeGen = require('./lib/CodeGen.js');
var jsParser = require('./lib/JSParser.js');

module.exports = exports = {};

/*******************
|    LOAD MODELS   |
*******************/

//Get array of all model folders
exports.getModelDirs = function(){
  var rslt = [];
  for(var moduleName in this.Modules){
    var module = this.Modules[moduleName];
    var modelPath = module.getModelPath();
    if(modelPath){
      rslt.push({ module: moduleName, path: modelPath, namespace: module.namespace });
    }
  }
  return rslt;
};

exports.SetModels = function (models) { this.Models = models; };

exports.LoadModels = function (modelbasedir, modeldir, prefix, dbtype, module, options) {
  options = _.extend(options, { isBaseDir: true });
  var _this = this;
  var dbDrivers = this.getDBDrivers();
  if (typeof prefix == 'undefined') prefix = '';
  if (typeof dbtype == 'undefined') dbtype = '';
  if(!fs.existsSync(modelbasedir)){ _this.LogInit_ERROR('Model folder ' + modelbasedir + ' not found'); return; }
  var fmodels = fs.readdirSync(modelbasedir);
  for (let i in fmodels) {
    var fname = fmodels[i];
    var fpath = modelbasedir + fname;
    var fstat = fs.lstatSync(fpath);
    if(fstat.isDirectory()){
      if(options.isBaseDir){
        if(fname=='js') continue;
        if(fname=='sql') continue;
        if(fname=='public_css') continue;
      }
      _this.LoadModels(fpath + '/', modeldir, prefix + fname + '/', dbtype, module, { isBaseDir: false });
    }
    if (fname.indexOf('.json', fname.length - 5) == -1) continue;
    if (fname == '_canonical.json') continue;
    var modelname = prefix + fname.replace('.json', '');
    if (dbtype && (fname.indexOf('.' + dbtype + '.') < 0)) {
      var found_other_dbtype = false;
      _.each(dbDrivers, function (odbtype) { if (fname.indexOf('.' + odbtype + '.') >= 0) found_other_dbtype = true; });
      if (found_other_dbtype) continue;
    }
    else{
      //Model is specific to this database
      modelname = prefix + fname.replace('.' + dbtype + '.', '.').replace('.json', '');
    }
    _this.LogInit_INFO('Loading ' + modelname);
    var modelbasename = _this.getBaseModelName(modelname);
    var model = _this.ParseJSON(fpath, 'Model ' + modelname);
    if (modelbasename == '_controls') {
      for (var c in model) this.CustomControls[c] = model[c];
    }
    else if (modelbasename == '_config') {
      continue;
    }
    else {
      if (!('layout' in model) && !('inherits' in model)) {
        //Parse file as multiple-model file
        _.each(model, function (submodel, submodelname) {
          if(submodelname && (submodelname[0]=='/')) submodelname = submodelname.substr(1);
          else submodelname = prefix + submodelname;
          _this.LogInit_INFO('Loading sub-model ' + submodelname);
          _this.AddModel(submodelname, submodel, prefix, fpath, modeldir);
        });
      }
      else this.AddModel(modelname, model, prefix, fpath, modeldir);
    }
  }
};

exports.ParseJSON = function(fname, desc){
  var _this = this;
  var ftext = Helper.JSONstrip(fs.readFileSync(fname, 'utf8'));
  var rslt  = null;
  try {
    rslt = jsParser.Parse(ftext, fname).Tree;
  }
  catch (ex2) {
    _this.Log.console_error('-------------------------------------------');
    _this.Log.console_error('FATAL ERROR Parsing ' + desc + ' in ' + fname);

    if('startpos' in ex2){
      var errmsg = 'Error: Parse error on line ' + ex2.startpos.line + ', char ' + ex2.startpos.char + '\n';
      var eline = Helper.getLine(ftext, ex2.startpos.line);
      if(typeof eline != 'undefined'){
        errmsg += eline + '\n';
        for(let i=0;i<ex2.startpos.char;i++) errmsg += '-';
        errmsg += '^\n';
      }
      errmsg += ex2.message + '\n';
      errmsg += ex2.stack;
      _this.Log.console(errmsg);
    }
    else _this.Log.console(ex2);

    _this.Log.console_error('-------------------------------------------');
    process.exit(8);
    throw (ex2);
  }
  return rslt;
};

exports.MergeFolder = function (dir) {
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
  for (let i in f) {
    var fname = dir + f[i];
    _this.LogInit_INFO('Loading ' + fname);
    var ftext = fs.readFileSync(fname, 'utf8');
    rslt += ftext + '\r\n';
  }
  return rslt;
};

exports.AddModel = function (modelname, model, prefix, modelpath, modeldir) {

  function prependPropFile(prop, path){
    if (fs.existsSync(path)) {
      var fcontent = fs.readFileSync(path, 'utf8');
      if (prop in model) fcontent += '\r\n' + model[prop];
      model[prop] = fcontent;
    }
  }

  //-------------------------

  if(model===null){ delete this.Models[modelname]; return; }

  if(!prefix) prefix = '';
  var _this = this;
  model['id'] = modelname;
  model['idmd5'] = crypto.createHash('md5').update(_this.Config.frontsalt + model.id).digest('hex');
  if('namespace' in model){ _this.LogInit_ERROR(model.id + ': "namespace" attribute should not be set, it is a read-only system parameter'); }
  model._inherits = [];
  model._referencedby = [];
  model._parentmodels = { tab: {}, duplicate: {}, subform: {}, popuplov: {}, button: {} };
  model._parentbindings = {};
  model._childbindings = {};
  model._auto = {};
  if(!model.path && modelpath) model.path = modelpath;
  if(!model.module && modeldir && modeldir.module) model.module = modeldir.module;
  model.namespace = _this.getNamespace(modelname);

  model.using = model.using || [];
  if(!_.isArray(model.using)) model.using = [model.using];
  for(let i=0;i<model.using.length;i++){
    //Resolve "using" paths
    var upath = model.using[i];
    upath = _this.getCanonicalNamespace(upath, modeldir.namespace);
    model.using[i] = upath;
  }
  if(!('fields' in model)) model.fields = [];
  if('css' in model) model.css = Helper.ParseMultiLine(model.css);
  //if (modelname in this.Models) throw new Error('Cannot add ' + modelname + '.  The model already exists.')
  var modelbasedir = '';
  if(model.path) modelbasedir = path.dirname(model.path) + '/';
  if(modelbasedir){
    //var modelpathbase = modelpath.substr(0,modelpath.length-5);
    var modelpathbase = modelbasedir + _this.getBaseModelName(model.id);

    //Load JS
    prependPropFile('js',modelpathbase + '.js');
    //Load CSS
    var cssfname = (modelpathbase + '.css');
    if(model.layout=='report') cssfname = (modelpathbase + '.form.css');
    prependPropFile('css',cssfname);
    //Load EJS
    var ejsfname = (modelpathbase + '.ejs');
    if(model.layout=='report') ejsfname = (modelpathbase + '.form.ejs');
    prependPropFile('ejs',ejsfname);
    //Load Report EJS
    if(model.layout=='report'){
      prependPropFile('pageheader',modelpathbase + '.header.ejs');
      prependPropFile('pagefooter',modelpathbase + '.footer.ejs');
      prependPropFile('reportbody',modelpathbase + '.ejs');
    }
    //Load "onroute" handler
    prependPropFile('onroute',modelpathbase + '.onroute.js');
  }
  if (!('helpid' in model) && !('inherits' in model)) model.helpid = modelname;
  if ('onroute' in model) model.onroute = (new Function('routetype', 'req', 'res', 'callback', 'require', 'jsh', 'modelid', 'params', model.onroute));
  this.Models[modelname] = model;
};

exports.ParseInheritance = function () {
  var _this = this;
  var foundinheritance = true;
  //Add model groups
  _.forOwn(this.Models, function (model) {
    if(!model.groups) model.groups = [];
    if(!_.isArray(model.groups)) throw new Error(model.id + ': model.groups must be an array');
    for(var modelgroup in _this.Config.model_groups){
      if(_.includes(_this.Config.model_groups[modelgroup],model.id)) model.groups.push(modelgroup);
    }
  });
  while (foundinheritance) {
    foundinheritance = false;
    _.forOwn(this.Models, function (model) {
      if ('inherits' in model) {
        foundinheritance = true;
        var parentmodel = _this.getModel(null,model.inherits,model);
        if (!parentmodel) throw new Error('Model ' + model.id + ': Parent model ' + model.inherits + ' does not exist.');
        if (parentmodel.id == model.id) throw new Error('Model ' + model.id + ' cyclic inheritance.');
        var origparentmodel = parentmodel;
        var parentinheritance = parentmodel.inherits;
        if (typeof parentinheritance !== 'undefined') return;
        parentmodel = JSON.parse(JSON.stringify(parentmodel)); //Deep clone
        if(origparentmodel.onroute) parentmodel.onroute = origparentmodel.onroute;
        model._inherits = parentmodel._inherits.concat([model.inherits]);
        if(!_.includes(model.using, parentmodel.namespace)) model.using.push(parentmodel.namespace);

        //Add Parent Model Groups
        model.groups = _.union(parentmodel.groups, model.groups);
        model.using = _.union(parentmodel.using, model.using);

        //Merge Models
        //Extend this to enable delete existing values by making them NULL
        //Extend this to enable merging arrays, like "button", "fields", "roles" using key, other arrays just overwrite
        
        var mergedprops = {};
        EntityPropMerge(mergedprops, 'fields', model, parentmodel, function (newval, oldval) {
          return _this.MergeModelArray(newval, oldval, function(newItem, oldItem, rsltItem){
            if ('validate' in newItem) rsltItem.validate = newItem.validate;
            EntityPropMerge(rsltItem, 'roles', newItem, oldItem, function (newval, oldval) { return _.merge({}, oldval, newval); });
          });
        });
        //Create a clone of parent model instead of object reference
        if (('fields' in parentmodel) && !('fields' in model)) model.fields = parentmodel.fields.slice(0);
        EntityPropMerge(mergedprops, 'roles', model, parentmodel, function (newval, oldval) { return newval||oldval; });
        EntityPropMerge(mergedprops, 'pagesettings', model, parentmodel, function (newval, oldval) { return _.merge({}, oldval, newval); });
        EntityPropMerge(mergedprops, 'tabs', model, parentmodel, function (newval, oldval) {
          return _this.MergeModelArray(newval, oldval);
        });
        EntityPropMerge(mergedprops, 'reportdata', model, parentmodel, function (newval, oldval) { return _.extend({}, oldval, newval); });
        EntityPropMerge(mergedprops, 'js', model, parentmodel, function (newval, oldval) { return oldval + '\r\n' + newval; });
        EntityPropMerge(mergedprops, 'fonts', model, parentmodel, function (newval, oldval) { return (oldval||[]).concat(newval||[]); });
        
        //Merge Everything Else
        _this.Models[model.id] = _.extend({}, parentmodel, model);
        //Restore Merged Properties
        _.each(mergedprops, function (val, key) { _this.Models[model.id][key] = val; });
        for (var prop in _this.Models[model.id]) { if (_this.Models[model.id][prop] == '__REMOVEPROPERTY__') { delete _this.Models[model.id][prop]; } }
        delete _this.Models[model.id].inherits;
      }
    });
  }
};

function EntityPropMerge(mergedprops, prop, model, parent, mergefunc) {
  if ((prop in model) && (prop in parent)) mergedprops[prop] = mergefunc(model[prop], parent[prop]);
}

exports.MergeModelArray = function(newval, oldval, eachItem){
  var _this = this;
  try{
    var rslt = newval.slice(0);
  }
  catch(ex){
    _this.Log.console(ex);
    _this.Log.console(newval);
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
  for (let i = 0; i < rslt.length; i++) {
    if ('__REMOVE__' in rslt[i]) {
      rslt.splice(i, 1);
      i--;
    }
  }
  return rslt;
};

function SortModelArray(fields){
  var cnt = 0;
  do {
    cnt = 0;
    for(let i = 0; i < fields.length; i++) {
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

exports.LogDeprecated = function(msg) {
  if (this.Config.debug_params.hide_deprecated) return;
  this.Log.console('**DEPRECATED** ' + msg);
};

exports.TestImageMagick  = function(strField){
  var _this = this;
  _this._IMAGEMAGICK_FIELDS.push(strField); 
  if(_this._IMAGEMAGICK_FIELDS.length > 1) return;
  var imagick = require('gm').subClass({ imageMagick: true });
  if(_this.Config.system_settings.ignore_imagemagick) return;
  imagick(100,100,'white').setFormat('PNG').toBuffer(function(err,b){
    if(err) _this.LogInit_ERROR('Please install ImageMagick.  Used by: ' + _.uniq(_this._IMAGEMAGICK_FIELDS).join(', '));
  });
};

exports.ParseDeprecated = function () {
  var _this = this;
  _.forOwn(this.Models, function (model) {
    //Convert tabs to indexed format, if necessary
    if(model.tabs){
      if(!_.isArray(model.tabs)){
        _this.LogDeprecated(model.id + ': Defining tabs as an associative array has been deprecated.  Please convert to the indexed array syntax [{ "name": "TABNAME" }]');
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
};

exports.ParseCustomControls = function () {
  var _this = this;
  var queries = _this.CustomControlQueries = {};
  for(var controlname in _this.CustomControls){
    var control = _this.CustomControls[controlname];
    if(control.for){
      if(!_.isArray(control.for)) control.for = [control.for];
      for(let i=0;i<control.for.length;i++){
        var expr = control.for[i];
        if(_.isString(expr)) expr = { 'field': { 'name': expr } };
        control.for[i] = expr;
        expr = JSON.parse(JSON.stringify(expr));
        var fname = '*';
        if(expr.field && expr.field.name){
          fname = expr.field.name;
          delete expr.field.name;
          if(_.isEmpty(expr.field)) delete expr.field;
        }
        var exprstr = JSON.stringify(expr);
        if(_.isEmpty(expr)) expr = exprstr = '*';

        if(!(fname in queries)) queries[fname] = {};
        if(!(exprstr in queries[fname])) queries[fname][exprstr] = { expr: expr, controls: [] };
        queries[fname][exprstr].controls.push(controlname);
      }
    }
  }
};

exports.ApplyCustomControlQueries = function(model, field){
  var _this = this;

  function QueryJSON(obj, expr){
    if(obj===expr) return true;
    if(!obj) return false;
    if(!expr) return false;
    for(var elem in expr){
      if(expr[elem]===obj[elem]) continue;
      if(_.isString(expr[elem])||_.isString(obj[elem])) return false;
      if(_.isArray(expr[elem])){
        if(!_.isArray(obj[elem])) return false;
        if(expr[elem].length != obj[elem].length) return false;
        for(let i=0;i<expr[elem].length;i++) if(!QueryJSON(expr[elem][i],obj[elem][i])) return false;
      }
      else if(expr[elem] && obj[elem]){
        if(!QueryJSON(expr[elem],obj[elem])) return false;
      }
      else return false;
    }
    return true;
  }

  function QueryControl(expr){
    if(!expr) return false;
    if(expr=='*') return true;
    var rslt = true;
    if(expr.field){
      rslt = rslt && QueryJSON(field, expr.field);
    }
    if(expr.model){
      rslt = rslt && QueryJSON(model, expr.model);
    }
    return rslt;
  }

  function ApplyQuery(query){
    var expr = query.expr;
    if((expr=='*')||QueryControl(expr)){
      //Apply controls
      var controlnames = query.controls;
      _.each(controlnames, function(controlname){
        _this.ApplyCustomControl(field, controlname);
      });
    }
  }

  var queries = _this.CustomControlQueries;
  if(queries['*']){
    for(let exprstr in queries['*']){
      ApplyQuery(queries['*'][exprstr]);
    }
  }
  if(field.name && (field.name in queries)){
    for(let exprstr in queries[field.name]){
      ApplyQuery(queries[field.name][exprstr]);
    }
  }
};

exports.ApplyCustomControl = function(field, controlname){
  var _this = this;
  var customcontrol = _this.CustomControls[controlname];
  for (var prop in customcontrol) {
    if(prop=='for') continue;
    if(prop=='control') continue;
    if (!(prop in field)){ field[prop] = customcontrol[prop]; }
    else if (prop == 'controlclass') field[prop] = field[prop] + ' ' + customcontrol[prop];
    else { /* Do not apply */ }
  }
  if('control' in customcontrol){
    if (!('_orig_control' in field)) field['_orig_control'] = [];
    field._orig_control.push(field.control);
    field.control = customcontrol.control;
  }
};

exports.ParseEntities = function () {
  var _this = this;
  _this.ParseCustomControls();
  var codegen = new jsHarmonyCodeGen(_this);
  var base_controls = ['label', 'html', 'textbox', 'textzoom', 'dropdown', 'date', 'textarea', 'hidden', 'subform', 'html', 'password', 'file_upload', 'file_download', 'button', 'linkbutton', 'tree', 'checkbox'];
  var base_datatypes = ['DATETIME','VARCHAR','CHAR','BOOLEAN','BIGINT','INT','SMALLINT','TINYINT','DECIMAL','FLOAT','DATE','DATETIME','TIME','ENCASCII','HASH','FILE','BINARY'];
  var auto_datatypes = _this.Config.system_settings.automatic_schema && _this.Config.system_settings.automatic_schema.datatypes;
  var auto_attributes = _this.Config.system_settings.automatic_schema && _this.Config.system_settings.automatic_schema.attributes;
  var auto_controls =  _this.Config.system_settings.automatic_schema && _this.Config.system_settings.automatic_schema.controls;
  var auto_keys =  _this.Config.system_settings.automatic_schema && _this.Config.system_settings.automatic_schema.keys;
  var validation_level = { };
  switch(_this.Config.system_settings.validation_level){
    case 'strict': validation_level.strict = 1; //falls through
    default: validation_level.standard = 1;
  }

  var modelsExt = {};
  _.forOwn(this.Models, function (model) {
    //Remove null values
    for(var prop in model) if(model[prop]===null) delete model[prop];
    if(model.fields) _.each(model.fields, function(field){ for(var prop in field) if(field[prop]===null) delete field[prop]; });

    var modelExt = modelsExt[model.id] = {
      db: undefined,
      sqlext: undefined,
      tabledef: undefined,
      automodel: undefined,
      isReadOnlyGrid: undefined,
    };
    var modelDB = 'default';
    if('db' in model){
      if(!(model.db in _this.DBConfig)) _this.LogInit_ERROR('Model ' + model.id + ' uses an undefined db: '+model.db);
      else modelDB = model.db;
    }
    var db = modelExt.db = _this.DB[modelDB];
    modelExt.sqlext = db.SQLExt;
    var tabledef = modelExt.tabledef = db.getTableDefinition(model.table);

    if((model.layout=='grid') && !('commitlevel' in model)){
      if(model.actions && !Helper.hasAction(model.actions, 'IUD')) model.commitlevel = 'none';
      else if(tabledef && (tabledef.table_type=='view') && !('actions' in model)){ model.commitlevel = 'none'; }
      else model.commitlevel = 'auto';
    }
    if (!('actions' in model)){
      if((model.layout=='exec')||(model.layout=='report')||(model.layout=='multisel')) model.actions = 'BU';
      else if(model.layout=='grid'){
        if(!model.table && model.sqlselect){
          model.actions = 'B';
          if(model.sqlinsert) model.actions += 'I';
          if(model.sqlupdate) model.actions += 'U';
          if(model.sqldelete) model.actions += 'D';
        }
        else if(!model.commitlevel || model.commitlevel=='none') model.actions = 'B';
        else model.actions = 'BIUD';
      }
      else{
        if(model.unbound) model.actions = 'B';
        else model.actions = 'BIUD';
      }
    }

    var isReadOnlyGrid = modelExt.isReadOnlyGrid = (model.layout=='grid') && (!model.commitlevel || (model.commitlevel=='none') || !Helper.hasAction(model.actions, 'IU'));
    if(tabledef){
      var autolayout = '';
      if((model.layout=='form') || (model.layout=='form-m') || (model.layout=='exec') || (model.layout=='report')) autolayout = 'form';
      if(model.layout=='grid') autolayout = 'grid';
      if(model.layout=='multisel') autolayout = 'multisel';

      if(autolayout=='form'){
        if(!tabledef.modelForm) codegen.generateModelFromTableDefition(tabledef,'form',{ db: model.db },function(err,messages,model){ tabledef.modelForm = model; });
        modelExt.automodel = tabledef.modelForm;
      }
      else if((autolayout=='grid') && isReadOnlyGrid){
        if(!tabledef.modelGridReadOnly) codegen.generateModelFromTableDefition(tabledef,'grid',{ db: model.db, readonly: true },function(err,messages,model){ tabledef.modelGridReadOnly = model; });
        modelExt.automodel = tabledef.modelGridReadOnly;
      }
      else if((autolayout=='grid') && !isReadOnlyGrid){
        if(!tabledef.modelGridEditable) codegen.generateModelFromTableDefition(tabledef,'grid',{ db: model.db },function(err,messages,model){ tabledef.modelGridEditable = model; });
        modelExt.automodel = tabledef.modelGridEditable;
      }
      else if(autolayout=='multisel'){
        if(!tabledef.modelMultisel) codegen.generateModelFromTableDefition(tabledef,'multisel',{ db: model.db },function(err,messages,model){ tabledef.modelMultisel = model; });
        modelExt.automodel = tabledef.modelMultisel;
      }
    }
    model.xvalidate = new XValidate();
    if ('sites' in model) _this.LogInit_WARNING('Model ' + model.id + ' had previous "sites" attribute - overwritten by system value');
    if(model.roles){
      var roleids = _.keys(model.roles);
      for(let i=0;i<roleids.length;i++){
        var role = roleids[i];
        if(_.isString(model.roles[role])){
          if(!('main' in model.roles)) model.roles['main'] = {};
          model.roles['main'][role] = model.roles[role];
          delete model.roles[role];
        }
      }
    }
    model.sites = Helper.GetRoleSites(model.roles);
    if ((model.layout != 'exec') && (model.layout != 'report') && !('table' in model) && !(model.unbound) && !model.sqlselect) _this.LogInit_WARNING('Model ' + model.id + ' missing table - use model.unbound property if this is intentional');
    //Read-only grids should only have "B" actions
    if ((model.layout=='grid') && model.actions){
      if(!model.commitlevel || (model.commitlevel=='none')){
        if(Helper.hasAction(model.actions, 'IUD')){
          _this.LogInit_ERROR('Model ' + model.id + ' actions should be "B" if it is a read-only grid and "commitlevel" is not set');
        }
      }
    }
    //Add Model caption if not set
    var originalCaption = true;
    if (!('caption' in model)) {
      model.caption = ['', model.id, model.id];
      originalCaption = false;
      if(!model.unbound && (model.layout != 'exec') && (model.layout != 'report') && validation_level.strict) _this.LogInit_WARNING('Model ' + model.id + ' missing caption');
    }
    if(!model.caption) model.caption = ['','',''];
    else if(_.isString(model.caption) || !_.isArray(model.caption)) model.caption = ['',model.caption,model.caption];
    else if(model.caption.length==1) model.caption = ['',model.caption[0],model.caption[0]];
    else if(model.caption.length==2) model.caption = ['',model.caption[0],model.caption[1]];

    model.class = Helper.getClassName(model.id);

    if(model.tabs && !('tabpos' in model)) model.tabpos = 'bottom';

    if (!('title' in model)){
      if(model.tabs && model.tabs.length && model.tabpos && (model.tabpos=='top')){ /* No action */ }
      else {
        if(!originalCaption && 
          tabledef && tabledef.description && 
          _this.Config.system_settings.automatic_schema && _this.Config.system_settings.automatic_schema.metadata_captions) model.title = tabledef.description;
        else if((model.layout == 'grid') || (model.layout == 'multisel')) model.title = model.caption[2];
        else model.title = model.caption[1];
      }
    }
    if (!('ejs' in model)) model.ejs = '';
    if (!('templates' in model)) model.templates = {};
    if ('sort' in model) {
      if (model.sort && model.sort.length) {
        for (let i = 0; i < model.sort.length; i++) {
          if (!_.isString(model.sort[i])) {
            var j = 0;
            for (let f in model.sort[i]) {
              var sortval = '';
              var dir = model.sort[i][f].toLowerCase();
              if (dir == 'asc') sortval = '^' + f;
              else if (dir == 'desc') sortval = 'v' + f;
              else _this.LogInit_ERROR(model.id + ': Invalid sort direction for ' + f);
              model.sort.splice(i + 1 + j, 0, sortval);
              j++;
            }
            model.sort.splice(i, 1);
          }
        }
      }
    }
    //Auto-add primary key
    var foundkey = false;
    _.each(model.fields, function (field) {
      if(field.key) foundkey = true;
    });
    if (!foundkey && (model.layout != 'exec') && (model.layout != 'report') && !model.unbound && !model.nokey){
      if(auto_attributes && tabledef){
        _.each(model.fields, function (field) {
          var fielddef = db.getFieldDefinition(model.table, field.name,tabledef);
          if(fielddef && fielddef.coldef && fielddef.coldef.primary_key){
            field.key = 1;
            foundkey = true;
            model._auto.primary_key = 1;
          }
        });
      }
      //Add Primary Key if Key is not Found
      if(!foundkey && auto_keys && tabledef){
        _.each(tabledef.fields, function(fielddef){
          if(fielddef.coldef && fielddef.coldef.primary_key){
            model.fields.push({ 
              name: fielddef.name, 
              key: 1,
              control: 'hidden'
            });
            foundkey = true;
            model._auto.primary_key = 1;
          }
        });
      }
      if(!foundkey && !isReadOnlyGrid){
        _this.LogInit_WARNING('Model ' + model.id + ' missing key - use model.unbound or model.nokey properties if this is intentional');
      }
    }
  });
  //Automatically add bindings
  _.forOwn(this.Models, function (model) {
    if(_this.Config.system_settings.automatic_bindings || auto_keys){
      if(('nokey' in model) && (model.nokey)){ /* No action */ }
      else{
        if ('tabs' in model) for (let i=0;i<model.tabs.length;i++) {
          var tab = model.tabs[i]; //tab.target, tab.bindings
          if(_this.Config.system_settings.automatic_bindings){
            _this.AddAutomaticBindings(model, tab, 'Tab '+(tab.name||''), { modelsExt: modelsExt, noErrorOnMissingParentKey: true, log: function(msg){ _this.LogInit_ERROR(msg); } });
          }
          _this.AddBindingFields(model, tab, 'Tab '+(tab.name||''), modelsExt);
        }
        if ('duplicate' in model) {
          //duplicate.target, duplicate,bindings
          if(_this.Config.system_settings.automatic_bindings){
            _this.AddAutomaticBindings(model, model.duplicate, 'Duplicate action', { modelsExt: modelsExt, noErrorOnMissingParentKey: true, log: function(msg){ _this.LogInit_ERROR(msg); } });
          }
          _this.AddBindingFields(model, model.duplicate, 'Duplicate action', modelsExt);
        }
        if ('buttons' in model) for (let i=0;i<model.buttons.length;i++) {
          var button = model.buttons[i]; //button.target, button.bindings
          if(button.link){
            var linkTarget = _this.parseLink(button.link);
            if((linkTarget.action!='update')&&(linkTarget.action!='browse')) continue;
            if(!linkTarget.modelid) continue;
            if(linkTarget.modelid.substr(0,3)=='js:') continue;
            var linkModel = _this.getModel(null,linkTarget.modelid,model);
            if(linkModel){
              button.target = linkModel.id;
              if(_this.Config.system_settings.automatic_bindings && !('bindings' in button)){
                _this.AddAutomaticBindings(model, button, 'Button '+button.link, { modelsExt: modelsExt, noErrorOnMissingParentKey: true, log: function(msg){ _this.LogInit_ERROR(msg); } });
                if(button.bindings) button._auto = _.extend(button._auto,{ bindings: 1 });
              }
              _this.AddBindingFields(model, button, 'Button '+button.link, modelsExt);
            }
          }
        }
        _.each(model.fields, function (field) {
          //Note: field.popuplov.target has not been converted to field.target at this point
          if (field.control == 'subform') {
            if(!field.name){
              var fieldName = Helper.getClassName(field.target);
              if(fieldName){
                var conflictField = _this.AppSrvClass.prototype.getFieldByName(model.fields, fieldName);
                if(!conflictField){
                  field.name = fieldName;
                }
                else _this.LogInit_ERROR(model.id + ' > Subform ' + field.target + ' has conflicting name with another field.  Explicity set field.name.');
              }
            }
            if(_this.Config.system_settings.automatic_bindings){
              _this.AddAutomaticBindings(model, field, 'Subform '+field.name, { modelsExt: modelsExt, noErrorOnMissingParentKey: true, log: function(msg){ _this.LogInit_ERROR(msg); } });
            }
            _this.AddBindingFields(model, field, 'Subform '+field.name, modelsExt);
          }
        });
      }
    }
  });

  function LogBindings(model, element){
    if(!element.bindings) return;
    var tmodel = _this.getModel(null, element.target, model);
    for(var childField in element.bindings){
      var parentField = element.bindings[childField];
      model._parentbindings[parentField] = 1;
      if(tmodel) tmodel._childbindings[childField] = 1;
    }
  }

  //Generate a list of parent / child bindings
  var all_keys = {};
  _.forOwn(this.Models, function (model) {
    _.each(model.tabs, function(tab){ LogBindings(model, tab); });
    _.each(model.buttons, function(button){
      LogBindings(model, button);
      //Delete automatically generated button bindings, so they can be bound at run-time
      if(button._auto && button._auto.bindings) delete button.bindings;
    });
    if(model.duplicate) LogBindings(model, model.duplicate);
    _.each(model.fields, function(field){ if((field.control=='subform')||field.popuplov) LogBindings(model, field); });
    _.each(model.fields, function (field) {
      if(field.name){
        if(field.key){
          if(!(field.name in all_keys)) all_keys[field.name] = [];
          all_keys[field.name].push(model.id);
        }
      }
    });
  });
  _.forOwn(this.Models, function (model) {
    //Initialize data from previous loop
    var modelExt = modelsExt[model.id];
    var db = modelExt.db;
    var sqlext = modelExt.sqlext;
    var tabledef = modelExt.tabledef;
    var automodel = modelExt.automodel;
    var isReadOnlyGrid = modelExt.isReadOnlyGrid;
    //Parse fields
    var firstfield = true;
    var fieldnames = [];
    _.each(model.fields, function (field) {
      field._auto = field._auto || {};
      var fielddef = db.getFieldDefinition(model.table, field.name,tabledef);
      var coldef = undefined;
      if(fielddef) coldef = fielddef.coldef;
      if(fielddef && _this.Config.system_settings.automatic_schema){
        var autofield = undefined;
        if(automodel){
          for(let i=0;i<automodel.fields.length;i++){
            if(automodel.fields[i].name.toLowerCase()==field.name.toLowerCase()){ autofield = automodel.fields[i]; break; }
          }
          if(autofield){
            //List of Values
            if(_this.Config.system_settings.automatic_schema.lovs){
              if(!('lov' in field) && autofield.lov){
                field.lov = autofield.lov;
                if(field.lov.parent){
                  var foundparent = false;
                  _.each(model.fields, function(pfield){ if(pfield.name && (pfield.name.toLowerCase()==field.lov.parent)) foundparent = true; });
                  var isReadOnlyField = isReadOnlyGrid || (field.actions && !Helper.hasAction(field.actions, 'IU')) || _.includes(['label','button','linkbutton'], field.control);
                  if(!foundparent && !isReadOnlyField){
                    _this.LogInit_WARNING(model.id + ' > ' + field.name + ': Cannot initialize List of Values (LOV) - Parent field missing: '+field.lov.parent);
                    delete field.lov;
                    //Reset to textbox
                    if(auto_controls && !('control' in field) && (autofield.control=='dropdown')){
                      field.control = 'textbox';
                      field._auto.control = true;
                    }
                  }
                }
              }
            }
            //Control
            if(auto_controls){
              if(!('control' in field) && autofield.control && (!('actions' in field) || Helper.hasAction(field.actions, 'B'))){
                //Field Control
                if(('lov' in field) && !isReadOnlyGrid) field.control = 'dropdown';
                else if('type' in field){ codegen.applyControlDefaults(model.layout, isReadOnlyGrid || (('actions' in field) && !Helper.hasAction(field.actions, 'IU')) || (!('actions' in field) && coldef.readonly), sqlext, field); }
                else{
                  field.control = autofield.control;
                  if(autofield.captionclass) field.captionclass = autofield.captionclass + ' ' + (field.captionclass||'');
                }
                field._auto.control = true;
                
              }
            }
            if(auto_attributes){
              //Required Field Validation
              if(autofield.validate){
                if(!('validate' in field)){
                  field.validate = [];
                  for(let i=0;i<autofield.validate.length;i++) field.validate.push(autofield.validate[i]);
                }
              }
              //Add Foreign Key to Multisel
              if(model.layout=='multisel'){
                if(field.key) { /* No action */ }
                else if(field.lov) { /* No action */ }
                else if(autofield.foreignkeys && autofield.foreignkeys.direct && autofield.foreignkeys.direct.length) field.foreignkey = 1;
              }
            }
          }
        }

        //Field Datatypes
        if(auto_datatypes){
          if(fielddef.type && !('type' in field)) field.type = fielddef.type;
          if(fielddef.length && !('length' in field)) field.length = fielddef.length;
          if(fielddef.precision && !('precision' in field)) field.precision = fielddef.precision;
        }
        //Field Caption from DB Metadata
        if(_this.Config.system_settings.automatic_schema.metadata_captions){
          if(coldef.description && !('caption' in field)) field.caption = coldef.description;
        }
      }
      _this.ApplyCustomControlQueries(model, field);
      if ('control' in field) {
        //Parse and apply Custom Controls
        while (base_controls.indexOf(field.control) < 0) {
          if (!(field.control in _this.CustomControls)) throw new Error('Control not defined: ' + field.control + ' in ' + model.id + ': ' + JSON.stringify(field));
          _this.ApplyCustomControl(field, field.control);
        }
        //Apply Custom Controls with Query Expressions
      }
      if (field.name === '') delete field.name;
      //Apply default actions
      if (!('actions' in field)){
        if(field.key && !model._auto.primary_key && (model.layout != 'multisel') && !isReadOnlyGrid && tabledef && (tabledef.table_type=='table') && Helper.hasAction(model.actions, 'I')){
          if(fielddef && fielddef.coldef && !fielddef.coldef.primary_key && !fielddef.coldef.readonly){
            field._auto.actions = 1;
            field.actions = 'BI';
          }
        }
      }
      if (!('actions' in field)) {
        field._auto.actions = 1;
        field.actions = '';
        if((model.layout=='grid') && ((field.type=='encascii')||(field.type=='hash'))){
          if(field.control) field.actions = 'B';
          else field.actions = '';
        }
        else if(field.type=='hash'){
          if(field.control) field.actions = 'B';
          else field.actions = '';
        }
        else if ((field.control == 'html') || (field.control == 'button') || (field.control == 'linkbutton')) field.actions = 'B';
        else {
          if (model.layout=='grid'){
            if(isReadOnlyGrid){
              //Read-only grid
              field.actions = 'B';
            }
            else {
              //Editable grid
              if(field.key) field.actions = 'B';
              else if(auto_attributes && coldef && coldef.readonly) field.actions ='B';
              else if(field.control=='label') field.actions = 'B';
              else if(model._parentbindings[field.name] || model._childbindings[field.name]) field.actions = 'BI';
              else field.actions = 'BIU';
            }
          }
          else if(model.layout=='form'){
            if(field.key) field.actions = 'B';
            else if(field.type=='file') field.actions = 'BIU';
            else if(auto_attributes && coldef && coldef.readonly) field.actions ='B';
            else if(field.control=='label') field.actions = 'B';
            else if(model._parentbindings[field.name] || model._childbindings[field.name]) field.actions = 'BI';
            else if(!('name' in field) && !('control' in field)) field.actions = 'B';
            //else if(!('control' in field)) field.actions = 'B';
            else field.actions = 'BIU';
          }
          else if(model.layout=='form-m'){
            if(field.key) field.actions = 'B';
            else if(field.foreignkey && !('control' in field)) field.actions = 'I';
            else if(auto_attributes && coldef && coldef.readonly) field.actions ='B';
            else if(field.control=='label') field.actions = 'B';
            else if(model._parentbindings[field.name] || model._childbindings[field.name]) field.actions = 'BI';
            else field.actions = 'BIU';
          }
          else if(model.layout=='multisel'){
            if(field.key) { /* No action */ }
            else if(field.foreignkey) { /* No action */ }
            else field.actions = 'B';
          }
          else if((model.layout=='exec')||(model.layout=='report')){
            if(field.key) field.actions = 'B';
            else if(!('control' in field)) field.actions = 'B';
            else if(auto_attributes && coldef && coldef.readonly) field.actions ='B';
            else if(field.control=='label') field.actions = 'B';
            else field.actions = 'BIU';
          }
          //_this.LogInit_WARNING('Model ' + model.id + ' Field ' + (field.name || field.caption || JSON.stringify(field)) + ' missing actions - defaulting to "'+field.actions+'"');
        }
      }
      if(field.name && !('type' in field) && Helper.hasAction(field.actions, 'BIUD')){
        if(!field.value && !field.html && !_.includes(['subform','html'],field.control)){
          field.type = 'varchar';
          if(!('length' in field)) field.length = -1;
        }
      }
      if(!('control' in field)){
        if(auto_controls){
          if(field.type=='file'){
            if(model.layout=='grid') field.control = 'file_download';
            else field.control = 'file_upload';
          }
          else if(('lov' in field) && !isReadOnlyGrid) field.control = 'dropdown';
          else if((model.layout=='form')||(model.layout=='form-m')||(model.layout=='exec')||(model.layout=='report')){
            if(Helper.hasAction(field.actions, 'B') && !field.value && !field.html){
              if(Helper.hasAction(field.actions, 'IU')){
                codegen.applyControlDefaults(model.layout, false, sqlext, field);
              }
              else field.control = 'label';
            }
          }
          if('control' in field) field._auto.control = true;
        }
      }
      if((field.type=='date') && !('format' in field) && (((model.layout=='grid') && !field.control) || (field.control=='label'))){
        field.format = ["date","YYYY-MM-DD"]; 
      }
      if((field.type=='time') && !('format' in field) && (((model.layout=='grid') && !field.control) || (field.control=='label'))){
        field.format = ["time","HH:mm:ss"]; 
      }
      if(!('caption' in field)){
        if(_.includes(['subform'],field.control)) field.caption = '';
        else if(_.includes(['linkbutton','button'],field.control) && ('value' in field)){
          if(model.layout=='grid') field.caption = field.value;
          else field.caption = '';
        }
        else if ('name' in field) {
          if (('control' in field) && (field.control == 'hidden')) field.caption = '';
          else field.caption = field.name;
        }
      }
      if(_.includes(['linkbutton','button'],field.control) && ('caption' in field) && !('value' in field)) field.value = field.caption;
      if((field.control=='subform') && !(field.controlparams && ('insert_link' in field.controlparams))){
        var tmodel = _this.getModel(null, field.target, model);
        if(tmodel && Helper.hasAction(tmodel.actions, 'I')){
          if(!field.controlparams) field.controlparams = {};
          field.controlparams.insert_link = 'insert:'+field.target;
        }
      }
      if(model.onecolumn){
        if((model.layout=='form')||(model.layout=='form-m')||(model.layout=='exec')||(model.layout=='report')){
          if(!firstfield && ('control' in field)) field.nl = 1;
        }
      }
      if(!('datatype_config' in field)) field.datatype_config = {};
      if ('name' in field) {
        //if (_.includes(fieldnames, field.name)) { throw new Error("Duplicate field " + field.name + " in model " + model.id + "."); }
        if (_.includes(fieldnames, field.name)) { _this.LogInit_ERROR('Duplicate field ' + field.name + ' in model ' + model.id + '.'); }
        fieldnames.push(field.name);
      }
      if (field.key) { 
        field.actions += 'K'; 
        if(Helper.hasAction(field.actions, 'F') || field.foreignkey){ _this.LogInit_WARNING(model.id + ' > ' + field.name + ': Key field should not also have foreignkey attribute.'); }
      }
      if ('__REMOVEFIELD__' in field){ 
        _this.LogDeprecated(model.id + ' > ' + field.name + ': __REMOVEFIELD__ has been deprecated.  Please use __REMOVE__ instead.'); 
        field.__REMOVE__ = field.__REMOVEFIELD__;
        delete field.__REMOVEFIELD__;
      }
      if (field.controlparams) {
        if (field.controlparams.CODEVal) { field.controlparams.codeval = field.controlparams.CODEVal; delete field.controlparams.CODEVal; }
        if ('codeval' in field.controlparams) _this.LogDeprecated(model.id + ' > ' + field.name + ': The controlparams codeval attribute has been deprecated - use "popuplov":{...}');
        if ('popupstyle' in field.controlparams) _this.LogDeprecated(model.id + ' > ' + field.name + ': The controlparams popupstyle attribute has been deprecated - use "popuplov":{...}');
        if ('popupiconstyle' in field.controlparams) _this.LogDeprecated(model.id + ' > ' + field.name + ': The controlparams popupiconstyle attribute has been deprecated - use "popuplov":{...}');
        if ('popup_copy_results' in field.controlparams) _this.LogDeprecated(model.id + ' > ' + field.name + ': The controlparams popup_copy_results attribute has been deprecated - use "popuplov":{...}');
        if ('base_readonly' in field.controlparams) _this.LogDeprecated(model.id + ' > ' + field.name + ': The controlparams base_readonly attribute has been deprecated - use "popuplov":{...}');
        if ('onpopup' in field.controlparams) _this.LogDeprecated(model.id + ' > ' + field.name + ': The controlparams onpopup attribute has been deprecated - use "popuplov":{...}');
        if (('image' in field.controlparams) && Helper.hasAction(field.actions, 'IU') && (field.controlparams.image.resize || field.controlparams.image.crop)) _this.TestImageMagick(model.id + ' > ' + field.name);
        if (('thumbnails' in field.controlparams) && Helper.hasAction(field.actions, 'IU')) _.each(field.controlparams.thumbnails,function(thumbnail){ if(thumbnail.resize || thumbnail.crop) _this.TestImageMagick(model.id + ' > ' + field.name); });
      }
      if ('popuplov' in field) {
        if (field.popuplov.CODEVal) { field.popuplov.codeval = field.popuplov.CODEVal; delete field.popuplov.CODEVal; }
        _.forOwn(field.popuplov, function (val, key) {
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
        if(!Helper.hasAction(field.actions, 'F')){
          if(_this.Config.system_settings.automatic_parameters){
            var add_foreignkey = false;
            //Disabled this check, because lov's with "nodatalock" should not be tagged with the foreign key
            //if (('control' in field) && ((field.lov && (field.lov.sql||field.lov.sql2||field.lov.sqlmp||field.lov.sqlselect))||(field.popuplov))){ add_foreignkey = 'lov'; }
            //Check if the field is in the list of key fields
            if (field.name && (field.name in all_keys)){ add_foreignkey = 'key'; }
            //Do not add foreign keys for Multisel LOV
            if ((model.layout=='multisel') && field.lov) add_foreignkey = false;
            if(add_foreignkey){
              if(!field.foreignkey) _this.LogInit_INFO('Adding foreign key : ' + model.id + ' > ' + field.name + ' || ' + add_foreignkey); //_INFO
              field.foreignkey = 1;
            }
          }
          if (field.foreignkey) { field.actions += 'F'; }
        }
        else if(Helper.hasAction(field.actions, 'F')){
          _this.LogDeprecated(model.id + ' > ' + field.name + ': "F" action has been deprecated.  Please use foreignkey instead, or automatic parameters.');
          field.foreignkey = 1;
        }
      }

      //Initialize file control
      if(field.control=='file_upload'){
        if (!('controlparams' in field)) field.controlparams = {};
        if (!('sqlparams' in field.controlparams)) field.controlparams.sqlparams = {};
        if(('image' in field.controlparams)||('thumbnails' in field.controlparams)){
          if (!('preview_button' in field.controlparams)) field.controlparams.preview_button = 'View';
        }
        else{
          if (!('download_button' in field.controlparams)) field.controlparams.download_button = 'Download';
        }
        if(!('upload_button' in field.controlparams)) field.controlparams.upload_button = 'Upload';
        if(!('delete_button' in field.controlparams)) field.controlparams.delete_button = 'Delete';
        if(!field.controlparams.sqlparams.FILE_EXT) field.controlparams._data_file_has_extension = true;
      }
      else if(field.control=='file_download'){
        if (!('controlparams' in field)) field.controlparams = {};
        if (!('sqlparams' in field.controlparams)) field.controlparams.sqlparams = {};
        if (!('download_button' in field.controlparams)) field.controlparams.download_button = 'Download';
        if(!field.controlparams.sqlparams.FILE_EXT) field.controlparams._data_file_has_extension = true;
      }

      //Apply "enable_search" property
      if(Helper.hasAction(field.actions, 'S')){
        _this.LogDeprecated(model.id + ' > ' + field.name + ': "S" action has been deprecated.  Please use the enable_search property instead.');
        field.enable_search = 1;
      }
      else if(field.enable_search) field.actions += 'S';

      //Resolve Custom Types / Apply additional properties inherited from DataType definition
      codegen.resolveType(sqlext, field);

      //Add Default Datatype Validation
      if ('type' in field) {
        switch (field.type.toUpperCase()) {
          case 'NVARCHAR':
            _this.LogDeprecated(model.id + ' > ' + field.name + ': The NVARCHAR type has been deprecated - use VARCHAR');
            field.type = 'varchar';
            break;
          case 'DATETIME2':
            _this.LogDeprecated(model.id + ' > ' + field.name + ': The DATETIME2 type has been deprecated - use DATETIME');
            field.type = 'datetime';
            break;
        }
        if(!_.includes(base_datatypes,field.type.toUpperCase())){
          _this.LogInit_ERROR('Model ' + model.id + ' Field ' + field.name + ' Invalid data type ' + field.type);
          //throw new Error('Data type ' + field.type + ' not recognized');
        }
        if (field.sql_from_db) field.sql_from_db = _this.parseFieldExpression(field, field.sql_from_db, {}, { ejs:true });
        if (field.sql_to_db) field.sql_to_db = _this.parseFieldExpression(field, field.sql_to_db, {}, { ejs:true });
        if (field.sqlsort) field.sqlsort = _this.parseFieldExpression(field, field.sqlsort, {}, { ejs:true });
        if (field.sqlsearch) field.sqlsearch = _this.parseFieldExpression(field, field.sqlsearch, {}, { ejs:true });
        if (field.sqlsearch_to_db) field.sqlsearch = _this.parseFieldExpression(field, field.sqlsearch_to_db, {}, { ejs:true });
        var has_datatype_validator = false;
        if (field.datatype_config){
          if(field.datatype_config.override_length){
            field.datatype_config.orig_length = field.length;
            field.length = field.datatype_config.override_length;
          }
          if(field.datatype_config.validate){
            has_datatype_validator = true;
            for(let i=0;i<field.datatype_config.validate.length;i++){
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
              if (!field.controlparams || !field.controlparams.data_folder) { _this.LogInit_ERROR('Model ' + model.id + ' Field ' + (field.name || '') + ' missing field.controlparams.data_folder'); }
              HelperFS.createFolderIfNotExists(_this.Config.datadir + field.controlparams.data_folder, function () { });
              break;
            case 'BINARY':
              var flen = -1;
              if (('length' in field) && (field.length >= 0)) flen = field.length;
              AddValidation(field, 'IsBinary:'+flen);
              break;
          }
        }
      }
      if(field.control && field.actions &&  !field.virtual && Helper.hasAction(field.actions, 'BIUD') && (field.control!='hidden')) firstfield = false;
    });
    
    //**DEPRECATED MESSAGES**
    if (model.fields) _.each(model.fields, function (field) {
      if (field.actions && Helper.hasAction(field.actions, 'C')) _this.LogDeprecated(model.id + ' > ' + field.name + ': Action \'C\' has been deprecated - use breadcrumbs.sql_params');
      if ('hidden' in field) _this.LogDeprecated(model.id + ' > ' + field.name + ': The hidden attribute has been deprecated - use "control":"hidden"');
      if ('html' in field) _this.LogDeprecated(model.id + ' > ' + field.name + ': The html attribute has been deprecated - use "control":"html"');
      if ('lovkey' in field) _this.LogDeprecated(model.id + ' > ' + field.name + ': The lovkey attribute has been deprecated');
    });

    //Check multisel
    if(model.layout=='multisel'){
      var lovfield = '';
      _.each(model.fields, function(field){
        if(field.lov){ 
          if(lovfield != '') _this.LogInit_ERROR('Model ' + model.id + ': Can only have one LOV per Multisel');
          lovfield = field.name; 
        }
      });
      if(lovfield == '') _this.LogInit_ERROR('Model ' + model.id + ': Multisel requires one LOV');
    }
    
    //Convert mutli-line variables to single string
    ParseMultiLineProperties(model, ['js', 'sqlselect', 'sqldownloadselect', 'sqlinsert', 'sqlinsertencrypt', 'sqlupdate', 'sqldelete', 'sqlexec', 'sqlwhere', 'oninit', 'onload', 'onloadimmediate', 'oninsert', 'onvalidate', 'onupdate', 'ondestroy', 'oncommit']);
    if (model.breadcrumbs) ParseMultiLineProperties(model.breadcrumbs, ['sql']);
    if (model.fields) _.each(model.fields, function (field) {
      ParseMultiLineProperties(field, ['onchange', 'sqlselect', 'sqlupdate', 'sqlinsert', 'sqlwhere', 'sqlsort', 'sqlsearch', 'sqlsearchsound', 'value']);
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
      if(model.breadcrumbs){
        _this.AddSqlParams(model, model.breadcrumbs);
        _this.AddSqlParams(model, model.breadcrumbs.insert);
        _this.AddSqlParams(model, model.breadcrumbs.update);
        _this.AddSqlParams(model, model.breadcrumbs.browse);
      }
      if(model.title){
        _this.AddSqlParams(model, model.title);
        _this.AddSqlParams(model, model.title.insert);
        _this.AddSqlParams(model, model.title.update);
        _this.AddSqlParams(model, model.title.browse);
      }
    }
    
    //Automatically add lovkey based on lov.sqlparams
    if (model.fields) _.each(model.fields, function (field) {
      if (field.lov && field.lov.sql_params) {
        _.each(field.lov.sql_params, function (sql_param) {
          //Get field
          var sql_param_field = _this.AppSrvClass.prototype.getFieldByName(model.fields, sql_param);
          if (!sql_param_field) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': LOV sql param "' + sql_param + '" is not defined as a field');
          else if (!sql_param_field.key && !sql_param_field.lovkey) { sql_param_field.lovkey = 1; }
        });
      }
      //Add C for any LOV field that can be used in truncate_lov
      if(field.lov){
        var lov = field.lov;
        if((model.layout=='form')||(model.layout=='form-m')||(model.layout=='exec')||(model.layout=='report')){
          if(!field.always_editable_on_insert && Helper.hasAction(model.actions, 'I') && Helper.hasAction(field.actions, 'I')){
            if(lov.sql||lov.sql2||lov.sqlmp||lov.sqlselect){
              if (!Helper.hasAction(field.actions, 'C')) { if (!field.actions) field.actions = ''; field.actions += 'C'; }
            }
          }
        }
        if(lov.sqlselect && !('sqlselect_params' in lov)){
          lov.sqlselect_params = [];
          _this.forEachSqlParam(model, lov.sqlselect, function(pfield_name, pfield){ lov.sqlselect_params.push(pfield_name); });
        }
      }
      //Check if sqltruncate also has %%%TRUNCATE%%% in sql
      if(field.lov){
        if(('sql' in lov) || ('sql2' in lov) || ('sqlmp' in lov)){
          var lovsql = (lov.sql||'')+(lov.sql2||'')+(lov.sqlmp||'');
          if(lov.sqltruncate && (lovsql.indexOf('%%%TRUNCATE%%%') < 0)){
            _this.LogInit_ERROR(model.id + ' > ' + field.name + ': LOV uses sqltruncate without adding %%%TRUNCATE%%% to SQL');
          }
        }
        else if(lov.sqltruncate){
          _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Cannot use sqltruncate without sql, sql2, or sqlmp');
        }
      }
    });
    
    //Automatically add C (breadcrumb parameter) for breadcrumb and title sql_params
    if(model.breadcrumbs){
      _this.AddSqlParamsFieldFlags(model, model.breadcrumbs, 'Breadcrumbs');
      _this.AddSqlParamsFieldFlags(model, model.breadcrumbs.insert, 'Breadcrumbs.Insert');
      _this.AddSqlParamsFieldFlags(model, model.breadcrumbs.update, 'Breadcrumbs.Update');
      _this.AddSqlParamsFieldFlags(model, model.breadcrumbs.browse, 'Breadcrumbs.Browse');
    }
    if(model.title){
      _this.AddSqlParamsFieldFlags(model, model.title, 'Title');
      _this.AddSqlParamsFieldFlags(model, model.title.insert, 'Title.Insert');
      _this.AddSqlParamsFieldFlags(model, model.title.update, 'Title.Update');
      _this.AddSqlParamsFieldFlags(model, model.title.browse, 'Title.Browse');
    }

    //Automatically add C based on default fields
    if(model.fields){
      var default_params = [];
      var default_params_desc = {};
      _.each(model.fields,function(field){
        if(field.default && field.default.sql_params){
          _.each(field.default.sql_params, function(default_param){
            if(!(default_param in default_params)){
              default_params.push(default_param);
              default_params_desc[default_param] = field.name;
            }
          });
        }
      });
      _.each(default_params,function(sql_param){
        var sql_param_field = _this.AppSrvClass.prototype.getFieldByName(model.fields, sql_param);
        if (!sql_param_field) _this.LogInit_ERROR(model.id + ' > ' + default_params_desc[sql_param] + ': Default sql param "' + sql_param + '" is not defined as a field');
        else if (!Helper.hasAction(sql_param_field.actions, 'C')) { if (!sql_param_field.actions) sql_param_field.actions = ''; sql_param_field.actions += 'C'; }
      });
    }

    //Validate Model and Field Parameters
    var _v_model = [
      'comment', 'layout', 'title', 'table', 'actions', 'roles', 'caption', 'sort', 'dev', 'sites', 'class', 'using',
      'samplerepeat', 'menu', 'id', 'idmd5', '_inherits', '_referencedby', '_parentbindings', '_childbindings', '_parentmodels', '_auto', 'groups', 'helpid', 'querystring', 'buttons', 'xvalidate',
      'pagesettings', 'pageheader', 'pageheaderjs', 'reportbody', 'headerheight', 'pagefooter', 'pagefooterjs', 'zoom', 'reportdata', 'description', 'template', 'fields', 'jobqueue', 'batch', 'fonts',
      'hide_system_buttons', 'grid_expand_search', 'grid_rowcount', 'reselectafteredit', 'newrowposition', 'commitlevel', 'validationlevel',
      'grid_require_search', 'rowstyle', 'rowclass', 'rowlimit', 'disableautoload',
      'oninit', 'oncommit', 'onload', 'oninsert', 'onupdate', 'onvalidate', 'onloadstate', 'onrowbind', 'ondestroy',
      'js', 'ejs', 'css', 'dberrors', 'tablestyle', 'formstyle', 'popup', 'onloadimmediate', 'sqlwhere', 'breadcrumbs', 'tabpos', 'tabs', 'tabpanelstyle',
      'nokey', 'nodatalock', 'unbound', 'duplicate', 'sqlselect', 'sqlupdate', 'sqlinsert', 'sqldelete', 'sqlexec', 'sqlexec_comment', 'sqltype', 'onroute', 'tabcode', 'noresultsmessage', 'bindings',
      'path', 'module', 'templates', 'db', 'onecolumn', 'namespace',
      //Report Parameters
      'subheader', 'footerheight', 'headeradd',
    ];
    var _v_field = [
      'name', 'type', 'actions', 'control', 'caption', 'length', 'sample', 'validate', 'controlstyle', 'key', 'foreignkey', 'serverejs', 'roles', 'static', 'cellclass',
      'controlclass', 'value', 'onclick', 'datalock', 'hidden', 'link', 'nl', 'lov', 'captionstyle', 'disable_sort', 'enable_search', 'disable_search', 'disable_search_all', 'cellstyle', 'captionclass',
      'caption_ext', '_orig_control', 'format', 'eol', 'target', 'bindings', 'default', 'controlparams', 'popuplov', 'virtual', 'always_editable_on_insert', 'precision', 'password', 'hash', 'salt', 'unbound',
      'sqlselect', 'sqlupdate', 'sqlinsert','sqlsort', 'sqlwhere', 'sqlsearchsound', 'sqlsearch', 'onchange', 'lovkey', 'readonly', 'html', '__REMOVE__', '__AFTER__','_auto',
      'sql_from_db','sql_to_db','sqlsearch_to_db','datatype_config'
    ];
    var _v_controlparams = [
      'value_true', 'value_false', 'value_hidden', 'codeval', 'popupstyle', 'popupiconstyle', 'popup_copy_results', 'onpopup', 'dateformat', 'base_readonly',
      'download_button', 'preview_button', 'upload_button', 'delete_button', 'data_folder', 'sqlparams', '_data_file_has_extension',
      'image', 'thumbnails', 'expand_all', 'item_context_menu', 'insert_link', 'grid_save_before_update'
    ];
    var _v_popuplov = ['target', 'codeval', 'popupstyle', 'popupiconstyle', 'popup_copy_results', 'onpopup', 'popup_copy_results', 'onpopup', 'base_readonly'];
    var _v_lov = ['sql', 'sql2', 'sqlmp', 'UCOD', 'UCOD2', 'GCOD', 'GCOD2', 'schema', 'blank', 'parent', 'parents', 'datalock', 'sql_params', 'sqlselect', 'sqlselect_params', 'sqltruncate', 'always_get_full_lov', 'nodatalock', 'showcode', 'db'];
    //lov
    var existing_targets = [];
    for (let f in model) { if (f.substr(0, 7) == 'comment') continue; if (!_.includes(_v_model, f)) _this.LogInit_ERROR(model.id + ': Invalid model property: ' + f); }
    var no_B = true;
    var no_key = true;
    if (model.fields) _.each(model.fields, function (field) {
      if (Helper.hasAction(field.actions, 'B') && (field.control != 'html') && (field.control != 'subform') && (field.control != 'button')) no_B = false;
      if (field.key) no_key = false;
      if (field.hidden) { field.control = 'hidden'; }
      for (let f in field) {
        if (f.substr(0, 7).toLowerCase() == 'comment') continue; if (!_.includes(_v_field, f)) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Invalid field property: ' + f);
      }
      if (field.controlparams) {
        for (let f in field.controlparams) { if (!_.includes(_v_controlparams, f)) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Invalid controlparams: ' + f); }
      }
      if (field.popuplov) {
        for (let f in field.popuplov) { if (!_.includes(_v_popuplov, f)) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Invalid popuplov parameter: ' + f); }
      }
      if (field.lov) {
        for (let f in field.lov) { if (!_.includes(_v_lov, f)) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Invalid lov parameter: ' + f); }
      }
      if (_.includes(['label','button','linkbutton'],field.control) && Helper.hasAction(field.actions, 'IUD')) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': A '+field.control+' can only have action B');
      //Check unique target
      if (field.target) {
        if (!_.includes(existing_targets, field.target)) existing_targets.push(field.target);
        else _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Duplicate target - each field target must be unique within a model');
      }
      //Check if the field has a type
      if(field.actions && field.name && !('type' in field) && !('value' in field) && (field.control != 'subform') && !field.unbound) _this.LogInit_WARNING(model.id + ' > ' + field.name + ': Missing type.  Set a field.value or field.unbound if intentional.');
      if(field.control && (model.layout=='grid') && !_.includes(['hidden','label','html','textbox','textzoom','date','textarea','dropdown','checkbox','button','linkbutton','file_download'],field.control)) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Grid does not support ' + field.control + ' control');
      if(((field.control == 'file_upload') || (field.control == 'file_download')) && (field.type != 'file')) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': The ' + field.control + ' control requires field.type="file"');
      if((field.control == 'file_download') && Helper.hasAction(field.actions, 'IU')) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': The file_download control field.actions must be "B" (browse-only).');
      //field.type=encascii, check if password is defined
      if(field.type=='encascii'){
        if(model.layout=='grid') _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Grid does not support field.type="encascii" (Use field.type="hash" for searching encrypted values)');
        if(!field.password) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': The field.password property is required for field.type="encascii" fields');
        else if(!(field.password in _this.Config.passwords)) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': The value for field.password is not defined in jsh.Config.passwords');
      }
      //field.type=hash, check if salt is defined
      if(field.type=='hash'){
        if(!field.salt) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': The field.salt property is required for field.type="hash" fields');
        else if(!(field.salt in _this.Config.salts)) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': The value for field.salt is not defined in jsh.Config.salts');
      }
      //field.hash, check if the target field is defined
      if('hash' in field){
        if(!field.hash) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': The field.hash property should not be an empty string');
        else {
          var hashfield = _this.AppSrvClass.prototype.getFieldByName(model.fields, field.hash);
          if(!hashfield) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': The target field for field.hash was not found');
          else if(hashfield.type != 'hash') _this.LogInit_ERROR(model.id + ' > ' + field.name + ': The target field for field.hash must have field.type="hash"');
        }
      }
    });
    if (no_B && model.breadcrumbs && model.breadcrumbs.sql) {
      _this.LogInit_ERROR(model.id + ': No fields set to B (Browse) action.  Form databinding will be disabled client-side, and breadcrumbs sql will not execute.');
    }
    if (no_key && !model.nokey && !model.unbound && ((model.layout == 'form') || (model.layout == 'form-m'))) {
      _this.LogInit_ERROR(model.id + ': No key is defined.  Use nokey or unbound attributes if intentional.');
    }
    if(model.unbound){
      _.each(['table','sqlselect','sqlinsert','sqlupdate','sqldelete','sqlexec','sqlrowcount','sqldownloadselect','sqlinsertencrypt'],function(prop){
        if(model[prop]){
          _this.LogInit_WARNING(model.id + ': Model has both "unbound" and "'+prop+'" properties.  The "'+prop+'" property cannot be used with unbound forms.');
        }
      });
    }
    if((model.layout=='exec')&&(Helper.hasAction(model.actions, 'ID'))) _this.LogInit_WARNING(model.id + ': Exec layout only supports BU actions');
    else if((model.layout=='multisel')&&(Helper.hasAction(model.actions, 'ID'))) _this.LogInit_WARNING(model.id + ': Multisel layout only supports BU actions');
    else if((model.layout=='report')&&(Helper.hasAction(model.actions, 'ID'))) _this.LogInit_WARNING(model.id + ': Report layout only supports BU actions');

    //Generate Validators
    _.each(model.fields, function (field) {
      model.xvalidate.AddValidator('_obj.' + field.name, field.caption || field.name, field.actions, _this.GetValidatorFuncs(field.validate), field.roles);
    });
  });

  var all_lovs = {};
  _.forOwn(this.Models, function (model) {
    _.each(model.fields, function (field) {
      if(field.name){
        if((field.lov && (field.lov.sql||field.lov.sql2||field.lov.sqlmp||field.lov.sqlselect))||(field.popuplov)){
          if(!(field.name in all_lovs)) all_lovs[field.name] = [];
          all_lovs[field.name].push(model.id);
        }
      }
    });
  });

  //Validate and parse _config datalocks
  var validDatalocks = true;
  if(_this.Config.datalocks) for(var siteid in _this.Config.datalocks){
    var sitedatalocks = _this.Config.datalocks[siteid];
    if(_.isString(sitedatalocks)){ _this.LogInit_ERROR('Invalid datalocks syntax in _config for site: '+siteid); validDatalocks = false; }
    else{
      for(var datalockid in sitedatalocks){
        if(_.isString(sitedatalocks[datalockid])){ _this.LogInit_ERROR('Invalid datalocks syntax in _config for site: '+siteid+', datalock: '+datalockid); validDatalocks = false; }
        else ParseMultiLineProperties(sitedatalocks[datalockid],_.keys(sitedatalocks[datalockid]));
      }
    }
  }
  
  //Validate Parent/Child Bindings and generate list of Foreign Keys
  var all_foreignkeys = {};
  _.forOwn(_this.Models, function (model) {

    //Verify bindings are set up properly
    ParseModelRoles(_this, model, model.id, model.actions);

    //Check Parent / Child Relationships for Potentially Missing Foreign keys  
    if (model.tabs) {
      for (let i=0; i<model.tabs.length; i++) {
        var tab = model.tabs[i];
        var tabname = tab.name;
        var tabmodel = _this.getModel(null,tab.target,model);
        if(!('actions' in tab)) tab.actions='*';
        for (var binding_child in tab.bindings) {
          if (!tabmodel) { continue; }
          if (!tabmodel.fields) _this.LogInit_ERROR(model.id + ' > Tab ' + tabname + ': Target model has no fields for binding');
          var binding_child_field = _this.AppSrvClass.prototype.getFieldByName(tabmodel.fields, binding_child);
          if (!binding_child_field) _this.LogInit_ERROR(model.id + ' > Tab ' + tabname + ': Bound field "' + binding_child + '" is not defined in the target model "' + tab.target + '"');
          else if (!Helper.hasAction(binding_child_field.actions, 'F') && !binding_child_field.key) _this.LogInit_ERROR(model.id + ' > Tab ' + tabname + ': Bound field "' + binding_child + '" in target model "' + tab.target + '" missing F action');
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
    if(_this.Config.system_settings.case_insensitive_datalocks) datalockSearchOptions.caseInsensitive = true;

    if(model.sqlinsert && (model.sqlinsert.indexOf('%%%DATALOCKS%%%')>=0)) _this.LogInit_ERROR(model.id + ' : %%%DATALOCKS%%% query parameter not supported for sqlinsert');

    for(var siteid in _this.Config.datalocks){
      if((siteid=='main') || (model.roles && model.roles[siteid] && !_.isString(model.roles[siteid]))){
        for(var datalockid in _this.Config.datalocks[siteid]){

          var skip_datalock = function(element, datalockid, datalockSearchOptions){ return (element && element.nodatalock && (Helper.arrayIndexOf(element.nodatalock,datalockid,datalockSearchOptions) >= 0)); };

          //----------------------

          var skip_datalock_model = skip_datalock(model, datalockid, datalockSearchOptions);
          //var skip_datalock_breadcrumbs = skip_datalock(model.breadcrumbs, datalockid, datalockSearchOptions);
          //var skip_datalock_breadcrumbs_insert = model.breadcrumbs && skip_datalock(model.breadcrumbs.insert, datalockid, datalockSearchOptions);
          //var skip_datalock_breadcrumbs_update = model.breadcrumbs && skip_datalock(model.breadcrumbs.update, datalockid, datalockSearchOptions);
          //var skip_datalock_breadcrumbs_browse = model.breadcrumbs && skip_datalock(model.breadcrumbs.browse, datalockid, datalockSearchOptions);
          var skip_datalock_title = skip_datalock(model.title, datalockid, datalockSearchOptions);
          var skip_datalock_title_insert = model.title && skip_datalock(model.title.insert, datalockid, datalockSearchOptions);
          var skip_datalock_title_update = model.title && skip_datalock(model.title.update, datalockid, datalockSearchOptions);
          var skip_datalock_title_browse = model.title && skip_datalock(model.title.browse, datalockid, datalockSearchOptions);

          if(skip_datalock_model) continue;

          //Check if datalocks are missing from any SQL statements that require them
          //Breadcrumbs do not require datalocks - parameters are individually validated if %%%DATALOCKS%%% is missing
          if(model.title){
            if(!skip_datalock_title) _this.CheckDatalockSQL(model, model.title.sql, 'Title');
            if(model.title.insert && !skip_datalock_title_insert) _this.CheckDatalockSQL(model, model.title.insert.sql, 'Title.Insert');
            if(model.title.update && !skip_datalock_title_update) _this.CheckDatalockSQL(model, model.title.update.sql, 'Title.Update');
            if(model.title.browse && !skip_datalock_title_browse) _this.CheckDatalockSQL(model, model.title.browse.sql, 'Title.Browse');
          }
          //Do not require breadcrumb datalocks, because in order to access them, the keys / foreign keys already need to be validated anyway
          //if(model.breadcrumbs) _this.CheckDatalockSQL(model, model.breadcrumbs.sql, 'Breadcrumbs');
          _.each(['sqlselect','sqlupdate','sqldelete','sqlexec','sqlrowcount','sqldownloadselect','sqlinsertencrypt'],
            function(sqlkey){ _this.CheckDatalockSQL(model, model[sqlkey], sqlkey); });

          _.each(model.fields, function (field) {
            var skip_datalock_lov = skip_datalock(field.lov, datalockid, datalockSearchOptions);
            var skip_datalock_default = skip_datalock(field.default, datalockid, datalockSearchOptions);

            //Check if datalocks are missing from any SQL statements that require them
            if(field.lov && !skip_datalock_lov) _.each(['sql','sql2','sqlmp'],function(sqlkey){
              if(field.lov[sqlkey]){
                _this.CheckDatalockSQL(model, field.lov[sqlkey], field.name + ' > ' + sqlkey);
                if(!field.lov.datalock || !Helper.arrayItem(field.lov.datalock,datalockid,datalockSearchOptions)) _this.LogInit_ERROR(model.id + ' > ' + field.name + ' > ' + sqlkey + ': Missing datalock '+siteid+'::'+datalockid+' on lov');
              }
            });
            if(field.default && !skip_datalock_default){
              if(field.default.sql){
                _this.CheckDatalockSQL(model, field.default.sql, field.name + ' > Default');
                if(!field.default.datalock || !Helper.arrayItem(field.default.datalock,datalockid,datalockSearchOptions)) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Missing datalock '+siteid+'::'+datalockid+' on default');
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
              else if(Helper.hasAction(field.actions, 'C')) _this.AddFieldDatalock(model, field, siteid, datalockid, datalockSearchOptions);
              //Lovkey parameters in multisel
              else if((model.layout=='multisel') && field.lovkey) _this.AddFieldDatalock(model, field, siteid, datalockid, datalockSearchOptions);
              //Check if any custom LOV is missing a datalock
              else if(!skip_datalock_lov && ((field.lov && (field.lov.sql||field.lov.sql2||field.lov.sqlmp||field.lov.sqlselect))||(field.popuplov))) _this.AddFieldDatalock(model, field, siteid, datalockid, datalockSearchOptions);
              //Any key fields + any fields defined as foreign keys elsewhere + any LOVs
              else if(_.includes(all_keys, field.name)) _this.AddFieldDatalock(model, field, siteid, datalockid, datalockSearchOptions);
              else if(_.includes(all_foreignkeys, field.name)) _this.AddFieldDatalock(model, field, siteid, datalockid, datalockSearchOptions);
              else if(_.includes(all_lovs, field.name)) _this.AddFieldDatalock(model, field, siteid, datalockid, datalockSearchOptions);
              //Any Exec / U fields with a datalock defined
              if (((model.layout=='exec')||(model.layout=='report')) && Helper.hasAction(field.actions, 'U') && Helper.arrayItem(_this.Config.datalocks[siteid][datalockid],field.name,datalockSearchOptions)) _this.AddFieldDatalock(model, field, siteid, datalockid, datalockSearchOptions);

              //If datalock was added, continue to next field
              if(field.datalock && Helper.arrayItem(field.datalock,datalockid,datalockSearchOptions)) return;
            }

            //Check if any KFC field is missing a datalock
            if(field.key) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Missing datalock '+siteid+'.'+datalockid +' for key '+field.name);
            else if(field.foreignkey) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Missing datalock '+siteid+'.'+datalockid +' for foreign key '+field.name);
            else if(Helper.hasAction(field.actions, 'C')) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Missing datalock '+siteid+'.'+datalockid +' for '+field.name);
            //Lovkey parameters in multisel
            else if((model.layout=='multisel') && field.lovkey) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Missing datalock on multisel lovkey '+siteid+'::'+datalockid);
            //Check if any custom LOV is missing a datalock
            else if(!skip_datalock_lov && ((field.lov && (field.lov.sql||field.lov.sql2||field.lov.sqlmp||field.lov.sqlselect))||(field.popuplov))) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Missing datalock on lov '+siteid+'::'+datalockid);
          });
        }
      }
    }
  });  

  //Validate LOV DB and add sqlselect for cross-db LOV
  //Perform this after datalock validation, since datalocks should not be required for this sqlselect
  _.forOwn(this.Models, function (model) {
    var modelDB = 'default';
    if('db' in model) modelDB = model.db;
    if (model.fields) _.each(model.fields, function (field) {
      if(field.lov){
        var lov = field.lov;
        var lovDB = 'default';
        if('db' in lov){
          if(!(lov.db in _this.DBConfig)) _this.LogInit_ERROR('Model ' + model.id + ' LOV ' + field.name + ' uses an undefined db: '+lov.db);
          else lovDB = lov.db;
        }
        if(lovDB != modelDB){
          lov.sqlselect = field.name;
        }
      }
    });
  });

  //Validate salt lengths
  for(var salt_name in this.Config.salts){
    if(!this.Config.salts[salt_name] || (this.Config.salts[salt_name].length < 60)) _this.LogInit_WARNING('jsh.Config.salts > '+salt_name+': Salts should be at least 60 characters');
  }

  //Validate password lengths
  for(var password_name in this.Config.passwords){
    if(!this.Config.passwords[password_name] || (this.Config.passwords[password_name].length < 60)) _this.LogInit_WARNING('jsh.Config.passwords > '+password_name+': Encryption passwords should be at least 60 characters');
  }
};

function ParseMultiLineProperties(obj, arr) {
  _.each(arr, function (p) { if (p in obj) obj[p] = Helper.ParseMultiLine(obj[p]); });
}

exports.forEachSqlParam = function(model, sql, f){ /* f(pfield_name) */
  var _this = this;
  sql = _this.AppSrvClass.prototype.getSQL(model, sql, _this);
  if(sql){
    var params = _this.AppSrvClass.prototype.getSQLParameters(sql, model.fields, _this);
    if(params.length){
      for(let i=0;i<params.length;i++){
        if(f) f(params[i]);
      }
    }
  }
};

exports.AddSqlParams = function(model, element, props){
  var _this = this;
  if(!props) props = ['sql'];
  if(!element) return;
  var sql = '';
  _.each(props, function(prop){ 
    if(element[prop]) sql += _this.AppSrvClass.prototype.getSQL(model, element[prop], _this)+' '; 
  });
  sql = sql.trim();
  if (sql && !('sql_params' in element)) {
    var params = _this.AppSrvClass.prototype.getSQLParameters(sql, model.fields, _this);
    if(params.length){
      for(let i=0;i<params.length;i++){
        var pfield = _this.AppSrvClass.prototype.getFieldByName(model.fields, params[i]);
        if (!Helper.hasAction(pfield.actions, 'F') && !pfield.key){ pfield.actions += 'F'; }
      }
      element.sql_params = params;
    }
  }
};

exports.AddSqlParamsFieldFlags = function(model, element, desc){
  var _this = this;
  if (element && element.sql_params && !model.fields) _this.LogInit_ERROR(model.id + ': Cannot use '+desc+' sql_params without any fields defined.');
  else if (model.fields && element && element.sql_params) _.each(element.sql_params, function (sql_param) {
    var sql_param_field = _this.AppSrvClass.prototype.getFieldByName(model.fields, sql_param);
    if (!sql_param_field) _this.LogInit_ERROR(model.id + ' > ' + sql_param + ': '+desc+' sql param "' + sql_param + '" is not defined as a field');
    else if (!Helper.hasAction(sql_param_field.actions, 'C')) { if (!sql_param_field.actions) sql_param_field.actions = ''; sql_param_field.actions += 'C'; }
  });
};

exports.CheckDatalockSQL = function(model, sql, desc){
  if(!sql) return;
  if (!(sql.indexOf('%%%DATALOCKS%%%') >= 0)) this.LogInit_ERROR(model.id + ' > ' + desc + ': SQL missing %%%DATALOCKS%%% in query');
};

exports.AddFieldDatalock = function(model, field, siteid, datalockid, datalockSearchOptions){
  var datalocks = this.Config.datalocks[siteid][datalockid];
  var datalockquery = Helper.arrayKey(datalocks,field.name,datalockSearchOptions);
  if(datalockquery){
    if(!field.datalock) field.datalock = {};
    field.datalock[datalockid] = datalockquery;
  }
  else this.LogInit_ERROR(model.id + ' > ' + field.name + ': Could not auto-add datalock - please define in _config.datalocks.'+siteid+'.'+datalockid+'.'+field.name);
};

//_this.AddAutomaticBindings(model, tab, 'Tab '+(tab.name||''), { noErrorOnMissingParentKey: true, log: function(msg){ _this.LogInit_ERROR(msg); } });
//_this.AddAutomaticBindings(model, model.duplicate, "Duplicate action", { noErrorOnMissingParentKey: true, log: function(msg){ _this.LogInit_ERROR(msg); } });
//_this.AddAutomaticBindings(model, field, 'Subform '+field.name, { noErrorOnMissingParentKey: true, log: function(msg){ _this.LogInit_ERROR(msg); } });
//insert: link_bindings = jsh.AddAutomaticBindings(model, link_bindingObj, 'Button '+(link_text||link_target), { req: req, bindType: 'nonKeyFields', additionalFields: link_binding_additionalFields });
//other: link_bindings = jsh.AddAutomaticBindings(model, link_bindingObj, 'Button '+(link_text||link_target), { req: req, bindType: 'childKey' });
exports.AddAutomaticBindings = function(model, element, elementname, options){
  var _this = this;
  //bindType: parentKey, childKey, nonKeyFields
  options = _.extend({ 
    //bindType: parentKey, childKey, or nonKeyFields
    //  parentKey: Create a binding between each Parent Form's Key and a field with the same name in the child (Default)
    //             "PARENT_KEY": "PARENT_KEY"
    //             Used in Tabs, Subforms, and Duplicate
    //  childKey:  Create a binding between each Child Form's Key and a field with the same name in the parent
    //             "CHILD_KEY": "CHILD_KEY"
    //             Used in Button Bindings
    //  nonKeyFields: Bind any field that exists in both the parent and child, that is in the "additionalFields" array
    //                Also, for parent form, form-m, and exec models, bind any field that is in both the parent and child, that is not the Child Form's key.
    //                "ADDITIONAL_FIELD": "ADDITONAL_FIELD"
    //                "CHILD_FIELD": "CHILD_FIELD" (When parent is a Form, Form-m, and Exec)
    // auto: parentKey and then childKey
    bindType: 'auto', 
    //Array of field names used for binding nonKeyFields
    additionalFields: [], 
    //Express Request
    req: null, 
    //Logging function
    log: function(msg){ _this.Log.error(msg); },
    //Do not display an error if binding not parentKey Binding not found
    noErrorOnMissingParentKey: false,
    //Extended Model Data
    modelsExt: null
  }, options);

  //If automatic bindings are not enabled, return
  if(!_this.Config.system_settings.automatic_bindings) return;

  //If a binding is already defined for this element, do not add more bindings
  if('bindings' in element) return;

  //Get binding target
  if (!('target' in element)) { options.log(model.id + ' > ' + elementname + ' Bindings: Missing target'); return; }
  var tmodel = _this.getModel(options.req, element.target, model);
  if (!tmodel) { options.log(model.id + ' > ' + elementname + ': Target model "' + element.target + '" not found'); return; }
  element.target = tmodel.id;

  //Get keys in parent model
  var parentKeys = _this.AppSrvClass.prototype.getKeyNames(model.fields);
  if(!parentKeys.length) { options.log(model.id + ' > ' + elementname + ' Bindings: Parent model has no key'); return; }

  var bindings = {};
  var found_bindings = false;
  //For each dynamic binding
  for(var modelgroup in this.Config.dynamic_bindings){
    //If the dynamic binding applies to this model
    if(!this.isInModelGroup(tmodel, modelgroup)) continue;
    found_bindings = true;
    var dynamic_binding = this.Config.dynamic_bindings[modelgroup];
    //Apply dynamic bindings
    for(var childKey in dynamic_binding){
      var parentField = dynamic_binding[childKey];
      //The following creates a conditional binding based on the name of the Parent Form's Key
      //"CHILD_FIELD": {
      //  //If the parent form's key name is "PARENT_KEY", set the binding from CHILD_FIELD to the character string 'CONSTANT'
      //  "key:PARENT_KEY": "'CONSTANT'", 
      //  //If the parent form's key name is "PARENT_KEY", set the binding from CHILD_FIELD to the Parent's PARENT_FIELD
      //  "key:PARENT_KEY": "PARENT_FIELD"
      //}
      if(!_.isString(parentField)){
        for(var parentFieldCondition in dynamic_binding[childKey]){
          if(parentFieldCondition.substr(0,4)=='key:'){
            if(_.includes(parentKeys,parentFieldCondition.substr(4))) parentField = dynamic_binding[childKey][parentFieldCondition];
          }
          else { options.log(model.id + ' > ' + elementname + ' Bindings: Invalid condition for '+childKey+': '+parentFieldCondition); return; }
        }
      }
      //The following will add a binding from CHILD_FIELD to the Parent Form's Key Field
      //"CHILD_FIELD": "key"
      //The following will add a binding from CHILD_FIELD to the Parent's PARENT_FIELD
      //"CHILD_FIELD": "PARENT_FIELD"
      //the following will add a binding from CHILD_FIELD to the character string 'CONSTANT'
      //"CHILD_FIELD": "'CONSTANT'"
      if(_.isString(parentField)){
        if(parentField=='key'){
          if(parentKeys.length != 1) { options.log(model.id + ' > ' + elementname + ' Bindings: Must have one key in the parent model when dynamically binding '+childKey+' to "key"'); return; } 
          parentField = parentKeys[0];
        }
        bindings[childKey] = parentField;
      }
    }
  }

  //If dynamic bindings were not applied
  if(!found_bindings){ 
    var auto_keys = _this.Config.system_settings.automatic_schema && _this.Config.system_settings.automatic_schema.keys;
    var ttabledef = options.modelsExt ? options.modelsExt[tmodel.id].tabledef : null;
    var stabledef = options.modelsExt ? options.modelsExt[model.id].tabledef : null;

    if((options.bindType=='auto')||(options.bindType=='parentKey')){ //parentKey
      //Match parent keys with child fields
      _.each(parentKeys, function(parentKey){
        var found_field = !!_this.AppSrvClass.prototype.getFieldByName(tmodel.fields, parentKey);
        if(!found_field && auto_keys && ttabledef){
          //Check tabledef, to see if field can be automatically added
          if(parentKey in ttabledef.fields) found_field = true;
        }
        if(!found_field && !options.noErrorOnMissingParentKey) { options.log(model.id + ' > ' + elementname + ' Bindings: Key '+parentKey+' not found in target form.  Explicitly define bindings if necessary.'); return; }
        if(!found_field) return;
        bindings[parentKey] = parentKey;
        found_bindings = true;
      });
    }
    if(((options.bindType=='auto')&&!found_bindings)||(options.bindType=='childKey')){
      //Match parent keys with child fields
      var childKeys = _this.AppSrvClass.prototype.getKeyNames(tmodel.fields);
      _.each(childKeys, function(childKey){
        var found_field = !!_this.AppSrvClass.prototype.getFieldByName(model.fields, childKey);
        if(!found_field && auto_keys && stabledef){
          //Check tabldef, to see if field can be automatically added
          if(childKey in stabledef.fields) found_field = true;
        }
        if(!found_field && !options.noErrorOnMissingParentKey) { options.log(model.id + ' > ' + elementname + ' Bindings: Key '+childKey+' not found in parent form.  Explicitly define bindings if necessary.'); return; }
        if(!found_field) return;
        bindings[childKey] = childKey;
        found_bindings = true;
      });
    }
    if(options.bindType=='nonKeyFields'){
      //Match all child fields that are not keys (for add operations)
      _.each(tmodel.fields, function(childField){
        if(childField.key) return;
        var field = null;
        //Don't bind to parent fields if the parent is a grid
        if((model.layout == 'form') || (model.layout == 'form-m') || (model.layout == 'exec') || (model.layout == 'report')){
          field = _this.AppSrvClass.prototype.getFieldByName(model.fields, childField.name);
        }
        if(field || _.includes(options.additionalFields,childField.name)){
          bindings[childField.name] = childField.name;
          found_bindings = true;
        }
      });
    }
  }
  
  if(found_bindings){
    element.bindings = bindings;
    return bindings;
  }
  else return null;
};

exports.AddBindingFields = function(model, element, elementname, modelsExt){
  var _this = this;
  var tmodel = _this.getModel(null, element.target, model);
  var auto_keys = _this.Config.system_settings.automatic_schema && _this.Config.system_settings.automatic_schema.keys;
  if(tmodel){
    var ttabledef = modelsExt[tmodel.id].tabledef;
    var tabledef = modelsExt[model.id].tabledef;
    //Check if all bindings exist
    _.each(element.bindings, function(binding, childKey){
      if(childKey && (childKey[0]=="'")){ /* No action */ }
      else {
        var tfield = _this.AppSrvClass.prototype.getFieldByName(tmodel.fields, childKey);
        if(!tfield) { 
          let created_field = false;
          if(auto_keys && ttabledef){
            //Add foreign key based on binding
            if(childKey in ttabledef.fields){
              tmodel.fields.push({ 
                name: childKey, 
                foreignkey: 1,
                control: 'hidden'
              });
              created_field = true;
            }
          }
          if(!created_field) _this.LogInit_ERROR(model.id + ' > ' + elementname + ' Bindings: Field '+childKey+' not found in target form.  Explicitly define bindings if necessary.');
        }
      }
      if(binding && (binding[0]=="'")){ /* No action */ }
      else {
        var sfield = _this.AppSrvClass.prototype.getFieldByName(model.fields, binding);
        if(!sfield) { 
          let created_field = false;
          if(auto_keys && tabledef){
            //Add foreign key based on binding
            if(binding in tabledef.fields){
              model.fields.push({ 
                name: binding,
                control: 'hidden'
              });
              created_field = true;
            }
          }
          if(!created_field) _this.LogInit_ERROR(model.id + ' > ' + elementname + ' Bindings: Field '+binding+' not found in parent form.  Explicitly define bindings if necessary.');
        }
      }
    });
  }
};

exports.isInModelGroup = function(model, modelgroupid){
  if(model.id==modelgroupid) return true;
  if(_.includes(model.groups, modelgroupid)) return true;
  if(_.includes(model._inherits, modelgroupid)) return true;
  return false;
};

function ParseModelRoles(jsh, model, srcmodelid, srcactions) {
  var _this = jsh;

  function validateSiteRoles(model, tmodel, prefix, suffix, roles){
    var childSites = _.intersection(model.sites, tmodel.sites);
    var parentSites = model.sites;
    if(roles){
      var roleSites = Helper.GetRoleSites(roles);
      childSites = _.intersection(childSites, roleSites);
      parentSites = _.intersection(parentSites, roleSites);
    }
    if(childSites.length != parentSites.length){
      _this.LogInit_ERROR((prefix||'') + 'Target model "' + tmodel.id + '" not defined for site: '+_.difference(model.sites, _.intersection(model.sites, tmodel.sites)).join(', ') +(suffix?' in link expression "'+suffix+'"':'')); return;
    }
  }

  function validateSiteLinks(model, link, prefix, suffix, roles){
    if(!link) return;
    var linkTarget = jsh.parseLink(link);
    if(!linkTarget.modelid) return;
    if(linkTarget.modelid.substr(0,3)=='js:') return;
    var linkModel = jsh.getModel(null,linkTarget.modelid,model);
    if (!linkModel) { _this.LogInit_ERROR((prefix||'') + 'Link Target model "' + linkTarget.modelid + '" not found'+(suffix?' in link expression "'+suffix+'"':'')); return; }
    if((linkTarget.action=='insert')&&!Helper.hasAction(linkModel.actions, 'I')) { 
      _this.LogInit_ERROR((prefix||'') + 'Link Target model "' + linkTarget.modelid + '" does not have "I" action'+(suffix?' for link expression "'+suffix+'"':'')); 
    }
    validateSiteRoles(model, linkModel, prefix, suffix, roles);
  }

  function validateBindings(bindings, model, tmodel, prefix, targetField){
    if(!bindings) return;
    for(var childFieldName in bindings){
      var parentFieldName = bindings[childFieldName];
      var childField = _this.AppSrvClass.prototype.getFieldByName(tmodel.fields, childFieldName);
      var parentField = _this.AppSrvClass.prototype.getFieldByName(model.fields, parentFieldName);
      if(childFieldName && (childFieldName[0]=="'")){ /* No action */ }
      else if(!childField) { _this.LogInit_ERROR((prefix||'') + 'Missing binding target field: '+tmodel.id+' > '+childFieldName); }
      else if((!_.includes(['exec','report'],tmodel.layout)) && Helper.hasAction(childField.actions, 'U') && childField._auto.actions) {
        _this.LogInit_WARNING((prefix||'') + 'Binding target field '+tmodel.id+' > '+childFieldName+' should not have "U" action.  Please explicitly define "actions" if necessary.');
      }
      if(parentFieldName && (parentFieldName[0]=="'")){ /* No action */ }
      else if(!parentField) { _this.LogInit_ERROR((prefix||'') + 'Missing binding source field: '+model.id+' > '+parentFieldName); }
      else if((!_.includes(['exec','report'],tmodel.layout)) && Helper.hasAction(parentField.actions, 'U') && !(targetField.controlparams && targetField.controlparams.grid_save_before_update)) {
        _this.LogInit_WARNING((prefix||'') + 'Binding source field '+model.id+' > '+parentFieldName+' should not have "U" action'+((targetField.control=='subform')?', unless "controlparams.grid_save_before_update" is specified on the subform control':'')+'.');
      }
    }
  }

  //-----------------------

  if ('tabs' in model) for (let i=0;i<model.tabs.length;i++) {
    var tab = model.tabs[i];
    var tabname = tab.name;
    if (!_.isObject(tab)) { _this.LogInit_ERROR(model.id + ' > Tab ' + tabname + ': Invalid tab definition'); return; }
    if (!('name' in tab)) { _this.LogInit_ERROR(model.id + ' > Tab ' + tabname + ': Invalid tab definition - missing name'); return; }
    if (!('target' in tab)) { _this.LogInit_ERROR(model.id + ' > Tab ' + tabname + ': Invalid tab definition - missing target'); return; }
    if (!('bindings' in tab)) { _this.LogInit_ERROR(model.id + ' > Tab ' + tabname + ': Invalid tab definition - missing bindings'); return; }
    if (tab.roles) {
      if(_.isArray(tab.roles)) tab.roles = { 'main': tab.roles };
      for(var siteid in tab.roles){
        if(!_.isArray(tab.roles[siteid])) { _this.LogInit_ERROR(model.id + ' > Tab ' + tabname + ': Invalid tab roles definition - please use { "siteid": ["role1", "role2"] }'); return; }
        //Convert tab roles into standard roles format "role":"perm"
        var rolesObj = {};
        for(var j=0;j<tab.roles[siteid].length;j++) rolesObj[tab.roles[siteid][j]] = 'B';
        tab.roles[siteid] = rolesObj;
      }
    }
    let tmodel = jsh.getModel(null,tab.target,model);
    if (!tmodel) { _this.LogInit_ERROR(model.id + ' > Tab ' + tabname + ': Target model "' + tab.target + '" not found'); return; }
    tmodel._parentmodels.tab[model.id] = 1;
    tab.target = tmodel.id;
    validateSiteRoles(model, tmodel, model.id + ' > Tab ' + tabname + ': ', '', tab.roles);
    validateBindings(tab.bindings, model, tmodel, model.id + ' > Tab ' + tabname + ': ', tab);
    ParseModelRoles(jsh, tmodel, srcmodelid, srcactions);
  }
  if ('duplicate' in model) {
    let tmodel = jsh.getModel(null,model.duplicate.target,model);
    if (!tmodel) { _this.LogInit_WARNING('Invalid duplicate model ' + model.duplicate + ' in ' + model.id); return; }
    if(tmodel.layout != 'exec') { _this.LogInit_ERROR(model.id + ' > Duplicate: Target model should have "exec" layout'); }
    tmodel._parentmodels.duplicate[model.id] = 1;
    model.duplicate.target = tmodel.id;
    validateSiteRoles(model, tmodel, model.id + ' > Duplicate model ' + model.duplicate + ': ', '');
    validateSiteLinks(model, model.duplicate.link, model.id + ' > Duplicate model ' + model.duplicate + ' link: ', model.duplicate.link);
    validateBindings(model.duplicate.bindings, model, tmodel, model.id + ' > Duplicate model ' + model.duplicate + ': ', model.duplicate);
    ParseModelRoles(jsh, tmodel, srcmodelid, srcactions);
  }
  _.each(model.buttons, function (button) {
    validateSiteLinks(model, button.link, model.id + ' > Button link: ', button.link, button.roles);
    if(button.target){
      let tmodel = jsh.getModel(null,button.target,model);
      if (!tmodel) { _this.LogInit_ERROR(model.id + ' > Button ' + button.link + ': Target model "' + button.target + '" not found'); return; }
      tmodel._parentmodels.button[model.id] = 1;
      validateBindings(button.bindings, model, tmodel, model.id + ' > Button ' + button.link + ': ', button);
    }
  });
  _.each(model.fields, function (field) {
    if (('target' in field) && ((field.control == 'subform') || (field.popuplov))) {
      let tmodel = jsh.getModel(null,field.target,model);
      if (!tmodel) { _this.LogInit_WARNING(model.id + ' > ' + field.name + ': Invalid target model "' + field.target + '"'); return; }
      if(field.control=='subform') tmodel._parentmodels.subform[model.id] = 1;
      else if(field.popuplov) tmodel._parentmodels.popuplov[model.id] = 1;
      field.target = tmodel.id;
      validateSiteRoles(model, tmodel, model.id + ' > ' + field.name + ': ', '', field.roles);
      validateSiteLinks(model, field.link, model.id + ' > ' + field.name + ' link: ', field.link, field.roles);
      validateBindings(field.bindings, model, tmodel, model.id + ' > ' + field.name + ': ', field);
      ParseModelRoles(jsh, tmodel, srcmodelid, srcactions);
      if(field.control=='subform'){
        if((tmodel.layout=='form') && field._auto.actions){
          _this.LogInit_WARNING(model.id + ' > Subform ' + field.name + ': When using a subform that has a "form" layout, "actions" should be explicitly set on the subform control.  If both a subform and parent form target the same table, either the parent model should be read-only (model.actions="B"), or the subform control should not have the "I" action, so that it will not be displayed on insert (field.actions="BU").');
        }
        if((tmodel.layout=='grid') && Helper.hasAction(field.actions, 'I') && _.includes(['row','cell'],tmodel.commitlevel) && !_.isEmpty(field.bindings) && !(field.controlparams && field.controlparams.grid_save_before_update) && Helper.hasAction(model.actions, 'I')){
          _this.LogInit_WARNING(model.id + ' > Subform ' + field.name + ': When using a subform that has "I" actions and a target with a "grid" layout and, the target model\'s "commitlevel" should be set to "auto" so that the "commitlevel" will be set to "page" on insert and have both parent and child data saved in one transaction.  Alternatively, set "grid_save_before_update" to true on the subform control so that no grid data can be entered until the parent is saved.');
        }
      }
    }
    else if(('link' in field)){
      if(Helper.hasAction(field.actions, 'B') && (field.control != 'hidden') && !('value' in field)){
        if(field.link != 'select'){
          validateSiteLinks(model, field.link, model.id + ' > ' + field.name + ' link: ', field.link, field.roles);
        }
      }
    }
    if ((field.control == 'subform') && !('bindings' in field)) _this.LogInit_WARNING('Model ' + model.id + ' subform ' + field.name + ' missing binding.');
  });
}

exports.ParsePopups = function () {
  var _this = this;
  _.forOwn(this.Models, function (model) {
    if (model.popup) {
      if (_.isArray(model.popup) && (model.popup.length == 2)) {
        _this.Popups[model.idmd5] = [model.popup[0], model.popup[1]];
      }
    }
  });
};

function AddValidation(field, validator) {
  if (!('validate' in field)) field.validate = [];
  field.validate.push(validator);
}

exports.ParseMacros = function() {
  var _this = this;
  if(!_this.Config.macros) _this.Config.macros = {};
  var macros = _this.Config.macros;
  macros['merge'] = function(){
    var args = Array.from(arguments);
    args.unshift({});
    return _.extend.apply(_,args);
  };
  var macroids = {};
  if(!macros) return;
  //Parse js functions
  for(var macroid in macros){
    var macro = macros[macroid];
    if(_.isString(macro) && (macro.substr(0,3)=='js:')){
      try{ macros[macroid] = eval('['+macro.substr(3)+']')[0]; }
      catch(ex){ _this.LogInit_ERROR('Macro: '+macroid+', error parsing function. '+ex.toString()); }
    }
    macroids['#'+macroid] = true;
  }
  //Execute macro (get replacement value)
  function evalMacro(macro, params){
    if(params) for(let i=0;i<params.length;i++){
      let xval = parseObject(params[i]);
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
      if(obj in macroids) return function(){ return evalMacro(macros[obj.substr(1)]); };
    }
    else if(_.isArray(obj) && (obj.length > 0)){
      if(obj[0] in macroids){
        return function(){ return evalMacro(macros[obj[0].substr(1)], obj.splice(1)); };
      }
      else{
        for(let i=0;i<obj.length;i++){
          let xval = parseObject(obj[i]);
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
        let xval = parseObject(obj[key]);
        if(xval) obj[key] = xval();
      }
      if((numkeys==1) && (lastkey in macroids)){
        return function(){ return _.extend({},evalMacro(macros[lastkey.substr(1)]),obj[lastkey]); };
      }
    }
  }
  parseObject(_this.Config);
  parseObject(_this.CustomControls);
  parseObject(_this.Models);
};
