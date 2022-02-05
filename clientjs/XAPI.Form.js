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

  var XAPIForm = function(){ };

  //----------------
  //Shared Functions
  //----------------
  XAPIForm.base = function(){ };

  XAPIForm.base.prototype.ExecuteURL = function(ExecParams, callback){
    if((ExecParams.model.indexOf('?')<=0) && (ExecParams.url[ExecParams.url.length-1] != '/')) ExecParams.url += '/';

    if(!callback) callback = function(errdata, rslt){};

    var _this = this;
    var url = ExecParams.url;
    if(!_.isEmpty(ExecParams.query)) url += '?'+$.param(ExecParams.query);
    var loader = jsh.xLoader;
    if(jsh.xDialog.length) loader = jsh.xDialogLoader;
    if(loader) loader.StartLoading(_this);
    $.ajax({
      type:ExecParams.method.toUpperCase(),
      cache: false,
      url: url,
      data: ExecParams.post,
      async: ExecParams.async,
      dataType: 'json',
      xhrFields: {
        withCredentials: true
      },
      success:function(rslt){
        if(loader) loader.StopLoading(_this);
        callback(null, rslt);
      },
      error:function(errdata){
        if(loader) loader.StopLoading(_this);
        callback(errdata, null);
      }
    });
  };
  
  //--------------
  //Static Adapter
  //--------------
  XAPIForm.Static = function(modelid, dataset){
    this.modelid = jsh.XExt.resolveModelID(modelid);
    this.dataset = dataset;

    this.onSelect = function(action, actionrslt, keys){}; //If return value is false, stop processing
    this.onInsert = function(action, actionrslt, newrow){}; //If return value is false, stop processing
    this.onUpdate = function(action, actionrslt, keys, newdata){}; //If return value is false, stop processing
    this.onDelete = function(action, actionrslt, keys){}; //If return value is false, stop processing
  };

  XAPIForm.Static.prototype = new XAPIForm.base();

  XAPIForm.Static.prototype.getRowByKeys = function(keys){
    var _this = this;
    var rslt = _.filter(_this.dataset, function(row){
      for(var key in keys){
        var keyval = keys[key];
        if(jsh.XExt.isNullUndefined(keyval)) keyval = '';
        keyval = keyval.toString().toUpperCase();

        var rowval = row[key];
        if(jsh.XExt.isNullUndefined(rowval)) rowval = '';
        rowval = rowval.toString().toUpperCase();
        
        if(keyval != rowval) return false;
      }
      return true;
    });
    if(rslt.length > 1) throw new Error('Multiple rows ('+rslt.length+') match target key');
    else if(rslt.length == 0) throw new Error('No rows match target key');
    else return rslt[0];
  };

  XAPIForm.Static.prototype.Execute = function(ExecParams, callback){
    var _this = this;

    if(ExecParams.url) return this.ExecuteURL(ExecParams, callback);

    function genError(err){ return JSON.stringify({ _error: { Number: -99999, Message: err.toString() } }); }

    //Get model
    var model = jsh.XModels[this.modelid];

    //Parse post data
    function parsePost(data){
      var rslt = {};
      if(data && !_.isString(data)) return data;
      if(data) rslt = jsh.XExt.parseGET(data);
      return rslt;
    }

    //Generate actions array
    var actions = [];
    var isTransaction = false;
    if(ExecParams.model == '_transaction'){
      isTransaction = true;
      try{
        var post = parsePost(ExecParams.post);
        if(post.data) actions = JSON.parse(post.data);
      }
      catch(ex){
        return callback(genError(ex), null);
      }
    }
    else {
      actions.push({
        method: ExecParams.method,
        model: ExecParams.model,
        query: ExecParams.query,
        post: ExecParams.post,
      });
    }

    var rslt = {
      _stats: {}
    };

    for(var i=0;i<actions.length;i++){
      try{
        var action = actions[i];
        action.query = parsePost(action.query);
        action.post = parsePost(action.post);

        var method = (action.method||'').toString().toUpperCase();

        if(action.model != _this.modelid) throw new Error('Invalid model for static API call: '+(action.model||''));

        var actionrslt = null;

        if(method=='GET'){
          //Get - Select
          //query = _action and keys
          if(_.isEmpty(action.query)) throw new Error('Empty query parameter in GET request - keys required');
          if(!_.isEmpty(action.post)) throw new Error('Invalid post parameters in GET request - should be empty');

          //Generate result
          actionrslt = {
            _stats: {}
          };
          actionrslt[_this.modelid] = null;
          actionrslt._stats[_this.modelid] = { warnings: [], notices: [] };

          if(model && model.title){
            actionrslt._title = model.title;
            actionrslt._stats._title = {};
          }

          var keys = action.query;

          if(_this.onSelect(action, actionrslt, keys)!==false){
            //Get row
            var row = _this.getRowByKeys(keys);
            actionrslt[_this.modelid] = row;
          }
        }
        else if(method=='PUT'){
          //Put - Insert
          //query = {}
          //post = data
          if(!_.isEmpty(action.query)) throw new Error('Invalid query parameters in PUT request - should be empty');
          if(_.isEmpty(action.post)) throw new Error('Empty post parameter in PUT request - new data required');

          //Get new data
          var newrow = action.post;

          //Generate result
          actionrslt = {
            _stats: {}
          };
          actionrslt[_this.modelid] = null;
          actionrslt._stats[_this.modelid] = { warnings: [], notices: [] };

          if(_this.onInsert(action, actionrslt, newrow)!==false){
            if(model){
              //Set key fields to null that were not defined
              _.each(model.fields, function(field){ if(field.key && !(field.name in newrow)) newrow[field.name] = null; });
            }
            //Add data to dataset
            _this.dataset.push(newrow);
          }
        }
        else if(method=='POST'){
          //Post - Update
          //query = keys
          //post = data
          if(_.isEmpty(action.query)) throw new Error('Empty query parameter in POST request - keys required');
          if(_.isEmpty(action.post)) throw new Error('Empty post parameter in POST request - updated data required');

          //Generate result
          actionrslt = {
            _stats: {}
          };
          actionrslt[_this.modelid] = null;
          actionrslt._stats[_this.modelid] = { warnings: [], notices: [] };

          var keys = action.query;
          var newdata = action.post;

          if(_this.onUpdate(action, actionrslt, keys, newdata)!==false){
            //Find row by keys
            var row = _this.getRowByKeys(keys);

            //Update row
            for(var key in newdata) row[key] = newdata[key];

            //Set updated rowcount
            actionrslt[_this.modelid] = { xrowcount: 1 };
          }
        }
        else if(method=='DELETE'){
          //Delete
          //query = keys
          //post = {}
          if(_.isEmpty(action.query)) throw new Error('Empty query parameter in GET request - keys required');
          if(!_.isEmpty(action.post)) throw new Error('Invalid post parameters in DELETE request - should be empty');

          //Generate result
          actionrslt = {
            _stats: {}
          };
          actionrslt[_this.modelid] = null;
          actionrslt._stats[_this.modelid] = { warnings: [], notices: [] };

          var keys = action.query;

          if(_this.onDelete(action, actionrslt, keys)!==false){
            //Find row by keys
            var row = _this.getRowByKeys(keys);

            //Delete row
            var deleted = false;
            for(var j=0;j<_this.dataset.length;j++){
              if(_this.dataset[j]===row){
                _this.dataset.splice(j, 1);
                deleted = true;
                break;
              }
            }
            if(!deleted) throw new error('Target row for delete operation not found');

            //Set updated rowcount
            actionrslt[_this.modelid] = { xrowcount: 1 };
          }
        }
        else throw new Error('Invalid method: '+method);
      }
      catch(ex){
        return callback(genError(ex), null);
      }

      if(isTransaction){
        var transIdx = i+1;
        for(var key in actionrslt){
          if(key=='_stats'){
            for(var statskey in actionrslt._stats){
              rslt._stats[transIdx + '_' + statskey] = actionrslt._stats[statskey];
            }
          }
          else rslt[transIdx + '_' + key] = actionrslt[key];
        }
      }
    }

    rslt._success = true;

    //Add timeout, so that grid focus methods will work
    setTimeout(function(){
      callback(null, rslt);
    }, 1);
  };

  //-----------------
  //jsHarmony Adapter
  //-----------------
  XAPIForm.jsHarmony = function(modelid){
    this.modelid = jsh.XExt.resolveModelID(modelid);
  };

  XAPIForm.jsHarmony.prototype = new XAPIForm.base();

  XAPIForm.jsHarmony.prototype.Execute = function(ExecParams, callback){
    if(!ExecParams.url){
      ExecParams.url = jsh._BASEURL + '_d/' + ExecParams.model;
    }
    return this.ExecuteURL(ExecParams, callback);
  };

  return XAPIForm;
};