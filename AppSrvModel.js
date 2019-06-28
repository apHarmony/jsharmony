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
var ejs = require('ejs');
var ejsext = require('./lib/ejsext.js');
var async = require('async');

/*
---------------------------
Return model data to client
---------------------------
Current server-side dependencies:
> toptitle
> tabs / bindings
> buttons
> helpurl / helpurl_onclick
> breadcrumbs
> field.serverejs
> link -> jsh.getURL
> onclick -> jsh.getURL_onclick
> jsh.getAuxFields

 * */

function AppSrvModel(appsrv) {
  this.AppSrv = appsrv;
  this.srcfiles = {};
  this.loadEJS();
}


/*******************
|     LOAD EJS     |
*******************/
AppSrvModel.prototype.loadEJS = function () {
  var jsh = this.AppSrv.jsh;
  this.srcfiles = {
    'jsh_form': jsh.getEJS('jsh_client_form'),
    'jsh_embed.js': jsh.getEJS('jsh_client_embed.js'),
    'jsh_controls': jsh.getEJS('jsh_client_controls'),
    'jsh_tabs_bottom': jsh.getEJS('jsh_client_tabs_bottom'),
    'jsh_tabs_top': jsh.getEJS('jsh_client_tabs_top'),
    'jsh_tabs_controls': jsh.getEJS('jsh_client_tabs_controls'),
    'jsh_topmost.js': jsh.getEJS('jsh_client_topmost.js'),
    'jsh_form.js': jsh.getEJS('jsh_client_form.js'),
    'jsh_form.js.datamodel': jsh.getEJS('jsh_client_form.js.datamodel'),
    'jsh_form.js.single': jsh.getEJS('jsh_client_form.js.single'),
    'jsh_form.js.multiple': jsh.getEJS('jsh_client_form.js.multiple'),
    'jsh_grid': jsh.getEJS('jsh_client_grid'),
    'jsh_grid.js': jsh.getEJS('jsh_client_grid.js'),
    'jsh_grid.js.datamodel': jsh.getEJS('jsh_client_grid.js.datamodel'),
    'jsh_multisel': jsh.getEJS('jsh_client_multisel'),
    'jsh_multisel.js': jsh.getEJS('jsh_client_multisel.js'),
    'jsh_multisel.js.datamodel': jsh.getEJS('jsh_client_multisel.js.datamodel'),
    'jsh_exec.js': jsh.getEJS('jsh_client_exec.js'),
    'jsh_exec.js.datamodel': jsh.getEJS('jsh_client_exec.js.datamodel'),
    'jsh_buttons': jsh.getEJS('jsh_client_buttons'),
  };
  for (var sname in this.srcfiles) {
    this.srcfiles[sname] = removeEmptyBytes(this.srcfiles[sname]);
  }
}

function removeEmptyBytes(str){
  //var rslt = str.replace(/div/g, "");
  //var rslt = str.replace(/\p{65279}/g, "");
  var rslt = str.replace(/\uFEFF/g, "");
  return rslt;
}

AppSrvModel.prototype.GetModel = function (req, res, fullmodelid) {
  var _this = this;
  var jsh = this.AppSrv.jsh;
  var model = jsh.getModel(req, fullmodelid);
  if (!Helper.hasModelAction(req, model, 'B')) { Helper.GenError(req, res, -11, 'Invalid Model Access for '+fullmodelid); return; }
  req.curtabs = jsh.getTabs(req, model);
  req.TopModel = fullmodelid;

  if(!('action' in req.query) && (model.unbound || model.nokey)) req.query.action = 'update';

  _this.genClientModel(req, res, fullmodelid, true, null, null, null, function(rslt){
    if(_.isString(rslt)){
      _this.genClientModel(req, res, 'jsHarmony/_BASE_HTML_MESSAGE', true, null, null, null, function(model){
        if(_.isString(model)) return res.end(model);
        model = _.extend(model, { 
          id: fullmodelid, 
          caption: ['',fullmodelid,fullmodelid],
          title: fullmodelid,
          helpurl: '',
          helpurl_onclick: '',
          ejs: rslt
        });
        res.end(JSON.stringify(model));
      });
      return;
    }
    else {
      res.end(JSON.stringify(rslt));
    }
  });
};

