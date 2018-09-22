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
var moment = require('moment');
var ejs = require('ejs');

exports = module.exports = {};

//Object.size = function(obj) {
exports.Size = function (obj) {
  var size = 0, key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) size++;
  }
  return size;
};
exports.access = function (access, perm){
  if (perm == "*") return true;
  if (access === undefined) return false;
  if (access == "*") return true;
	for(var i=0;i<perm.length;i++){
		if(access.indexOf(perm[i]) > -1) return true;
	}
	return false;
};
exports.GetRoleSites = function(roles){
  var rslt = [];
  if(roles){
    var allobj = true;
    for(var siteid in roles){
      if(_.isString(roles[siteid])) allobj = false;
      else rslt.push(siteid)
    }
    if(!allobj) rslt = [];
  }
  if(!rslt.length) rslt.push('main');
  return rslt;
}
exports.GetModelRoles = function(req, model){
  //For main site, enable roles: { "roleid": "perm" } syntax
  //For other sites, require roles: { "siteid": { "roleid": "perm" } } syntax
  if(!model || !model.roles) return {};
  var roles = model.roles;
  if((req.jshsite.id in roles) && !_.isString(roles[req.jshsite.id])) roles = roles[req.jshsite.id];
  else if(req.jshsite.id != 'main') return {};
  return roles;
}
exports.HasModelAccess = function (req, model, perm){
  if(!this.access(model.actions,perm)) return false;
  if('DEV' in req._roles) return true;
  if(!model.dev && ('SYSADMIN' in req._roles)) return true;
  var roles = exports.GetModelRoles(req, model);
  for (role in roles) {
    if ((role in req._roles) || (role == '*')) {
      var roleperm = roles[role];
      if(this.access(roleperm, perm)) return true;
    }
  }
	return false;
};
exports.HasRole = function (req, role){
  if ('SYSADMIN' in req._roles) return true;
  if ('DEV' in req._roles) return true;
  if (role in req._roles) return true;
  return false;
}
exports.NewError = function(message,number){
	var err = new Error(message);
  if (typeof number != 'undefined') err.number = number;
	return err;
}
exports.GenError = function(req,res,num,txt,options){
	var erslt = {'_error':{
		'Number':num,
		'Message':txt
    }
  };
  if (num == -99999) {
    if(req.getJSH){
      req.getJSH().Log.error(txt);
    }
    if (!req.jshsite || !req.jshsite.show_system_errors) {
      erslt._error.Message = 'A system error has occurred.  If the problem continues, please contact support for assistance.';
    }
  }
  res.header('Content-Type','text/html'); 
  if (options && options.renderJS) { res.end(this.js_proxy_raw(req, JSON.stringify(erslt))); return erslt; }
  if ('jsproxyid' in req) { res.end(this.js_proxy_raw(req, JSON.stringify(erslt))); return erslt; }
  res.status(500);
  res.end(JSON.stringify(erslt));
  return erslt;
};
exports.GenHTMLError = function (res, num, txt){
  //Possibly process error, log if unexpected
  res.end(txt);
  return false;
}
exports.Redirect302 = function(res,url){
	res.writeHead(302,{ 'Location': url });
	res.end();
};
exports.SQLISOFormat = "YYYY-MM-DDTHH:mm:ss";
exports.DateToSQLISO = function(dt){
	var dtstmp = Date.parse(dt);
	if(isNaN(dtstmp)){ return null; }
	return moment(exports.ParseDate(dtstmp)).format(exports.SQLISOFormat);
}
exports.IsValidDate = function(dt){
	var dtstmp = Date.parse(dt);
	if(isNaN(dtstmp)){ return false; }
	return true;
}
exports.ResolveParams = function (req, val) {
  if (typeof val === 'undefined') return val;
  var rslt = val;
  if (rslt.indexOf('@') >= 0) {
    //Replace any datalocks
    if ('globalparams' in req.jshsite) {
      for (key in req.jshsite.globalparams) {
        var pval = req.jshsite.globalparams[key];
        if (_.isFunction(pval)) pval = pval(req);
        rslt = this.ReplaceAll(rslt, '@' + key, pval)
      }
    }
  }
  return rslt;
};
exports.ParseMultiLine = function (val){
  if (!val) return val;
  if (_.isArray(val)) return val.join(' ');
  return val.toString();
}
exports.ReplaceAll = function (val, find, replace){
  return val.split(find).join(replace);
}
exports.getFullURL = function (req, url) {
  return req.protocol + '://' + req.get('host') + url;
};
exports.js_proxy = function (req, data) {
  return this.js_proxy_raw(req, JSON.stringify(data));
};
exports.js_proxy_raw = function (req, jsparams) {
  return '<script language="javascript" type="text/javascript"> \
          window.top.window.'+req.jshsite.instance+'.js_proxy_complete('+JSON.stringify(req.jsproxyid)+','+jsparams+'); \
          </script>';
};
exports.js_proxy_error = function (err) {
  var errtxt = JSON.stringify(err);
  return '<script language="javascript" type="text/javascript" src="/js/jsHarmony.js"></script><script language="javascript" type="text/javascript"> \
          function(){ var jsh = new jsHarmony(); jsh.XExt.Alert(' + JSON.stringify(errtxt) + '); } \
          </script>';
}
exports.endsWith = function(str, suffix) {
  return str.match(suffix + "$") == suffix;
}
exports.beginsWith = function (str, prefix) {
  return str.indexOf(prefix) === 0;
}
exports.renderTable = function (data){
  var rslt = '';
  if (!_.isArray(data)) throw new Error('renderTable data must be an array');
  rslt += '<table border="1">';
  //Print Header
  if(data.length > 0){
    var row = data[0];
    rslt += '<tr>';
    for (var col in row) {
      rslt += '<th nowrap align="left">' + col + '</th>';
    }
    rslt += '</tr>';
  }
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    rslt += '<tr>';
    for (var col in row) {
      rslt += '<td nowrap>' + row[col] + '</td>';
    }
    rslt += '</tr>';
  }
  rslt += '</table>';
  return rslt;
}
exports.pad = function(val, padding, length) {
  var rslt = val.toString();
  while (rslt.length < length) rslt = padding + rslt;
  return rslt;
}
exports.JSONstrip = function (txt) {
  if (!txt) return '';
  txt = txt.replace(new RegExp("\/\/(.*)", "g"), '');
  txt = txt.replace(new RegExp("\\\\$\r\n", "mg"), '');
  return txt;
};
exports.ParamCheck = function (desc, col, params, log) {
  var args = arguments;
  var parsed = [];
  if (typeof params != 'undefined') {
    for (var i = 0; i < params.length; i++) {
      var param = params[i].substr(1);
      var req = (params[i][0] == '&');
      if (req && !(param in col)) {
        if (log) log.warning(desc + ': Invalid Parameters - Missing ' + param);
        return false;
      }
      parsed.push(param);
    }
  }
  for (var i in col) {
    if (!_.includes(parsed, i)) {
      if (log) log.warning(desc + ': Invalid Parameters - Extra Parameter ' + i);
      return false;
    }
  }
  return true;
}
exports.utf8_base64 = function (str) { return btoa(unescape(encodeURIComponent(str))); }
exports.base64_utf8 = function (str) {
  var rslt = new Buffer(str, 'base64').toString();
  return decodeURIComponent(escape(rslt));
}
exports.escapeJS = function (q) {
  return q.replace(/[\\'"]/g, "\\$&");
}
exports.execif = function (cond, apply, f){
  if (cond) apply(f);
  else f();
}
exports.notset = function (val){
  if(typeof val === 'undefined') return true;
  return false;
};
exports.str2hex = function(s) {
  var i, l, o = '', n;
  s += '';
  for (i = 0, l = s.length; i < l; i++) {
    n = s.charCodeAt(i)
      .toString(16);
    o += n.length < 2 ? '0' + n : n;
  }
  return o;
}
//Returns an item from an associative array, optionally using case-insensitive comparison
exports.arrayItem = function(array,idx,options){
  if(!options) options = {};
  if(!array) return undefined;
  if(!idx) return undefined;
  if(options.caseInsensitive){
    idx = idx.toUpperCase();
    for(var f in array){ if(f.toUpperCase()==idx) return array[f]; }
    return undefined;
  }
  else return array[idx];
}
//Returns the key in the associative array, primarily when using case-insensitive comparison
exports.arrayKey = function(array,idx,options){
  if(!options) options = {};
  if(!array) return undefined;
  if(!idx) return undefined;
  if(options.caseInsensitive){
    idx = idx.toUpperCase();
    for(var f in array){ if(f.toUpperCase()==idx) return f; }
    return undefined;
  }
  else return idx;
}
exports.arrayIndexOf = function(array,val,options){
  if(!options) options = {};
  if(!array) return undefined;
  if(options.caseInsensitive){
    if(!val) val = '';
    val = val.toUpperCase();
    for(var i=0;i<array.length;i++){ if(array[i].toUpperCase()==val) return i; }
    return -1;
  }
  else return array.indexOf(val);
}
exports.StripTags = function (val, ignore) {
  if (!val) return val;
  
  ignore = (((ignore || '') + '').toLowerCase().match(/<[a-z][a-z0-9]*>/g) || []).join('')
  var clienttags = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi
  var servertags = /<!--[\s\S]*?-->|<\?(?:php)?[\s\S]*?\?>/gi
  
  return _.unescape(val.replace(servertags, '').replace(clienttags, function ($0, $1) {
    return ignore.indexOf('<' + $1.toLowerCase() + '>') > -1 ? $0 : ''
  }));
}
exports.GetCookie = function(req, res, jsh, name){
  name += exports.GetCookieSuffix(req, jsh);
  if (!(name in req.cookies)) return undefined;
  return req.cookies[name];
}
exports.SetCookie = function(req, res, jsh, name, value, options){
  name += exports.GetCookieSuffix(req, jsh);
  res.cookie(name, value, options);
}
exports.ClearCookie = function(req, res, jsh, name, options){
  name += exports.GetCookieSuffix(req, jsh);
  res.clearCookie('account', { 'path': req.baseurl });
}
exports.GetCookieSuffix = function(req, jsh){
  if(typeof jsh.Config.system_settings.cookie_suffix !== 'undefined') return jsh.Config.system_settings.cookie_suffix;
  var port = req.socket.localPort;
  return '_'+port;
}
exports.ParseDate = function(val){
  if(val===0){}
  else if(!val) val = '';
  val = val.toString();
  var rslt = moment(val.trim(), "YYYY-MM-DDTHH:mm:ss.SSS", true); //Strict parsing
  if(!rslt.isValid()) rslt = moment(new Date(val));
  return rslt.toDate();
}