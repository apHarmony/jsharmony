/*
Copyright 2026 apHarmony

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

var moment = require('moment');

exports = module.exports = {};

function XValidate(jsh) {
  this.Validators = new Array();
  this.Errors = new Array();
  this.FocusOnError = true;
  this.ErrorClass = 'xinputerror';
  this.jsh = jsh||XValidate.jsh;
}
XValidate.jsh = undefined;
XValidate.prototype.AddValidator = function (_field, _caption, _actions, _funcs, _roles) {
  this.Validators.push(new XValidator(_field, _caption, _actions, _funcs, undefined, _roles));
};
XValidate.prototype.AddControlValidator = function (_selector, _field, _caption, _actions, _funcs) {
  this.Validators.push(new XValidator(_field, _caption, _actions, _funcs, _selector));
};
XValidate.prototype.ResetValidation = function (field, parentobj) {
  if (!parentobj) parentobj = this.jsh.xdroot;
  this.Errors.length = 0;
  field = field || '';
  for (var i = 0; i < this.Validators.length; i++) {
    var v = this.Validators[i];
    if (field && (field != v.Field)) continue;
    
    if ((this.ErrorClass != '') && (v.Selector != '')) {
      this.jsh.XDom(parentobj, v.Selector).class.remove(this.ErrorClass);
    }
  }
};
XValidate.prototype.ValidateControls = function (perms, _obj, field, parentobj) {
  var _this = this;
  field = field || '';
  var firstErrorControl = '';
  if (!parentobj) parentobj = _this.jsh.xdroot;
  this.ResetValidation(field, parentobj);
  var verrors = this.Validate(perms, _obj, field);
  if (verrors) {
    var errstr = 'The following errors have occurred:\n\n';
    for (var ctrl in verrors) {
      errstr += verrors[ctrl].join('\n') + '\n';
      if (ctrl != '') {
        if (this.FocusOnError && (firstErrorControl == '')) {
          firstErrorControl = ctrl;
        }
        if (this.ErrorClass != '') {
          _this.jsh.XDom(parentobj, ctrl).class.add(this.ErrorClass);
        }
      }
    }
    errstr = errstr.substr(0, errstr.length - 1);
    
    _this.jsh.XExt.Alert(errstr, function () {
      if (firstErrorControl != '') {
        _this.jsh.ignorefocusHandler = true;
        window.setTimeout(function () {
          document.activeElement && document.activeElement.blur();
          var newobj = _this.jsh.XDom(parentobj, firstErrorControl).element;
          var subfocus = _this.jsh.XDom(newobj, '.xform_ctrl_subfocus').element;
          if(subfocus) newobj = subfocus;
          if (newobj) {
            newobj.focus();
            if (newobj.select) {
              newobj.select();
            }
          }
          window.setTimeout(function () { _this.jsh.ignorefocusHandler = false; }, 1);
        }, 1);
      }
    });
    return false;
  }
  return true;
};
XValidate.prototype.Validate = function (perms, _obj, field, ignore, roles, options) {
  if(!options) options = { ignoreUndefined: false };
  field = field || '';
  if (typeof ignore == 'undefined') ignore = [];
  var rslt = {};
  
  for (var i = 0; i < this.Validators.length; i++) {
    var v = this.Validators[i];
    if (field && (field != v.Field)) continue;
    var ignorefield = false;
    for (var j = 0; j < ignore.length; j++) { if (ignore[j] == v.Field) { ignorefield = true; break; } }
    if (ignorefield) continue;
    if (!HasAccess(v.Actions, perms)) continue;
    var val = null;
    eval('val = ' + v.Field);
    if(options.ignoreUndefined && (typeof val === 'undefined')) continue;
    if ((typeof val === 'undefined') && v.Roles && roles && !('SYSADMIN' in roles) && !('DEV' in roles) && HasAccess('BIUD', perms)) {
      var has_role_access = false;
      for (var role in v.Roles) {
        if (role in roles) {
          var rAccess = v.Roles[role];
          if ((rAccess == '*') || HasAccess(rAccess, perms)) has_role_access = true;
        }
      }
      if (!has_role_access) { continue; }
    }
    for (var k = 0; k < v.Funcs.length; k++) {
      var vrslt = v.Funcs[k](v.Caption || v.Field, val, _obj);
      if (vrslt) {
        this.Errors.push(vrslt);
        if (!(v.Selector in rslt)) rslt[v.Selector] = [];
        rslt[v.Selector].push(vrslt);
      }
    }
  }
  if(isEmpty(rslt)) return null;
  else return rslt;
};
function HasAccess(access, perm) {
  if (access === undefined) return false;
  if (perm == '*') return true;
  for (var i = 0; i < perm.length; i++) {
    if (access.indexOf(perm[i]) > -1) return true;
  }
  return false;
}
function isEmpty(val){
  if(!val) return true;
  for(var key in val) return false;
  return true;
}

function XValidator(_field, _caption, _actions, _funcs, _selector, _roles) {
  this.Field = _field;
  this.Caption = _caption;
  this.Actions = _actions;
  this.Funcs = _funcs;
  this.Selector = _selector || '';
  this.Roles = _roles;
}

XValidate.XValidator = XValidator;

XValidate.Vex = function (validator, val) {
  return (validator()('', val) != '');
};

XValidate.isBlank = function (_val) {
  return ((typeof _val == 'undefined')||(_val==='')||(_val===null)||(_val.toString()==''));
};


XValidate.returnIfBlank = function (_var) {
  return 'if((typeof '+_var+' == "undefined")||('+_var+'==="")||('+_var+'===null)||('+_var+'.toString()=="")) return "";';
};

XValidate._v_MaxLength = function (_max) {
  return (new Function('_caption', '_val', '\
    if(' + _max + ' < 0) return "";\
    '+XValidate.returnIfBlank('_val')+'\
    if(_val.toString().length > ' + _max + ') return _caption+" is too long (limit ' + _max + ' characters).";\
    return "";'));
};

XValidate._v_MinLength = function (_min) {
  return (new Function('_caption', '_val', '\
  '+XValidate.returnIfBlank('_val')+'\
    if(_val.toString().length < ' + _min + ') return _caption+" is too short (minimum ' + _min + ' characters).";\
    return "";'));
};

XValidate._v_Required = function (_blank) {
  if (_blank) {
    return (new Function('_caption', '_val', '\
      if(typeof _val === "undefined") return _caption+" is required.";\
      if(_val === null) return _caption + " is required.";\
      return "";'));
  }
  else {
    return (new Function('_caption', '_val', '\
      if((typeof _val == "undefined")||(_val==="")||(_val===null)||(_val.toString()=="")||(_val===false)) return _caption+" is required.";\
      return "";'));
  }
};

XValidate._v_IsNumeric = function (_nonneg) {
  if (typeof (_nonneg) === 'undefined') _nonneg = false;
  return (new Function('_caption', '_val', '\
  '+XValidate.returnIfBlank('_val')+'\
    if((typeof _val === "string") || (_val instanceof String)) _val = _val.replace(/^0*/, "");\
    if(!_val) return "";\
    if(String(parseInt(_val)) != _val) return _caption+" must be a whole number (with no letters or symbols).";\
    ' + (_nonneg ? 'if(parseInt(_val) < 0) return _caption+" must be a positive number (with no letters or symbols).";' : '') + '\
    return "";'));
};

