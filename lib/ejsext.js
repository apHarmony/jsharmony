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
exports.escapeJS = function (q) {
  return q.replace(/[\\'"]/g, "\\$&");
}
exports.escapeCSS = function(val, options){
  //options { nodash: true }
  var rslt = val;
  if(rslt.nodash) rslt = rslt.replace(/[^a-zA-Z0-9_]+/g, '_');
  else rslt = rslt.replace(/[^a-zA-Z0-9_-]+/g, '_');
  while(rslt && (rslt[0]=='-')) rslt = rslt.substr(1);
  while(rslt.indexOf('__') > 0) rslt = Helper.ReplaceAll(rslt,'__','_');
  return rslt;
};
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

//hasAction (req, model, perm1, perm2, perm3, permN )
//Run getActions on [req, model, perm1, ... permN-1]
//Intersect result with permN
exports.hasAction = function (req, model) {
  var args = Array.prototype.slice.call(arguments);
  var rslt = this.getActions.apply(this, args.slice(0, arguments.length - 1));
  rslt = this.intersectperm(rslt, args[args.length - 1]);
  return (rslt.length > 0);
}

//getActions(req, model, perm1, perm2, perm3, ....)
//Intersect permissions:
//  req._roles:DEV - *
//  req._roles:SYSADMIN - *
//  [roles for model] & [model.actions] & [BIUD] & perm1 & perm2 & perm3
//  Keep KFCS separate - union KFCS and append to end of result
exports.getActions = function (req, model){
  //field passed as model to check field permissions
  var args = arguments;
  if (arguments.length < 2) throw new Error('Invalid arguments - no permissions specified');
  if (!('actions' in model)) return '';
  var effperm = '';
  if ('DEV' in req._roles) effperm = '*';
  else if(!model.dev && ('SYSADMIN' in req._roles)) effperm = '*';
  else {
    var roles = Helper.GetModelRoles(req, model);
    for (role in roles) {
      if (role in req._roles) {
        effperm = this.unionperm(effperm, roles[role]);
      }
    }
  }
  effperm = this.intersectperm(effperm, model.actions);
  effperm = this.intersectperm(effperm, 'BIUD');
  if (req && req.query && req.query.action && (req.query.action=='browse')) effperm = this.intersectperm(effperm, 'B');
  if (effperm.length = 0) return '';
  var kfc = '';
  for (var i = 2; i < arguments.length; i++) {
    effperm = this.intersectperm(effperm, arguments[i]);
    kfc = this.unionperm(kfc,this.intersectperm('KFCS',arguments[i]));
  }
  return (effperm+kfc);
};
exports.hasFieldAction = function (req, field, perm) {
  //This does not check against model, because that is already done by the AppSrv
  if (perm == "*") return true;
  if (field.actions === undefined) return false;
  var actions = field.actions;
  if (field.roles) {
    if (req === null) return false;
    actions = exports.getActions(req, field, actions);
  }
  return Helper.hasAction(actions, perm);
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
  if(!fields) return;
	for(var i=0;i<fields.length;i++){
	if(fields[i].key)
		func(fields[i]);
	}
};
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
	var rslt = '<div class="errorExplanation">';
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
  return ('<div class="notification">' + info + '</div>');
};
exports.BreadCrumbs = function (req, jsh, fullmodelid) {
  if (req.bcrumb_override) { return '<div class="bcrumbs">'+req.bcrumb_override+'</div>'; return; }
  var model = jsh.getModel(req, fullmodelid);
  if (!model) return;
  if (!('breadcrumbs' in model) || !('parents' in model.breadcrumbs)) return;
  var breadcrumbs = model.breadcrumbs;
  var rslt = '';
  rslt += '<div class="bcrumbs">';

  var targetperm = '';
  if(req && req.query && req.query.action=='insert') targetperm = 'I';
  else if(req && req.query && req.query.action=='browse') targetperm = 'B';
  else targetperm = 'BU';

  var breadcrumbs_parents = undefined;
  var breadcrumbs_title = undefined;

  if((targetperm == 'I') && breadcrumbs.insert){
    if('parents' in breadcrumbs.insert) breadcrumbs_parents = breadcrumbs.insert.parents;
    if('title' in breadcrumbs.insert) breadcrumbs_title = breadcrumbs.insert.title;
  }
  else if((targetperm == 'B') && breadcrumbs.browse){
    if('parents' in breadcrumbs.browse) breadcrumbs_parents = breadcrumbs.browse.parents;
    if('title' in breadcrumbs.browse) breadcrumbs_title = breadcrumbs.browse.title;
  }
  else if((targetperm == 'B') && breadcrumbs.update){
    if('parents' in breadcrumbs.update) breadcrumbs_parents = breadcrumbs.update.parents;
    if('title' in breadcrumbs.update) breadcrumbs_title = breadcrumbs.update.title;
  }
  else if((targetperm == 'BU') && breadcrumbs.update){
    if('parents' in breadcrumbs.update) breadcrumbs_parents = breadcrumbs.update.parents;
    if('title' in breadcrumbs.update) breadcrumbs_title = breadcrumbs.update.title;
  }
  else if((targetperm == 'BU') && breadcrumbs.browse){
    if('parents' in breadcrumbs.browse) breadcrumbs_parents = breadcrumbs.browse.parents;
    if('title' in breadcrumbs.browse) breadcrumbs_title = breadcrumbs.browse.title;
  }
  if(typeof breadcrumbs_parents == 'undefined') breadcrumbs_parents = breadcrumbs.parents;
  if(typeof breadcrumbs_title == 'undefined') breadcrumbs_title = breadcrumbs.title;

  //Add parent breadcrumbs
  _.each(breadcrumbs_parents, function (bcrumb) {
    var bmodel = jsh.getModel(req, bcrumb, model);
    if (bmodel) {
      var blink = req.baseurl + bmodel.id;
      var mtitle = '';
      if (('breadcrumbs' in bmodel) && ('title' in bmodel.breadcrumbs)) mtitle = bmodel.breadcrumbs.title;
      else if(_.isString(bmodel.title)) mtitle = bmodel.title;
      else if((targetperm == 'B') && bmodel.title && _.isString(bmodel.title.browse)) mtitle = bmodel.title.browse;
      else if((targetperm == 'B') && bmodel.title && _.isString(bmodel.title.update)) mtitle = bmodel.title.update;
      else if(bmodel.title && _.isString(bmodel.title.update)) mtitle = bmodel.title.update;
      else if(bmodel.title && _.isString(bmodel.title.browse)) mtitle = bmodel.title.browse;
      rslt += '<a href="' + blink + '">' + Helper.ResolveParams(req, mtitle) + '</a> &gt; ';
    }
    else {
      //Treat breadcrumb as literal
      rslt += bcrumb + ' &gt; ';
    }
    });

  //Add current model breadcrumbs
  var mtitle = '';
  if(typeof breadcrumbs_title != 'undefined') mtitle = breadcrumbs_title;
  else if(_.isString(model.title)) mtitle = model.title;
  else if(targetperm == 'I'){
    //Insert
    if(model.title && _.isString(model.title.insert)) mtitle = model.title.insert;
  }
  else if(targetperm == 'B'){
    //Browse
    if(model.title && _.isString(model.title.browse)) mtitle = model.title.browse;
    else if(model.title && _.isString(model.title.update)) mtitle = model.title.update;
  }
  else {
    //Update
    if(model.title && _.isString(model.title.update)) mtitle = model.title.update;
    else if(model.title && _.isString(model.title.browse)) mtitle = model.title.browse;
  }
  if(mtitle) rslt += mtitle;
  
  rslt += '</div>';
  return rslt;
}
exports.ResolveParams = Helper.ResolveParams;
exports.json_encode_ejs = function (val){
  var rslt = JSON.stringify(val);
  rslt = rslt.replace(/script/g, 'scr"+"ipt');
  return rslt;
}
exports.null_log = function (log, val, txt){
  if (typeof val === undefined) log.warning('Report has undefined value: ' + txt);
  if (val == null) log.warning('Report has null value: ' + txt);
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