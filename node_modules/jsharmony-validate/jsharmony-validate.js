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

exports = module.exports = {};

function XValidate() {
  this._this = this;
  this.Validators = new Array();
  this.Errors = new Array();
  this.FocusOnError = true;
  this.ErrorClass = 'xinputerror';
}
XValidate.prototype.AddValidator = function (_field, _caption, _access, _funcs, _roles) {
  this.Validators.push(new XValidator(_field, _caption, _access, _funcs, undefined, _roles));
};
XValidate.prototype.AddControlValidator = function (_control, _field, _caption, _access, _funcs) {
  this.Validators.push(new XValidator(_field, _caption, _access, _funcs, _control));
};
XValidate.prototype.ResetValidation = function (field, parentobj) {
  if (!parentobj) parentobj = $(document);
  this.Errors.length = 0;
  field = field || '';
  for (var i = 0; i < this.Validators.length; i++) {
    var v = this.Validators[i];
    if (field && (field != v.Field)) continue;
    
    if ((this.ErrorClass != '') && (v.Control != '')) {
      parentobj.find(v.Control).removeClass(this.ErrorClass);
    }
  }
}
XValidate.prototype.ValidateControls = function (perms, _obj, field, parentobj) {
  field = field || '';
  var firstErrorControl = '';
  if (!parentobj) parentobj = $(document);
  this.ResetValidation(field, parentobj);
  var verrors = this.Validate(perms, _obj, field);
  if (!_.isEmpty(verrors)) {
    var errstr = 'The following errors have occurred:\n\n';
    for (var ctrl in verrors) {
      errstr += verrors[ctrl].join('\n') + '\n';
      if (ctrl != '') {
        if (this.FocusOnError && (firstErrorControl == '')) {
          firstErrorControl = ctrl;
        }
        if (this.ErrorClass != '') {
          parentobj.find(ctrl).addClass(this.ErrorClass);
        }
      }
    }
    errstr = errstr.substr(0, errstr.length - 1);
    
    XExt.Alert(errstr, function () {
      if (firstErrorControl != '') {
        window.ent_ignorefocusHandler = true;
        window.setTimeout(function () {
          $(document.activeElement).blur();
          parentobj.find(firstErrorControl).focus();
          parentobj.find(firstErrorControl).select();
          window.setTimeout(function () { window.ent_ignorefocusHandler = false; }, 1);
        }, 1);
      }
    });
    return false;
  }
  return true;
}
XValidate.prototype.Validate = function (perms, _obj, field, ignore, roles) {
  field = field || '';
  if (typeof ignore == 'undefined') ignore = [];
  var rslt = {};
  
  for (var i = 0; i < this.Validators.length; i++) {
    var v = this.Validators[i];
    if (field && (field != v.Field)) continue;
    var ignorefield = false;
    for (var j = 0; j < ignore.length; j++) { if (ignore[j] == v.Field) { ignorefield = true; break; } }
    if (ignorefield) continue;
    /*
    if (accessfields && v.Field) {
      //Check if field is in fields
      var has_access = false;
      for (var k = 0; k < accessfields.length; k++) {
        var accessfield = accessfields[k];
        if (('_obj.' + accessfield) == v.Field) { has_access = true; }
      }
      if (!has_access) continue;
    }*/
		if (!HasAccess(v.Access, perms)) continue;
    eval('var val = ' + v.Field);
    if ((typeof val === 'undefined') && v.Roles && roles && !('SYSADMIN' in roles) && HasAccess("BIUD", perms)) {
      var has_role_access = false;
      for (role in v.Roles) {
        if (role in roles) {
          var rAccess = v.Roles[role];
          if ((rAccess == '*') || HasAccess(rAccess, perms)) has_role_access = true;
        }
      }
      if (!has_role_access) { continue; }
    }
    for (var j = 0; j < v.Funcs.length; j++) {
      var vrslt = v.Funcs[j](v.Caption, val);
      if (vrslt) {
        this.Errors.push(vrslt);
        if (!(v.Control in rslt)) rslt[v.Control] = [];
        rslt[v.Control].push(vrslt);
      }
    }
  }
  return rslt;
}
function HasAccess(access, perm) {
  if (access === undefined) return false;
  if (perm == '*') return true;
  for (var i = 0; i < perm.length; i++) {
    if (access.indexOf(perm[i]) > -1) return true;
  }
  return false;
}

function XValidator(_field, _caption, _access, _funcs, _control, _roles) {
  this.Field = _field;
  this.Caption = _caption;
  this.Access = _access;
  this.Funcs = _funcs;
  this.Control = _control || '';
  this.Roles = _roles;
}

XValidate.Vex = function (validator, val) {
  return (validator()('', val) != '');
};

XValidate._v_MaxLength = function (_max) {
  return (new Function('_caption', '_val', '\
    if(!_val) return "";\
    if(_val.length > ' + _max + ') return _caption+" is too long (limit ' + _max + ' characters).";\
    return "";'));
}

XValidate._v_MinLength = function (_min) {
  return (new Function('_caption', '_val', '\
    if(!_val) return "";\    if(_val=="") return "";\
    if(_val.length < ' + _min + ') return _caption+" is too short (minimum ' + _min + ' characters).";\
    return "";'));
}

XValidate._v_Required = function (_null) {
  if (_null) {
    return (new Function('_caption', '_val', '\
      if(typeof _val === "undefined") return _caption+" is required.";\
      if(_val === null) return _caption + " is required.";\
      return "";'));
  }
  else {
    return (new Function('_caption', '_val', '\
      if(!_val) return _caption+" is required.";\
      return "";'));
  }
}