XValidate._v_IsDecimal = function (_maxplaces, _comma) {
  if (typeof (_maxplaces) === 'undefined') _maxplaces = -1;
  var places_qty = '\\.?[0-9]' + ((_maxplaces > 0) ? '{1,' + _maxplaces + '}' : '+');
  if(_maxplaces == 0) places_qty = '';
  return (new Function('_caption', '_val', '\
  '+XValidate.returnIfBlank('_val')+'\
    '+(_comma ? '_val = String(_val).replace(/,/g, "");' : '')+'\
    var dec = String(_val).match(/^-?[0-9]*' + places_qty + '$/);\
    if(dec === null){ \
      if(' + _maxplaces + ' <= 0) return _caption + " must be a valid decimal number (with no letters or symbols).";\
      else return _caption + " must be a valid number (with no letters or symbols) having max ' + _maxplaces + ' digits after the decimal point.";\
    } \
    return "";'));
};

XValidate._v_IsDecimalComma = function (_maxplaces) {
  return XValidate._v_IsDecimal(_maxplaces, true);
};

XValidate._v_IsFloat = function () {
  return (new Function('_caption', '_val', '\
  '+XValidate.returnIfBlank('_val')+'\
    if(isNaN(parseFloat(_val))) return _caption + " must be a valid number (with no letters or symbols).";\
    return "";'));
};

