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

var $ = require('./jquery-1.11.2');
var _ = require('lodash');
var moment = require('moment');

exports = module.exports = {};

exports.phone = function(val){
	if(!_.isString(val)) return val;
  if (val.length < 10) return val;
  if (val.length == 10) return '(' + val.substr(0, 3) + ') ' + val.substr(3, 3) + '-' + val.substr(6);
  return '(' + val.substr(0, 3) + ') ' + val.substr(3, 3) + '-' + val.substr(6,4) + '  ' + val.substr(10);
}

exports.phone_decode = function(val){
	var rslt = val.replace(/[^0-9]+/g,'');
	if(rslt=='') return rslt;
	if(rslt[0]=='1') return rslt.substr(1);
	return rslt;
}

exports.parseDate = function(val){
  if(!val) return moment(null);
  val = val.trim();
  val = val.replace(/,/g,' ');
  val = val.replace(/  /g,' ');
  var rslt = moment(val, "YYYY-MM-DDTHH:mm:ss.SSS", true);
  if(!rslt.isValid()) rslt = moment(val, "YYYY-MM-DDTHH:mm:ss", true);
  if(!rslt.isValid()) rslt = moment(val, "YYYY-MM-DDTHH:mm", true);
  if(!rslt.isValid()) rslt = moment(val, "YYYY-MM-DDTHH", true);
  if(!rslt.isValid()) rslt = moment(val, "YYYY-MM-DDTHH:mm:ss.SSSZ", true);
  if(!rslt.isValid()) rslt = moment(val, "YYYY-MM-DDTHH:mm:ssZ", true);
  if(!rslt.isValid()) rslt = moment(val, "YYYY-MM-DDTHH:mmZ", true);
  if(!rslt.isValid()) rslt = moment(val, "YYYY-MM-DDTHHZ", true);
  if(!rslt.isValid()) rslt = moment(val, "YYYY-MM-DD", true);
  if(!rslt.isValid()) rslt = moment(val, "YY-MM-DD", true);
  if(!rslt.isValid()) rslt = moment(val, "MM/DD/YYYY", true);
  if(!rslt.isValid()) rslt = moment(val, "MM/DD/YY", true);
  if(!rslt.isValid()) rslt = moment(val, "M/D/YYYY", true);
  if(!rslt.isValid()) rslt = moment(val, "M/D/YY", true);
  if(!rslt.isValid()) rslt = moment(val, "MMM D YYYY", true);
  if(!rslt.isValid()) rslt = moment(val, "MMM DD YYYY", true);
  if(!rslt.isValid()) rslt = moment(val, "MMMM D YYYY", true);
  if(!rslt.isValid()) rslt = moment(val, "MMMM DD YYYY", true);
  return rslt;
}

exports.date = function (format, val){
  if (val == null) return val;
  var rslt = this.parseDate(val);
  if(!rslt.isValid()) rslt = moment(new Date(val));
	if(rslt.isValid()) return rslt.format(format);
	return '';
}

exports.date_decode = function (format, val){
  if (val === '') return null;
  if (val === null) return null;
  var m = moment(val, format, true);
  if (!m.isValid()) m = moment(new Date(val));
  return m.format("YYYY-MM-DDTHH:mm:ss.SSS");
  
  var dtstmp = Date.parse(val);
	if(isNaN(dtstmp)){ return null; }
	return moment(new Date(dtstmp)).format("YYYY-MM-DDTHH:mm:ss.SSS");
	
	var rslt = moment(new Date(val));
	if(rslt.isValid()){
//		return rslt.toDate();
		var dstr = rslt.toISOString();
		dstr = dstr.substr(0,dstr.length-1);
		return dstr;
	}
	return null;
}

exports.tstmp = function(val){ return this.date('MM/DD/YY HH:mm',val); }
exports.tstmp_decode = function(val){ return this.date_decode('MM/DD/YY HH:mm',val); }

exports.MMDDYY = function(val){ return this.date('MM/DD/YY',val); }
exports.MMDDYY_decode = function (val){ return this.date_decode('MM/DD/YY', val); }

exports.decimal = function (numdigits, val) {
  if (isNaN(val)) return val;
  if (val === '') return val;
  if (val === null) return val;
  return parseFloat(val).toFixed(numdigits);
}

exports.decimal_decode = function (numdigits, val) {
  if (isNaN(val)) return val;
  if (val === '') return val;
  if (val === null) return val;
  return parseFloat(val).toFixed(numdigits); //Do not remove digits
}

function decimalPlaces(number) {
  if(!number) return 0;
  var numarr = String(number).split(".");
  if(numarr.length < 2) return 0;
  return numarr[1].length;
}