AppSrvModel.prototype.genClientModel = function (req, res, modelid, topmost, parentBindings, sourceModel, options, onComplete) {
  options = _.extend({ targetperm: undefined }, options);
  var _this = this;
  var jsh = this.AppSrv.jsh;
  var model = jsh.getModel(req, modelid, sourceModel);
  if(!model) throw new Error('Model ID not found: ' + modelid);
  var fullmodelid = model.id;
  
  var targetperm = '';
  if(typeof options.targetperm != 'undefined') targetperm = options.targetperm;
  else {
    targetperm = 'B';
    if(model.unbound) targetperm = 'U';
    
    if ('action' in req.query) {
      if (req.query.action == 'insert') targetperm = 'I';
      else if (req.query.action == 'update') targetperm = 'U';
      else if (req.query.action == 'browse') targetperm = 'B';
      else return onComplete('Invalid "action" in querystring');
    }
    if (!Helper.hasModelAction(req, model, 'B'+targetperm)) { return onComplete("<div>You do not have access to this form.</div>"); }
  }
  
  //Check if the bindings are based on the key value
  var allConstantBindings = true;
  _.each(parentBindings, function(value, key){
    if(typeof jsh.getStaticBinding(value) == 'undefined') allConstantBindings = false;
  });
  //If insert, and the model has any dynamic bindings, show message that the user needs to save first to edit the data
  if((targetperm=='I') && !Helper.hasModelAction(req, model, 'I')){
    if(!allConstantBindings) {
      if(!topmost && _.includes(['exec','report','multisel'], model.layout)){ }
      else {
        return onComplete("<div>Please save to manage "+model.caption[1]+" data.</div>");
      }
    }
  }

  if(!req.query.action){
    if(model.layout=='form'){
      if(!model.nokey && !model.unbound){
        var keys = _this.AppSrv.getKeys(model.fields);
        if(keys && keys.length){ 
          return onComplete(jsh.RenderFormStarter(req, fullmodelid))
        }
      }
    }
    else if((model.layout=='multisel')||(model.layout=='form-m')){
      return onComplete(jsh.RenderFormStarter(req, fullmodelid));
    }
  }

  var rslt = {};

  copyValues(rslt, model, [
    'id', 'namespace', 'class', 'layout', 'caption', 'oninit', 'onload', 'onloadimmediate', 'oninsert', 'onupdate', 'oncommit', 'onvalidate', 'onloadstate', 'onrowbind', 'ondestroy', 'js', 'hide_system_buttons',
    'popup', 'rowclass', 'rowstyle', 'tabpanelstyle', 'tablestyle', 'formstyle', 'sort', 'querystring', 'disableautoload', 'tabpos', 'templates', 'unbound',
    'reselectafteredit','newrowposition','validationlevel','default_search','grid_expand_search','grid_rowcount', 'grid_require_search','grid_static','noresultsmessage','ejs','css','onecolumn',
    //Commit Level
    function(){
      if(model.commitlevel){
        if(model.commitlevel=='auto'){
          if(!Helper.hasModelAction(req, model, 'IUD')) rslt.commitlevel = 'none';
          else if(topmost) rslt.commitlevel = 'row';
          else rslt.commitlevel = 'page';
        }
        else rslt.commitlevel = model.commitlevel;
      }
    },
    //Add Bindings
    function() {
      if(parentBindings) rslt.bindings = parentBindings;
      else if(model.bindings) rslt.bindings = model.bindings;
    },
    //General Data
    function () {
      return {
        'actions': ejsext.getActions(req, model, 'BIUD'),
        'breadcrumbs': ejsext.BreadCrumbs(req, jsh, fullmodelid)
      }
    },
    //Generate Buttons
    function () {
      var rsltbuttons = [];
      var buttons = jsh.parseButtons(model.buttons);
      if (typeof buttons != 'undefined') for (var i = 0; i < buttons.length; i++) {
        var button = buttons[i];
        var link_target = button['link'];
        var link_bindings = button['bindings'];
        var link_actions = button['actions'];
        var link_text = button['text'] || '';
        var link_icon = button['icon'];
        var link_style = button['style'];
        var link_class = button['class'];
        var link_newline = button['nl'] ? 1 : 0;
        var link_group = button['group'] || '';
        if (!ejsext.hasAction(req, model, link_actions)) continue;
        if('roles' in button) if (!ejsext.hasAction(req, button, link_actions)) continue;
        var link_url = '';
        var link_onclick = '';
        if (link_target && link_target.substr(0, 3) == 'js:') {
          link_url = '#';
          link_onclick = "var modelid = '" + fullmodelid + "'; "+link_target.substr(3)+'; return false;';
        }
        else {
          var link_parsed = jsh.parseLink(link_target);
          var link_targetmodelid = link_parsed.modelid;
          var link_targetmodel = link_targetmodelid ? jsh.getModel(req, link_targetmodelid, model) : null;
          if(link_targetmodel){
            link_targetmodelid = link_targetmodel.id;
            //Hide the button if the user does not have target access to the model
            var link_targetperm = 'B';
            if(link_parsed.action=='insert') link_targetperm = 'I';
            if(button.hide_when_target_inaccessible && !Helper.hasModelAction(req, link_targetmodel, link_targetperm)) continue;
            //Apply text in button caption
            link_text = link_text.replace(new RegExp('%%%CAPTION%%%', 'g'), link_targetmodel.caption[1]);
            link_text = link_text.replace(new RegExp('%%%CAPTIONS%%%', 'g'), link_targetmodel.caption[2]);
            //Add bindings, if applicable
            if(!link_bindings && _.isEmpty(link_parsed.keys)){
              var link_bindingObj = { target: link_targetmodelid };
              var link_binding_additionalFields = _.keys(req.forcequery).concat(_.keys(rslt.bindings)).concat(_.pullAll(_.keys(req.query),['action','tabs']));
              if(link_parsed.action=='insert'){
                link_bindings = jsh.AddAutomaticBindings(model, link_bindingObj, 'Button '+(link_text||link_target), { req: req, bindType: 'nonKeyFields', additionalFields: link_binding_additionalFields });
              }
              else{
                link_bindings = jsh.AddAutomaticBindings(model, link_bindingObj, 'Button '+(link_text||link_target), { req: req, bindType: 'childKey' });
              }
            }
          }
          //Generate link
          link_url = jsh.getURL(req, model, link_target, undefined, undefined, link_bindings);
          link_onclick = jsh.getURL_onclick(req, model, link_target);
        }
        link_text = link_text.replace(new RegExp('%%%CAPTION%%%', 'g'), model.caption[1]);
        link_text = link_text.replace(new RegExp('%%%CAPTIONS%%%', 'g'), model.caption[2]);
        var rsltbutton = {
          'link': link_url,
          'onclick': link_onclick,
          'actions': link_actions,
          'icon': link_icon,
          'text': link_text,
          'style': link_style,
          'class': link_class,
          'nl' : link_newline,
          'group': link_group,
        };
        rsltbuttons.push(rsltbutton);
      }
      return { 'buttons': rsltbuttons };
    },
  ]);
  if (jsh.Config.use_sample_data) rslt['sample_data'] = 1;

  if (!model._inherits || (model._inherits.length == 0)) rslt._basemodel = model.id;
  else rslt._basemodel = model._inherits[0];

  //Define whether the model definition needs to be reselected after update
  rslt.modeltype = 'static';
  if(req.jshlocal && (fullmodelid in req.jshlocal.Models)) rslt.modeltype = 'dynamic'; //Model uses onroute to customize properties
  else if(model.tabcode) rslt.modeltype = 'dynamic'; //Model has tabs calculated server-side

  var tabcode = null;
  var helpid = model.helpid;

  async.waterfall([
    //Get tabcode, if applicable
    function(cb){
      if(model.tabcode && (targetperm!='I')){
        _this.AppSrv.getTabCode(req, res, fullmodelid, function(_tabcode){
          tabcode = _tabcode;
          return cb();
        });
      }
      else return cb();
    },

    function(cb){
      //Generate Tabs
      tabcode = (tabcode || '').toString();
      if(('tabpos' in model) && model.tabs) {
        var tabbindings = {};
        var basetab = req.curtabs[model.id];
        if (!basetab) basetab = '';
        
        var showtabs = [];
        var showmodels = [];
        var modeltabids = [];

        for(var i=0; i<model.tabs.length;i++){
          var tab = model.tabs[i];
          var tabname = tab.name;
          //Initially, thought to disable hiding based on role, because
          //  a. Roles should define effective permissions
          //  b. "Hiding" based on roles is confusing to the developer and user.
          //  This should be handled via inheritance instead
          //Then, added it back, because it is such a hassle to need to
          //redeclare inheritance for nested forms just to remove one tab
          //var tabmodel = jsh.getModel(req, tab.target, model);
          //if (!ejsext.hasAction(req, model, targetperm, tab.actions)) continue;
          var tabtargetperm = targetperm;
          if(targetperm=='U') tabtargetperm = 'BU';

          if('roles' in tab) if (!ejsext.hasAction(req, tab, tabtargetperm)) continue;
          if('actions' in tab) if (!ejsext.hasAction(req, model, tab.actions, tabtargetperm)) continue;
          //if(!Helper.hasModelAction(req, tabmodel, 'B')) continue;
          if (tab.showcode) {
            if (_.includes(tab.showcode, tabcode)) {
              showtabs.push(tabname);
              showmodels.push(tab.target);
            }
          }
          else {
            showtabs.push(tabname);
            showmodels.push(tab.target);
          }
        }
        
        if(showtabs.length == 0) {
          //return Helper.GenError(req, res, -9, "No tabs available for display");
          rslt.tabs = [];
          delete rslt.tabpos;
          return cb();
        }
        if (!(model.id in req.curtabs) || !(_.includes(showmodels, req.curtabs[model.id]))) req.curtabs[model.id] = showmodels[0];

        for(var i=0; i<model.tabs.length;i++){
          var tab = model.tabs[i];
          if (req.curtabs[model.id] == tab.target) {
            tabbindings = tab.bindings;
            break;
          }
        }
        
        //Override Help URL to that of first tab
        if(model.tabpos == 'top'){
          var firsttabmodel = jsh.getModel(req, req.curtabs[model.id], model);
          if (firsttabmodel){
            helpid = firsttabmodel.helpid;
          }
        }

        var rslttabs = [];
        for(var i=0; i<model.tabs.length;i++){
          var tab = model.tabs[i];
          var tabname = tab.name;
          if (!_.includes(showtabs, tabname)) continue;
          var acss = 'xtab xtab' + model.class;
          if (i == (model.tabs.length-1)) acss += ' last';
          var linktabs = new Object();
          var tabmodelid = tab.target;
          linktabs[model.id] = tabmodelid;
          var link = jsh.getURL(req, model, '', linktabs);
          var caption = tab.caption;
          var tab_selected = false;
          if (!caption) caption = tabname;
          if (req.curtabs[model.id] == tabmodelid){ acss += ' selected'; tab_selected = true; }
          else if (('action' in req.query) && (req.query.action == 'insert')) { link = '#'; acss += ' disabled'; }
          var rslttab = {
            'acss': acss,
            'link': link,
            'name': tabname,
            'caption': caption,
            'selected': tab_selected,
            'modelid': tabmodelid
          };
          rslttabs.push(rslttab);
        }
        //Get value of current tab
        _this.genClientModel(req, res, req.curtabs[model.id], false, tabbindings, model, null, function(curtabmodel){
          rslt.tabs = rslttabs;
          rslt.curtabmodel = curtabmodel;
          return cb();
        });
      }
      else return cb();
    },

    function(cb){
      //Duplicate Model
      if (model.duplicate && ejsext.hasAction(req, model, 'I')) {
        var dmodelid = model.duplicate.target;
        var dmodel = jsh.getModel(req, dmodelid, model);
        if (!dmodel) { throw new Error('Duplicate Model ID not found: ' + dmodelid); }
        _this.genClientModel(req, res, dmodelid, false, model.duplicate.bindings, model, null, function(dclientmodel){
          if (!_.isString(dclientmodel)) {
            rslt.duplicate = {};
            rslt.duplicate.target = dmodelid;
            rslt.duplicate.bindings = model.duplicate.bindings;
            rslt.duplicate.model = dclientmodel;
            rslt.duplicate.popupstyle = '';
            if ('popup' in dmodel) rslt.duplicate.popupstyle = 'width: ' + dmodel.popup[0] + 'px; height: ' + dmodel.popup[1] + 'px;';
            if(model.layout != 'grid') rslt.buttons.push({
              'link': '#',
              'onclick': "if(jsh.XPage.HasUpdates()){ XExt.Alert('Please save changes before duplicating.'); return false; } XExt.popupShow('" + dmodelid + "','" + model.class + "_duplicate','Duplicate " + model.caption[1] + "',undefined,this); return false;",
              'actions': 'I',
              'icon': 'copy',
              'text': (model.duplicate.link_text || 'Duplicate'),
              'style': 'display:none;',
              'class': 'duplicate'
            });
            if ('link' in model.duplicate) {
              rslt.duplicate.link = jsh.getURL(req, model, model.duplicate.link, undefined, dmodel.fields);
              var ptarget = jsh.parseLink(model.duplicate.link);
              var duplicateparams = {
                resizable: 1,
                scrollbars: 1
              }
              if(ptarget.url){ /* Do nothing */ }
              else {
                var link_model = jsh.getModel(req, ptarget.modelid, model);
                if (!link_model) throw new Error("Link Model " + ptarget.modelid + " not found.");
                
                if('popup' in link_model){
                  duplicateparams.width = link_model['popup'][0];
                  duplicateparams.height = link_model['popup'][1];
                }
              }
              duplicateparams = _.extend(duplicateparams, ptarget.actionParams);
              var duplicateparamsarr = [];
              for(var key in duplicateparams) duplicateparamsarr.push(key+'='+duplicateparams[key]);
              rslt.duplicate.link_options = duplicateparamsarr.join(',');
            }
          }
          return cb();
        });
      }
      else return cb();
    },

    //Resolve title, if applicable
    function(cb){
      _this.AppSrv.getTitle(req, res, fullmodelid, (targetperm=='U'?'BU':targetperm), function(err, title){
        if(typeof title !== 'undefined') rslt.title = (title||'');
        return cb();
      });
    },

    //Help System
    function(cb){
      req.jshsite.help(req, res, jsh, helpid, function(helpurl, helpurl_onclick){
        rslt.helpurl = helpurl;
        rslt.helpurl_onclick = helpurl_onclick;
        return cb();
      });
    },

    //SysConfig, using
    function(cb){
      rslt._sysconfig = {};
      copyValues(rslt._sysconfig, model._sysconfig, ['unbound_meta']);

      //Model Using
      rslt.using = [];
      if(model.using) rslt.using = rslt.using.concat(model.using);
      
      //Module Using
      if(model.module){
        var module = jsh.Modules[model.module];
        if(module.using) rslt.using = rslt.using.concat(module.using);
      }

      return cb();
    },

    //Set up fields
    function(cb){
      if (topmost) {
        rslt['topmost'] = 1;
        rslt['menu'] = '';
        copyValues(rslt, model, ['menu']);
        rslt['toptitle'] = model.id;
        if ('title' in rslt) rslt['toptitle'] = rslt.title;
        rslt['forcequery'] = req.forcequery;
      }
      if ('fields' in model) _this.copyModelFields(req,res,rslt,model,targetperm,function(fields){
        rslt.fields = fields;
        return cb();
      });
      else return cb();
    },

  ],function(err){
    if(!rslt.fields) rslt.fields = [];
    //Return result
    if(onComplete) onComplete(rslt);
  });
}

