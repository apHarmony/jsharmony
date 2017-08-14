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
var jshParser = require('./JSParser.js');

function CodeGen(db){
  this.db = db;
}

CodeGen.prototype.generateModels = function(table, callback){
  var _this = this;
  var rslt = {};
  _this.db.meta.getTables(table, function(err, tabledefs){
    if(err) return callback(err);
    async.eachSeries(tabledefs, function(tabledef, table_callback){
      _this.db.meta.getTableFields(tabledef, function(err, fields){
        if(err) return table_callback(err);
        tabledef.fields = fields;
        //Model Name
        var model_name = tabledef.name;
        if(tabledef.schema != 'dbo') model_name = tabledef.schema+'_'+model_name;
        //Generate Form
        var formtxt = _this.generateModelFromTableDefition(tabledef, 'form');
        if(formtxt) rslt[model_name+'_form'] = formtxt;
        //Generate Grid
        var gridtxt = _this.generateModelFromTableDefition(tabledef, 'grid', { 'form': model_name+'_form' });
        if(gridtxt) rslt[model_name+'_grid'] = gridtxt;
        table_callback();
      });
    }, function(err){
      if(err) return callback(err);
      if(table && !_.size(rslt)) return callback(new Error('Table not found: '+(table.schema||'dbo')+'.'+table.name));
      return callback(null, rslt);
    });
  });
}

CodeGen.prototype.generateModelFromTableDefition = function(tabledef, layout, options){
  if(!options) options = {};
  var model = {};
  model.comment = tabledef.name;
  model.layout = layout;
  model.title = tabledef.description||tabledef.name;
  model.table = tabledef.name;
  if(tabledef.schema) model.table = tabledef.schema + '.' + model.table;
  model.caption = ["", "Item", "Items"];

  var primary_keys = [];
  _.each(tabledef.fields,function(fielddef){
    if(fielddef.coldef.primary_key) primary_keys.push(fielddef.name);
  });

  if(layout=='form'){
    if(primary_keys.length==0){
      model.unbound = 1;
      console.log('WARNING: Table ' + model.table + ' - MISSING PRIMARY KEY - Adding UNBOUND parameter');
    }
    model.access = 'BIUD';
    model.popup = [900,600];
  }
  else if(layout=='grid'){
    model.access = 'BI';
    model.sort = [];
    _.each(primary_keys,function(fname){ model.sort.push("^" + fname) });
    if(options.form) model.buttons = [{"link":"add:"+options.form}];
  }

  model.fields = [];
  _.each(tabledef.fields,function(fielddef){
    var field = { };
    var coldef = fielddef.coldef;
    for(prop in fielddef){ if(prop != 'coldef') field[prop] = fielddef[prop]; }
    //Caption
    if(coldef.description) field.caption = coldef.description;
    else field.caption = field.name;
    //Primary Key
    if(coldef.primary_key) field.key = 1;

    if(layout=='form'){
      //Set Controls
      if(coldef.readonly){
        field.access = "B";
        field.control = "label";
      }
      else{
        field.access = "BIU";
        field.control = "textbox";
      }
      //Validation / Required fields
      field.validate = [];
      if(coldef.required) field.validate.push("Required");
      field.nl = 1;
    }
    else if(layout=='grid'){
      field.access = 'B';
      if(coldef.primary_key){
        if(options.form) field.link = "edit:"+options.form;
      }
    }
    model.fields.push(field);
  });

  //Format JSON
  formatter = [{Pre:'',Post:''}];
  for(var prop in model){
    var proptoken = {S:prop,SPre:"\r\n  ",SPost:"",VPre:" ",VMid:"",VPost:""};
    if(prop=='fields'){
      proptoken.V = [];
      for(var i=0;i<model.fields.length;i++){
        var fieldtoken = { I:(i+1), VPre: "\r\n    ",VMid: "",VPost:"", V:[] };
        for(var fprop in model.fields[i]){
          fieldtoken.V.push({S:fprop,SPre:" ",SPost:"",VPre:"",VMid:"",VPost:""});
        }
        if(fieldtoken.V.length > 0) fieldtoken.V[0].SPre = "";
        proptoken.V.push(fieldtoken);
      }
      if(proptoken.V.length) proptoken.V[proptoken.V.length-1].VPost = "\r\n  ";
    }
    formatter.push(proptoken);
  }
  formatter[formatter.length-1].VPost = "\r\n";

  //Generate Output
  var rslt = jshParser.GenString(model,formatter);
  return rslt;
}

exports = module.exports = CodeGen;