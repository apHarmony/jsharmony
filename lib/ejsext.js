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
var Helper = require('./Helper.js');
var ejsutil = require('ejs/lib/utils.js');
exports = module.exports = {};

exports.escapeHTML = function (val) {
  var entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;',
    "/": '&#x2F;',
    '\u00A0':'&#xa0;'
  };
  
  return String(val).replace(/[\u00A0&<>"'\/]/g, function (s) {
    return entityMap[s];
  });
}
exports.iif = function(cond,tval,fval){
	if(cond) return tval;
	if(fval !== undefined) return fval;
	return '';
};
exports.showProp = function (prop, val) {
  if (typeof val != 'undefined') return prop + '="' + ejsutil.escape(val) + '"';
  return '';
};
exports.case = function () {
  var args = arguments;
  if (args.length == 0) return '';
  var i = 0;
  while (i < args.length) {
    if (i == (args.length - 1)) return args[i];
    if (args[i]) return args[i + 1];
    i += 2;
  }
  return '';
};
exports.visible = function(cond){
	try{
  	if(!cond) return 'display:none;';
	}catch(ex){}
	return '';
};
exports.intersectperm = function (perm1, perm2){
  if (typeof perm1 == 'undefined') perm1 = '';
  if (typeof perm2 == 'undefined') perm2 = '';
  var rslt = '';
  if (perm1 == '*') return perm2;
  if (perm2 == '*') return perm1;
  for (var i = 0; i < perm1.length; i++) {
    if (perm2.indexOf(perm1[i]) > -1) rslt += perm1[i];
  }
  return rslt;
}
exports.unionperm = function (perm1, perm2) {
  if ((typeof perm1 == 'undefined') && (typeof perm2 == 'undefined')) return '';
  if (typeof perm1 == 'undefined') return perm2;
  if (typeof perm2 == 'undefined') return perm1;
  if (perm1 == '*') return '*';
  if (perm2 == '*') return '*';
  var rslt = perm1;
  for (var i = 0; i < perm2.length; i++) {
    if (rslt.indexOf(perm2[i]) < 0) rslt += perm2[i];
  }
  return rslt;
}
exports.access = function (req, model) {
  var args = Array.prototype.slice.call(arguments);
  var rslt = this.getaccess.apply(this, args.slice(0, arguments.length - 1));
  rslt = this.intersectperm(rslt, args[args.length - 1]);
  return (rslt.length > 0);
}