AppSrvModel.prototype.copyModelFields = function (req, res, rslt, srcobj, targetperm, onComplete) {
  var jsh = this.AppSrv.jsh;
  var model = srcobj;
  var rslt = [];
  var firstsort = (('sort' in model)?model['sort'][0].substring(1):'');
  var _this = this;
  async.eachOfSeries(srcobj.fields, function(srcfield,i,cb){
    var dstfield = {};
    copyValues(dstfield, srcfield, [
      'name', 'key', 'control', 'caption', 'caption_ext', 'captionstyle', 'captionclass', 'nl', 'eol', 'type', 'length',
      'value', 'controlclass', 'target', 'bindings', 'format', 'readonly', 'always_editable', 'locked_by_querystring', 'ongetvalue', 'unbound', 'onchange', 'onclick', 'hidden',
      'html', 'cellstyle', 'cellclass', 'lovkey', 'controlstyle', 'block', 'blockstyle', 'blockclass', 'disable_sort', 'disable_search'
    ]);
    if (srcfield.popuplov) dstfield.popuplov = 1;
    if (srcfield.sqlsearchsound) dstfield.search_sound = 1;
    if (jsh.Config.use_sample_data && ('sample' in srcfield)) dstfield.sample = srcfield.sample;
    if ('controlparams' in srcfield) {
      dstfield.controlparams = {};
      copyValues(dstfield.controlparams, srcfield.controlparams, [
        'download_button', 'preview_button', 'upload_button', 'delete_button', 'dateformat', 'item_context_menu', 'expand_all', 'expand_to_selected', 'value_true', 'value_false', 'value_hidden', 'code_val', 'popupstyle', 'popupiconstyle', 'popup_copy_results', 'onpopup','base_readonly','grid_save_before_update','update_when_blank','htmlarea_config','show_thumbnail','preview_on_click',
      ]);
      if ('thumbnails' in srcfield.controlparams) for (var tname in srcfield.controlparams.thumbnails) {
        var thumb = srcfield.controlparams.thumbnails[tname];
        if (thumb.resize) dstfield.controlparams.thumbnail_width = thumb.resize[0];
        else if (thumb.crop) dstfield.controlparams.thumbnail_width = thumb.crop[0];
        break;
      }
      else if('image' in srcfield.controlparams) {
        if (srcfield.controlparams.image.resize) dstfield.controlparams.thumbnail_width = srcfield.controlparams.image.resize[0];
        else if (srcfield.controlparams.image.crop) dstfield.controlparams.thumbnail_width = srcfield.controlparams.image.crop[0];
      }
      if (('insert_link' in srcfield.controlparams) && (srcfield.controlparams.insert_link)) {
        dstfield.controlparams.insert_link = jsh.getURL(req, model, srcfield.controlparams.insert_link, undefined, undefined, srcfield.bindings);
        dstfield.controlparams.insert_link_onclick = jsh.getURL_onclick(req, model, srcfield.controlparams.insert_link);
      }
    }
    if (('serverejs' in srcfield) && (srcfield.serverejs)) {
      dstfield.value = ejs.render(dstfield.value, { ejsext: ejsext, req: req, res: res, _: _, model: model, jsh: jsh });
    }
    if (('link' in srcfield) && (srcfield.link)) {
      if (srcfield.link == 'select') {
        dstfield.link = jsh.getURL(req, model, srcfield.link + ':' + model.id, undefined, model.fields);
        dstfield.link_onclick = req.jshsite.instance+".XExt.popupSelect('"+ Helper.escapeJS(model.id) + "',this);return false;";
      }
      else if (srcfield.link.substr(0,3)=='js:') {
        dstfield.link = '#';
        dstfield.link_onclick = srcfield.link.substr(3) + ' return false;';
      }
      else {
        dstfield.link = jsh.getURL(req, model, srcfield.link, undefined, model.fields);
        dstfield.link_onclick = jsh.getURL_onclick(req, model, srcfield.link);
      }
      
      if (((srcfield.control=='button') || (srcfield.control=='linkbutton')) && !('onclick' in srcfield)) {
        dstfield.onclick = dstfield.link_onclick;
      }
    }
    if ((model.layout == 'grid') || (model.layout == 'multisel')) {
      dstfield.sortclass = ((srcfield.name == firstsort)?((model['sort'][0].substring(0, 1) == '^')?'sortAsc':'sortDesc'):'');
    }
    if (srcfield.lov) {
      dstfield.lov = {};
      copyValues(dstfield.lov, srcfield.lov, ['parent','parents','blank','showcode']);
      if (('UCOD2' in srcfield.lov) || ('sql2' in srcfield.lov)) dstfield.lov.duallov = 1;
      else if ('sqlmp' in srcfield.lov) dstfield.lov.multilov = 1;
    }
    if('default' in srcfield){
      if(_.isString(srcfield.default) && (srcfield.default.substr(0,3)=='js:')) dstfield.default = srcfield.default;
      else if (model.unbound){
        if (_.isString(srcfield.default) || _.isNumber(srcfield.default) || _.isBoolean(srcfield.default)) dstfield.default = srcfield.default;
      }
    }
    if ('actions' in srcfield) {
      dstfield.actions = ejsext.getActions(req, model, srcfield.actions);
      if ('roles' in srcfield) dstfield.actions = ejsext.getActions(req, srcfield, dstfield.actions);
      if(srcfield.always_editable){
        dstfield.actions = ejsext.unionperm('BIU', dstfield.actions);
      }
    }
    dstfield.validate = jsh.GetClientValidator(req, model, srcfield);
    if (('control' in dstfield) && ((dstfield.control == 'subform') || (dstfield.popuplov))) {
      _this.genClientModel(req, res, srcfield.target, false, srcfield.bindings, model, { targetperm: (dstfield.popuplov ? 'B' : undefined) }, function(subform){
        if(srcfield.control=='subform'){
          //targetperm
          //field.actions (dstfield.actions
          //field.roles (applied to dstfield.actions)
          //subformModel.actions
          //subformModel.roles
          //subformModel.layout
          //
          //If targetperm==I
          //  If dstfield.actions has I
          //  If subformModel.layout == multisel, exec, report
          //    If subformModel.actions && subformModel.roles has B/U
          //  If subformModel.layout == form, form-m, grid
          //    If subformModel.actions && subformModel.roles has B/I
          //If targetperm==B
          //  If dstfield.actions has B
          //  If subformModel.actions && subformModel.roles has B
          //If targetperm==U
          //  If dstfield.actions has B/U
          //  If subformModel.actions && subformModel.roles has B/U
          var parentFieldActions = srcfield.actions;
          if ('roles' in srcfield) parentFieldActions = ejsext.getActions(req, srcfield, parentFieldActions);

          if(!Helper.hasAction(parentFieldActions, (targetperm=='U'?'BU':targetperm))) return cb();

          var subformmodel = jsh.getModel(req, srcfield.target, model.id);
          var subformtargetperm = targetperm;
          if(targetperm=='U') subformtargetperm = 'BU';
          else if(targetperm=='I'){
            if(_.includes(['multisel','exec','report'],subformmodel.layout)) subformtargetperm = 'BU';
            else subformtargetperm = 'BI';
          }
          if(!ejsext.hasAction(req, subformmodel, subformtargetperm)) return cb();
        }
        dstfield.model = subform;
        rslt.push(dstfield);
        return cb();
      });
    }
    else {
      rslt.push(dstfield);
      return cb();
    }
  }, function(err){
    if(onComplete) onComplete(rslt);
  });
};

function copyValues(destobj, srcobj, values) {
  for (var i = 0; i < values.length; i++) {
    var value = values[i];
    if (_.isFunction(value)) { var fval = value(); if (typeof fval != 'undefined') _.extend(destobj, fval); }
    else if (value in srcobj) destobj[value] = srcobj[value];
  }
}

module.exports = AppSrvModel;