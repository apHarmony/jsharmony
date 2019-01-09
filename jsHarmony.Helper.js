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
var XValidate = require('jsharmony-validate');
//Compile base list of validators
var XValidateBase = {};
for (var key in XValidate) { XValidateBase[key] = XValidate[key]; }
//Add Extended Validators
require('./lib/ext-validation.js')(XValidate);
var Helper = require('./lib/Helper.js');
var moment = require('moment');

var _ERROR = 1;
var _WARNING = 2;
var _INFO = 4;

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

exports.getAuxFields = function (req, res, model) {
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
      var link_model = this.getModel(req, ptarget.modelid, model);
      if (!link_model) throw new Error("Link Model " + ptarget.modelid + " not found.");
      if (!Helper.hasModelAction(req, link_model, 'BIU')) { rslt[i]['link_onclick'] = req.jshsite.instance+".XExt.Alert('You do not have access to this form.');return false;"; }
      else {
        if(ptarget.action=='download'){
          rslt[i]['link_onclick'] = "var url = "+req.jshsite.instance+".$(this).attr('href') + '?format=js'; "+req.jshsite.instance+".getFileProxy().prop('src', url); return false;";
        }
        else if ('popup' in link_model) {
          rslt[i]['link_onclick'] = "window.open("+req.jshsite.instance+".$(this).attr('href'),'_blank','width=" + link_model['popup'][0] + ",height=" + link_model['popup'][1] + ",resizable=1,scrollbars=1');return false;";
        }
      }
    }
    rslt[i].sortclass = ((model.fields[i].name == firstsort)?((model['sort'][0].substring(0, 1) == '^')?'sortAsc':'sortDesc'):'');
  }
  return rslt;
}

