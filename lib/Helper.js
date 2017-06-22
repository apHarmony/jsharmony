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

exports.SUPPORTED_IMAGES = ['.jpg','.jpeg','.gif','.png'];

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
exports.HasModelAccess = function (req, model, perm){
	if(!this.access(model.access,perm)) return false;
	if('SYSADMIN' in req._roles) return true;
  if (!('roles' in model)) return false;
  for (role in model.roles) {
    if ((role in req._roles) || (role == '*')) {
      var roleperm = model.roles[role];
      if(this.access(roleperm, perm)) return true;
    }
  }
	return false;
};
exports.HasRole = function (req, role){
  if ('SYSADMIN' in req._roles) return true;
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
    global.log(txt);
    if (!req.jshconfig || !req.jshconfig.show_system_errors) {
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
	return moment(new Date(dtstmp)).format(exports.SQLISOFormat);
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
    if ('globalparams' in req.jshconfig) {
      for (key in req.jshconfig.globalparams) {
        var pval = req.jshconfig.globalparams[key];
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
exports.SendTXTEmail = function (dbcontext, jsh, TXT_ATTRIB, email_to, email_cc, email_bcc, email_attachments, params, callback) {
  var _this = this;
  //Pull TXT data from database
  var dbtypes = jsh.AppSrv.DB.types;
  jsh.AppSrv.ExecRecordset(dbcontext, "Helper_SendTXTEmail", [dbtypes.VarChar(32)], { 'TXT_ATTRIB': TXT_ATTRIB }, function (err, rslt) {
    if ((rslt != null) && (rslt.length == 1) && (rslt[0].length == 1)) {
      var TXT = rslt[0][0];
      var new_bcc = email_bcc;
      if (TXT[jsh.map.txt_bcc]) {
        if (new_bcc) new_bcc += ', ' + TXT[jsh.map.txt_bcc];
        else new_bcc = TXT[jsh.map.txt_bcc];
      }
      var email_text = '';
      var email_html = '';
      var email_body = TXT[jsh.map.txt_val];
      if (email_body && (TXT[jsh.map.txt_type].toUpperCase()=='HTML')) email_html = email_body;
      else email_text = email_body;
      _this.SendBaseEmail(dbcontext, jsh, TXT[jsh.map.txt_tval], email_text, email_html, email_to, email_cc, new_bcc, email_attachments, params, callback)
    }
    else return callback(new Error('Email ' + TXT_ATTRIB + ' not found.'));
  });
};
exports.SendBaseEmail = function (dbcontext, jsh, email_subject, email_text, email_html, email_to, email_cc, email_bcc, email_attachments, params, callback){
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
  if(global.debug_params.disable_email){ global.log('DEBUG - NO EMAIL SENT'); return callback(); }
  if (!('from' in mparams)) mparams.from = global.mailer_email;
  global.log(mparams);
  if(!global.mailer){ global.log('ERROR - global.mailer not configured'); return callback(); }
  global.mailer.sendMail(mparams, callback);
}
exports.js_proxy = function (req, data) {
  return this.js_proxy_raw(req, JSON.stringify(data));
};
exports.js_proxy_raw = function (req, jsparams) {
  return '<script language="javascript" type="text/javascript"> \
          window.top.window.js_proxy_complete('+JSON.stringify(req.jsproxyid)+','+jsparams+'); \
          </script>';
};
exports.js_proxy_error = function (err) {
  var errtxt = JSON.stringify(err);
  return '<script language="javascript" type="text/javascript" src="/js/main.js"></script><script language="javascript" type="text/javascript"> \
          XExt.Alert(' + JSON.stringify(errtxt) + '); \
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
exports.ParamCheck = function (desc, col, params, show_errors) {
  if (typeof show_errors == 'undefined') show_errors = true;
  var args = arguments;
  var parsed = [];
  if (typeof params != 'undefined') {
    for (var i = 0; i < params.length; i++) {
      var param = params[i].substr(1);
      var req = (params[i][0] == '&');
      if (req && !(param in col)) {
        if (show_errors) global.log(desc + ': Invalid Parameters - Missing ' + param);
        return false;
      }
      parsed.push(param);
    }
  }
  for (var i in col) {
    if (!_.includes(parsed, i)) {
      if (show_errors) global.log(desc + ': Invalid Parameters - Extra Parameter ' + i);
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
exports.MergeConfig = function(srcconfig, newconfig){
  var rslt = srcconfig;
  for(var f in newconfig){
    if(!(f in rslt)) rslt[f] = newconfig[f];
    else if((f=='auth') && (newconfig[f] === false)){
      rslt[f] = false;
    }
    else if(_.includes(['auth', 'datalock','datalocktypes','globalparams','sqlparams'],f)){
      rslt[f] = _.extend(rslt[f],newconfig[f]);
    }
    else if(_.includes(['public_apps','private_apps'],f)){
      rslt[f] = newconfig[f].concat(rslt[f]);
    }
    else rslt[f] = newconfig[f];
  }
  return rslt;
}
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