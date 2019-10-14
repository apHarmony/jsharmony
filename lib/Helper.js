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
var async = require('async');

exports = module.exports = {};

//Object.size = function(obj) {
exports.Size = function (obj) {
  var size = 0, key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) size++;
  }
  return size;
};
//Return whether actions contains any of the permissions in PERM
exports.hasAction = function (actions, perm){
  perm = perm || '';
  if (perm == "*") return true;
  if (actions === undefined) return false;
  if (actions == "*") return true;
	for(var i=0;i<perm.length;i++){
		if(actions.indexOf(perm[i]) > -1) return true;
	}
	return false;
};
exports.GetRoleSites = function(roles){
  var rslt = [];
  if(roles){
    var addmain = false;
    for(var siteid in roles){
      if(roles[siteid] && _.isString(roles[siteid])) addmain = true;
      else rslt.push(siteid)
    }
  }
  if(addmain){
    if(!_.includes(rslt,'main')) rslt.push('main');
  }
  if(rslt.length==0) rslt.push('main');
  return rslt;
}
exports.GetModelRoles = function(req, model){
  //For main site, enable roles: { "roleid": "perm" } syntax
  //For other sites, require roles: { "siteid": { "roleid": "perm" } } syntax
  if(!model || !model.roles) return {};
  var roles = _.extend({},model.roles);
  if((req.jshsite.id in roles) && !_.isString(roles[req.jshsite.id])) roles = _.extend({},roles[req.jshsite.id]);
  else if(req.jshsite.id != 'main') return {};
  //Remove any objects
  for(var role in roles){
    if(!_.isString(roles[role])) delete roles[role];
  }
  return roles;
}