XValidate._v_IsBinary = function (_maxlength) {
  if (typeof (_maxlength) === 'undefined') _maxlength = -1;
  return (new Function('_caption', '_val', '\
  '+XValidate.returnIfBlank('_val')+'\
    _val = _val.toString();\
    if(_val.substr(0,2).toLowerCase() == "0x"){ \
      var hexstr = _val.substr(2); \
      if(!(/^[0-9A-Fa-f]*$/.test(hexstr))) return _caption + " must be a valid hex string."; \
      if((' + _maxlength + ' >= 0) && (hexstr.length > ' + _maxlength * 2 + ')) return _caption+" is too long (limit ' + _maxlength + ' bytes).";\
      return "";\
    } \
    if(!(/^[\x00-\x7F]*$/.test(_val))) return _caption + " must be an ASCII string, or hex string starting with 0x."; \
    if((' + _maxlength + ' >= 0) && (_val.length > ' + _maxlength + ')) return _caption+" is too long (limit ' + _maxlength + ' bytes).";\
    return "";'));
};

XValidate._v_MaxValue = function (_max) {
  return (new Function('_caption', '_val', '\
  '+XValidate.returnIfBlank('_val')+'\
    var fval = parseFloat(_val);\
    if(isNaN(fval)) return "";\
    if(fval > ' + _max + ') return _caption+" must be less than or equal to ' + _max + '.";\
    return "";'));
};

XValidate._v_MinValue = function (_min) {
  return (new Function('_caption', '_val', '\
  '+XValidate.returnIfBlank('_val')+'\
    var fval = parseFloat(_val);\
    if(isNaN(fval)) return "";\
    if(fval < ' + _min + ') return _caption+" must be greater than or equal to ' + _min + '.";\
    return "";'));
};

XValidate._v_RegEx = function (_re, _msg) {
  return (new Function('_caption', '_val', '\
  '+XValidate.returnIfBlank('_val')+'\
    var re = ' + _re + '; \
    if(!re.test(_val)) return _caption+" must ' + _msg + '"; \
    return "";'));
};

XValidate._v_IsEmail = function () {
  return XValidate._v_RegEx(
    '/^(([^<>()[\\]\\\\.,;:\\s@\\"]+(\\.[^<>()[\\]\\\\.,;:\\s@\\"]+)*)|(\\".+\\"))@((\\[[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\])|(([a-zA-Z\\-0-9]+\\.)+[a-zA-Z]{2,}))$/',
    'be an email address');
};

XValidate._v_IsSSN = function () {
  return (new Function('_caption', '_val', '\
  '+XValidate.returnIfBlank('_val')+'\
    var rslt = String(_val).replace(/-/g,"");\
    if(!rslt.match(/^\\d{9}$/)) return _caption+" must be in the format 999-99-9999";\
    return "";'));
};

XValidate._v_IsEIN = function () {
  return (new Function('_caption', '_val', '\
    '+XValidate.returnIfBlank('_val')+'\
    var rslt = String(_val).replace(/-/g,"");\
    if(!rslt.match(/^\\d{9}$/)) return _caption+" must be in the format 99-9999999";\
    return "";'));
};

XValidate._v_IsDate = function (_format, _strict) {
  return function(_caption, _val){
    if(XValidate.isBlank(_val)) return '';
    var rslt;

    if(!_strict){
      rslt = Date.parse(_val);
      if(!isNaN(rslt)) return '';
    }

    _val = _val.toString().trim();
    if(_format && moment(_val, _format, true).isValid()) return '';
    if(_format && _strict) return _caption+' must be a valid date in format '+_format+'.';

    _val = _val.replace(/,/g,' ');
    _val = _val.replace(/ {2}/g,' ');
    rslt = moment(_val, 'YYYY-MM-DDTHH:mm:ss.SSS', true);
    if(!rslt.isValid()) rslt = moment(_val, 'YYYY-MM-DDTHH:mm:ss', true);
    if(!rslt.isValid()) rslt = moment(_val, 'YYYY-MM-DDTHH:mm', true);
    if(!rslt.isValid()) rslt = moment(_val, 'YYYY-MM-DDTHH', true);
    if(!rslt.isValid()) rslt = moment(_val, 'YYYY-MM-DDTHH:mm:ss.SSSZ', true);
    if(!rslt.isValid()) rslt = moment(_val, 'YYYY-MM-DDTHH:mm:ssZ', true);
    if(!rslt.isValid()) rslt = moment(_val, 'YYYY-MM-DDTHH:mmZ', true);
    if(!rslt.isValid()) rslt = moment(_val, 'YYYY-MM-DDTHHZ', true);
    if(!rslt.isValid()) rslt = moment(_val, 'YYYY-MM-DD', true);
    if(!rslt.isValid()) rslt = moment(_val, 'YY-MM-DD', true);
    if(!rslt.isValid()) rslt = moment(_val, 'MM/DD/YYYY', true);
    if(!rslt.isValid()) rslt = moment(_val, 'MM/DD/YY', true);
    if(!rslt.isValid()) rslt = moment(_val, 'M/D/YYYY', true);
    if(!rslt.isValid()) rslt = moment(_val, 'M/D/YY', true);
    if(!rslt.isValid()) rslt = moment(_val, 'MMM D YYYY', true);
    if(!rslt.isValid()) rslt = moment(_val, 'MMM DD YYYY', true);
    if(!rslt.isValid()) rslt = moment(_val, 'MMMM D YYYY', true);
    if(!rslt.isValid()) rslt = moment(_val, 'MMMM DD YYYY', true);

    if(rslt.isValid()) return '';
    return _caption+' must be a valid date.';
  };
};


