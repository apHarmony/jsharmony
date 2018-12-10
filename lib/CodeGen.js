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
  async.parallel([
    function(cb){
      db.meta.getTables(undefined, { ignore_jsharmony_schema: false }, function(err, messages, tabledefs){
        if(err) return callback(err);
        rslt.tables = tabledefs;
        return cb();
      });
    },
    function(cb){
      db.meta.getTableFields(undefined, function(err, messages, fields){
        if(err) return callback(err);
        rslt.fields = fields;
        return cb();
      });
    },
    function(cb){
      db.meta.getForeignKeys(undefined, function(err, messages, fields){
        if(err) return callback(err);
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
  options = _.extend({ db: 'default' }, options);
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
            _this.generateModelFromTableDefition(tabledef, 'form', { db: options.db }, function(err, messages, model){  
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
            _this.generateModelFromTableDefition(tabledef, 'grid', { db: options.db, form: model_name+'_form', readonly: true }, function(err, messages, modeltxt){  
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

CodeGen.prototype.generateModelFromTableDefition = function(tabledef, layout, options, callback){
  var _this = this;
  options = _.extend({ db: 'default' /* ,form: model_id */, readonly: false }, options);
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
    if(options.form) model.buttons = [{"link":"add:"+options.form}];
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

    var finaltype = { type: field.type, datatype_config: {} };
    var fieldtypes = [];
    fieldtypes.push(field.type);
    while(finaltype.type in sqlext.CustomDataTypes){
      var fieldtype = finaltype.type;
      var datatype = sqlext.CustomDataTypes[fieldtype];
      for (var prop in datatype) {
        if(!(prop in finaltype) || (prop=='type')) finaltype[prop] = datatype[prop];
        else if(prop=='datatype_config'){
          for(var subprop in datatype.datatype_config){
            if(!(subprop in finaltype.datatype_config)) finaltype.datatype_config[subprop] = datatype.datatype_config[subprop];
          }
        }
      }
      if(finaltype.type==fieldtype) break;
      fieldtypes.push(finaltype.type);
    }
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
      //Set Controls
      if(field.lov){
        field.control = 'dropdown';
      }
      else if(finaltypename=='boolean'){
        field.control = 'checkbox';
      }
      else if(coldef.readonly && (layout=='grid')){
        if(finaltypename=='date') field.control = 'label_mmddyyyy';
        else if((finaltypename=='time') && !finaltype.datatype_config.preserve_timezone) field.control = 'label_hhmmss';
        else field.control = 'label';
      }
      else if(finaltypename=='int'){ field.control = 'textbox_S'; }
      else if(finaltypename=='smallint'){ field.control = 'textbox_VS'; }
      else if(finaltypename=='tinyint'){ field.control = 'textbox_VS'; }
      else if(finaltypename=='decimal'){ field.control = 'textbox_decimal'; }
      else if(finaltypename=='float'){ field.control = 'textbox_decimal'; }
      else if(finaltypename=='date'){ field.control = 'date_mmddyyyy'; }
      else if(finaltypename=='time'){
        if(finaltype.datatype_config.preserve_timezone){ field.controlclass = 'xtextbox_tstmp7z'; }
        else{ field.control = 'textbox_hhmmss'; }
      }
      else if(finaltypename=='datetime'){ 
        if(finaltype.datatype_config.preserve_timezone){ field.controlclass = 'xtextbox_tstmp7z'; }
        else{ field.controlclass = 'xtextbox_tstmp7'; }
      }
      else if(_.includes(fieldtypes, 'money')){ field.control = 'textbox_S'; }
      else if(_.includes(fieldtypes, 'interval')){ field.control = 'textbox_M'; }

      else if(_.includes(fieldtypes, 'point')){ field.control = 'textbox_S'; }
      else if(_.includes(fieldtypes, 'line')){ field.control = 'textbox_S'; }
      else if(_.includes(fieldtypes, 'lseg')){ field.control = 'textbox_S'; }
      else if(_.includes(fieldtypes, 'box')){ field.control = 'textbox_S'; }
      else if(_.includes(fieldtypes, 'path')){ field.control = 'textbox_L'; }
      else if(_.includes(fieldtypes, 'polygon')){ field.control = 'textbox_M'; }
      else if(_.includes(fieldtypes, 'circle')){ field.control = 'textbox_M'; }
      
      else if(_.includes(fieldtypes, 'inet')){ field.control = 'textbox_M'; }
      else if(_.includes(fieldtypes, 'cidr')){ field.control = 'textbox_M'; }
      else if(_.includes(fieldtypes, 'macaddr')){ field.control = 'textbox_S'; }
      else if(_.includes(fieldtypes, 'tsvector')){ field.control = 'textbox_L'; }
      else if(_.includes(fieldtypes, 'tsquery')){ field.control = 'textbox_L'; }
      
      else if(_.includes(fieldtypes, 'uuid')){ field.control = 'textbox_L'; }
      else if(_.includes(fieldtypes, 'pg_lsn')){ field.control = 'textbox_S'; }
      else if(_.includes(fieldtypes, 'txid_snapshot')){ field.control = 'textbox_S'; }

      else if(_.includes(fieldtypes, 'uniqueidentifier')){ field.control = 'textbox_L'; }
      else if(_.includes(fieldtypes, 'sql_variant')){ field.control = 'textbox_M'; }
      else if(_.includes(fieldtypes, 'hierarchyid')){ field.control = 'textbox_S'; }
      else if(_.includes(fieldtypes, 'geometry')){ field.control = 'textbox_L'; }
      else if(_.includes(fieldtypes, 'geography')){ field.control = 'textbox_VL'; }

      else if(finaltypename=='binary'){ field.control = 'textbox_L'; }

      if(coldef.readonly){
        field.actions = "B";
        if(!field.control) field.control = "label";
      }
      else{
        field.actions = "BIU";
        if(!field.control){
          field.control = "textbox";
          if((finaltypename=='varchar')||(finaltypename=='char')){
            var flen = field.length||finaltype.length||-1;
            if(_.includes(fieldtypes, 'binary')||_.includes(fieldtypes, 'varbinary')) flen = flen*2;

            if(flen < 0){
              if(db.dbconfig._driver.name=='sqlite'){ field.control = "textbox_M"; }
              else{ field.control = "textarea_M";  field.captionclass = "xtextarea_caption"; }
            }
            else if(flen <= 10) field.control = "textbox_S";
            else if(flen <= 50) field.control = "textbox_M";
            else if(flen <= 100) field.control = "textbox_L";
            else if(flen <= 200) field.control = "textbox_VL";
            else{ field.control = "textarea_M"; field.captionclass = "xtextarea_caption"; }
          }
        }
      }
      //Validation / Required fields
      var validate = [];
      if(layout != 'multisel'){
        if(coldef.required && (field.control != 'checkbox')) validate.push("Required");
        if(validate.length) field.validate = validate;
      }
      field.nl = 1;
    }
    else if(readonlyGrid){
      field.actions = 'B';

      if(finaltypename=='date'){ field.format = ["date","MM/DD/YYYY"]; }

      if(coldef.primary_key){
        if(options.form) field.link = "edit:"+options.form;
      }
    }
    model.fields.push(field);
  });

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