//hasModelAction(req, model, perm)
//  Returns whether the user has access to the model with any of the permissions in PERM
//  If user has DEV/SYSADMIN access, return true
//
exports.hasModelAction = function (req, model, perm){
  if(!this.hasAction(model.actions,perm)) return false;
  if('DEV' in req._roles) return true;
  if(!model.dev && ('SYSADMIN' in req._roles)) return true;
  var roles = exports.GetModelRoles(req, model);
  for (role in roles) {
    if ((role in req._roles) || (role == '*')) {
      var roleperm = roles[role];
      if(this.hasAction(roleperm, perm)) return true;
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
exports.NewError = function(message,number,stats){
	var err = new Error(message);
  if(typeof number != 'undefined') err.number = number;
  if(stats) err.stats = stats; 
  err.frontend_visible = true;
	return err;
}
exports.GetTrace = function(){
  try {
    throw new Error('Trace');
  } catch(e) {
    return e.stack;
  }
}
exports.GenError = function(req,res,num,txt,options){
  options = _.extend({ stats: undefined, renderJS: false, trace: false }, options);
  var stats = {};
  if(options.stats) stats = exports.FormatStats(req, options.stats);

  //options.trace = true; //Debugging Mode
  if(options.trace){
    txt = (txt||'').toString() + '\n' + exports.GetTrace().toString();
  }

	var erslt = {'_error':{
		'Number':num,
		'Message':txt
    },
    '_stats': stats
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
  if (options.renderJS) { res.end(this.js_proxy_raw(req, JSON.stringify(erslt))); return erslt; }
  if ('jsproxyid' in req) { res.end(this.js_proxy_raw(req, JSON.stringify(erslt))); return erslt; }
  if ('jsonpcallback' in req.query) { res.end(this.jsonp(req, erslt)); return erslt; }
  res.status(500);
  res.end(JSON.stringify(erslt));
  return erslt;
};
exports.FormatStats = function(req, stats, options){
  options = _.extend({ notices: false, show_all_messages: false }, options);

  function getExceptionMessage(exception, show_all){
    if ('model' in stats) {
      var model = stats.model;
      if ('dberrors' in model) {
        var errmsg = (exception.message||'').toString().toLowerCase();
        for (var i = 0; i < model.dberrors.length; i++) {
          var dberr = model.dberrors[i];
          var erex = dberr[0].toString().toLowerCase();
          var etxt = dberr[1];
          if (erex.indexOf('/') == 0) {
            erex = erex.substr(1, erex.length - 2);
            if (errmsg.match(new RegExp(erex))) { return etxt }
          }
          else if (errmsg.indexOf(erex) >= 0) { return etxt }
        }
      }
    }
    if(exception.message.indexOf('Application Error - ')==0) return exception.message;
    if(exception.message.indexOf('Application Warning - ')==0) return exception.message;
    if(exception.message.indexOf('Execute Form - ')==0) return exception.message;
    if (show_all) {
      var msg = '';
      if(stats.model) msg += stats.model.id + ': ';
      msg += exception.message;
      return msg;
    }
  }

  var rslt = { };

  if(!stats) return { };

  var one_result = (stats.warnings && _.isArray(stats.warnings)) || (stats.notices && _.isArray(stats.notices));
  if(one_result){ //One result
    rslt.warnings = [];
    if(_.isArray(stats.warnings)){
      var show_all_warnings = (options.show_all_messages || (req && req.jshsite && req.jshsite.show_system_errors));
      for(var i=0;i<stats.warnings.length;i++){
        var etxt = getExceptionMessage(stats.warnings[i], show_all_warnings);
        if(etxt) rslt.warnings.push(etxt);
      }
    }
    rslt.notices = [];
    if(stats.notices && _.isArray(stats.notices)){
      var show_all_notices = options.notices && (options.show_all_messages || (req && req.jshsite && req.jshsite.show_system_errors));
      for(var i=0;i<stats.notices.length;i++){
        var etxt = getExceptionMessage(stats.notices[i], show_all_notices);
        if(etxt) rslt.notices.push(etxt);
      }
    }
  }
  else { //Multiple results
    for(var key in stats){
      rslt[key] = exports.FormatStats(req, stats[key], options);
    }
  }
  return rslt;
}
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
exports.pushCreate = function(parent, idx, val){
  if(!parent) throw new Error('Parent not defined');
  if(!(idx in parent)) parent[idx] = [];
  parent[idx].push(val);
}
exports.getFullURL = function (req, url) {
  return req.protocol + '://' + req.get('host') + url;
};
exports.getLine = function(txt, lineno){
  if(!txt) return undefined;
  var lines = txt.toString().split('\n');
  if(lineno > lines.length) return undefined;
  return lines[lineno-1];
}
exports.js_proxy = function (req, data) {
  return this.js_proxy_raw(req, JSON.stringify(data));
};
exports.js_proxy_raw = function (req, jsparams) {
  return '<script language="javascript" type="text/javascript"> \
          window.top.window.'+req.jshsite.instance+'.XPage.onJSProxyComplete('+JSON.stringify(req.jsproxyid)+','+jsparams+'); \
          </script>';
};
exports.jsonp = function (req, data) {
  return this.jsonp_raw(req, req.query.jsonpcallback, JSON.stringify(data));
};
exports.jsonp_raw = function (req, id, jsparams) {
  return id+'('+jsparams+');';
};
exports.js_proxy_error = function (err) {
  var errtxt = JSON.stringify(err);
  return '<script language="javascript" type="text/javascript" src="/js/jsHarmony.js"></script><script language="javascript" type="text/javascript"> \
          alert(' + JSON.stringify(errtxt) + '); \
          </script>';
}
exports.endsWith = function(str, suffix) {
  return str.match(suffix + "$") == suffix;
}
exports.beginsWith = function (str, prefix) {
  return str.indexOf(prefix) === 0;
}
exports.trim = function(str,chr,dir){
  if(!chr) chr = ' \t\n\r\v\f';
  var foundchr = true;
  var rslt = str||'';

  if(!dir){
    rslt = exports.trim(str, chr, 1);
    rslt = exports.trim(rslt, chr, -1);
    return rslt;
  }

  while(foundchr){
    foundchr = false;
    if(!rslt) break;
    var tgtchr = '';
    if(dir>0) tgtchr = rslt[rslt.length-1];
    else tgtchr = rslt[0];
    for(var i=0;i<chr.length;i++){
      if(tgtchr==chr[i]){ foundchr = true; break; }
    }
    if(foundchr){
      if(dir>0) rslt = rslt.substr(0,rslt.length - 1);
      else rslt = rslt.substr(1);
    }
  }
  return rslt;  
}
exports.trimRight = function(str, chr){
  return exports.trim(str, chr, 1);
}
exports.trimLeft = function(str, chr){
  return exports.trim(str, chr, -1);
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
exports.escapeCSSClass = function(val,options){
  //options { nodash: true }
  var rslt = val;
  if(rslt.nodash) rslt = rslt.replace(/[^a-zA-Z0-9_]+/g, '_');
  else rslt = rslt.replace(/[^a-zA-Z0-9_-]+/g, '_');
  rslt = exports.trimLeft(rslt,'-');
  while(rslt.indexOf('__') > 0) rslt = exports.ReplaceAll(rslt,'__','_');
  return rslt;
}
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
//Escape HTML and replace line breaks with HTML line breaks
exports.escapeHTMLBR = function (val) {
  if((typeof val=='undefined')||(val===null)) return val;
  return exports.ReplaceAll(exports.ReplaceAll(exports.escapeHTML(val.toString()), '\n', '<br/>'), '\r', '');
}
exports.escapeJS = function (q) {
  return q.replace(/[\\'"]/g, "\\$&");
}
exports.escapeCSS = function (q) {
  return q.replace(/[\\'"]/g, "\\$&");
}
exports.escapeRegEx = function (q) {
  return q.replace(/[-[\]{}()*+?.,\\/^$|#\s]/g, "\\$&");
}
exports.execif = function (cond, apply, f){
  if (cond) apply(f);
  else f();
}
exports.notset = function (val){
  if(typeof val === 'undefined') return true;
  return false;
};
exports.firstKey = function (arr){
  if(_.isArray(arr)) return arr.length ? arr[0] : undefined;
  for(var key in arr) return arr[key];
  return undefined;
}
exports.remove = function (arr, elem){
  if(!_.isArray(arr)) return;
  for(var i=0;i<arr.length;i++){
    if(arr[i]==elem){
      arr.splice(i, 1);
      i--;
    }
  }
}
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
exports.convertBufferToHexString = function(obj, index){
  if(!obj){ }
  else if(typeof index == 'undefined'){
    for(var key in obj) exports.convertBufferToHexString(obj,key);
  }
  else if(!obj[index]){ }
  else if(obj[index] instanceof Buffer){ obj[index] = '0x'+obj[index].toString('hex').toUpperCase(); }
  else if(_.isString(obj[index])){ }
  else if(_.isArray(obj[index])){
    for(var i=0;i<obj[index].length;i++) exports.convertBufferToHexString(obj[index],i);
  }
  else {
    for(var key in obj[index]) exports.convertBufferToHexString(obj[index],key);
  }
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
exports.GetCookie = function(req, jsh, name){
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
  var rslt = '';
  var port = req.socket.localPort;
  rslt += '_'+port;
  if(req.jshsite) rslt += '_' + (req.jshsite.id||'');
  return rslt;
}
exports.ParseDate = function(val){
  if(_.isNumber(val)) val = moment(val).toString("YYYY-MM-DDTHH:mm:ss.SSS");
  if(val===0){}
  else if(!val) val = '';
  val = val.toString().trim();
  var rslt = moment(val, "YYYY-MM-DDTHH:mm:ss.SSS", true); //Strict parsing
  if(!rslt.isValid()) rslt = moment(val, 'YYYY-MM-DDTHH:mm:ss.SSSSSS', true);
  if(!rslt.isValid()) rslt = moment(val, 'YYYY-MM-DD', true);
  if(!rslt.isValid()) rslt = moment(new Date(val));
  return rslt.toDate();
}
exports.GetIP = function(req){
  if(!req) return '';
  return (req._remoteAddress || (req.connection && req.connection.remoteAddress) || '');
}
exports.trigger = function(handlers /*, param1, param2 */){
  if(!handlers) handlers = [];
  if(!_.isArray(handlers)) handlers = [handlers];

  var params = [];
  if(arguments.length > 1) params = Array.prototype.slice.call(arguments, 1);

  //Run handlers
  _.each(handlers, function(handler){
    handler.apply(null, params);
  });
}
exports.triggerAsync = function(handlers, cb /*, param1, param2 */){
  if(!cb) cb = function(){ };
  if(!handlers) handlers = [];
  if(!_.isArray(handlers)) handlers = [handlers];

  var params = [];
  if(arguments.length > 2) params = Array.prototype.slice.call(arguments, 2);

  //Run handlers
  async.eachSeries(handlers, function(handler, handler_cb){
    var hparams = [handler_cb].concat(params);
    handler.apply(null, hparams);
  }, cb);
}

exports.stringify = function (origvalue, replacer, space) {
  var cache = [];
  return JSON.stringify(origvalue, function(key, value){
    if (typeof value === 'object' && value !== null) {
      if (cache.indexOf(value) !== -1) {
          // Duplicate reference found
          try {
              // If this value does not reference a parent it can be deduped
              return JSON.parse(JSON.stringify(value));
          } catch (error) {
              // discard key if value cannot be deduped
              return;
          }
      }
      // Store value in our collection
      cache.push(value);
  }
  if(replacer) return replacer(key, value);
  return value;
  }, space);
}

exports.JSEval = function(str,_thisobj,params){
  if(!_thisobj) thisobj = jsh;
  if(!params) params = {};
  var paramstr = '';
  if(params){
    for(var param in params){
      paramstr += 'var '+param+'=params.'+param+';';
    }
  }
  var jscmd = '(function(){'+paramstr+'return '+str+'}).call(_thisobj)';
  return eval(jscmd);
}

exports.mapReplace = function(mapping, txt){
  if((txt === null) || (typeof txt == 'undefined')) return '';
  var rslt = txt.toString();
  
  //Get mapping keys
  var mapkeys = _.keys(mapping);
  //Sort by length
  mapkeys.sort(function(a,b){
    if(a.length > b.length) return -1;
    if(a.length < b.length) return 1;
    if(a < b) return 1;
    if(a > b) return -1;
    return 0;
  });
  
  if(!mapkeys.length) return rslt;
  
  //Generate cubemap
  var cubemap = [];
  var maxkeylen = mapkeys[0].length;
  for(var i=0;i<maxkeylen;i++) cubemap.push({});
  for(var i=0;i<mapkeys.length;i++){
    var key = mapkeys[i];
    for(var j=0;j<key.length;j++) exports.pushCreate(cubemap[j], key.substr(0, j+1), key);
  }
  
  var matches = [];
  var fragments = [];
  for(var i=0;i<maxkeylen;i++){
    fragments.push('');
    matches.push([]);
  }
  
  rslt += '\n';
  for(var idx=0;idx<rslt.length;idx++){
    var chr = rslt[idx];
    var longest_current_fragment_length = 0;
    var longest_previous_match_length = 0;
    var longest_previous_match = '';
    var longest_previous_match_index = -1;
    //console.log(''); //DEBUG
    //console.log(chr); //DEBUG
    //console.log(fragments); //DEBUG
    //console.log(matches); //DEBUG
    for(var i=(maxkeylen - 1); i>= -1; i--){
      if(i>0) matches[i] = matches[i-1];
      else if(i==0) matches[i] = [];
      
      if(!((i==-1) || fragments[i])) continue;
      var curmatch = (i >= 0) ? fragments[i] + chr : chr;
      if(curmatch in mapping) matches[i].push(curmatch);
      //console.log(curmatch + ' - ' + i); //DEBUG
      if((i < (maxkeylen - 1)) && (curmatch in cubemap[i+1])){
        if((i+2) > longest_current_fragment_length) longest_current_fragment_length = i + 2;
        fragments[i+1] = curmatch;
      }
      else if(i>=0){
        for(var j=0;j<matches[i].length;j++){
          var match = matches[i][j];
          if(match.length >= longest_previous_match_length){
            longest_previous_match_length = match.length;
            longest_previous_match = match;
            longest_previous_match_index = i;
          }
        }
        //if(fragments[i]){ console.log('Clearing '+fragments[i]); } //DEBUG
      }
      if(i>=0) fragments[i] = '';
    }
    if(longest_previous_match_length && (longest_previous_match_length > longest_current_fragment_length)){
      var foundtxt = longest_previous_match;
      var replacetxt = mapping[foundtxt];
      var startidx = idx - longest_previous_match_index - 1;
      var endidx = startidx + foundtxt.length;
      var rerun_replacement = false;
      if((startidx >= 2) && (endidx < (rslt.length - 2))){
        var prevchars = rslt.substr(startidx-2,2);
        var nextchars = rslt.substr(endidx,2);
        if((prevchars=='{{') && (nextchars=='}}')){
          //Escape {{...}} to original string
          replacetxt = foundtxt;
          foundtxt = prevchars + foundtxt + nextchars;
          startidx -= prevchars.length;
          endidx += nextchars.length;
        }
        else if((prevchars=='f:') && (nextchars[0]==':')){
          //Escape if::...:endif:
          var token_if = ':if:';
          var token_else = ':else:';
          var token_endif = ':endif:';
          if((startidx >= token_if.length) && (rslt.substr(startidx-token_if.length,token_if.length)==token_if)){
            endidx += 1;
            var idx_else = rslt.indexOf(token_else, endidx);
            var idx_endif = rslt.indexOf(token_endif, endidx);
            if(idx_else > idx_endif) idx_else = -1;
            if(idx_endif < 0) idx_endif = rslt.length;
            var rslt_true = '';
            var rslt_false = '';
            if(idx_else >= 0){
              rslt_true = rslt.substr(endidx, idx_else - endidx);
              rslt_false = rslt.substr(idx_else + token_else.length, idx_endif - (idx_else + token_else.length));
            }
            else {
              rslt_true = rslt.substr(endidx, idx_endif - endidx);
            }

            if(!replacetxt || (replacetxt==='0')) replacetxt = rslt_false;
            else replacetxt = rslt_true;
            startidx -= token_if.length;
            endidx = idx_endif + token_endif.length;
            if(endidx > rslt.length) endidx = rslt.length;
            foundtxt = rslt.substr(startidx, endidx - startidx);
            rerun_replacement = true;
          }
        }
      }
      rslt = rslt.substr(0,startidx) + replacetxt + rslt.substr(endidx);
      if(rerun_replacement){
        idx = startidx - 1;
      }
      else {
        idx = endidx - (endidx - startidx) + replacetxt.length - 1;
      }
      //console.log('Replace ' + foundtxt + ' at ' + longest_previous_match_index); //DEBUG
      for(var i=1;i<maxkeylen;i++){
        fragments[i] = '';
        matches[i] = [];
      }
    }
  }
  rslt = rslt.substr(0,rslt.length - 1);
  
  //console.log(cubemap); //DEBUG
  
  return rslt;
}