XValidate._v_IsTime = function (_format) {
  return function(_caption, _val){
    if(XValidate.isBlank(_val)) return '';
    if(_val instanceof Date) return '';
    
    _val = _val.toString().trim();
    if(_format && moment(_val, _format, true).isValid()) return '';
    
    var d = moment(_val, 'hh:mm a');
    if(!d.isValid()) return _caption+' must be a valid time in format HH:MM.';
    return '';
  };
};

XValidate._v_MaxAge = function (_maxage) {
  return (new Function('_caption', '_val', '\
    '+XValidate.returnIfBlank('_val')+'\
    var rslt = Date.parse(_val);\
    if(isNaN(rslt)) return "";\
    var curdt = new Date();\
    var maxday = new Date(curdt.getFullYear()-' + _maxage + ',curdt.getMonth(),curdt.getDate());\
    if (rslt < maxday) return _caption+" cannot be more than ' + _maxage + ' years old.";\
    return "";'));
};

XValidate._v_MinAge = function (_minage) {
  return (new Function('_caption', '_val', '\
    '+XValidate.returnIfBlank('_val')+'\
    var rslt = Date.parse(_val);\
    if(isNaN(rslt)) return "";\
    var curdt = new Date();\
    var minday = new Date(curdt.getFullYear()-' + _minage + ',curdt.getMonth(),curdt.getDate());\
    if (rslt > minday) return _caption+" must be at least ' + _minage + ' years old.";\
    return "";'));
};

XValidate._v_IsPhone = function () {
  return XValidate._v_RegEx(
    '/^\\d{10,20}$/',
    'be a valid phone number');
};

XValidate._v_Luhn = function () {
  return (new Function('_caption', '_val', '\
    '+XValidate.returnIfBlank('_val')+'\
    var luhnChk = function (a) { return function (c) { for (var l = c.length, b = 1, s = 0, v; l;) v = parseInt(c.charAt(--l), 10), s += (b ^= 1)?a[v]:v; return s && 0 === s % 10 } }([0, 2, 4, 6, 8, 1, 3, 5, 7, 9]); \
    if(luhnChk(_val.toString())) return "";\
    return _caption+" must be a valid credit card number.";'));
};

XValidate._v_InArray = function (_arr) {
  if (typeof (_arr) === 'undefined') _arr = [];
  return (new Function('_caption', '_val', '\
    '+XValidate.returnIfBlank('_val')+'\
    var _arr = ' + JSON.stringify(_arr) + ';\
    for(var i=0;i<_arr.length;i++){ if(_arr[i]==_val) return ""; }\
    return _caption+" must be one of the following values: "+_arr.join(",");'));
};

XValidate._v_Equals = function (_cmp_expr, _cmp_caption) {
  if(!_cmp_caption) _cmp_caption = '';
  if(XValidate.isBlank(_cmp_expr)) _cmp_expr = "''";
  return (new Function('_caption', '_val', '_obj', '\
    var _cmp_expr = "'+_cmp_expr.toString().replace(/[\\'"]/g, '\\$&')+'";\
    eval("var _cmp_val = "+_cmp_expr);\
    if(_cmp_val==_val) return "";\
    return _caption+" must equal '+_cmp_caption.toString().replace(/[\\'"]/g, '\\$&')+'";'));
};

XValidate._v_IsJSON = function() {
  return function(_caption, _val, _obj) {
    if(XValidate.isBlank(_val)) return '';
    try {
      JSON.parse(_val);
      return '';
    } catch (err) {
      return _caption + ' is not valid JSON: ' + err.message;
    }
  };
};

XValidate.BaseValidators = {};
for(var key in XValidate) if(key.substr(0,3)=='_v_') XValidate.BaseValidators[key] = 1;

module.exports = XValidate;// JavaScript Document