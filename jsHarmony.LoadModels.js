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
var Helper = require('./lib/Helper.js');
var HelperFS = require('./lib/HelperFS.js');
var jsHarmonyCodeGen = require('./lib/CodeGen.js');
var jsParser = require('./lib/JSParser.js');

module.exports = exports = {};

/*******************
|    LOAD MODELS   |
*******************/

var BASE_CONTROLS = ['label', 'html', 'textbox', 'textzoom', 'dropdown', 'date', 'textarea', 'htmlarea', 'hidden', 'subform', 'html', 'password', 'file_upload', 'file_download', 'button', 'linkbutton', 'tree', 'checkbox','image'];
var BASE_DATATYPES = ['DATETIME','VARCHAR','CHAR','BOOLEAN','BIGINT','INT','SMALLINT','TINYINT','DECIMAL','FLOAT','DATE','DATETIME','TIME','ENCASCII','HASH','FILE','BINARY'];

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

exports.LoadModels = function (modelbasedir, modeldir, prefix, dbtype, moduleName, options) {
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
      _this.LoadModels(fpath + '/', modeldir, prefix + fname + '/', dbtype, moduleName, { isBaseDir: false });
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
    var model = _this.ParseJSON(fpath, moduleName, 'Model ' + modelname);
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
          _this.AddModel(submodelname, submodel, prefix, fpath, modeldir, moduleName);
        });
      }
      else this.AddModel(modelname, model, prefix, fpath, modeldir, moduleName);
    }
  }
};

exports.ParseJSON = function(fname, moduleName, desc, cb){
  var _this = this;
  var fread = null;
  if(cb) fread = function(fread_cb){ fs.readFile(fname, 'utf8', fread_cb); }
  else fread = function(fread_cb){ return fread_cb(null, fs.readFileSync(fname, 'utf8'));  }
  return fread(function(err, data){
    if(err) return cb(err);
    var ftext = fs.readFileSync(fname, 'utf8');
    ftext = Helper.JSONstrip(ftext);
    //Apply Transform
    var module = _this.Modules[moduleName];
    if(module) ftext = module.transform.Apply(ftext, fname);
    //Parse JSON
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
    if(cb) return cb(null, rslt);
    else return rslt;
  });
};

exports.MergeFolder = function (dir, moduleName) {
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
  //Apply Transform
  var module = _this.Modules[moduleName];
  if(module) rslt = module.transform.Apply(rslt, fname);
  return rslt;
};

