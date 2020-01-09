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

exports = module.exports = function(){

  XFormat = {};

  //Decode must be idempotent

  XFormat.phone = function(val){
    if ((typeof val == 'undefined') || (val === null)) return val;
    if (val.toString().length < 10) return val;
    val = val.toString();
    val = this.phone_decode(val);
    if (val.length == 10) return '(' + val.substr(0, 3) + ') ' + val.substr(3, 3) + '-' + val.substr(6);
    return '(' + val.substr(0, 3) + ') ' + val.substr(3, 3) + '-' + val.substr(6,4) + '  ' + val.trim().substr(10);
  }

  XFormat.phone_decode = function(val){
    if(val===null) return val;
    if(typeof val == 'undefined') return val;
    val = val.toString();
    var rslt = '';
    for(var i=0;i<val.length;i++){
      if(rslt.length >= 10) break;
      if(val[i].match(/[0-9]/)){
        if(!rslt && val[i]=='1') continue;
        rslt += val[i];
      }
    }
    if(i < val.length) rslt += val.substr(i).trim();
    if(rslt=='') return rslt;
    return rslt;
  }

  XFormat.parseDate = function(val){
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

  XFormat.date = function (format, val){
    if (val == null) return val;
    var rslt = this.parseDate(val);
    if(!rslt.isValid()) rslt = moment(new Date(val));
    if(rslt.isValid()) return rslt.format(format);
    return '';
  }

  XFormat.date_decode = function (format, val){
    if (val === '') return null;
    if (val === null) return null;
    var m = moment(val, format, true);
    if (!m.isValid()) m = this.parseDate(val);
    if (!m.isValid()) m = moment(new Date(val));
    return m.format("YYYY-MM-DDTHH:mm:ss.SSS");
  }

  XFormat.tstmp = function(val){ return this.date('MM/DD/YY HH:mm',val); }
  XFormat.tstmp_decode = function(val){ return this.date_decode('MM/DD/YY HH:mm',val); }

  XFormat.MMDDYY = function(val){ return this.date('MM/DD/YY',val); }
  XFormat.MMDDYY_decode = function (val){ return this.date_decode('MM/DD/YY', val); }

  XFormat.decimal = function (numdigits, val) {
    if (isNaN(val)) return val;
    if (val === '') return val;
    if (val === null) return val;
    return parseFloat(val).toFixed(numdigits);
  }

  XFormat.decimal_decode = function (numdigits, val) {
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

  XFormat.decimalext = function (numdigits, val) {
    if (isNaN(val)) return val;
    if (val === '') return val;
    if (val === null) return val;
    if (typeof val == 'undefined') return val;
    var fval = parseFloat(val);
    if (decimalPlaces(fval) > numdigits) return fval.toString();
    return fval.toFixed(numdigits);
  }

  XFormat.decimalext_decode = function (numdigits, val) {
    if (isNaN(val)) return val;
    if (val === '') return val;
    if (val === null) return val;
    if (typeof val == 'undefined') return val;
    return parseFloat(val);
  }

  XFormat.decimalcomma = function (numdigits, val){
    return XFormat.comma(XFormat.decimal(numdigits, val));
  }

  XFormat.decimalcomma_decode = function (numdigits, val){
    return XFormat.decimal_decode(numdigits, XFormat.comma_decode(val));
  }

  XFormat.comma = function(val){
    if(typeof val == 'undefined') return '';
    if(val===null) return '';
    if(isNaN(parseFloat(val))) return val;
    var n= val.toString().split(".");
    n[0] = n[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return n.join(".");
  }

  function trimString(val){
    return (val||'').replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,'');
  }

  XFormat.comma_decode = function(val){
    if (val === '') return val;
    if (val === null) return val;
    if (typeof val === 'undefined') return val;
    var uval = trimString(String(val).replace(/,/g,''));
    if (isNaN(uval)) return val;
    return parseFloat(uval);
  }

  XFormat.ssn = function (val) {
    if ((typeof val == 'undefined') || (val === null)) return val;
    val = this.ssn_decode(val.toString());
    if (val.toString().length != 9) return val;
    val = val.toString();
    return val.substr(0, 3) + '-' + val.substr(3, 2) + '-' + val.substr(5);
  }

  XFormat.ssn_decode = function (val) {
    if (val === null) return val;
    if (typeof val === 'undefined') return val;
    var rslt = (val||'').replace(/[^0-9]+/g, '');
    return rslt;
  }

  XFormat.ein = function (val) {
    if ((typeof val == 'undefined') || (val === null)) return val;
    val = this.ein_decode(val.toString());
    if (val.toString().length != 9) return val;
    val = val.toString();
    return val.substr(0, 2) + '-' + val.substr(2);
  }

  XFormat.ein_decode = function (val) {
    if (val === null) return val;
    if (typeof val === 'undefined') return val;
    var rslt = (val||'').replace(/[^0-9]+/g, '');
    return rslt;
  }

  XFormat.time = function (format, val) {
    if (typeof val == 'undefined') return val;
    if (val === null) return val;
    if (val === "") return val;
    if (val instanceof Date) return val;
    
    var d = this.parseDate(val); //Strict parsing
    if (!d.isValid()) d = moment(new Date(val));
    if (!d.isValid()) d = moment(val.trim(), "hh:mm", true); //Strict parsing
    if (!d.isValid()) d = moment(val.trim(), "hh:mm a");
    if (d.isValid()) return d.format(format);
    return '';
  }

  XFormat.time_decode = function (format, val) {
    if (val === '') return null;
    if (val === null) return null;
    if (typeof val == 'undefined') return null;
    
    if (val.trim() == parseInt(val.trim()).toString()) {
      var vint = parseInt(val.trim());
      if (vint <= 0) val = "0";
      val = vint.toString() + ":00"
    }
    
    var rslt = null;
    if (val instanceof Date) rslt = moment(val);
    else rslt = moment(this.parseDate(val));
    if (!rslt.isValid()) rslt = moment(val.trim(), "hh:mm", true); //Strict parsing
    if (!rslt.isValid()) rslt = moment(val.trim(), "hh:mm a", true); //Strict parsing
    if (!rslt.isValid()) rslt = moment(val.trim(), "HH:mm", true); //Strict parsing
    if (!rslt.isValid()) rslt = moment(val.trim(), "hh:mm:ss", true); //Strict parsing
    if (!rslt.isValid()) rslt = moment(val.trim(), "hh:mm:ss a", true); //Strict parsing
    if (!rslt.isValid()) rslt = moment(val.trim(), "HH:mm:ss", true); //Strict parsing
    if (!rslt.isValid()) rslt = moment(val.trim(), "hh:mm:ss.SSSSSSSS a");
    if (!rslt.isValid()) rslt = moment(new Date(val));
    if (!rslt.isValid()) return null;
    
    return rslt.format("1970-01-01THH:mm:ss.SSS");
    //return m.format("HH:mm:ss.SSS");
  }

  XFormat.bool = function(val){
    val = this.bool_decode(val);
    if (!_.isBoolean(val)) return val;
    if(val) return 'true';
    else return 'false';
  }

  XFormat.bool_decode = function (val) {
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

  XFormat.json = function(val) {
    if (val === null) return val;
    if (typeof val == 'undefined') return val;
    if (typeof(val) == "string") {
      if (val === '') return val;
      try{
        val = JSON.parse(val);
      } catch (e) {
        return val;
      }
    }
    return JSON.stringify(val,null,2);
  }

  XFormat.json_decode = function(val) {
    if (val === null) return val;
    if (typeof val === 'undefined') return val;
    if (typeof(val) == "string") {
      if (val === '') return val;
      try{
        val = JSON.parse(val);
      } catch (e) {
        return val;
      }
    }
    return JSON.stringify(val);
  }

  XFormat.js = function(funcstr, val) {
    var func = eval('(function(val){'+funcstr+'})');
    return func(val);
  }

  XFormat.parseFormat = function(format){
    if(_.isArray(format)) return format;
    format = (format||'').toString();
    if(format.indexOf(':') < 0) return [format];
    var rslt = [];
    var formatName = format.substr(0, format.indexOf(':'));
    rslt.push(formatName);
    var args = format.substr(format.indexOf(':')+1);
    if(formatName=='js'){
      args = [args];
    }
    else {
      try{
        args = eval('['+args+']');
      }
      catch(ex){
        throw new Error('Invalid syntax in format: '+format);
      }
    }
    rslt = rslt.concat(args);
    return rslt;
  }

  XFormat.bytes = function(val){
    if(typeof val=='undefined') return '';
    if(val===null) return '';
    if(isNaN(parseFloat(val))) return val;
    var sizes = ['B','KB','MB','GB'];
    for(var i=0;i<sizes.length;i++){
      if(val < 1000) return val.toString()+' '+sizes[i];
      val = Math.round(val / 1024);
    }
    return XFormat.comma(val) + ' TB';
  }

  XFormat.Apply = function(format,val){
    if(typeof val == 'undefined') return '###MISSING###';
    if(format){
      format = XFormat.parseFormat(format);
      if(!(format[0] in this)){ return '###Invalid Format ' + format[0] + '###'; }
      var fargs = [];
      for(var i=1;i < format.length;i++) fargs.push(format[i]);
      fargs.push(val);
      val = this[format[0]].apply(this,fargs);
    }
    if(typeof val == 'undefined') val = '';
    else if(val === null) val = '';
    return val;
  }

  XFormat.Decode = function(format, val){
    if(typeof val == 'undefined') return val;
    if(!format) return val;
    format = XFormat.parseFormat(format);
    var fargs = [];
    for (var i = 1; i < format.length; i++) fargs.push(format[i]);
    fargs.push(val);
    if(!((format[0] + '_decode') in this)) throw new Error('Missing format function: '+ format[0] + '_decode');
    return this[format[0] + '_decode'].apply(this, fargs);
  }

  XFormat.Add = function(formatters){
    if(!formatters) return;
    for(var fname in formatters){
      XFormat[fname] = eval('('+formatters[fname]+')');
    }
  }

  return XFormat;
}