exports.getaccess = function (req, model){
  //field passed as model to check field permissions
  var args = arguments;
  if (arguments.length < 2) throw new Error('Invalid arguments - no permissions specified');
  if (!('actions' in model)) return '';
  var effperm = '';
  if ('DEV' in req._roles) effperm = '*';
  else if(!model.dev && ('SYSADMIN' in req._roles)) effperm = '*';
  else if ('roles' in model) {
    for (role in model.roles) {
      if (role in req._roles) {
        effperm = this.unionperm(effperm, model.roles[role]);
      }
    }
  }
  effperm = this.intersectperm(effperm, model.actions);
  effperm = this.intersectperm(effperm, 'BIUD');
  if (effperm.length = 0) return '';
  var kfc = '';
  for (var i = 2; i < arguments.length; i++) {
    effperm = this.intersectperm(effperm, arguments[i]);
    kfc = this.unionperm(kfc,this.intersectperm('KFCS',arguments[i]));
  }
  return (effperm+kfc);
};
exports.accessField = function (req, field, perm) {
  //This does not check against model, because that is already done by the AppSrv
  if (perm == "*") return true;
  if (field.actions === undefined) return false;
  var access = field.actions;
  if (field.roles) {
    if (req === null) return false;
    access = exports.getaccess(req, field, access);
  }
  return Helper.access(access, perm);
}
exports.selected = function(cond){
	if(cond) return 'selected';
	return '';
};
exports.size = function(obj){
    var size = 0, key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) size++;
    }
    return size;
};
exports.eachKey = function(fields,func){
	for(var i=0;i<fields.length;i++){
	if(fields[i].key)
		func(fields[i]);
	}
};
exports.GetValue = function(field){
	if(!global.use_sample_data) return '';
	if('sample' in field) return field.sample;
	return '';
}
exports.ShowChecked = function(val){
	if(typeof val == 'undefined') return '';
	if(val) return 'checked="checked"';
	return '';
}
exports.DisplayErrors = function(verrors){
	if(typeof verrors == 'undefined') return '';
	var earr = [];
	_.each(verrors,function(verror){
		if(_.isArray(verror)){
			_.each(verror,function(err){
				earr.push(err);
			});
		}
		else earr.push(verror);
	});
	if(exports.size(earr)==0) return '';
	var rslt = '<div class="errorExplanation" id="errorExplanation">';
	rslt += '<h2>'+earr.length+' error'+(earr.length > 1 ? 's' : '')+' occurred while processing this form.</h2>';
  rslt += '<p>There were problems with the following fields:</p><ul>';
	_.each(earr,function(err){
		rslt += '<li>'+err+'</li>';
	});
	rslt += '</ul></div>';
	return rslt;
//	
}
exports.DisplayInfo = function (info) {
  if (typeof info == 'undefined') return '';
  return ('<div class="notification" id="notification">' + info + '</div>');
};
exports.BreadCrumbs = function (req, jsh, modelid) {
  if (req.bcrumb_override) { return '<div class="bcrumbs">'+req.bcrumb_override+'</div>'; return; }
  if (!jsh.hasModel(req, modelid)) return;
  var model = jsh.getModel(req, modelid);
  if (!('breadcrumbs' in model) || !('parents' in model.breadcrumbs)) return;
  var breadcrumbs = model.breadcrumbs;
  var rslt = '';
  rslt += '<div class="bcrumbs">';
  _.each(breadcrumbs.parents, function (bcrumb) {
    if (jsh.hasModel(req, bcrumb)) {
      var bmodel = jsh.getModel(req, bcrumb);
      var blink = req.baseurl + bcrumb;
      var mtitle = '';
      if (('breadcrumbs' in bmodel) && ('title' in bmodel.breadcrumbs)) mtitle = bmodel.breadcrumbs.title;
      else if(_.isString(bmodel.title)) mtitle = bmodel.title;
      else if(bmodel.title && _.isString(bmodel.title.edit)) mtitle = bmodel.title.edit;
      rslt += '<a href="' + blink + '">' + Helper.ResolveParams(req, mtitle) + '</a> &gt; ';
    }
    else {
      //Treat breadcrumb as literal
      rslt += bcrumb + ' &gt; ';
    }
    });
  if('title' in breadcrumbs) rslt += breadcrumbs.title;
  else if(_.isString(model.title)) mtitle = model.title;
  else if(req && req.query && req.query.action=='add'){
    //Add
    if(model.title && _.isString(model.title.add)) mtitle += model.title.add;
  }
  else {
    //Browse / Edit
    if(model.title && _.isString(model.title.edit)) mtitle = model.title.edit;
  }
  rslt += '</div>';
  return rslt;
}
exports.ResolveParams = Helper.ResolveParams;
exports.getHelpURL = function (req, jsh, modelid){
  var help_view = exports.getHelpView(req, jsh);
  var helpid = modelid;
  if (jsh.hasModel(req, modelid)){ 
    var model = jsh.getModel(req, modelid);
    helpid = model.helpid;
  }
  return req.baseurl + help_view + '/?' + jsh.Config.help_panelid + '=' + encodeURIComponent(modelid); //help_listing
}
exports.getHelpOnClick = function (req, jsh) {
  var help_view = exports.getHelpView(req, jsh);
  if(!help_view) return 'XExt.Alert(\'Help not initialized.\'); return false;';
  return jsh.getModelLinkOnClick(help_view);
}
exports.getHelpView = function(req, jsh){
  if(!jsh.Config.help_view) return null;
  if(_.isString(jsh.Config.help_view)) return jsh.Config.help_view;
  for(var baseurl in jsh.Config.help_view){
    if(req.baseurl==baseurl) return jsh.Config.help_view[baseurl];
  }
  throw new Error("help_view not defined in _config.json for '"+baseurl+"'");
}
exports.json_encode_ejs = function (val){
  var rslt = JSON.stringify(val);
  rslt = rslt.replace(/script/g, 'scr"+"ipt');
  return rslt;
}
exports.null_log = function (val, txt){
  if (typeof val === undefined) global.log('Report has undefined value: ' + txt);
  if (val == null) global.log('Report has null value: ' + txt);
  return (val||'');
}
exports.number_format = function(number, decimals, dec_point, thousands_sep) {
  var n = !isFinite(+number) ? 0 : +number, 
      prec = !isFinite(+decimals) ? 0 : Math.abs(decimals),
      sep = (typeof thousands_sep === 'undefined') ? ',' : thousands_sep,
      dec = (typeof dec_point === 'undefined') ? '.' : dec_point,
      toFixedFix = function (n, prec) {
        var k = Math.pow(10, prec);
        return Math.round(n * k) / k;
      },
      s = (prec ? toFixedFix(n, prec) : Math.round(n)).toString().split('.');
  if (s[0].length > 3) {
    s[0] = s[0].replace(/\B(?=(?:\d{3})+(?!\d))/g, sep);
  }
  if ((s[1] || '').length < prec) {
    s[1] = s[1] || '';
    s[1] += new Array(prec - s[1].length + 1).join('0');
  }
  return s.join(dec);
}
exports.phone_format = function(val){
	if(!_.isString(val)) return val;
  if (val.length < 10) return val;
  if (val.length == 10) return '(' + val.substr(0, 3) + ') ' + val.substr(3, 3) + '-' + val.substr(6);
  return '(' + val.substr(0, 3) + ') ' + val.substr(3, 3) + '-' + val.substr(6,4) + '  ' + val.substr(10);
}
exports.drawCheckbox = function(val, w, h) {
  if (!w) w = 11;
  if (!h) h = w;
  var rslt = '<div style="width:' + w + 'px;height:' + h + 'px;line-height:' + h + 'px;">';
  if (val) rslt += '&#10060;';
  rslt += '</div>';

  rslt = '<canvas class="'+(val?'checkbox checked':'')+'" width=' + w + ' height=' + h + ' style="border:solid 1px black;"></canvas>';
  return rslt;
}