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

exports = module.exports = function(jsh){

  var XAPIGrid = function(){ }

  //----------------
  //Shared Functions
  //----------------
  XAPIGrid.base = function(){ }

  XAPIGrid.base.HandleGenericError = function(errdata){
    //Error
    var jerrdata = {};
    try { jerrdata = JSON.parse(errdata); }
    catch(ex){ }
    if ((jerrdata instanceof Object) && ('_error' in jerrdata)) {
      if (jsh.DefaultErrorHandler(jerrdata._error.Number, jerrdata._error.Message)) { }
      else if ((jerrdata._error.Number == -9) || (jerrdata._error.Number == -5)) { jsh.XExt.Alert(jerrdata._error.Message); }
      else { jsh.XExt.Alert('Error #' + jerrdata._error.Number + ': ' + jerrdata._error.Message); }
      if ('onFail' in ExecParams) ExecParams.onFail(jerrdata._error);
      return;
    }
    if(('status' in errdata) && (errdata.status == '404')){ jsh.XExt.Alert('(404) The requested page was not found.'); }
    else if(jsh._debug){
      var errmsg = errdata.toString();
      if(errdata.responseText) errmsg = errdata.responseText;
      jsh.XExt.Alert('An error has occurred: ' + errmsg);
    }
    else jsh.XExt.Alert('An error has occurred.  If the problem continues, please contact the system administrator for assistance.');
  }
  
  //--------------
  //Static Adapter
  //--------------
  XAPIGrid.Static = function(modelid, dataset){
    this.modelid = jsh.XExt.resolveModelID(modelid);
    this.dataset = dataset||[];
  }

  XAPIGrid.Static.prototype = new XAPIGrid.base();

  XAPIGrid.rowFilter = function(row, d){
    if(!row) return false;
    if(!d) return true;
    for(var key in d){
      if(jsh.XExt.isNullUndefined(row[key]) && jsh.XExt.isNullUndefined(d[key])) continue;
      if(jsh.XExt.isNullUndefined(row[key]) || jsh.XExt.isNullUndefined(d[key])) return false;
      if(row[key].toString().toUpperCase() != d[key].toString().toUpperCase()) return false;
    }
    return true;
  }

  XAPIGrid.rowSearchMatch = function(model, row, searchjson){
    if(!row) return false;
    if(!searchjson || !searchjson.length) return true;

    var exprslt = [];

    //Compare
    for(var i=0;i<searchjson.length;i++){
      var exp = searchjson[i];
      if(!exp.Column){ exprslt.push(null); continue; }

      var vals = null;
      if(exp.Column=='ALL'){
        vals = [];
        var keys = [];
        if(model) keys = _.map(model.fields, function(field){ return field.name })||[];
        else keys = _.keys(jsh.XExt.XModel.GetOwnFields(row));

        _.each(keys, function(key){
          var val = row[key];
          if(model) val = jsh.XExt.getTypedValue(jsh.XExt.getFieldByName(model, key), val);
          vals.push(val);
        });
      }
      else{
        var val = row[exp.Column];
        if(model) val = jsh.XExt.getTypedValue(jsh.XExt.getFieldByName(model, exp.Column), val);
        vals = [val];
      }

      var cmprslt = false;


      if(!_.includes(['null','notnull','contains','notcontains','=','<>','beginswith','endswith','>','<','>=','<='], exp.Comparison)){ exprslt.push(null); continue; }

      for(var j=0;j<vals.length;j++){
        var val = vals[j];
        var cmpval = exp.Value;
        if(exp.Comparison=='null'){
          if(jsh.XExt.isNullUndefinedEmpty(val)) cmprslt = true;
        }
        else if(exp.Comparison=='notnull'){
          if(!jsh.XExt.isNullUndefinedEmpty(val)) cmprslt = true;
        }
        else if(jsh.XExt.isNullUndefinedEmpty(cmpval)) cmprslt = true; //Ignore search query if search value is empty
        else if(jsh.XExt.isNullUndefined(val)) cmprslt = false; //Return false for comparison queries if row value is null
        else {
          if(jsh.XExt.isNullUndefined(cmpval)) cmpval = '';
          if(jsh.XExt.isNullUndefined(val)) val = '';

          var cmpvalstr = cmpval.toString().toUpperCase();
          var valstr = val.toString().toUpperCase();

          if(exp.Comparison=='contains'){
            if(valstr.indexOf(cmpvalstr)>=0) cmprslt = true;
          }
          else if(exp.Comparison=='notcontains'){
            if(valstr.indexOf(cmpvalstr)<0) cmprslt = true;
          }
          else if(exp.Comparison=='beginswith'){
            if(jsh.XExt.beginsWith(valstr, cmpvalstr)) cmprslt = true;
          }
          else if(exp.Comparison=='endswith'){
            if(jsh.XExt.endsWith(valstr, cmpvalstr)) cmprslt = true;
          }
          else {
            //Compare types
            if(_.isString(val)){
              cmpval = cmpvalstr;
              val = valstr;
            }
            else if(_.isNumber(val)) cmpval = Number(cmpval);
            else if(_.isBoolean(val)) cmpval = jsh.XFormat.bool_decode(cmpval);
            else if(_.isDate(val)){
              if(!cmpval) continue;
              cmpval = new Date(jsh.XFormat.date_decode(null, cmpval));
              val = val.getTime();
              cmpval = cmpval.getTime();
            }
            
            if(exp.Comparison=='='){
              if(val==cmpval) cmprslt = true;
            }
            else if(exp.Comparison=='<>'){
              if(val != cmpval) cmprslt = true;
            }
            else if(exp.Comparison=='>'){
              if(val > cmpval) cmprslt = true;
            }
            else if(exp.Comparison=='<'){
              if(val < cmpval) cmprslt = true;
            }
            else if(exp.Comparison=='>='){
              if(val >= cmpval) cmprslt = true;
            }
            else if(exp.Comparison=='<='){
              if(val <= cmpval) cmprslt = true;
            }
          }
        }
      }

      exprslt.push(cmprslt);
    }

    //Apply AND
    for(var i=searchjson.length-1;i>0;i--){
      var exp = searchjson[i];
      var prevexp = searchjson[i-1];
      if(exp.Join=='and'){
        if((exprslt[i-1]===null) && (exprslt[i]!==null)){ exprslt[i-1] = exprslt[i]; }
        else if((exprslt[i-1]===null) && (exprslt[i]===null)){ }
        else exprslt[i-1] = exprslt[i-1] && exprslt[i];
        exprslt.splice(i,1);
      }
    }

    //Apply OR
    for(var i=0;i<exprslt.length;i++){
      if(exprslt[i]===true) return true;
    }
    return false;
  }

  XAPIGrid.rowSort = function(model, _sort){
    //-1 if #1 is first
    //1 if #2 is first
    var sort = [];
    if(_sort && _sort.length) for(var i=0;i<_sort.length;i++){
      var sortexp = _sort[i];
      if(!sortexp || (sortexp.length < 2)) continue;
      var sortdir = sortexp[0];
      var sortcol = sortexp.substr(1);
      sort.push({
        dir: sortdir,
        col: sortcol,
        field: jsh.XExt.getFieldByName(model, sortcol),
      });
    }
    return function(row1,row2){
      if(!row1 && !row2) return 0;
      if(!row1) return -1;
      if(!row2) return 1;

      for(var i=0;i<sort.length;i++){
        var sortexp = sort[i];
        var col1 = row1[sortexp.col];
        var col2 = row2[sortexp.col];
        
        if(sortexp.field){
          col1 = jsh.XExt.getTypedValue(sortexp.field, col1);
          col2 = jsh.XExt.getTypedValue(sortexp.field, col2);
        }

        if(_.isString(col1)) col1 = col1.toUpperCase();
        if(_.isString(col2)) col2 = col2.toUpperCase();

        if(sortexp.dir=='^'){
          if(col1 < col2) return -1;
          if(col2 < col1) return 1;
        }
        else {
          if(col1 < col2) return 1;
          if(col2 < col1) return -1;
        }
      }

      return 0;
    }
  }

  XAPIGrid.Static.prototype.Select = function(params, callback){
    params = _.extend({
      rowstart: 0,              //Starting row for paging
      rowcount: 0,              //Number of rows for paging
      sort: JSON.stringify([]), //Sort order (string):   ["vcust_name","^cust_id"]
      searchjson: undefined,    //Search query (string): [{"Column":"cust_id","Value":"2","Comparison":">"},{"Column":"cust_name","Value":"brother","Join":"and","Comparison":"contains"}]
      d: undefined,             //Filters (string): { key: value }
      meta: undefined,          //1 to return metadata
      getcount: undefined,      //1 to return count
    }, params);
    if(!callback) callback = function(err, rslt){ };

    function genError(err){ return JSON.stringify({ _error: { Number: -99999, Message: err.toString() } }); }

    var model = jsh.XModels[this.modelid];

    if(!params.rowcount){
      if(model && ('rowlimit' in model)) params.rowcount = model.rowlimit;
    }

    if(params.searchjson){
      try{
        params.searchjson = JSON.parse(params.searchjson);
      }
      catch(ex){
        return callback(genError(ex), null);
      }
    }

    if(params.sort){
      try{
        params.sort = JSON.parse(params.sort);
      }
      catch(ex){
        return callback(genError(ex), null);
      }
    }

    if(params.d){
      try{
        params.d = JSON.parse(params.d);
      }
      catch(ex){
        return callback(genError(ex), null);
      }
    }

    params.d = params.d || {};

    var resultset = [].concat(this.dataset);

    //Filter data by d
    resultset = _.filter(resultset, function(row){ return XAPIGrid.rowFilter(row, params.d); });

    //Filter data by searchjson
    resultset = _.filter(resultset, function(row){ return XAPIGrid.rowSearchMatch(model, row, params.searchjson); });

    //Apply sort
    if(params.sort) resultset.sort(XAPIGrid.rowSort(model, params.sort));

    //Apply paging
    var fullcount = resultset.length;
    var eof = true;
    if(params.rowcount > 0){
      resultset = resultset.slice(params.rowstart, params.rowstart + params.rowcount);
      eof = ((params.rowstart + params.rowcount) >= fullcount);
    }

    //Return dataset
    var rslt = {
      _success: 1,
      _stats: { }
    };

    //Add meta data, if applicable
    if(params.meta){
      rslt._defaults = {};
      rslt._stats._defaults = {};
      if(model && model.title){
        rslt._title = model.title;
        rslt._stats._title = {};
      }
    }

    //Add resultset
    rslt[this.modelid] = resultset;
    rslt._stats[this.modelid] = { warnings: [], notices: [] };
    rslt['_eof_' + this.modelid] = eof;

    //Set count, if applicable
    var getcount = (params.rowcount == -1) || params.getcount;
    if(getcount){
      rslt['_count_' + this.modelid] = fullcount;
      rslt._stats['_count_' + this.modelid] = { warnings: [], notices: [] };
    }
    
    return callback(null, rslt);
  }

  XAPIGrid.Static.prototype.ExportCSV = function(params, callback){
    jsh.XExt.Alert('Static Grid Data Adapter does not support CSV export');
  }

  //-----------------
  //jsHarmony Adapter
  //-----------------
  XAPIGrid.jsHarmony = function(modelid){
    this.modelid = jsh.XExt.resolveModelID(modelid);
  }

  XAPIGrid.jsHarmony.prototype = new XAPIGrid.base();

  XAPIGrid.jsHarmony.prototype.Select = function(params, callback){
    params = _.extend({
      rowstart: 0,              //Starting row for paging
      rowcount: 0,              //Number of rows for paging
      sort: JSON.stringify([]), //Sort order (string):   ["vcust_name","^cust_id"]
      searchjson: undefined,    //Search query (string): [{"Column":"cust_id","Value":"2","Comparison":">"},{"Column":"cust_name","Value":"brother","Join":"and","Comparison":"contains"}]
      d: undefined,             //Filters (string): { key: value }
      meta: undefined,          //1 to return metadata
      getcount: undefined,      //1 to return count
    }, params);
    if(!callback) callback = function(err, rslt){ };

    $.ajax({
      type:"GET",
      cache: false,
      url:jsh._BASEURL+'_d/'+this.modelid+'/',
      data: params,
      dataType: 'json',
      success: function(data){ callback(null, data); },
      error: function (data) { callback(data||{}, null); },
    });
  }

  XAPIGrid.jsHarmony.prototype.ExportCSV = function(params, callback){
    var url = jsh._BASEURL + '_csv/' + this.modelid + '/?'+$.param(params);
    jsh.getFileProxy().prop('src', url);
    if(callback) callback();
  }

  return XAPIGrid;
}