exports.parseLink = function (target) {
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
//  jsh.getURL(req, link_target, undefined, undefined, link_bindings);
//Tab Links: linktabs[model.id] = tabmodelid
//  jsh.getURL(req, '', linktabs); 
//Duplicate Model Links
//  jsh.getURL(req, model.duplicate.link, undefined, dmodel.fields);
//Select Links: 'select'
//  jsh.getURL(req, srcfield.link + ':' + model.id, undefined, model.fields); 
//Field Links
//  jsh.getURL(req, srcfield.link, undefined, model.fields);
//
//ex: edit:EW&E_ID
//Parameters:
//  req (Express.Request): Request
//  target (string): Link target
//  tabs: Array of selected tabs: { "PARENT_MODEL_ID": "SELECT_TAB_MODEL_ID" }
//  fields: Array of the model's fields, for adding querystring parameters to the link, based on the link target parameters, ex: edit:EW&e_c_id=c_id
//  bindings: Array of the link bindings, for adding additional querystring parameters to the link
//            Bindings will be evaluated client-side, and overwrite any other querystring parameters
exports.getURL = function (req, srcmodel, target, tabs, fields, bindings) {
  var _this = this;
  var ptarget = this.parseLink(target);
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
  if (action != '') q['action'] = action;
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
    rslt = req.baseurl + '_dl/' + fullmodelid + '/<#=encodeURI(data[j][\'' + keyfield + '\'])#>/' + fieldname;
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
          rsltparams += '&amp;' + ptargetkeys[i] + '=<#=encodeURI(data[j][\'' + ptarget.keys[ptargetkeys[i]] + '\'])#>';
          /* Commented out for Amber COMH_CDUP form, so that c_id=X1 would work
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
        var foundfield = false;
        if(action=='edit'){
          _.each(tmodel.fields, function (field) {
            if (field.key && _this.AppSrvClass.prototype.getFieldByName(fields, field.name)) {
              foundfield = true;
              delete q[field['name']];
              rsltparams += '&amp;' + field['name'] + '=<#=encodeURI(jsh.XExt.LiteralOrLookup(\'' + field['name'] + '\',[data[j], jsh._GET]))#>';
            }
          });
        }
        if(!foundfield){
          _.each(fields, function (field) {
            if (field.key) {
              delete q[field['name']];
              rsltparams += '&amp;' + field['name'] + '=<#=encodeURI(data[j][\'' + field['name'] + '\'])#>';
            }
          });
        }
      }
    }
  }
  if (typeof bindings !== 'undefined') {
    _.each(bindings, function (binding, bindingid) {
      //Evaluate bindings
      delete q[bindingid];
      rsltparams += '&amp;' + bindingid + '=<#=encodeURI('+req.jshsite.instance+'.XExt.LiteralOrLookup(' + JSON.stringify(binding).replace(/"/g, '&quot;') + ',data))#>';
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
exports.getURL_onclick = function (req, model, field) {
  var seturl = "var url = "+req.jshsite.instance+".$(this).attr('data-url'); ";
  var rslt = req.jshsite.instance+".XExt.navTo(url); return false;";
  if ('link' in field) {
    var link = field.link;
    var ptarget = this.parseLink(link);
    var tmodel = this.getModel(req, ptarget.modelid, model);
    if (!tmodel) throw new Error("Link Model " + ptarget.modelid + " not found.");
    if (!Helper.hasModelAction(req, tmodel, 'BIU')) return req.jshsite.instance+".XExt.Alert('You do not have access to this form.');return false;";
    if ((model.layout == 'form') || (model.layout == 'form-m') || (model.layout == 'exec') || (model.layout == 'report')) {
      seturl += "var jsh="+req.jshsite.instance+"; url=jsh.XExt.ReplaceAll(url,'data[j]','data'); var modelid='" + Helper.escapeHTML(model.id) + "'; var xmodel=jsh.XModels[modelid]; var xform = xmodel.controller.form; if(xform && xform.Data && !xform.Data.Commit()) return false; url = jsh.XPage.ParseEJS(url,modelid); ";
    }
    if(ptarget.action=='download'){
      rslt = "url += '?format=js'; "+req.jshsite.instance+".getFileProxy().prop('src', url); return false;";
    }
    else if ('popup' in tmodel) {
      rslt = "window.open(url,'_blank','width=" + tmodel.popup[0] + ",height=" + tmodel.popup[1] + ",resizable=1,scrollbars=1');return false;";
    }
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
  if(!namespace || (namespace[0]!='/')) namespace = parentNamespace + namespace;
  if(namespace && (namespace[0]=='/')) namespace = namespace.substr(1);
  return namespace;
}

exports.resolveModelID = function(modelid, sourceModel){
  if(!modelid) return undefined;
  //Absolute
  if(modelid.substr(0,1)=='/') return modelid.substr(1);
  if(!sourceModel) return modelid;
  //Relative to namespace
  if(sourceModel.namespace){
    var testmodel = sourceModel.namespace+modelid;
    if(testmodel in this.Models) return testmodel;
  }
  //Model Using
  if(sourceModel.using){
    for(var i=0;i<sourceModel.using.length;i++){
      var namespace = sourceModel.using[i];
      var testmodel = namespace+modelid;
      if(testmodel.substr(0,1)=='/') testmodel = testmodel.substr(1);
      if(testmodel in this.Models) return testmodel;
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
        if(testmodel in this.Models) return testmodel;
      }
    }
  }
  return modelid;
}

exports.getModel = function(req, modelid, sourceModel) {
  modelid = this.resolveModelID(modelid, sourceModel);
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

exports.getModelLinkOnClick = function (req, srcmodel, tgtmodelid, link_target) {
  if (!tgtmodelid) tgtmodelid = req.TopModel;
  var model = this.getModel(req, tgtmodelid, srcmodel);
  if (!model) return '';
  //XPage.ParseEJS if necessary
  if (link_target && (link_target.substr(0, 8) == 'savenew:')) {
    return req.jshsite.instance+".XPage.SaveNew(href);return false;";
  }
  else if ('popup' in model) {
    return ("window.open(this.href,'_blank','width=" + model['popup'][0] + ",height=" + model['popup'][1] + ",resizable=1,scrollbars=1');return false;");
  }
  return "";
};

exports.getStaticBinding = function(str){
  if (!isNaN(str)) return str;
  else if ((str.length >= 2) && (str[0] == "'") && (str[str.length - 1] == "'")) return str.substr(1, str.length - 2);
  else if(str.trim().toLowerCase()=='null') return null;
  return undefined;
}

exports.GetValidatorClientStr = function (field) {
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

exports.GetValidatorFuncs = function (validators) {
  var jsh = this;
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
      var email_body = TXT[_this.map.txt_val];
      if (email_body && (TXT[_this.map.txt_type].toUpperCase()=='HTML')) email_html = email_body;
      else email_text = email_body;
      _this.SendBaseEmail(dbcontext, TXT[_this.map.txt_tval], email_text, email_html, email_to, email_cc, new_bcc, email_attachments, params, callback)
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
  mparams.subject = ejs.render(mparams.subject, { data: params, _: _ });
  _this.SendEmail(mparams, callback);
}

exports.SendEmail = function (mparams,callback){
  var _this = this;
  if(_this.Config.debug_params.disable_email){ _this.Log.info('DEBUG - NO EMAIL SENT'); return callback(); }
  if (!('from' in mparams)) mparams.from = _this.Config.mailer_email;
  _this.Log.info(mparams);
  if(!_this.Mailer){ _this.Log.error('ERROR - Mailer not configured'); return callback(); }
  _this.Mailer.sendMail(mparams, callback);
}

//Log Initialization Errors / Warnings / Info
exports.LogInit = function(severity, msg) {
  var _this = this;
  if ((this.Config.debug_params.jsh_error_level & severity) > 0) {
    switch (severity) {
      case _ERROR:{ console.log("ERROR: " + msg); this.SystemErrors.push(msg); break; }
      case _WARNING: console.log("WARNING: " + msg); break;
      default: _this.Log.info(msg); break;
    }
  }
}
exports.LogInit_ERROR = function(msg){ return this.LogInit(_ERROR, msg); }
exports.LogInit_WARNING = function(msg){ return this.LogInit(_WARNING, msg); }
exports.LogInit_INFO = function(msg){ return this.LogInit(_INFO, msg); }