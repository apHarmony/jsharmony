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
      if (!this.hasModel(req, ptarget.modelid)) throw new Error("Link Model " + ptarget.modelid + " not found.");
      var link_model = this.getModel(req, ptarget.modelid);
      if (!Helper.HasModelAccess(req, link_model, 'BIU')) { rslt[i]['link_onclick'] = req.jshsite.instance+".XExt.Alert('You do not have access to this form.');return false;"; }
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
//  fields: Array of the model's fields, for adding querystring parameters to the link, based on the link target parameters, ex: edit:EW&E_C_ID=C_ID
//  bindings: Array of the link bindings, for adding additional querystring parameters to the link
//            Bindings will be evaluated client-side, and overwrite any other querystring parameters
exports.getURL = function (req, target, tabs, fields, bindings) {
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
      rsltparams += '&amp;' + bindingid + '=<#='+req.jshsite.instance+'.XExt.LiteralOrLookup(' + JSON.stringify(binding).replace(/"/g, '&quot;') + ',data)#>';
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

exports.getURL_onclick = function (req, field, model) {
  var seturl = "var url = "+req.jshsite.instance+".$(this).attr('data-url'); ";
  var rslt = req.jshsite.instance+".XExt.navTo(url); return false;";
  if ('link' in field) {
    var link = field.link;
    var ptarget = this.parseLink(link);
    if (!this.hasModel(req, ptarget.modelid)) throw new Error("Link Model " + ptarget.modelid + " not found.");
    if (!Helper.HasModelAccess(req, this.getModel(req, ptarget.modelid), 'BIU')) return req.jshsite.instance+".XExt.Alert('You do not have access to this form.');return false;";
    if ((model.layout == 'form') || (model.layout == 'form-m') || (model.layout == 'exec')) {
      seturl += "var jsh="+req.jshsite.instance+"; url=jsh.XExt.ReplaceAll(url,'data[j]','data'); var modelid='" + Helper.escapeHTML(model.id) + "'; var xmodel=jsh.XModels[modelid]; var xform = xmodel.controller.form; if(xform && xform.Data && !xform.Data.Commit()) return false; url = jsh.XPage.ParseEJS(url,modelid); ";
    }
    var link_model = this.getModel(req, ptarget.modelid);
    if(ptarget.action=='download'){
      rslt = "url += '?format=js'; "+req.jshsite.instance+".getFileProxy().prop('src', url); return false;";
    }
    else if ('popup' in link_model) {
      rslt = "window.open(url,'_blank','width=" + link_model.popup[0] + ",height=" + link_model.popup[1] + ",resizable=1,scrollbars=1');return false;";
    }
  }
  return seturl + rslt;
}

exports.getModelID = function (req) {
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

exports.getModelClone = function(req, modelid, options){
  if(!options) options = {};
  var model;
  if(options.cloneLocal) model = this.getModel(req, modelid);
  else model = this.getModel(undefined, modelid);

  if(!model) return model;
  //return JSON.parse(JSON.stringify(model));
  return _.cloneDeep(model);
}

exports.getModel = function(req, modelid) {
  if(req){
    if(req.jshlocal && (modelid in req.jshlocal.Models)) return req.jshlocal.Models[modelid];
  }
  return this.Models[modelid];
}

exports.getModelDB = function(req, modelid) {
  var model = this.getModel(req, modelid);
  var dbid = '';
  if(model.db) dbid = model.db;
  return this.getDB(dbid);
}

exports.getDB = function(dbid){
  if(!dbid) dbid = 'default';
  if(!(dbid in this.DB)) throw new Error('Database connection '+dbid+' not found');
  return this.DB[dbid];
}

exports.hasModel = function(req, modelid){
  //if(!req){ }
  return (modelid in this.Models);
}

exports.getTabs = function (req) {
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

exports.getModelLinkOnClick = function (tgtmodelid, req, link_target) {
  if (!tgtmodelid) tgtmodelid = req.TopModel;
  if (!this.hasModel(req, tgtmodelid)) return '';
  var model = this.getModel(req, tgtmodelid);
  //XPage.ParseEJS if necessary
  if (link_target && (link_target.substr(0, 8) == 'savenew:')) {
    return req.jshsite.instance+".XPage.SaveNew(href);return false;";
  }
  else if ('popup' in model) {
    return (" window.open(href,'_blank','width=" + model['popup'][0] + ",height=" + model['popup'][1] + ",resizable=1,scrollbars=1');return false;");
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

exports.SendTXTEmail = function (dbcontext, TXT_ATTRIB, email_to, email_cc, email_bcc, email_attachments, params, callback) {
  var _this = this;
  //Pull TXT data from database
  var dbtypes = _this.AppSrv.DB.types;
  _this.AppSrv.ExecRecordset(dbcontext, "Helper_SendTXTEmail", [dbtypes.VarChar(32)], { 'TXT_ATTRIB': TXT_ATTRIB }, function (err, rslt) {
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
    else return callback(new Error('Email ' + TXT_ATTRIB + ' not found.'));
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