exports.AddModel = function (modelname, model, prefix, modelpath, modeldir, moduleName) {
  var _this = this;
  var module = _this.Modules[moduleName];

  function prependPropFile(prop, path){
    if (fs.existsSync(path)) {
      var fcontent = fs.readFileSync(path, 'utf8');
      if(module) fcontent = module.transform.Apply(fcontent, path);
      if (prop in model) fcontent += '\r\n' + model[prop];
      model[prop] = fcontent;
    }
  }

  //-------------------------

  if(model===null){ delete this.Models[modelname]; return; }

  if(!prefix) prefix = '';
  model['id'] = modelname;
  model['idmd5'] = crypto.createHash('md5').update(_this.Config.frontsalt + model.id).digest('hex');
  if('namespace' in model){ _this.LogInit_ERROR(model.id + ': "namespace" attribute should not be set, it is a read-only system parameter'); }
  model._inherits = [];
  model._referencedby = [];
  model._parentmodels = { tab: {}, duplicate: {}, subform: {}, popuplov: {}, button: {} };
  model._parentbindings = {};
  model._childbindings = {};
  model._auto = {};
  model._sysconfig = { unbound_meta: false };
  if(!model.path && modelpath) model.path = modelpath;
  if(!model.module && modeldir && modeldir.module) model.module = modeldir.module;
  model.namespace = _this.getNamespace(modelname);

  model.using = model.using || [];
  if(!_.isArray(model.using)) model.using = [model.using];
  if(prefix != model.namespace) model.using.push(prefix);
  if(module && (module.namespace != prefix) && (module.namespace != model.namespace)) model.using.push(module.namespace);
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
    if(!('source_files_prefix' in model)) model.source_files_prefix = _this.getBaseModelName(model.id);
    var modelpathbase = modelbasedir + model.source_files_prefix;

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
        var curmodelid = _this.resolveModelID(model.id);
        var parentmodel = _this.getModel(null,model.inherits,model,{ ignore: [curmodelid] });
        if (!parentmodel){
          if(_this.getModel(null,model.inherits,model)) throw new Error('Model ' + model.id + ' cyclic inheritance.');
          throw new Error('Model ' + model.id + ': Parent model ' + model.inherits + ' does not exist.');
        }
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
            EntityPropMerge(rsltItem, 'controlparams', newItem, oldItem, function (newval, oldval) { return _.extend({}, oldval, newval); });
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
        EntityPropMerge(mergedprops, 'css', model, parentmodel, function (newval, oldval) { return oldval + '\r\n' + newval; });
        EntityPropMerge(mergedprops, 'fonts', model, parentmodel, function (newval, oldval) { return (oldval||[]).concat(newval||[]); });
        
        //Merge Everything Else
        _this.Models[model.id] = _.extend({}, parentmodel, model);
        //Restore Merged Properties
        _.each(mergedprops, function (val, key) { _this.Models[model.id][key] = val; });
        for (var prop in _this.Models[model.id]) { if (_this.Models[model.id][prop] == '__REMOVEPROPERTY__') { delete _this.Models[model.id][prop]; } }
        _.each(_this.Models[model.id].fields, function(field){ if(!field) return; for (var prop in field) { if (field[prop] == '__REMOVEPROPERTY__') { delete field[prop]; } } });
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
  this.Statistics.Counts.InitDeprecated++;
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
    if (model.duplicate && !_.isString(model.duplicate)){
      if('link_text' in model.duplicate){
        _this.LogDeprecated(model.id + ': model.duplicate.link_text has been deprecated.  Please use model.duplicate.button_text instead.'); 
        model.duplicate.button_text = model.duplicate.link_text;
        delete model.duplicate.link_text;
      }
      if('link' in model.duplicate){
        _this.LogDeprecated(model.id + ': model.duplicate.link has been deprecated.  Please use model.duplicate.link_on_success instead.'); 
        model.duplicate.link_on_success = model.duplicate.link;
        delete model.duplicate.link;
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

  function ApplyQuery(key, query){
    var expr = query.expr;
    if((expr=='*')||QueryControl(expr)){
      //Apply controls
      var controlnames = query.controls;
      _.each(controlnames, function(controlname){
        _this.ApplyCustomControl(model, field, controlname);
      });
    }
  }

  var queries = _this.CustomControlQueries;
  if(queries['*']){
    for(let exprstr in queries['*']){
      ApplyQuery('*',queries['*'][exprstr]);
    }
  }
  if(field.name && (field.name in queries)){
    for(let exprstr in queries[field.name]){
      ApplyQuery(field.name, queries[field.name][exprstr]);
    }
  }
};

exports.ApplyCustomControl = function(model, field, controlname){
  var _this = this;
  if(!controlname){
    if(BASE_CONTROLS.indexOf(field.control) >= 0) return;
    if(!field.control) return;
    controlname = field.control;
  }
  if(!(controlname in _this.CustomControls)) throw new Error('Custom Control not defined: ' + field.control + ' in ' + model.id + ': ' + JSON.stringify(field));
  var customcontrol = _this.CustomControls[controlname];
  for (var prop in customcontrol) {
    if(prop=='for') continue;
    if(prop=='control') continue;
    //Apply Macro JS
    var val = customcontrol[prop];
    if(_.isString(val) && (val.substr(0,8)=='jsmacro:')){
      val = val.substr(8);
      try{
        field[prop] = Helper.JSEval(val, field, {});
      }
      catch(ex){
        throw new Error('Error evaluating Custom Control jsmacro: ' + controlname + '.' + prop + ': ' + ex.toString() + '(' + model.id + ': ' + JSON.stringify(field) + ')');
      }
    }
    else{
      if (!(prop in field)){ field[prop] = val; }
      else if (prop == 'controlclass') field[prop] = field[prop] + ' ' + val;
      else if (prop == 'captionclass') field[prop] = field[prop] + ' ' + val;
      else { /* Do not apply */ }
    }
  }
  if('control' in customcontrol){
    if (!('_orig_control' in field)) field['_orig_control'] = [];
    field._orig_control.push(field.control);
    field.control = customcontrol.control;
  }
  _this.ApplyCustomControl(model, field);
};

exports.validateDisplayLayouts = function(model){
  var _this = this;
  if(model.display_layouts){
    var field_names = {};
    _.each(model.fields, function(field){ field_names[field.name] = 1; });
    for(var display_layout_name in model.display_layouts){
      var display_layout = model.display_layouts[display_layout_name];
      var column_names = {};
      display_layout.columns = _.reduce(display_layout['columns'],function(rslt,column){
        if(_.isString(column)){
          var column_name = column;
          if(!(column_name in field_names)){ _this.LogInit_ERROR('Display layout column not found: '+model.id+'::'+display_layout_name+'::'+column_name); return rslt; }
          if(column_name in column_names){ _this.LogInit_ERROR('Duplicate display layout column: '+model.id+'::'+display_layout_name+'::'+column_name); return rslt; }
          rslt.push({name: column_name});
          column_names[column_name] = 1;
        }
        else if(column){
          var column_name = column.name;
          if(!column_name){ _this.LogInit_ERROR('Display layout column missing "name" property: '+model.id+'::'+display_layout_name+' '+JSON.stringify(column)); return rslt; }
          if(!(column_name in field_names)){ _this.LogInit_ERROR('Display layout column not found: '+model.id+'::'+display_layout_name+'::'+column_name); return rslt; }
          if(column_name in column_names){ _this.LogInit_ERROR('Duplicate display layout column: '+model.id+'::'+display_layout_name+'::'+column_name); return rslt; }
          rslt.push(column);
          column_names[column.name] = 1;
        }
        return rslt;
      },[]);
    }
  }
}

exports.ParseEntities = function () {
  var _this = this;
  _this.ParseCustomControls();
  var codegen = new jsHarmonyCodeGen(_this);
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
    if(model.unbound && !('layout' in model)) model.layout = 'exec';

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
    if(tabledef && tabledef.table_type){
      model._dbdef = { 
        table_type: tabledef.table_type ,
        instead_of_insert: tabledef.instead_of_insert
      };
    }

    if((model.layout=='grid') && !('commitlevel' in model)){
      if(model.actions && !Helper.hasAction(model.actions, 'IUD')) model.commitlevel = 'none';
      else if(tabledef && (tabledef.table_type=='view') && !('actions' in model)){ model.commitlevel = 'none'; }
      else model.commitlevel = 'auto';
    }
    if (!('actions' in model)){
      if((model.layout=='exec')||(model.layout=='report')||(model.layout=='multisel')) model.actions = 'BU';
      else if(model.layout=='grid'){
        if(model.grid_static) model.actions = 'B';
        else if(!model.table && model.sqlselect){
          model.actions = 'B';
          if(model.sqlinsert) model.actions += 'I';
          if(model.sqlupdate) model.actions += 'U';
          if(model.sqldelete) model.actions += 'D';
        }
        else if(!model.commitlevel || model.commitlevel=='none') model.actions = 'B';
        else model.actions = 'BIUD';
      }
      else{
        if(model.unbound) model.actions = 'BU';
        else if(!model.table){
          model.actions = 'B';
          if(model.sqlinsert) model.actions += 'I';
          if(model.sqlupdate) model.actions += 'U';
          if(model.sqldelete) model.actions += 'D';
        }
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
    model.xvalidate = new _this.XValidate();
    if ('sites' in model) _this.LogInit_WARNING('Model ' + model.id + ' had previous "sites" attribute - overwritten by system value');
    if(model.roles){
      var roleids = _.keys(model.roles);
      //Resolve '*' roles
      for(let i=0;i<roleids.length;i++){
        var role = roleids[i];
        if(_.isString(model.roles[role])){
          if(!('main' in model.roles)) model.roles['main'] = {};
          model.roles['main'][role] = model.roles[role];
          delete model.roles[role];
        }
        else if(role=='*'){
          for(var siteid in _this.Sites){
            var newroles = JSON.parse(JSON.stringify(model.roles[role]));
            model.roles[siteid] = _.extend({},newroles,model.roles[siteid]);
          }
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

    model.class = Helper.escapeCSSClass(model.id);

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
            addHiddenField(model, fielddef.name, { key: 1 });
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
              var fieldName = Helper.escapeCSSClass(field.target);
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
          //Automatically add file parameters
          if ((field.type == 'file') && field.controlparams && field.controlparams.sqlparams) {
            _.each(_.pick(field.controlparams.sqlparams,['file_extension','file_name','file_size','file_upload_timestamp','file_upload_user']), function(fieldname,param){
              if(!_this.AddFieldIfNotExists(model, fieldname, modelsExt, 'B')) _this.LogInit_ERROR(model.id + ' > File field ' + fieldname + ': ' + param + ' target field does not exist in model.fields');
            });
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
    var fieldnames = {};
    var file_params = {};
    _.each(model.fields, function (field) {
      if(field.type == 'file'){
        if(field.controlparams && field.controlparams.sqlparams){
          var filesqlparams = field.controlparams.sqlparams;
          _.each(['file_size','file_extension','file_upload_user','file_upload_timestamp'], function(elem){
            if(filesqlparams[elem]){
              if(!file_params[filesqlparams[elem]]) file_params[filesqlparams[elem]] = [];
              file_params[filesqlparams[elem]].push(field.name);
            }
          });
        }
      }
    });
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
                  if(autofield.controlclass) field.controlclass = autofield.controlclass + ' ' + (field.controlclass||'');
                }
                if(field.control && (model.layout=='multisel') && (field.control != 'hidden')) field.control = 'label';
                field._auto.control = true;
                
              }
            }
            if(auto_attributes){
              //Required Field Validation
              if(autofield.validate){
                if(!('validate' in field)){
                  field.validate = [];
                  for(let i=0;i<autofield.validate.length;i++){
                    if(field.readonly && (autofield.validate[i]=='Required')) continue;
                    field.validate.push(autofield.validate[i]);
                  }
                }
              }
              //Add Foreign Key to Multisel
              if(model.layout=='multisel'){
                if(field.key) { /* No action */ }
                else if(field.lov) { /* No action */ }
                else if('foreignkey' in field) { /* No action */ }
                else if(autofield.foreignkeys && autofield.foreignkeys.direct && autofield.foreignkeys.direct.length) field.foreignkey = 1;
              }
            }
          }
        }

        //Field Datatypes
        if(auto_datatypes && !(field.unbound)){
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
        _this.ApplyCustomControl(model, field);
        //Apply Custom Controls with Query Expressions
      }
      if (field.name === '') delete field.name;

      //Apply default actions
      if (!('actions' in field) && field.unbound){
        field._auto.actions = 1;
        field.actions = 'BIU';
      }
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
        else if ((field.control == 'html') || (field.control == 'button') || (field.control == 'linkbutton') || (field.control == 'file_download') || (field.control == 'image')) field.actions = 'B';
        else if (('sqlselect' in field) && !('sqlupdate' in field) && !('sqlinsert' in field)) field.actions = 'B';
        else if (field.name && (field.name in file_params)) field.actions = 'B'; //Field is a file upload parameter
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
              else if((field.control=='label') && !field.popuplov) field.actions = 'B';
              else if(model._parentbindings[field.name] || model._childbindings[field.name]) field.actions = 'BI';
              else field.actions = 'BIU';
            }
          }
          else if(model.layout=='form'){
            if(field.key) field.actions = 'B';
            else if(field.type=='file') field.actions = 'BIU';
            else if(auto_attributes && coldef && coldef.readonly) field.actions ='B';
            else if((field.control=='label') && !field.popuplov) field.actions = 'B';
            else if(model._parentbindings[field.name] || model._childbindings[field.name]) field.actions = 'BI';
            else if(!('name' in field) && !('control' in field)) field.actions = 'B';
            //else if(!('control' in field)) field.actions = 'B';
            else field.actions = 'BIU';
          }
          else if(model.layout=='form-m'){
            if(field.key) field.actions = 'B';
            else if(field.foreignkey && !('control' in field)) field.actions = 'I';
            else if(auto_attributes && coldef && coldef.readonly) field.actions ='B';
            else if((field.control=='label') && !field.popuplov) field.actions = 'B';
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
            else if((field.control=='label') && !field.popuplov) field.actions = 'B';
            else field.actions = 'BIU';
          }
          if(!field.name && field.type && field.actions){
            //Calculated database field
            field.actions = 'B';
          }
          //_this.LogInit_WARNING('Model ' + model.id + ' Field ' + (field.name || field.caption || JSON.stringify(field)) + ' missing actions - defaulting to "'+field.actions+'"');
        }
        if((field.control=='password') && !field.unbound) field.actions = (field.actions||'').replace(/B/g,'');
      }
      if((field.name||field.sqlselect) && !('type' in field) && Helper.hasAction(field.actions, 'BIUD')){
        if(!field.value && !_.includes(['subform','html'],field.control)&&!field.unbound&&!model.unbound){
          field.type = 'varchar';
          if(!('length' in field)) field.length = -1;
        }
      }
      if(!('control' in field)){
        if(auto_controls){
          if(field.type=='file'){
            if(model.layout=='grid'){
              if(field.controlparams && (field.controlparams.image||field.controlparams.thumbnails)) field.control = 'image';
              else field.control = 'file_download';
            }
            else field.control = 'file_upload';
          }
          else if(('lov' in field) && (model.layout=='multisel')) field.control = 'label';
          else if(('lov' in field) && !isReadOnlyGrid) field.control = 'dropdown';
          else if((model.layout=='form')||(model.layout=='form-m')||(model.layout=='exec')||(model.layout=='report')){
            if(Helper.hasAction(field.actions, 'B') && !field.value){
              if(Helper.hasAction(field.actions, 'IU')){
                codegen.applyControlDefaults(model.layout, false, sqlext, field);
                _this.ApplyCustomControl(model, field);
              }
              else field.control = 'label';
            }
            if(field.value) field.control = 'html';
          }
          else if(model.layout=='grid'){
            if(!field.value) field.control = 'label';
            else if(field.value) field.control = 'html';
          }
          else if(model.layout=='multisel'){
            field.control = 'label';
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
        if(_.includes(['subform','html','hidden'],field.control)) field.caption = '';
        else if(_.includes(['linkbutton','button','label'],field.control) && ('value' in field)){
          if(model.layout=='grid') field.caption = field.value;
          else field.caption = '';
        }
        else if ('name' in field) {
          field.caption = field.name;
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
      if(model.onecolumn && !('nl' in field)){
        if((model.layout=='form')||(model.layout=='form-m')||(model.layout=='exec')||(model.layout=='report')){
          if(!firstfield && ('control' in field)){
            if((field.control=='html') && ('value' in field) && !field.caption){ /* No action */ }
            else field.nl = 1;
          }
        }
      }
      if(!('datatype_config' in field)) field.datatype_config = {};
      if ('name' in field) {
        //if (_.includes(fieldnames, field.name)) { throw new Error("Duplicate field " + field.name + " in model " + model.id + "."); }
        if (fieldnames[field.name]) { _this.LogInit_ERROR('Duplicate field ' + field.name + ' in model ' + model.id + '.'); }
        fieldnames[field.name] = 1;
      }
      if(!('captioncolon' in field)){
        if((model.layout=='form')||(model.layout=='form-m')||(model.layout=='exec')||(model.layout=='report')){
          field.captioncolon = true;
        }
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
        if (field.controlparams.CODEVal) { field.controlparams.code_val = field.controlparams.CODEVal; delete field.controlparams.CODEVal; }
        if ('code_val' in field.controlparams) _this.LogDeprecated(model.id + ' > ' + field.name + ': The controlparams code_val attribute has been deprecated - use "popuplov":{...}');
        if ('popupstyle' in field.controlparams) _this.LogDeprecated(model.id + ' > ' + field.name + ': The controlparams popupstyle attribute has been deprecated - use "popuplov":{...}');
        if ('popupiconstyle' in field.controlparams) _this.LogDeprecated(model.id + ' > ' + field.name + ': The controlparams popupiconstyle attribute has been deprecated - use "popuplov":{...}');
        if ('popup_copy_results' in field.controlparams) _this.LogDeprecated(model.id + ' > ' + field.name + ': The controlparams popup_copy_results attribute has been deprecated - use "popuplov":{...}');
        if ('base_readonly' in field.controlparams) _this.LogDeprecated(model.id + ' > ' + field.name + ': The controlparams base_readonly attribute has been deprecated - use "popuplov":{...}');
        if ('onpopup' in field.controlparams) _this.LogDeprecated(model.id + ' > ' + field.name + ': The controlparams onpopup attribute has been deprecated - use "popuplov":{...}');
        if (('image' in field.controlparams) && Helper.hasAction(field.actions, 'IU') && (field.controlparams.image)) _this.TestImageMagick(model.id + ' > ' + field.name);
        if (('thumbnails' in field.controlparams) && Helper.hasAction(field.actions, 'IU')) _.each(field.controlparams.thumbnails,function(thumbnail){ _this.TestImageMagick(model.id + ' > ' + field.name); });
      }
      if ('popuplov' in field) {
        if (field.popuplov.CODEVal) { field.popuplov.code_val = field.popuplov.CODEVal; delete field.popuplov.CODEVal; }
        _.forOwn(field.popuplov, function (val, key) {
          if (!('controlparams' in field)) field.controlparams = {};
          if (key == 'target') field.target = field.popuplov.target;
          else if (key == 'code_val') field.controlparams.code_val = field.popuplov.code_val;
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
          if(_this.Config.system_settings.automatic_parameters && !('foreignkey' in field)){
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
        if(('image' in field.controlparams)||('thumbnails' in field.controlparams)){
          if (!('preview_button' in field.controlparams)) field.controlparams.preview_button = 'View';
          if (!('preview_on_click' in field.controlparams)) field.controlparams.preview_on_click = true;
          if (!('show_thumbnail' in field.controlparams)) field.controlparams.preview_on_click = true;
        }
        else{
          if (!('download_button' in field.controlparams)) field.controlparams.download_button = 'Download';
        }
        if(!('upload_button' in field.controlparams)) field.controlparams.upload_button = 'Upload';
        if(!('delete_button' in field.controlparams)) field.controlparams.delete_button = 'Delete';
        if(field.type != 'file') _this.LogInit_ERROR('Model ' + model.id + ' Field ' + (field.name || '') + ' should have field.type="file" for field.control="file_upload"');
      }
      else if(field.control=='file_download'){
        if (!('controlparams' in field)) field.controlparams = {};
        if (!('download_button' in field.controlparams)) field.controlparams.download_button = 'Download';
        if(field.type != 'file') _this.LogInit_ERROR('Model ' + model.id + ' Field ' + (field.name || '') + ' should have field.type="file" for field.control="file_download"');
      }
      else if(field.control=='image'){
        if (!('controlparams' in field)) field.controlparams = {};
        if (!('preview_on_click' in field.controlparams)) field.controlparams.preview_on_click = true;
        if(field.type != 'file') _this.LogInit_ERROR('Model ' + model.id + ' Field ' + (field.name || '') + ' should have field.type="file" for field.control="image"');
      }
      if(field.type=='file'){
        if (!('controlparams' in field)) field.controlparams = {};
        if (!('sqlparams' in field.controlparams)) field.controlparams.sqlparams = {};
        if(field.controlparams.image||field.controlparams.thumbnails){
          if(!('show_thumbnail' in field.controlparams)){
            if(field.controlparams.thumbnails) field.controlparams.show_thumbnail = Helper.firstKey(field.controlparams.thumbnails);
            else field.controlparams.show_thumbnail = true;
          }
        }
        if(!field.controlparams.sqlparams.file_extension) field.controlparams._data_file_has_extension = true;
        if(!field.name && !('data_file_prefix' in field.controlparams)) _this.LogInit_ERROR('Model ' + model.id + ' Field ' + (field.name || '') + ' should have either field.name or field.controlparams.data_file_prefix defined if file.type="file"');
      }

      //Initialize tree control
      if(field.control=='tree'){
        if (!('controlparams' in field)) field.controlparams = {};
        if(!('expand_to_selected' in field.controlparams)) field.controlparams.expand_to_selected = true;
      }

      //Add validation to password control
      if((field.control=='password')&&!field.unbound&&!('validate' in field)){
        field.validate = [{"function":"Required","actions":((field.controlparams && field.controlparams.update_when_blank)?"BIU":"I")}, "MinLength:8"];
      }

      //Apply "enable_search" property
      if(Helper.hasAction(field.actions, 'S')){
        _this.LogDeprecated(model.id + ' > ' + field.name + ': "S" action has been deprecated.  Please use the enable_search property instead.');
        field.enable_search = 1;
      }
      else if(field.enable_search) field.actions += 'S';

      //Apply "disable_search" property
      if(!('disable_search' in field) && !('disable_search_all' in field) && !Helper.hasAction(field.actions,'BS')) field.disable_search = true;

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
        if(!_.includes(BASE_DATATYPES,field.type.toUpperCase())){
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
      if(firstfield && field.control && field.actions){
        if(!Helper.hasAction(field.actions, 'BIUD')) { /* No action */ }
        else if(field.control=='hidden') { /* No action */ }
        else if((field.control=='html') && ('value' in field) && !field.caption) { /* No action */ }
        else firstfield = false;
      }
    });
    
    if (model.fields) _.each(model.fields, function (field) {
      //**DEPRECATED MESSAGES**
      if (field.actions && Helper.hasAction(field.actions, 'C')) _this.LogDeprecated(model.id + ' > ' + field.name + ': Action \'C\' has been deprecated - use breadcrumbs.sql_params');
      if ('hidden' in field) _this.LogDeprecated(model.id + ' > ' + field.name + ': The hidden attribute has been deprecated - use "control":"hidden"');
      if ('html' in field) _this.LogDeprecated(model.id + ' > ' + field.name + ': The html attribute has been deprecated - use "control":"html"');
      if ('lovkey' in field) _this.LogDeprecated(model.id + ' > ' + field.name + ': The lovkey attribute has been deprecated');
      if (field.controlparams && ('dateformat' in field.controlparams)) _this.LogDeprecated(model.id + ' > ' + field.name + ': The field.controlparams.dateformat attribute has been deprecated - please remove and use "format":["date","MM/DD/YY"]');

      //Add automatic name
      if(!field.name){
        var fieldname = 'unnamed_';
        if(field.control) fieldname += field.control + '_';
        fieldname += 'control_';
        var idx = 1;
        while(fieldnames[fieldname+idx]) idx++;
        fieldname = fieldname + idx;
        field.name = fieldname;
        fieldnames[fieldname] = 1;
      }

      //Add dateformat
      if(field.control=='date'){
        if(!('format' in field)) field.format = ["date","YYYY-MM-DD"];
        if((field.control=='date') && (!field.controlparams || !('dateformat' in field.controlparams))){
          if(('format' in field) && _.isArray(field.format) && (field.format.length>=2) && (field.format[0]=='date')){
            if(!field.controlparams) field.controlparams = {};
            field.controlparams.dateformat = _this.getDatepickerFormat(field.format[1], model.id + ' > ' + field.name);
          }
        }
      }

      //Set field.unbound if model.unbound
      if(field.control && model.unbound) field.unbound = true;

      //Set field.unbound if control without type
      if(!('type' in field) && !('unbound' in field)) field.unbound = true;

      //Default locked_by_querystring to true
      if(!('locked_by_querystring' in field)) field.locked_by_querystring = true;

      //Process validators
      if(field.validate){
        for(var i=0;i<field.validate.length;i++){
          let validator = field.validate[i];
          let validator_updated = false;
          let vfunc = _.isString(validator)?validator:validator.function;
          let vparams = '';
          let vsplit = vfunc.indexOf(':');
          if (vsplit > 0) { vparams = vfunc.substr(vsplit + 1); vfunc = vfunc.substr(0, vsplit); }
          if(vfunc=='Equals'){
            let vparamsarr = vparams.split(',');
            if(vparams.length > 0){
              let cmpfield = _this.AppSrvClass.prototype.getFieldByName(model.fields, vparamsarr[0]);
              if(cmpfield){
                vparamsarr[0] = JSON.stringify('_obj.' + cmpfield.name);
                if(vparamsarr.length == 1) vparamsarr.push(JSON.stringify(cmpfield.caption));
                vparams = vparamsarr.join(',');
                validator_updated = true;
              }
            }
          }
          if(validator_updated){
            if(vparams) vfunc = vfunc + ':' + vparams;
            if(_.isString(validator)) field.validate[i] = vfunc;
            else validator.function = vfunc;
          }
        }
      }
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
    ParseMultiLineProperties(model, ['js', 'sqlselect', 'sqldownloadselect', 'sqlinsert', 'sqlinsertencrypt', 'sqlupdate', 'sqldelete', 'sqlexec', 'sqlwhere', 'sqlgetinsertkeys', 'oninit', 'onload', 'onloadimmediate', 'oninsert', 'onvalidate', 'onupdate', 'ondestroy', 'oncommit']);
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
          if(!field.unbound && field.locked_by_querystring && Helper.hasAction(model.actions, 'I') && Helper.hasAction(field.actions, 'I')){
            if(lov.sql||lov.sql2||lov.sqlmp||lov.sqlselect){
              if (!Helper.hasAction(field.actions, 'C')) { if (!field.actions) field.actions = ''; field.actions += 'C'; }
            }
          }
        }
        if(lov.sqlselect && !('sqlselect_params' in lov)){
          lov.sqlselect_params = [];
          _this.forEachSqlParam(model, lov.sqlselect, function(pfield_name, pfield){ lov.sqlselect_params.push(pfield_name); });
        }
        if(!('blank' in field.lov) && (field.control=='dropdown')) lov.blank = true;
        var lov_code_type = '';
        _.map(['code','code2','code_sys','code_app','code2_sys','code2_app'],function(code_type){
          if(code_type in lov){
            if(lov_code_type){ _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Cannot have multiple LOV codes on one field: '+lov_code_type+', '+code_type); }
            lov_code_type = code_type;
            var code_table = lov[code_type];
            var code_schema_index = code_table.indexOf('.');
            if(code_schema_index >= 0){
              var code_schema = code_table.substr(0, code_schema_index);
              if(('schema' in lov) && (lov.schema != code_schema)){
                _this.LogInit_ERROR(model.id + ' > ' + field.name + ': LOV '+code_type+' schema conflicts with existing schema "'+(lov.schema||'')+'"');
              }
              else lov.schema = code_schema;
              code_table = code_table.substr(code_schema_index+1);
              lov[code_type] = code_table;
            }
          }
        });
      }
      
      if(field.lov){
        //Check if sqltruncate also has %%%TRUNCATE%%% in sql
        if(('sql' in lov) || ('sql2' in lov) || ('sqlmp' in lov)){
          var lovsql = (lov.sql||'')+(lov.sql2||'')+(lov.sqlmp||'');
          if(lov.sqltruncate && (lovsql.indexOf('%%%TRUNCATE%%%') < 0)){
            _this.LogInit_ERROR(model.id + ' > ' + field.name + ': LOV uses sqltruncate without adding %%%TRUNCATE%%% to SQL');
          }
        }
        else if(lov.sqltruncate){
          _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Cannot use sqltruncate without sql, sql2, or sqlmp');
        }

        //Replace UCOD/UCOD2/GCOD/GCOD2
        if('ucod' in lov){ lov.code_sys = lov.ucod;  delete lov.ucod; }
        if('UCOD' in lov){ lov.code_sys = lov.UCOD;  delete lov.UCOD; }
        if('gcod' in lov){ lov.code_app = lov.gcod;  delete lov.gcod; }
        if('GCOD' in lov){ lov.code_app = lov.GCOD;  delete lov.GCOD; }
        if('ucod2' in lov){ lov.code2_sys = lov.ucod2;  delete lov.ucod2; }
        if('UCOD2' in lov){ lov.code2_sys = lov.UCOD2;  delete lov.UCOD2; }
        if('gcod2' in lov){ lov.code2_app = lov.gcod2;  delete lov.gcod2; }
        if('GCOD2' in lov){ lov.code2_app = lov.GCOD2;  delete lov.GCOD2; }
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
    _this.validateDisplayLayouts(model);

    //Validate Model and Field Parameters
    var _v_model = [
      'comment', 'layout', 'title', 'table', 'actions', 'roles', 'caption', 'sort', 'dev', 'sites', 'class', 'using',
      'samplerepeat', 'menu', 'id', 'idmd5', '_inherits', '_referencedby', '_parentbindings', '_childbindings', '_parentmodels', '_auto', '_sysconfig', '_dbdef', 'groups', 'helpid', 'querystring', 'buttons', 'xvalidate', 'source_files_prefix',
      'pagesettings', 'pageheader', 'pageheaderjs', 'reportbody', 'headerheight', 'pagefooter', 'pagefooterjs', 'zoom', 'reportdata', 'description', 'template', 'fields', 'jobqueue', 'batch', 'fonts',
      'hide_system_buttons', 'grid_expand_search', 'grid_rowcount', 'reselectafteredit', 'newrowposition', 'commitlevel', 'validationlevel',
      'grid_require_search', 'default_search', 'grid_static', 'rowstyle', 'rowclass', 'rowlimit', 'disableautoload',
      'oninit', 'oncommit', 'onload', 'oninsert', 'onupdate', 'onvalidate', 'onloadstate', 'ongetstate', 'onrowbind', 'ondestroy',
      'js', 'ejs', 'css', 'dberrors', 'tablestyle', 'formstyle', 'popup', 'onloadimmediate', 'sqlwhere', 'breadcrumbs', 'tabpos', 'tabs', 'tabpanelstyle',
      'nokey', 'nodatalock', 'unbound', 'duplicate', 'sqlselect', 'sqlupdate', 'sqlinsert', 'sqlgetinsertkeys', 'sqldelete', 'sqlexec', 'sqlexec_comment', 'sqltype', 'onroute', 'tabcode', 'noresultsmessage', 'bindings',
      'path', 'module', 'templates', 'db', 'onecolumn', 'namespace',
      //Report Parameters
      'subheader', 'footerheight', 'headeradd',
      'display_layouts'
    ];
    var _v_field = [
      'name', 'type', 'actions', 'control', 'caption', 'length', 'sample', 'validate', 'controlstyle', 'key', 'foreignkey', 'serverejs', 'roles', 'ongetvalue', 'cellclass',
      'controlclass', 'value', 'onclick', 'datalock', 'hidden', 'link', 'nl', 'block', 'blockstyle', 'blockclass', 'lov', 'captionstyle', 'disable_sort', 'enable_search', 'disable_search', 'disable_search_all', 'cellstyle', 'captionclass', 'captioncolon',
      'caption_ext', '_orig_control', 'format', 'eol', 'target', 'bindings', 'default', 'controlparams', 'popuplov', 'always_editable', 'locked_by_querystring', 'precision', 'password', 'hash', 'salt', 'unbound',
      'sqlselect', 'sqlupdate', 'sqlinsert','sqlsort', 'sqlwhere', 'sqlsearchsound', 'sqlsearch', 'onchange', 'lovkey', 'readonly', '__REMOVE__', '__AFTER__','_auto',
      'sql_from_db','sql_to_db','sqlsearch_to_db','datatype_config'
    ];
    var _v_controlparams = [
      'value_true', 'value_false', 'value_hidden', 'code_val', 'popupstyle', 'popupiconstyle', 'popup_copy_results', 'onpopup', 'base_readonly', 'dateformat', 'panelstyle',
      'download_button', 'preview_button', 'upload_button', 'delete_button', 'data_folder', 'data_file_prefix', 'sqlparams', '_data_file_has_extension', 'show_thumbnail', 'preview_on_click',
      'image', 'thumbnails', 'expand_all', 'expand_to_selected', 'onmove', 'ondrop', 'item_context_menu', 'insert_link', 'grid_save_before_update', "update_when_blank", "htmlarea_config"
    ];
    var _v_popuplov = ['target', 'code_val', 'popupstyle', 'popupiconstyle', 'popup_copy_results', 'onpopup', 'popup_copy_results', 'onpopup', 'base_readonly'];
    var _v_lov = ['sql', 'sql2', 'sqlmp', 'code', 'code2', 'code_sys', 'code2_sys', 'code_app', 'code2_app', 'schema', 'blank', 'parent', 'parents', 'datalock', 'sql_params', 'sqlselect', 'sqlselect_params', 'sqltruncate', 'always_get_full_lov', 'nodatalock', 'showcode', 'db', 'values', 'post_process'];
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
        if(('blank' in field.lov) && !field.lov.blank && !(field.lov.blank === '')){
          if(field.unbound && Helper.hasAction(field.actions, 'IU') && !('default' in field)){ _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Unbound LOV field with lov.blank=false must have a default value'); }
          else if(Helper.hasAction(field.actions, 'I') && !('default' in field)){ _this.LogInit_ERROR(model.id + ' > ' + field.name + ': LOV field with lov.blank=false and "I" action must have a default value'); }
        }
      }
      //if (_.includes(['label','button','linkbutton'],field.control) && Helper.hasAction(field.actions, 'IUD')) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': A '+field.control+' can only have action B'); //Disabled because popuplov / JS can change values
      if (field.value && !_.includes(['label','html','button','linkbutton'],field.control)){ _this.LogInit_ERROR(model.id + ' > ' + field.name + ': The field.value property is only supported for label, html, button, and linkbuttons controls.  Use field.default instead.'); }
      if (field.link && !_.includes(['label','html','button','linkbutton','hidden'],field.control)){ _this.LogInit_ERROR(model.id + ' > ' + field.name + ': The field.link property is only supported for label, html, button, and linkbuttons controls.'); }
      //Check unique target
      if (field.target) {
        if (!_.includes(existing_targets, field.target)) existing_targets.push(field.target);
        else _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Duplicate target - each field target must be unique within a model');
      }
      //Only allow always_editable with unbound fields
      if(field.always_editable && !field.unbound) _this.LogInit_WARNING(model.id + ' > ' + field.name + ': The field.always_editable property can only be used when field.unbound is set');
      //Check if the field has a type
      if(field.actions && field.name && !('type' in field) && !('value' in field) && (field.control != 'subform') && !field.unbound) _this.LogInit_WARNING(model.id + ' > ' + field.name + ': Missing field.type property.  Set field.value or field.unbound if it should not be bound to the data layer.');
      if(field.block && (model.layout=='grid' || model.layout=='multisel')) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Model.layout='+model.layout+' does not support the field.block property');
      if(!field.block && (field.blockstyle || field.blockclass)) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Field.block must be set to true in order to use the field.blockstyle or field.blockclass properties');
      if(field.control && (model.layout=='grid') && !_.includes(['hidden','label','html','textbox','textzoom','password','date','textarea','dropdown','checkbox','button','linkbutton','file_download','image'],field.control)) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Grid does not support ' + field.control + ' control');
      if(field.control && (model.layout=='multisel') && !_.includes(['hidden','label'],field.control)) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Multisel does not support ' + field.control + ' control');
      if(field.unbound && (model.layout=='multisel') && !_.includes(['hidden','label'],field.control)) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Multisel does not support unbound controls');
      if(!model.unbound && field.unbound && field.type) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Unbound fields should not have a field.type property');
      if(field.unbound && (field.sqlselect || field.sqlupdate || field.sqlinsert)) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Unbound fields should not have a field.sqlselect, field.sqlinsert, or field.sqlupdate properties');
      if(field.unbound && !Helper.hasAction(field.actions, 'IU') && Helper.hasAction(model.actions, 'IU') && field.always_editable) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Unbound fields that do not have "IU" actions should not have field.always_editable set');
      if(((field.control == 'file_upload') || (field.control == 'file_download') || (field.control == 'image')) && (field.type != 'file')) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': The ' + field.control + ' control requires field.type="file"');
      if(((field.control == 'file_download') || (field.control == 'image')) && Helper.hasAction(field.actions, 'IU')) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': The ' + field.control + ' control field.actions must be "B" (browse-only).');
      if((model.layout=='grid')&&(model.sqlselect)&&((model.sqlselect.indexOf('%%%ROWSTART%%%') < 0)||(model.sqlselect.indexOf('%%%ROWCOUNT%%%') < 0)) && (model.sqlselect.indexOf('%%%SQLSUFFIX%%%') < 0)) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Grid with model.sqlselect defined must use either %%%SQLSUFFIX%%% or (%%%ROWSTART%%% and %%%ROWCOUNT%%%) to implement paging');
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
      if(!('control' in field) && Helper.hasAction(field.actions, 'B')) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': The field does not have a control defined');
      if(model.unbound){
        if(field.default && field.default.sql) model._sysconfig.unbound_meta = true;
        if(field.lov) model._sysconfig.unbound_meta = true;
      }
      if(!('caption' in field) && (model.layout=='grid')) _this.LogInit_ERROR(model.id + ' > ' + field.name + ': If a grid field does not have a caption, the field.control should be set to "hidden"');
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
          _this.LogInit_ERROR(model.id + ': Model has both "unbound" and "'+prop+'" properties.  The "'+prop+'" property cannot be used with unbound forms.');
        }
      });
      if(model.breadcrumbs){
        if(model.breadcrumbs.sql) model._sysconfig.unbound_meta = true;
        if(model.breadcrumbs.insert && model.breadcrumbs.insert.sql) model._sysconfig.unbound_meta = true;
        if(model.breadcrumbs.update && model.breadcrumbs.update.sql) model._sysconfig.unbound_meta = true;
        if(model.breadcrumbs.browse && model.breadcrumbs.browse.sql) model._sysconfig.unbound_meta = true;
      }
      if(model.title){
        if(model.title.sql) model._sysconfig.unbound_meta = true;
        if(model.title.insert && model.title.insert.sql) model._sysconfig.unbound_meta = true;
        if(model.title.update && model.title.update.sql) model._sysconfig.unbound_meta = true;
        if(model.title.browse && model.title.browse.sql) model._sysconfig.unbound_meta = true;
      }
    }
    if((model.layout=='exec')&&(Helper.hasAction(model.actions, 'ID'))) _this.LogInit_ERROR(model.id + ': Exec layout only supports BU actions');
    else if((model.layout=='multisel')&&(Helper.hasAction(model.actions, 'ID'))) _this.LogInit_ERROR(model.id + ': Multisel layout only supports BU actions');
    else if((model.layout=='report')&&(Helper.hasAction(model.actions, 'ID'))) _this.LogInit_ERROR(model.id + ': Report layout only supports BU actions');
    if((model.layout=='grid')&&model.grid_static&&(Helper.hasAction(model.actions, 'IUD'))) _this.LogInit_ERROR(model.id + ': The model.grid_static property cannot be used with IUD actions');

    //Generate Validators
    _.each(model.fields, function (field) {
      if(field.validate) _this.AddValidatorFuncs(model, field);
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

  //Validate CustomFormatters
  for(var fname in _this.CustomFormatters){
    var basename = fname;
    if(Helper.endsWith(fname, '_decode')) basename = fname.substr(0,fname.length - 7);
    if((fname in _this.CustomFormatters) && ((fname+'_decode') in _this.CustomFormatters)) continue;
    if((fname != basename) && (fname in _this.CustomFormatters) && (basename in _this.CustomFormatters)) continue;
    if(fname != basename) _this.LogInit_ERROR('jsh.CustomFormatters.'+fname+' > Base formatter jsh.CustomFormatters.'+basename+' not defined');
    else _this.LogInit_ERROR('jsh.CustomFormatters.'+fname+' > Decode formatter jsh.CustomFormatters.'+fname+'_decode not defined');
  }
};

function ParseMultiLineProperties(obj, arr) {
  _.each(arr, function (p) { if (p in obj) obj[p] = Helper.ParseMultiLine(obj[p]); });
}

function addHiddenField(model, fieldname, props){
  var newfield = _.extend({ 
    name: fieldname,
    control: 'hidden'
  }, props);
  if(model.layout=='grid') newfield.disable_search = true;
  model.fields.push(newfield);
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
  if ((sql.indexOf('%%%DATALOCKS%%%') < 0) && (sql.indexOf('%%%SQLSUFFIX%%%') < 0)) this.LogInit_ERROR(model.id + ' > ' + desc + ': SQL missing %%%DATALOCKS%%% in query');
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
  if(!parentKeys.length) { options.log(model.id + ' > ' + elementname + ' Bindings: Parent model has no key.  Please explicitly define empty bindings (bindings: {}), if intentional'); return; }

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
  else if(tmodel.unbound) element.bindings = {};
  else return null;
};

exports.AddFieldIfNotExists = function(model, fieldname, modelsExt, actions){
  var _this = this;
  var field = _this.AppSrvClass.prototype.getFieldByName(model.fields, fieldname);
  if(field) return true;
  var tabledef = modelsExt[model.id].tabledef;
  if(tabledef && (fieldname in tabledef.fields)){
    addHiddenField(model, fieldname, { actions: actions });
    return true;
  }
  return false;
}

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
              addHiddenField(tmodel, childKey, { foreignkey: 1 });
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
              addHiddenField(model, binding);
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
      _this.LogInit_ERROR((prefix||'') + 'Target model "' + tmodel.id + '" does not have a role assigned to site: '+_.difference(model.sites, _.intersection(model.sites, tmodel.sites)).join(', ') +(suffix?' in link expression "'+suffix+'"':'')); return;    }
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
      else if((!_.includes(['exec','report'],tmodel.layout)) && (model.layout=='grid') && Helper.hasAction(parentField.actions, 'U') && !(targetField.controlparams && targetField.controlparams.grid_save_before_update)) {
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
    if (!tmodel) { _this.LogInit_ERROR(model.id + ' > Duplicate: Invalid target'); return; }
    if(tmodel.layout != 'exec') { _this.LogInit_ERROR(model.id + ' > Duplicate: Target model should have "exec" layout'); }
    tmodel._parentmodels.duplicate[model.id] = 1;
    model.duplicate.target = tmodel.id;
    validateSiteRoles(model, tmodel, model.id + ' > Duplicate model ' + JSON.stringify(model.duplicate) + ': ', '');
    validateSiteLinks(model, model.duplicate.link_on_success, model.id + ' > Duplicate model ' + JSON.stringify(model.duplicate) + ' link_on_success: ', model.duplicate.link_on_success);
    validateBindings(model.duplicate.bindings, model, tmodel, model.id + ' > Duplicate model ' + JSON.stringify(model.duplicate) + ': ', model.duplicate);
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
      if (!tmodel) { _this.LogInit_ERROR(model.id + ' > ' + field.name + ': Invalid target model "' + field.target + '"'); return; }
      if(field.control=='subform') tmodel._parentmodels.subform[model.id] = 1;
      else if(field.popuplov) tmodel._parentmodels.popuplov[model.id] = 1;
      field.target = tmodel.id;
      validateSiteRoles(model, tmodel, model.id + ' > ' + field.name + ': ', '', field.roles);
      validateSiteLinks(model, field.link, model.id + ' > ' + field.name + ' link: ', field.link, field.roles);
      validateBindings(field.bindings, model, tmodel, model.id + ' > ' + field.name + ': ', field);
      if(field.popuplov){
        var found_code_val = false;
        var found_child_popup_copy_results = {};
        var found_parent_popup_copy_results = {};
        _.each(field.popuplov.popup_copy_results, function(child_field, parent_field){
          found_child_popup_copy_results[child_field] = false;
          found_parent_popup_copy_results[parent_field] = false;
        });
        _.each(tmodel.fields, function(tfield){
          if(tfield.name==field.popuplov.code_val) found_code_val = true; 
          for(var key in found_child_popup_copy_results) if(tfield.name==key) found_child_popup_copy_results[key] = true;
        });
        _.each(model.fields, function(pfield){
          for(var key in found_parent_popup_copy_results) if(pfield.name==key) found_parent_popup_copy_results[key] = true;
        });
        if(field.popuplov.code_val && !found_code_val) _this.LogInit_WARNING(model.id + ' > Popup LOV ' + field.name + ': popuplov.code_val "' + field.popuplov.code_val + '" not found in target model');
        for(var key in found_child_popup_copy_results) if(!found_child_popup_copy_results[key]) _this.LogInit_WARNING(model.id + ' > Popup LOV ' + field.name + ': popuplov.popup_copy_results - Target field "' + key + '" not found in target model');
        for(var key in found_parent_popup_copy_results) if(!found_parent_popup_copy_results[key]) _this.LogInit_WARNING(model.id + ' > Popup LOV ' + field.name + ': popuplov.popup_copy_results - Parent field "' + key + '" not found in model');
      }
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

exports.getDatepickerFormat = function(fstr, fdesc){
  /*
  Moment Format String
  --------------------
  >>> Month	
  M	1 2 ... 11 12
  Mo	1st 2nd ... 11th 12th
  MM	01 02 ... 11 12
  MMM	Jan Feb ... Nov Dec
  MMMM	January February ... November December
  >>> Quarter
  Q	1 2 3 4
  Qo	1st 2nd 3rd 4th
  >>> Day of Month
  D	1 2 ... 30 31
  Do	1st 2nd ... 30th 31st
  DD	01 02 ... 30 31
  >>> Day of Year
  DDD	1 2 ... 364 365
  DDDo	1st 2nd ... 364th 365th
  DDDD	001 002 ... 364 365
  >>> Day of Week
  d	0 1 ... 5 6
  do	0th 1st ... 5th 6th
  dd	Su Mo ... Fr Sa
  ddd	Sun Mon ... Fri Sat
  dddd	Sunday Monday ... Friday Saturday
  >>> Day of Week (Locale)
  e	0 1 ... 5 6
  >>> Day of Week (ISO)
  E	1 2 ... 6 7
  >>> Week of Year
  w	1 2 ... 52 53
  wo	1st 2nd ... 52nd 53rd
  ww	01 02 ... 52 53
  >>> Week of Year (ISO)
  W	1 2 ... 52 53
  Wo	1st 2nd ... 52nd 53rd
  WW	01 02 ... 52 53
  >>> Year
  YY	70 71 ... 29 30
  YYYY	1970 1971 ... 2029 2030
  Y	1970 1971 ... 9999 +10000 +10001 
  Note: This complies with the ISO 8601 standard for dates past the year 9999
  >>> Week Year
  gg	70 71 ... 29 30
  gggg	1970 1971 ... 2029 2030
  >>> Week Year (ISO)
  GG	70 71 ... 29 30
  GGGG	1970 1971 ... 2029 2030
  >>> AM/PM
  A	AM PM
  a	am pm
  >>> Hour
  H	0 1 ... 22 23
  HH	00 01 ... 22 23
  h	1 2 ... 11 12
  hh	01 02 ... 11 12
  k	1 2 ... 23 24
  kk	01 02 ... 23 24
  >>> Minute
  m	0 1 ... 58 59
  mm	00 01 ... 58 59
  >>> Second
  s	0 1 ... 58 59
  ss	00 01 ... 58 59
  >>> Fractional Second
  S	0 1 ... 8 9
  SS	00 01 ... 98 99
  SSS	000 001 ... 998 999
  SSSS ... SSSSSSSSS	000[0..] 001[0..] ... 998[0..] 999[0..]
  >>> Time Zone
  z or zz	EST CST ... MST PST 
  Note: as of 1.6.0, the z/zz format tokens have been deprecated from plain moment objects. Read more about it here. However, they *do* work if you are using a specific time zone with the moment-timezone addon.
  Z	-07:00 -06:00 ... +06:00 +07:00
  ZZ	-0700 -0600 ... +0600 +0700
  >>> Unix Timestamp
  X	1360013296
  >>> Unix Millisecond Timestamp
  x	1360013296123

  jQuery Format String
  --------------------
  d - day of month (no leading zero)
  dd - day of month (two digit)
  o - day of the year (no leading zeros)
  oo - day of the year (three digit)
  D - day name short
  DD - day name long
  m - month of year (no leading zero)
  mm - month of year (two digit)
  M - month name short
  MM - month name long
  y - year (two digit)
  yy - year (four digit)
  @ - Unix timestamp (ms since 01/01/1970)
  ! - Windows ticks (100ns since 01/01/0001)
  '...' - literal text
  '' - single quote

  d   > D
  dd  > DD
  o   > DDD
  oo  > DDDD
  D   > ddd
  DD  > dddd
  m   > M
  mm  > MM
  M   > MMM
  MM  > MMMM
  y   > YY
  yy  > YYYY
  @   > X

  1. Front to back, convert all non-tokens to literals
  2. Merge literals
  */
  var tokens = {
    'DDDD': 'oo',
    'dddd': 'DD',
    'MMMM': 'MM',
    'YYYY': 'yy',
    'DDD': 'o',
    'ddd': 'D',
    'MMM': 'M',
    'DD': 'dd',
    'MM': 'mm',
    'YY': 'y',
    'D': 'd',
    'M': 'm',
    'X': '@',
  };
  var rslt = (fstr||'').toString();
  var unsupported = false;
  for(var i=0;i<rslt.length;i++){
    var found_token = false;
    for(var token in tokens){
      if(rslt.substr(i,token.length)==token){
        found_token = true;
        rslt = rslt.substr(0,i) + tokens[token] + rslt.substr(i+token.length);
        i += tokens[token].length - 1;
        break;
      }
    }
    if(!found_token){
      if(((rslt[i] >= 'A') && (rslt[i] <= 'Z')) || ((rslt[i] >= 'a') && (rslt[i] <= 'z'))){
        unsupported = true;
      }
    }
  }
  if(unsupported){
    this.LogInit_ERROR(fdesc + ': Unsupported date format for date control: "' + fstr + '", please use only D/DD/DDD/DDDD/ddd/dddd/M/MM/MMM/MMMM/YY/YYYY/X');
  }
  return rslt;
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