XValidate._v_IsNumeric = function (_nonneg) {
  if (typeof (_nonneg) === 'undefined') _nonneg = false;
  return (new Function('_caption', '_val', '\
	  if(!_val) return "";\    if((typeof _val === "string") || (_val instanceof String)) _val = _val.replace(/^0*/, "");\    if(!_val) return "";\
		if(String(parseInt(_val)) != _val) return _caption+" must be a whole number.";\
		' + (_nonneg ? 'if(parseInt(_val) < 0) return _caption+" must be a positive number.";' : '') + '\
    return "";'));
}

XValidate._v_IsDecimal = function (_maxplaces) {
  if (typeof (_maxplaces) === 'undefined') _maxplaces = 0;
  var places_qty = ((_maxplaces > 0) ? '{1,' + _maxplaces + '}' : '+');
  return (new Function('_caption', '_val', '\
	  if(!_val) return "";\    if(_val == null) return "";\    if(_val == "") return "";\
		var dec = String(_val).match(/^-?[0-9]*.?[0-9]' + places_qty + '$/);\
		if(dec === null){ \
      if(' + _maxplaces + ' == 0) return _caption + " must be a valid decimal number.";\
      else return _caption + " must be a number with max ' + _maxplaces + ' places after the decimal point.";\
    } \
    return "";'));
}

XValidate._v_MaxValue = function (_max) {
  return (new Function('_caption', '_val', '\
    if(!_val) return "";\
		var fval = parseFloat(_val);\
		if(isNaN(fval)) return "";\
    if(fval > ' + _max + ') return _caption+" must be less than or equal to ' + _max + '.";\
    return "";'));
}

XValidate._v_MinValue = function (_min) {
  return (new Function('_caption', '_val', '\
    if(!_val) return "";\
		var fval = parseFloat(_val);\
		if(isNaN(fval)) return "";\
    if(fval < ' + _min + ') return _caption+" must be greater than or equal to ' + _min + '.";\
    return "";'));
}

XValidate._v_RegEx = function (_re, _msg) {
  return (new Function('_caption', '_val', '\
	  if(!_val) return "";\
		var re = ' + _re + '; \
		if(!re.test(_val)) return _caption+" must ' + _msg + '"; \
    return "";'));
}

XValidate._v_IsEmail = function () {
  return XValidate._v_RegEx(
    '/^(([^<>()[\\]\\\\.,;:\\s@\\"]+(\\.[^<>()[\\]\\\\.,;:\\s@\\"]+)*)|(\\".+\\"))@((\\[[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\])|(([a-zA-Z\\-0-9]+\\.)+[a-zA-Z]{2,}))$/',
		'be an email address');
}

XValidate._v_IsSSN = function () {
  return (new Function('_caption', '_val', '\
	  if(!_val) return "";\    var rslt = _val;\    //var rslt = String(_val).replace(/-/g,"");\
    if(!rslt.match(/^\\d{9}$/)) return _caption+" must be in the format 999-99-9999";\
    return "";'));
}

XValidate._v_IsDate = function () {
  return (new Function('_caption', '_val', '\
	  if(!_val) return "";\
		var rslt = Date.parse(_val);\
		if(isNaN(rslt)==false) return "";\
		return _caption+" must be a valid date.";'));

/*	return XValidate._v_RegEx(
//	  '/^\d\d\d\d\-\d\d\-\d\d$/',
	  '/^\\d{4}-\\d{2}-\\d{2}$/',
		'be a valid date in format YYYY-MM-DD.');*/
}

XValidate._v_IsValidDOB = function () {
  return (new Function('_caption', '_val', '\
    if (!_val) return "";\
    var rslt = Date.parse(_val);\
    if (isNaN(rslt) == false) {\
      if (rslt < new Date("1900-01-01")) return _caption+" must be a valid date of birth.";\
    }\
    return "";'));
}

XValidate._v_MinDOB = function (_minyear) {
  return (new Function('_caption', '_val', '\
    if (!_val) return "";\
    var rslt = Date.parse(_val);\
    if (isNaN(rslt) == false) {\      rslt = new Date(rslt);\      var minbday = new Date(rslt.getFullYear()+' + _minyear + ',rslt.getMonth(),rslt.getDate());\
      if (minbday > (new Date())) return _caption+" must be at least ' + _minyear + ' years old.";\
    }\
    return "";'));
}

XValidate._v_IsPhone = function () {
  return XValidate._v_RegEx(
    '/^\\d{10,20}$/',
		'be a valid phone number');
}

XValidate._v_IsTime = function () {
  return (new Function('_caption', '_val', '\
	  if(!_val) return "";\    if(_val instanceof Date) return "";\    var d = moment(_val, "hh:mm a");\
    if(!d.isValid()) return _caption+" must be a valid time in format HH:MM.";\
    return "";'));
}

XValidate._v_Luhn = function () {
  return (new Function('_caption', '_val', '\
	  if(!_val) return "";\    var luhnChk = function (a) { return function (c) { for (var l = c.length, b = 1, s = 0, v; l;) v = parseInt(c.charAt(--l), 10), s += (b ^= 1)?a[v]:v; return s && 0 === s % 10 } }([0, 2, 4, 6, 8, 1, 3, 5, 7, 9]); \    if(luhnChk(_val.toString())) return "";\
		return _caption+" must be a valid credit card number.";'));
}

XValidate._v_InArray = function (_arr) {
  if (typeof (_arr) === 'undefined') _arr = [];
  return (new Function('_caption', '_val', '\
	  if(!_val) return "";\    var _arr = ' + JSON.stringify(_arr) + ';\    for(var i=0;i<_arr.length;i++){ if(_arr[i]==_val) return ""; }\
		return _caption+" must be one of the following values: "+_arr.join(",");'));
}

module.exports = XValidate;// JavaScript Document