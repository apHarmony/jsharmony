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
var url = require('url');
var querystring = require('querystring');
var Helper = require('./lib/Helper.js');
var ejsext = require('./lib/ejsext.js');
var moment = require('moment');
var jsHarmonyLocale = require('./jsHarmonyLocale.js');

var _ERROR = 1;
var _WARNING = 2;
var _INFO = 4;
var _PERFORMANCE = 8;

/*************************
|    HELPER FUNCTIONS    |
*************************/
exports.parseButtons = function (buttons) {
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
    if(!rsltbtn.icon) rsltbtn.icon = "ok";
    if(!('hide_when_target_inaccessible' in rsltbtn)) rsltbtn.hide_when_target_inaccessible = true;
    rslt.push(rsltbtn);
  });
  return rslt;
}

exports.parseLink = function (target) {
  var action = '';
  var actionParams = {};
  var modelid = '';
  var keys = {};
  var tabs = null;
  var url = '';
  target = target || '';

  function parseAction(_action){
    if (target.indexOf(_action + ':') == 0) {
      action = _action;
      modelid = target.substring(_action.length+1);
      return true;
    }
    else if (target.indexOf(_action + '(') == 0) {
      var parsestr = target;
      var actionParamsArr = parsestr.substr(_action.length + 1, parsestr.indexOf(')') - _action.length - 1).trim().split(',');
      for(var i=0;i<actionParamsArr.length;i++){
        var param = actionParamsArr[i].trim();
        var pname = param;
        var pvalue = 1;
        if(param.indexOf('=') >= 0){
          pname = param.substr(0,param.indexOf('=')).trim();
          pvalue = param.substr(param.indexOf('=')+1).trim();
        }
        if(!pname) continue;
        actionParams[pname.toLowerCase()] = pvalue;
      }
      parsestr = parsestr.substring(parsestr.indexOf(')')+1).trim();
      if(parsestr.length && parsestr[0]==':'){
        action = _action;
        modelid = parsestr.substring(parsestr.indexOf(':')+1);
      }
      return true;
    }
    return false;
  }

  //Parse action
  if(parseAction('update')){ /* Do nothing */ }
  else if(parseAction('insert')){ /* Do nothing */ }
  else if(parseAction('browse')){ /* Do nothing */ }
  else if(parseAction('download')){ /* Do nothing */ }
  else if(parseAction('savenew')){ /* Do nothing */ }
  else if(parseAction('select')){ /* Do nothing */ }
  else if(parseAction('url')){ /* Do nothing */ }
  else modelid = target;

  //Parse parameters
  if (action == 'url') {
    url = modelid;
    modelid = '';
  }
  else if ((modelid.indexOf('&') >= 0)||(modelid.indexOf('?') >= 0)) {
    var modelmarker = '&';
    if((modelid.indexOf('?') >= 0) && (modelid.indexOf('?') < modelid.indexOf('&'))) modelmarker = '?';
    var opts = modelid.substr(modelid.indexOf(modelmarker)+1);
    modelid = modelid.substr(0,modelid.length-opts.length-1);
    opts = opts.split('&');
    for (var i = 0; i < opts.length; i++) {
      if (Helper.beginsWith(opts[i], 'tabs=')) tabs = opts[i].substr(5);
      else {
        var keystr = opts[i];
        var prekeys = keystr.split(',');
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

  return { action: action, actionParams: actionParams, modelid: modelid, keys: keys, tabs: tabs, url: url };
}

exports.parseFieldExpression = function(field, exp, params, options){
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

// getURL :: Generate a URL for a link, based on the "target" string
//Button Links
//  jsh.getURL(req, model, link_target, undefined, undefined, link_bindings);
//Tab Links: linktabs[model.id] = tabmodelid
//  jsh.getURL(req, model, '', linktabs); 
//Duplicate Model Links
//  jsh.getURL(req, model, model.duplicate.link_on_success, undefined, dmodel.fields);
//Select Links: 'select'
//  jsh.getURL(req, model, srcfield.link + ':' + model.id, undefined, model.fields); 
//Field link
//  jsh.getURL(req, model, srcfield.link, undefined, model.fields);
//Field insert_link
//  jsh.getURL(req, model, srcfield.controlparams.insert_link, undefined, undefined, srcfield.bindings);
//
//ex: update:EW&E_ID
//Parameters:
//  req (Express.Request): Request
//  target (string): Link target
//  tabs: Array of selected tabs: { "PARENT_MODEL_ID": "SELECT_TAB_MODEL_ID" }
//  fields: Array of the model's fields, for adding querystring parameters to the link, based on the link target parameters, ex: update:EW&e_c_id=c_id
//  bindings: Array of the link bindings, for adding additional querystring parameters to the link
//            Bindings will be evaluated client-side, and overwrite any other querystring parameters
exports.getURL = function (req, srcmodel, target, tabs, fields, bindings) {
  var _this = this;
  var ENCODE_URI = req.jshsite.instance+'.XExt.encodeEJSURI';
  var ptarget = this.parseLink(target);
  if(ptarget.url) return ptarget.url;
  var modelid = ptarget.modelid;
  var action = ptarget.action;
  if (modelid == '') modelid = req.TopModel;
  var tmodel = this.getModel(req, modelid, srcmodel);
  if(!tmodel) throw new Error('Model ' + modelid + ' not found');
  var fullmodelid = tmodel.id;
  if (!Helper.hasModelAction(req, tmodel, 'BIU')) return "";
  tabs = typeof tabs !== 'undefined' ? tabs : new Object();
  var rslt = req.baseurl + fullmodelid;
  if(req.curtabs) for(var xmodelid in req.curtabs){
    var tabmodel = this.getModel(req, xmodelid, srcmodel);
    if(tabmodel){
      if(!(tabmodel.id in tabs)) { tabs[tabmodel.id] = req.curtabs[xmodelid]; }
    }
  }
  var q = {};
  if (typeof fields == 'undefined') {
    //if fullmodelid = currentmodelid  (changing tab)
    if (req.TopModel == fullmodelid) {
      _.extend(q, req.query); //Copy all parameters
    }
  }
  if (action != ''){
    if(action=='savenew') q['action'] = 'insert';
    else q['action'] = action;
  }
  if (Helper.Size(tabs) > 0) {
    if (req.TopModel == fullmodelid) {
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
    rslt = req.baseurl + '_dl/' + fullmodelid + '/<#='+ENCODE_URI+'(data[\'' + keyfield + '\'])#>/' + fieldname;
    return rslt;
  }

  //Add keys
  if ((action == 'update') || (action == 'insert') || (action == 'browse') || (action == 'select') || (action == 'savenew')) {
    if (action == 'select') { rsltoverride = '#select'; }
    if (_.size(ptarget.keys) > 0) {
      var ptargetkeys = _.keys(ptarget.keys);
      for (var i = 0; i < ptargetkeys.length; i++) {
        delete q[ptargetkeys[i]];
        var keyval = ptarget.keys[ptargetkeys[i]];
        if (!isNaN(keyval)) {}
        else if(keyval && (keyval[0]=="'")){
          keyval = keyval.trim();
          keyval = Helper.escapeHTML(keyval.substr(1,keyval.length-2));
        }
        else keyval = '<#='+ENCODE_URI+'(data[\'' + keyval + '\'])#>';
        rsltparams += '&amp;' + ptargetkeys[i] + '=' + keyval;
        /* Commented out for Amber COMH_CDUP form, so that c_id=X1 would work
        for (var j = 0; j < fields.length; j++) {
          var field = fields[j];
          if (!('name' in field)) continue;
          if (field.name == ptargetkeys[i]) {
            rslt += '&amp;' + field['name'] + '=<#=data[\'' + ptarget.keys[ptargetkeys[i]] + '\']#>';
          }
        }*/
      }
    }
    else if (typeof fields !== 'undefined') {
      var foundfield = false;
      if((action=='update')||(action=='browse')){
        _.each(tmodel.fields, function (field) {
          if (field.key && _this.AppSrvClass.prototype.getFieldByName(fields, field.name)) {
            foundfield = true;
            delete q[field['name']];
            rsltparams += '&amp;' + field['name'] + '=<#='+ENCODE_URI+'(jsh.XExt.LiteralOrLookup(\'' + field['name'] + '\',[data, jsh._GET]))#>';
          }
        });
      }
      if(!foundfield){
        _.each(fields, function (field) {
          if (field.key) {
            var tmodelKeyConflict = false;
            if((action=='insert')||(action=='savenew')){
              _.each(tmodel.fields, function (tfield) {
                if(field.name && (tfield.name == field.name) && field.key && !Helper.hasAction(field.actions, 'IU')){
                  tmodelKeyConflict = true;
                }
              });
            }
            if(!tmodelKeyConflict){
              //If insert and no "IU" on field, do not add to params
              delete q[field['name']];
              rsltparams += '&amp;' + field['name'] + '=<#='+ENCODE_URI+'(data[\'' + field['name'] + '\'])#>';
            }
          }
        });
      }
    }
  }
  if (typeof bindings !== 'undefined') {
    _.each(bindings, function (binding, bindingid) {
      //Evaluate bindings
      delete q[bindingid];
      rsltparams += '&amp;' + bindingid + '=<#='+ENCODE_URI+'('+req.jshsite.instance+'.XExt.LiteralOrLookup(' + JSON.stringify(binding).replace(/"/g, '&quot;') + ',data))#>';
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

//Generates the "onclick" event for a link, based on the field.link property
exports.getURL_onclick = function (req, model, link) {
  var seturl = "var url = "+req.jshsite.instance+".$(this).attr('data-url'); if(!url) url = "+req.jshsite.instance+".$(this).attr('href'); if(url=='#') url = ''; if(!url || (url=='mailto:')) return false;";
  var rslt = req.jshsite.instance+".XExt.navTo(url); return false;";
  var windowtarget = '_self';
  if (typeof link != 'undefined') {
    var link = link;
    var ptarget = this.parseLink(link);
    var tmodel = null;
    if(ptarget.url){ /* Do nothing */ }
    else {
      tmodel = this.getModel(req, ptarget.modelid||req.TopModel, model);
      if (!tmodel) throw new Error("Link Model " + ptarget.modelid + " not found.");
      if (!Helper.hasModelAction(req, tmodel, 'BIU')) return req.jshsite.instance+".XExt.Alert('You do not have access to this form.');return false;";
    }
    if(model && model.layout){
      if ((model.layout == 'form') || (model.layout == 'form-m') || (model.layout == 'exec') || (model.layout == 'report')) {
        seturl += "var jsh="+req.jshsite.instance+"; var modelid='" + Helper.escapeJS(model.id) + "'; var xmodel=jsh.XModels[modelid]; var xform = xmodel.controller.form; if(xform && xform.Data && !xform.Data.Commit()) return false; url = jsh.XPage.ParseEJS(url,modelid); if(!url || (url=='mailto:')) return false;";
      }
      else if (model.layout == 'grid'){
        seturl += "var jsh="+req.jshsite.instance+"; var modelid='" + Helper.escapeJS(model.id) + "'; var xmodel=jsh.XModels[modelid]; var xgrid = xmodel.controller.grid; var xform = xmodel.controller.form; var xeditablegrid = xmodel.controller.editablegrid; ";
        seturl += "if(xeditablegrid && xeditablegrid.CurrentCell && !xform.CommitRow()) return false; ";
        seturl += "if(xform && xform.Data && !xform.Data.Commit()) return false; ";
        seturl += "var rowid = jsh.XExt.XModel.GetRowID(modelid, this); ";
        seturl += "url = jsh.XPage.ParseEJS(url, modelid, undefined, xform.DataSet[rowid]); if(!url || (url=='mailto:')) return false;";
      }
    }
    if(ptarget.action=='download'){
      rslt = "url += '?format=js'; "+req.jshsite.instance+".getFileProxy().prop('src', url); return false;";
    }
    else if ((tmodel && ('popup' in tmodel))||!_.isEmpty(ptarget.actionParams)) {
      var params = {
        resizable: 1,
        scrollbars: 1
      }
      if(tmodel && ('popup' in tmodel)){
        params.width = tmodel['popup'][0];
        params.height = tmodel['popup'][1];
      }
      params = _.extend(params, ptarget.actionParams);
      windowtarget = ('target' in params)?params.target:'_blank';
      delete params.target;
      var paramsarr = [];
      for(var key in params) paramsarr.push(key+'='+params[key]);
      rslt = "window.open(url,'"+Helper.escapeJS(windowtarget)+"','"+Helper.escapeJS(paramsarr.join(','))+"');return false;";
    }
  }
  if(ptarget.action=='savenew'){
    rslt = req.jshsite.instance+".XPage.SaveNew(function(){" + rslt + "}, { abortRefresh: " + (windowtarget=='_self'?'true':'false') + " });return false;";
  }
  return seturl + rslt;
}

exports.getModelClone = function(req, fullmodelid, options){
  if(!options) options = {};
  var model;
  if(options.cloneLocal) model = this.getModel(req, fullmodelid);
  else model = this.getModel(undefined, fullmodelid);

  if(!model) return model;
  return _.cloneDeep(model);
}

exports.getBaseModelName = function(modelid){
  if(!modelid) return modelid;
  if(modelid.indexOf('/')<0) return modelid;
  modelid = modelid.substr(modelid.lastIndexOf('/')+1);
  return modelid;
}

exports.getNamespace = function(modelid){
  if(modelid.indexOf('/')>=0){
    return modelid.substr(0,modelid.lastIndexOf('/')+1);
  }
  else return '';
}

exports.getCanonicalNamespace = function(namespace, parentNamespace){
  namespace = namespace || '';
  parentNamespace = parentNamespace || '';
  //Add trailing slash to namespace if it does not exist
  if(namespace && (namespace[namespace.length-1]!='/')) namespace += '/';
  //Prepend parent namespace if the namespace does not begin with a "/"
  if(!namespace || (namespace[0]!='/')){
    var cmpParentNamespace = parentNamespace;
    if(cmpParentNamespace){
      if(cmpParentNamespace[0]=='/') cmpParentNamespace = cmpParentNamespace.substr(1);
      if(Helper.beginsWith(namespace, cmpParentNamespace)) namespace = namespace.substr(cmpParentNamespace.length);
    }
    namespace = parentNamespace + namespace;
  }
  if(namespace && (namespace[0]=='/')) namespace = namespace.substr(1);
  return namespace;
}

exports.resolveModelID = function(modelid, sourceModel, options /* { ignore: [] } */){

  function ignoreModel(testmodel){
    if(!options || !options.ignore || !options.ignore.length) return false;
    return _.includes(options.ignore, testmodel);
  }

  if(!modelid) return undefined;
  //Absolute
  if(modelid.substr(0,1)=='/'){
    var testmodel = modelid.substr(1);
    if(!ignoreModel(testmodel)) return modelid.substr(1);
    return undefined;
  }
  if(!sourceModel) return modelid;
  //Relative to namespace
  if(sourceModel.namespace){
    var testmodel = sourceModel.namespace+modelid;
    if((testmodel in this.Models) && !ignoreModel(testmodel)) return testmodel;
  }
  //Model Using
  if(sourceModel.using){
    for(var i=0;i<sourceModel.using.length;i++){
      var namespace = sourceModel.using[i];
      var testmodel = namespace+modelid;
      if(testmodel.substr(0,1)=='/') testmodel = testmodel.substr(1);
      if((testmodel in this.Models) && !ignoreModel(testmodel)) return testmodel;
    }
  }
  //Module Using
  if(sourceModel.module){
    var module = this.Modules[sourceModel.module];
    if(module.using){
      for(var i=0;i<module.using.length;i++){
        var namespace = module.using[i];
        var testmodel = namespace+modelid;
        if(testmodel.substr(0,1)=='/') testmodel = testmodel.substr(1);
        if((testmodel in this.Models) && !ignoreModel(testmodel)) return testmodel;
      }
    }
  }
  if(!ignoreModel(modelid)) return modelid;
  return undefined;
}

exports.getModel = function(req, modelid, sourceModel, options /* { ignore: [] } */) {
  modelid = this.resolveModelID(modelid, sourceModel, options);
  if(req){
    if(req.jshlocal && (modelid in req.jshlocal.Models)) return req.jshlocal.Models[modelid];
  }
  if(sourceModel && !this.isInitialized){
    if(modelid in this.Models){
      if(!_.includes(this.Models[modelid]._referencedby, sourceModel.id)){
        this.Models[modelid]._referencedby.push(sourceModel.id);
      }
    }
  }
  return this.Models[modelid];
}

exports.getModelDB = function(req, fullmodelid) {
  var model = this.getModel(req, fullmodelid);
  var dbid = '';
  if(model.db) dbid = model.db;
  return this.getDB(dbid);
}

exports.getDB = function(dbid){
  if(!dbid) dbid = 'default';
  if(!(dbid in this.DB)) throw new Error('Database connection '+dbid+' not found');
  return this.DB[dbid];
}

exports.hasModel = function(req, modelid, sourceModel){
  var model = this.getModel(undefined, modelid, sourceModel);
  return !!model;
}

exports.getTabs = function (req, model) {
  var curtabs = {};
  if (typeof req.query['tabs'] != 'undefined') {
    var tabs = JSON.parse(req.query['tabs']);
    for (var xmodelid in tabs) {
      var tabmodel = this.getModel(req, xmodelid, model);
      if (tabmodel) {
        curtabs[tabmodel.id] = tabs[xmodelid];
      }
    }
  }
  return curtabs;
};

exports.getStaticBinding = function(str){
  if (!isNaN(str)) return str;
  else if ((str.length >= 2) && (str[0] == "'") && (str[str.length - 1] == "'")) return str.substr(1, str.length - 2);
  else if(str.trim().toLowerCase()=='null') return null;
  return undefined;
}

//Get custom formatters for client-side formatting
exports.getCustomFormatters = function(){
  var _this = this;
  var rslt = {};
  for(var fname in _this.CustomFormatters){
    rslt[fname] = _this.CustomFormatters[fname].toString();
  }
  return rslt;
}

//Generate client-side validators
exports.GetClientValidator = function (req, model, field, actions) {
  var _this = this;
  var rslt = [];
  _.each(field.validate, function (validator) {
    if(_.isString(validator)) validator = { function: validator };
    //Parse validator function
    var vfuncname = validator.function;
    var vparams = '';
    var vsplit = vfuncname.indexOf(':');
    if (vsplit > 0) { vparams = vfuncname.substr(vsplit + 1); vfuncname = vfuncname.substr(0, vsplit); }
    if (validator.runat && !_.includes(validator.runat,'client')) return;
    var vfunccall = '';
    if(vfuncname == 'js'){
      vfunccall = '(function(_caption, _val, _obj){'+validator.function.substr(3)+'})';
    }
    else {
      if (!(('_v_' + vfuncname) in _this.XValidate)) return; //Ignore undefined functions
      var vfunc = _this.XValidate['_v_' + vfuncname];
      if(!vfunc || (vfunc.runat && !_.includes(vfunc.runat,'client'))) return; //Ignore server-only functions
      if(('_v_' + vfuncname) in _this.XValidate.BaseValidators){
        vfunccall = 'XValidate._v_' + vfuncname + '(' + vparams + ')';
      }
      else {
        vfunccall = '('+vfunc.toString()+')(' + vparams + ')';
      }
    }
    //Parse validator actions
    var vactions = ('actions' in validator)?validator.actions:(field.always_editable?ejsext.getActions(req, model, "BIU"):actions);
    var vcaption = ('caption' in validator)?validator.caption:(field.caption_ext||field.caption);
    var client_validator = {
      actions: vactions,
      caption: vcaption,
      funcs: [vfunccall]
    };
    if('selector' in validator) client_validator.selector = validator.selector;
    rslt.push(client_validator);
  });
  return rslt;
};

exports.generateLOVTree = function (values, options) {
  options = _.extend({ separator: '/', root_txt: '(Root)', default_root: true, new_code_val: function(patharr){ return patharr.join("/"); } }, options);
  var separator = options.separator || '/';
  
  var jsh = this;
  var map = jsh.Config.ui_field_mapping;
  var rslt = [];
  var paths = {};

  function mapCode(code){
    var rslt = {}
    rslt[map.code_id] = code.code_id;
    rslt[map.code_parent_id] = code.code_parent_id;
    rslt[map.code_val] = code.code_val;
    rslt[map.code_txt] = code.code_txt;
    rslt[map.code_icon] = code.code_icon;
    return rslt;
  }

  //Normalize paths
  for(var i=0;i<values.length;i++){
    var path = values[i][map.code_val];
    while(path.indexOf(separator+separator)>=0) path = Helper.ReplaceAll(path, separator+separator, separator);
    if(path.indexOf(separator)==0) path = path.substr(separator.length);
    if(path.lastIndexOf(separator)==path.length-separator.length) path = path.substr(0,path.length-separator.length);
    if(path in paths) continue;

    //Add value to array
    values[i][map.code_id] = path;
    paths[path] = values[i];
  }

  //Add missing parents to array
  for(var path in paths){
    var patharr = path.split(separator);
    for(var i=0;i<(patharr.length-1);i++){
      var subpath = patharr.slice(0,i+1).join(separator);

      //Add root node, if necessary
      if(!('' in paths)){
        var new_code_val = options.new_code_val(['']);
        if(_.isObject(options.default_root)) paths[''] = mapCode(options.default_root);
        else paths[''] = mapCode({ code_id: '', code_parent_id: null, code_val: new_code_val, code_txt: options.root_txt, code_icon: paths[path][map.code_icon] });
      }

      //Add parent path
      if(!(subpath in paths)){
        var new_code_val = options.new_code_val(patharr.slice(0,i+1));
        paths[subpath] = mapCode({ code_id: subpath, code_parent_id: null, code_val: new_code_val, code_txt: patharr[i], code_icon: paths[path][map.code_icon] });
      }
    }
    if(!path) paths[path][map.code_txt] = options.root_txt;
    else paths[path][map.code_txt] = patharr[patharr.length-1];
  }

  //Add root node, if necessary
  if(options.default_root && !('' in paths)){
    var new_code_val = options.new_code_val(['']);
    if(_.isObject(options.default_root)) paths[''] = mapCode(options.default_root);
    else paths[''] = mapCode({ code_id: '', code_parent_id: null, code_val: new_code_val, code_txt: options.root_txt, code_icon: 'folder' });
  }

  //Sort by path
  var rslt = [];
  for(var path in paths) rslt.push(paths[path]);
  rslt.sort(function(a,b){
    var alower = (a[map.code_id]||'').toLowerCase();
    var blower = (b[map.code_id]||'').toLowerCase();
    if(alower > blower) return 1;
    if(alower < blower) return -1;
    return 0;
  });

  //Add code_id, code_parent_id
  var i=1;
  _.each(rslt, function(val){
    var parentpath = val[map.code_id].split(separator);
    if(parentpath.length > 1){
      parentpath = parentpath.slice(0,parentpath.length-1).join(separator);
      if(parentpath in paths) val[map.code_parent_id] = paths[parentpath][map.code_id];
    }
    else if(!val[map.code_id]) { /* Root node */ }
    else {
      if(paths['']) val[map.code_parent_id] = paths[''][map.code_id];
    }
    //Find parent node and add missing nodes
    val[map.code_id] = i;
    i++;
  });

  //Update values array
  while(values.length) values.pop();
  for(var i=0;i<rslt.length;i++) values.push(rslt[i]);
}

//Add server-side validators for models and tasks
exports.AddValidatorFuncs = function (xvalidate, field, desc) {
  var jsh = this;
  if(!field.validate) return;
  _.each(field.validate, function (validator) {
    if(_.isString(validator)) validator = { function: validator };
    var vfuncname = validator.function;
    var vparams = '';
    var vsplit = vfuncname.indexOf(':');
    if (vsplit > 0) { vparams = vfuncname.substr(vsplit + 1); vfuncname = vfuncname.substr(0, vsplit); }
    var vactions = ('actions' in validator)?validator.actions:field.actions;
    var vcaption = ('caption' in validator)?validator.caption:(field.caption_ext||field.caption||field.name);

    if (validator.runat && !_.includes(validator.runat,'server')) return;

    if((vfuncname != 'js') && !(('_v_'+vfuncname) in jsh.XValidate)){ jsh.LogInit_ERROR(desc + ' > ' + field.name + ': Undefined validator used in field.validate: '+vfuncname); return; }

    var vfunc = null;
    try{
      if(vfuncname=='js') vfunc = eval('(function(_caption, _val, _obj){'+validator.function.substr(3)+'})');
      else vfunc = eval('jsh.XValidate._v_' + vfuncname + '(' + vparams + ')');
    }
    catch(ex){
      if(ex){ jsh.LogInit_ERROR(desc + ' > ' + field.name + ': Error initializing validator '+vfuncname+': '+ex.toString()); return; }
    }
    if(!vfunc){ jsh.LogInit_ERROR(desc + ' > ' + field.name + ': Error initializing validator '+vfuncname+': No function returned from jsh.XValidate._v_'+vfuncname); return; }
    if(vfunc.runat && !_.includes(vfunc.runat,'server')) return; //Ignore client-only functions

    //Do not add validators to unbound fields
    if(field.unbound) return;
    xvalidate.AddValidator(
      '_obj.' + field.name,
      vcaption,
      vactions,
      [vfunc],
      field.roles
    );
  });
};

exports.SendTXTEmail = function (dbcontext, txt_attrib, email_to, email_cc, email_bcc, email_attachments, params, callback) {
  var _this = this;
  //Pull TXT data from database
  var dbtypes = _this.AppSrv.DB.types;
  _this.AppSrv.ExecRecordset(dbcontext, "Helper_SendTXTEmail", [dbtypes.VarChar(32)], { 'txt_attrib': txt_attrib }, function (err, rslt) {
    if ((rslt != null) && (rslt.length == 1) && (rslt[0].length == 1)) {
      var TXT = rslt[0][0];
      var new_bcc = email_bcc;
      if (TXT[_this.map.txt_bcc]) {
        if (new_bcc) new_bcc += ', ' + TXT[_this.map.txt_bcc];
        else new_bcc = TXT[_this.map.txt_bcc];
      }
      var email_text = '';
      var email_html = '';
      var email_body = TXT[_this.map.txt_body];
      if (email_body && (TXT[_this.map.txt_type].toUpperCase()=='HTML')) email_html = email_body;
      else email_text = email_body;
      _this.SendBaseEmail(dbcontext, TXT[_this.map.txt_title], email_text, email_html, email_to, email_cc, new_bcc, email_attachments, params, callback)
    }
    else return callback(new Error('Email ' + txt_attrib + ' not found.'));
  });
};

exports.SendBaseEmail = function (dbcontext, email_subject, email_text, email_html, email_to, email_cc, email_bcc, email_attachments, params, callback){
  var _this = this;
  email_to = email_to || null;
  email_cc = email_cc || null;
  email_bcc = email_bcc || null;
  
  var mparams = {};
  if (email_to) mparams.to = email_to;
  if (email_cc) mparams.cc = email_cc;
  if (email_bcc) mparams.bcc = email_bcc;
  if (email_attachments) mparams.attachments = email_attachments;
  mparams.subject = email_subject;
  //Set Text Body, HTML Body, and Subject
  if (!email_text && !email_html) mparams.text = '';
  try {
    if (email_text) {
      mparams.text = email_text;
      mparams.text = ejs.render(mparams.text, { data: params, _: _, moment: moment });
    }
    if (email_html) {
      if (email_html.toLowerCase().indexOf('<html') < 0) email_html = '<html>' + email_html + '</html>';
      mparams.html = email_html;
      mparams.html = ejs.render(mparams.html, { data: params, _: _, moment: moment });
    }
  }
  catch (e) {
    return callback(e);
  }
  mparams.subject = ejs.render(mparams.subject, { data: params, _: _, moment: moment });
  _this.SendEmail(mparams, callback);
}

exports.createFunction = function (script, args, desc){
  try {
    return Function.prototype.bind.apply(Function, [null].concat(args||[]).concat([script]))();
  }
  catch(ex){
    throw new Error('Error creating function '+desc+': '+ex.toString()+'\n:: in ::\n'+script);
  }
}

exports.SendEmail = function (mparams,callback){
  var _this = this;
  if(_this.Config.debug_params.disable_email){ _this.Log.console('DEBUG - NO EMAIL SENT '+(mparams.to||'')+' '+(mparams.subject||'')+' '+(mparams.text||mparams.html||'')); return callback(); }
  if (!('from' in mparams)) mparams.from = _this.Config.mailer_email;
  _this.Log.info(mparams);
  if(!_this.Mailer){ _this.Log.error('ERROR - Mailer not configured'); return callback(new Error('Email could not be sent - Mailer not configured')); }
  _this.Mailer.sendMail(mparams, callback);
}

exports.setLocale = function(localeId){
  this.Locale = new jsHarmonyLocale(localeId);
}

exports._t = function(msgId, section, pluralIndex){
  for(var moduleName in this.Modules){
    var module = this.Modules[moduleName];
    var msg = module.translator.translate(msgId, section, pluralIndex, { nullOnNotFound: true });
    if(!Helper.isNullUndefined(msg)) return msg;
  }
  return msgId;
}

exports._tN = function(msgId, cnt, section){
  for(var moduleName in this.Modules){
    var module = this.Modules[moduleName];
    var msg = module.translator.translateN(msgId, cnt, section, { nullOnNotFound: true });
    if(!Helper.isNullUndefined(msg)) return msg;
  }
  return msgId;
}

exports._tP = function(msgId, params, section, pluralIndex){
  for(var moduleName in this.Modules){
    var module = this.Modules[moduleName];
    var msg = module.translator.translateParams(msgId, params, section, pluralIndex, { nullOnNotFound: true });
    if(!Helper.isNullUndefined(msg)) return msg;
  }
  return Helper.ReplaceParams(msgId, params);
}

exports._tPN = function(msgId, params, cnt, section){
  for(var moduleName in this.Modules){
    var module = this.Modules[moduleName];
    var msg = module.translator.translateParamsN(msgId, params, cnt, section, { nullOnNotFound: true });
    if(!Helper.isNullUndefined(msg)) return msg;
  }
  return Helper.ReplaceParams(msgId, params);
}

//Log Initialization Errors / Warnings / Info
exports.LogInit = function(severity, msg) {
  var _this = this;
  if ((this.Config.debug_params.jsh_error_level & severity) > 0) {
    switch (severity) {
      case _ERROR:{ _this.Statistics.Counts.InitErrors++; if(!_this.isConfigLoaded || !_this.Config.silentStart) console.log("ERROR: " + msg); this.SystemErrors.push(msg); break; }
      case _WARNING:{  _this.Statistics.Counts.InitWarnings++; if(!_this.Config.silentStart) console.log("WARNING: " + msg); this.SystemErrors.push(msg); break; }
      default: if(!_this.Config.silentStart) _this.Log.info(msg); break;
    }
  }
}
exports.LogInit_ERROR = function(msg){ return this.LogInit(_ERROR, msg); }
exports.LogInit_WARNING = function(msg){ return this.LogInit(_WARNING, msg); }
exports.LogInit_INFO = function(msg){ return this.LogInit(_INFO, msg); }
exports.LogInit_PERFORMANCE = function(msg){ return this.LogInit(_PERFORMANCE, msg); }