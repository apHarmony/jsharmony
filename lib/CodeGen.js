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

function CodeGen(jsh){
  this.jsh = jsh;
}

CodeGen.prototype.getSchema = function(options, callback){
  var _this = this;
  options = _.extend({ db: 'default' }, options);
  if(!options.db) options.db = 'default';
  var db = _this.jsh.DB[options.db];
  var rslt = {};
  if(!db.getType() || (db.getType()=='none')) return callback(null, null);
  async.parallel([
    function(cb){
      db.meta.getTables(undefined, { ignore_jsharmony_schema: false }, function(err, messages, tabledefs){
        if(err) return cb(err);
        rslt.tables = tabledefs;
        return cb();
      });
    },
    function(cb){
      db.meta.getTableFields(undefined, function(err, messages, fields){
        if(err) return cb(err);
        rslt.fields = fields;
        return cb();
      });
    },
    function(cb){
      db.meta.getForeignKeys(undefined, function(err, messages, fields){
        if(err) return cb(err);
        rslt.foreignkeys = fields;
        return cb();
      });
    }
  ], function(err){
    if(err) return callback(err);
    return callback(null,rslt);
  });
}

CodeGen.prototype.generateModels = function(table, options, callback){
  var _this = this;
  options = _.extend({ db: 'default', short: false }, options);
  if(!options.db) options.db = 'default';
  var db = this.jsh.DB[options.db];
  var rslt = {};
  var rsltmessages = [];
  db.meta.getTables(table, {}, function(err, messages, tabledefs){
    if(err) return callback(err);
    if(messages.length > 0) rsltmessages = rsltmessages.concat(messages);
    async.eachSeries(tabledefs, function(tabledef, table_callback){
      db.meta.getTableFields(tabledef, function(err, messages, fields){
        if(err) return table_callback(err);
        if(messages.length > 0) rsltmessages = rsltmessages.concat(messages);
        tabledef.fields = fields;
        //Model Name
        var model_name = tabledef.model_name;
        async.waterfall([
          //Generate Form
          function(generate_cb){
            _this.generateModelFromTableDefition(tabledef, 'form', { db: options.db, short: options.short }, function(err, messages, model){  
              if(err) return generate_cb(err);
              if(messages.length > 0) rsltmessages = rsltmessages.concat(messages);
              var modeltxt = '';
              if(model) modeltxt = _this.modelToJSON(model);
              if(modeltxt) rslt[model_name+'_form'] = modeltxt;
              return generate_cb(null);
            });
          },
          //Generate Grid
          function(generate_cb){
            _this.generateModelFromTableDefition(tabledef, 'grid', { db: options.db, short: options.short, form: model_name+'_form', readonly: true }, function(err, messages, model){  
              if(err) return generate_cb(err);
              if(messages.length > 0) rsltmessages = rsltmessages.concat(messages);
              var modeltxt = '';
              if(model) modeltxt = _this.modelToJSON(model);
              if(modeltxt) rslt[model_name+'_grid'] = modeltxt;
              return generate_cb(null);
            });
          },
        ], table_callback);
      });
    }, function(err){
      if(err) return callback(err);
      if(table && !_.size(rslt)) return callback(new Error('Table not found: '+(table.schema?(table.schema+'.'):'')+table.name));
      return callback(null, rsltmessages, rslt);
    });
  });
}

CodeGen.prototype.resolveType = function(sqlext, field){
  if(!field.type) return field;
  if(!field.datatype_config) field.datatype_config = {};
  if(!field.datatype_config.types) field.datatype_config.types = [];
  field.datatype_config.types.push(field.type);
  if(!sqlext.CustomDataTypes) return field;

  while(field.type in sqlext.CustomDataTypes){
    var curtypename = field.type;
    var curtype = sqlext.CustomDataTypes[curtypename];
    for (var prop in curtype) {
      if(!(prop in field) || (prop=='type')) field[prop] = curtype[prop];
      else if(prop=='datatype_config'){
        for(var subprop in curtype.datatype_config){
          if(!(subprop in field.datatype_config)) field.datatype_config[subprop] = curtype.datatype_config[subprop];
        }
      }
    }
    if(field.type==curtypename) break;
    field.datatype_config.types.push(field.type);
  }
  return field;
}

CodeGen.prototype.applyControlDefaults = function(layout, readonly, sqlext, field, finaltype){
  var fieldcontrol = this.getControl(layout, readonly, sqlext, field, finaltype);
  for(var prop in fieldcontrol){
    if(!(prop in field)) field[prop] = fieldcontrol[prop];
    else if(prop == 'captionclass') field.captionclass = fieldcontrol.captionclass + ' ' + (field.captionclass||'');
    else if(prop == 'controlclass') field.controlclass = fieldcontrol.controlclass + ' ' + (field.controlclass||'');
  }
}