exports.decimalext = function (numdigits, val) {
  if (isNaN(val)) return val;
  if (val === '') return val;
  if (val === null) return val;
  var fval = parseFloat(val);
  if (decimalPlaces(fval) > numdigits) return fval.toString();
  return fval.toFixed(numdigits);
}

exports.decimalext_decode = function (numdigits, val) {
  if (isNaN(val)) return val;
  if (val === '') return val;
  if (val === null) return val;
  return parseFloat(val);
}

exports.decimalcomma = function (numdigits, val){
  return exports.comma(exports.decimal(numdigits, val));
}

exports.decimalcomma_decode = function (numdigits, val){
  return exports.decimal_decode(numdigits, exports.comma_decode(val));
}

exports.comma = function(val){
	if(val==null) return '';
  var n= val.toString().split(".");
  n[0] = n[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return n.join(".");
}

exports.comma_decode = function(val){
	if (val === '') return val;
  if (val === null) return val;
  if (typeof val === 'undefined') return val;
  var uval = $.trim(String(val).replace(/,/g,''));
  if (isNaN(uval)) return val;
	return parseFloat(uval);
}

exports.ssn = function (val) {
  if (!_.isString(val)) return val;
  if (val.length != 9) return val;
  return val.substr(0, 3) + '-' + val.substr(3, 2) + '-' + val.substr(5);
}

exports.ssn_decode = function (val) {
  var rslt = val.replace(/[^0-9]+/g, '');
  return rslt;
}

exports.ein = function (val) {
  if (!_.isString(val)) return val;
  if (val.length != 9) return val;
  return val.substr(0, 2) + '-' + val.substr(2);
}

exports.ein_decode = function (val) {
  var rslt = val.replace(/[^0-9]+/g, '');
  return rslt;
}

exports.time = function (format, val) {
  if (val == null) return val;
  if (val == "") return val;
  if (val instanceof Date) return val;
  
  var d = this.parseDate(val); //Strict parsing
  if (!d.isValid()) d = moment(new Date(val));
  if (!d.isValid()) d = moment(val.trim(), "hh:mm", true); //Strict parsing
  if (!d.isValid()) d = moment(val.trim(), "hh:mm a");
  if (d.isValid()) return d.format(format);
  return '';
}

exports.time_decode = function (format, val) {
  if (val === '') return null;
  if (val === null) return null;
  if (typeof val === undefined) return null;
  
  if (val.trim() == parseInt(val.trim()).toString()) {
    var vint = parseInt(val.trim());
    if (vint <= 0) val = "0";
    val = vint.toString() + ":00"
  }
  
  var rslt = null;
  if (val instanceof Date) rslt = moment(val);
  else rslt = moment(new Date(val));
  if (!rslt.isValid()) rslt = moment(val.trim(), "hh:mm", true); //Strict parsing
  if (!rslt.isValid()) rslt = moment(val.trim(), "hh:mm a", true); //Strict parsing
  if (!rslt.isValid()) rslt = moment(val.trim(), "HH:mm", true); //Strict parsing
  if (!rslt.isValid()) rslt = moment(val.trim(), "hh:mm:ss", true); //Strict parsing
  if (!rslt.isValid()) rslt = moment(val.trim(), "hh:mm:ss a", true); //Strict parsing
  if (!rslt.isValid()) rslt = moment(val.trim(), "HH:mm:ss", true); //Strict parsing
  if (!rslt.isValid()) rslt = moment(val.trim(), "hh:mm:ss.SSSSSSSS a");
  
  return rslt.format("1970-01-01THH:mm:ss.SSS");
  //return m.format("HH:mm:ss.SSS");
}

exports.bool_decode = function (val) {
  if(typeof val == 'undefined') return false;
  if(val===null) return false;
  if(val==='') return false;
  if(val===true) return true;
  if(val===false) return false;
  var valstr = val.toString().toUpperCase();
  if((valstr==='TRUE')||(valstr==='T')||(valstr==='Y')||(valstr==='YES')||(valstr==='ON')||(valstr==='1')) return true;
  if((valstr==='FALSE')||(valstr==='F')||(valstr==='N')||(valstr==='NO')||(valstr==='OFF')||(valstr==='0')) return false;
  return (val?true:false);
}

exports.Apply = function(format,val){
	if(typeof val == 'undefined') return '###MISSING###';
	if(typeof format != 'undefined'){
		var format = format;
		if(_.isString(format)) format = [format];
		var fargs = [];
		for(var i=1;i < format.length;i++) fargs.push(format[i]);
		if(!(format[0] in this)){ return '###Invalid Format ' + format[0] + '###'; }
		fargs.push(val);
		val = this[format[0]].apply(this,fargs);
	}
  if(val == null) val = '';
	return val;
}