CodeGen.prototype.getControl = function(layout, readonly, sqlext, field, finaltype){
  if(!finaltype){
    finaltype = this.resolveType(sqlext, { type: field.type });
  }
  var typename = '';
  var typenames = [];
  var preserve_timezone = false;
  var length = field.length;
  if(finaltype && finaltype.datatype_config && finaltype.datatype_config.types){
    typename = finaltype.type;
    preserve_timezone = !!finaltype.datatype_config.preserve_timezone;
    typenames = finaltype.datatype_config.types;
    length = length||finaltype.length||undefined;
  }

  var rslt = {};

  //Set Controls
  if(field.lov){
    rslt.control = 'dropdown';
  }
  else if(typename=='boolean'){
    rslt.control = 'checkbox';
  }
  else if(readonly && (layout=='grid')){
    if(typename=='date') rslt.control = 'label_mmddyyyy';
    else if((typename=='time') && !preserve_timezone) rslt.control = 'label_hhmmss';
    else rslt.control = 'label';
  }
  else if(typename=='int'){ rslt.control = 'textbox_S'; }
  else if(typename=='smallint'){ rslt.control = 'textbox_VS'; }
  else if(typename=='tinyint'){ rslt.control = 'textbox_VS'; }
  else if(typename=='decimal'){ rslt.control = 'textbox_decimal'; }
  else if(typename=='float'){ rslt.control = 'textbox_decimal'; }
  else if(typename=='date'){ rslt.control = 'date_mmddyyyy'; }
  else if(typename=='time'){
    if(preserve_timezone){ 
      if(readonly) rslt.control = 'label_hhmmssz';
      else{
        rslt.control = 'textbox';
        rslt.controlclass = 'xtextbox_tstmp7z';
      }
    }
    else {
      if(readonly) rslt.control = 'label_hhmmss';
      else rslt.control = 'textbox_hhmmss';
    }
  }
  else if(typename=='datetime'){ 
    if(readonly) rslt.control = 'label';
    else rslt.control = 'textbox';

    if(preserve_timezone){ rslt.controlclass = 'xtextbox_tstmp7z'; }
    else{ rslt.controlclass = 'xtextbox_tstmp7'; }
  }
  else if(_.includes(typenames, 'money')){ rslt.control = 'textbox_S'; }
  else if(_.includes(typenames, 'interval')){ rslt.control = 'textbox_M'; }

  else if(_.includes(typenames, 'point')){ rslt.control = 'textbox_S'; }
  else if(_.includes(typenames, 'line')){ rslt.control = 'textbox_S'; }
  else if(_.includes(typenames, 'lseg')){ rslt.control = 'textbox_S'; }
  else if(_.includes(typenames, 'box')){ rslt.control = 'textbox_S'; }
  else if(_.includes(typenames, 'path')){ rslt.control = 'textbox_L'; }
  else if(_.includes(typenames, 'polygon')){ rslt.control = 'textbox_M'; }
  else if(_.includes(typenames, 'circle')){ rslt.control = 'textbox_M'; }
  
  else if(_.includes(typenames, 'inet')){ rslt.control = 'textbox_M'; }
  else if(_.includes(typenames, 'cidr')){ rslt.control = 'textbox_M'; }
  else if(_.includes(typenames, 'macaddr')){ rslt.control = 'textbox_S'; }
  else if(_.includes(typenames, 'tsvector')){ rslt.control = 'textbox_L'; }
  else if(_.includes(typenames, 'tsquery')){ rslt.control = 'textbox_L'; }
  
  else if(_.includes(typenames, 'uuid')){ rslt.control = 'textbox_L'; }
  else if(_.includes(typenames, 'pg_lsn')){ rslt.control = 'textbox_S'; }
  else if(_.includes(typenames, 'txid_snapshot')){ rslt.control = 'textbox_S'; }

  else if(_.includes(typenames, 'uniqueidentifier')){ rslt.control = 'textbox_L'; }
  else if(_.includes(typenames, 'sql_variant')){ rslt.control = 'textbox_M'; }
  else if(_.includes(typenames, 'hierarchyid')){ rslt.control = 'textbox_S'; }
  else if(_.includes(typenames, 'geometry')){ rslt.control = 'textbox_L'; }
  else if(_.includes(typenames, 'geography')){ rslt.control = 'textbox_VL'; }

  else {
    if(readonly){
      rslt.control = "label";
    }
    else{
      rslt.control = "textbox";
      if((typename=='varchar')||(typename=='char')||(typename=='binary')){

        if(typeof length == 'undefined'){
          if(_.includes(typenames, 'xml')){ rslt.control = 'textarea_M'; }
          else if(_.includes(typenames, 'json')){ rslt.control = 'textarea_M'; }
          else if(_.includes(typenames, 'jsonb')){ rslt.control = 'textarea_M'; }
          else rslt.control = "textbox_M";
        }
        else {
          var flen = length;
          if(_.includes(typenames, 'binary')||_.includes(typenames, 'varbinary')) flen = flen*2;
          if(flen < 0){ rslt.control = "textarea_M"; }
          else if(flen <= 10) rslt.control = "textbox_S";
          else if(flen <= 64) rslt.control = "textbox_M";
          else if(flen <= 128) rslt.control = "textbox_L";
          else if(flen <= 512) rslt.control = "textbox_VL";
          else{ rslt.control = "textarea_M"; }
        }
      }
    }
  }

  return rslt;
}

CodeGen.prototype.generateModelFromTableDefition = function(tabledef, layout, options, callback){
  var _this = this;
  options = _.extend({ db: 'default' /* ,form: model_id */, readonly: false, short: false }, options);
  if(!options.db) options.db = 'default';
  var db = _this.jsh.DB[options.db];
  var messages = [];
  var model = {};
  model.comment = tabledef.name;
  model.layout = layout;
  model.title = tabledef.description||tabledef.name;
  model.table = tabledef.name;
  if(options.db != 'default') model.db = options.db;
  if(tabledef.schema) model.table = tabledef.schema + '.' + model.table;
  model.caption = ["", "Item", "Items"];
  if(layout=='form') model.onecolumn = true;

  var readonlyGrid = (layout=='grid') && options.readonly;

  var primary_keys = [];
  _.each(tabledef.fields,function(fielddef){
    if(fielddef.coldef.primary_key) primary_keys.push(fielddef.name);
  });

  if(layout=='form'){
    if(primary_keys.length==0){
      model.unbound = 1;
      messages.push('WARNING: Table ' + model.table + ' - MISSING PRIMARY KEY - Adding UNBOUND parameter');
    }
    model.actions = 'BIUD';
    model.popup = [900,600];
  }
  else if(readonlyGrid){
    model.actions = 'B';
    model.sort = [];
    _.each(primary_keys,function(fname){ model.sort.push("^" + fname) });
    if(options.form) model.buttons = [{"link":"insert:"+options.form}];
  }

  var allfields = {};
  _.each(tabledef.fields, function(fielddef){ if(fielddef.name) allfields[fielddef.name.toLowerCase()] = 1; });

  model.fields = [];
  var sqlext = db.getSQLExt();
  _.each(tabledef.fields,function(fielddef){
    var field = { };
    var coldef = fielddef.coldef;
    for(prop in fielddef){ if(prop != 'coldef') field[prop] = fielddef[prop]; }
    //Caption
    if(coldef.description) field.caption = coldef.description;
    else field.caption = field.name;
    //Primary Key
    if(coldef.primary_key) field.key = 1;

    var finaltype = _this.resolveType(sqlext, { type: field.type });
    var finaltypename = finaltype.type;

    //Dropdown UCOD/GCOD
    var isCODE = function(fkey){
      if((fkey.codetype=='ucod')||(fkey.codetype=='gcod')) return true;
      if((fkey.codetype=='ucod2')||(fkey.codetype=='gcod2')){
        if(fkey.codeparent && allfields[fkey.codeparent]) return true;
      }
    }
    var isForeignKeyEqual = function(a,b){
      if(a.schema_name!=b.schema_name) return false;
      if(a.table_name!=b.table_name) return false;
      if(a.column_name!=b.column_name) return false;
      return true;
    }
    var foreignKeyTypes = ['direct','indirect','lov'];
    var foundForeignKey = false;
    var code = null;
    if(fielddef.foreignkeys){
      for(var i=0;i<foreignKeyTypes.length;i++){
        var foreignKeyType = foreignKeyTypes[i];
        var fkeys = fielddef.foreignkeys[foreignKeyType];
        var foundKeys = [];
        _.each(fkeys, function(fkey){ if(isCODE(fkey)){ foundKeys.push(fkey); } });
        if(foundKeys.length){
          if(foreignKeyType=='direct'){ code = foundKeys[0]; break; }
          if(foreignKeyType=='indirect'){
            var allEqual = true;
            _.each(foundKeys, function(fkey){ allEqual = allEqual && isForeignKeyEqual(foundKeys[0], fkey); });
            if(allEqual){ code = foundKeys[0]; break; }
          }
          if(foreignKeyType=='lov') return foundKeys[0];
        }
      }
    }
    if(code){
      field.lov = {       
        schema: code.codeschema,
        blank: 1
      };
      field.lov[code.codetype.toUpperCase()] = code.codename;
      if(code.codeparent) field.lov.parent = code.codeparent;
    }

    if(!readonlyGrid){

      if(coldef.readonly){
        field.actions = "B";
      }
      else{
        field.actions = "BIU";
      }

      //Generate control
      _this.applyControlDefaults(layout, coldef.readonly, sqlext, field, finaltype);

      //Validation / Required fields
      var validate = [];
      if(layout != 'multisel'){
        if(coldef.required && (field.control != 'checkbox')) validate.push("Required");
        if(validate.length) field.validate = validate;
      }
    }
    else if(readonlyGrid){
      field.actions = 'B';

      if(finaltypename=='date'){ field.format = ["date","MM/DD/YYYY"]; }

      if(coldef.primary_key){
        if(options.form) field.link = "update:"+options.form;
      }
    }
    if(options.short){
      for(var prop in field){
        if(!_.includes(['name','caption','link'],prop)) delete field[prop];
      }
    }
    model.fields.push(field);
  });

  if(options.short){
    if(!readonlyGrid) delete model.actions;
    delete model.comment;
  }

  return callback(null, messages, model);
}

CodeGen.prototype.modelToJSON = function(model){
  //Format JSON
  var formatter = [{Pre:'',Post:''}];
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