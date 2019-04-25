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

var Helper = require('./lib/Helper.js');
var _ = require('lodash');
var async = require('async');
var HelperFS = require('./lib/HelperFS.js');
var crypto = require('crypto');

module.exports = exports = {};

exports.getModelForm = function (req, res, fullmodelid, Q, P, form_m) {
  var model = this.jsh.getModel(req, fullmodelid);
  if (!Helper.hasModelAction(req, model, 'B')) { Helper.GenError(req, res, -11, 'Invalid Model Access for '+fullmodelid); return; }
  if (model.unbound && !model._sysconfig.unbound_meta) { Helper.GenError(req, res, -11, 'Cannot run database queries on unbound models'); return; }
  var _this = this;
  var fieldlist = this.getFieldNames(req, model.fields, 'B');
  var filelist = this.getFileFieldNames(req, model.fields, 'B');
  var keylist = this.getKeyNames(model.fields);
  var foreignkeylist = this.getFieldNames(req, model.fields, 'F');
  var crumbfieldlist = this.getFieldNames(req, model.fields, 'C');
  var allfieldslist = _.union(keylist, fieldlist);
  var encryptedfields = this.getEncryptedFields(req, model.fields, 'B');
  var lovkeylist = this.getFieldNamesWithProp(model.fields, 'lovkey');
  var db = _this.jsh.getModelDB(req, fullmodelid);
  if ((encryptedfields.length > 0) && !(req.secure) && (!_this.jsh.Config.system_settings.allow_insecure_http_encryption)) { Helper.GenError(req, res, -51, 'Encrypted fields require HTTPS connection'); return; }
  

  var is_insert = false;
  var is_browse = false;
  var selecttype = 'single';
  if (typeof form_m == 'undefined') form_m = false;
  if (form_m) {
    is_insert = (('_action' in Q) && (Q['_action'] == 'insert'));
    is_browse = (('_action' in Q) && (Q['_action'] == 'browse'));
    //Check if multiple or single and validate parameters
    if (_this.ParamCheck('Q', Q, _.map(keylist, function (key) { return '&' + key; }), false)) { /* Default */ }
    else if (_this.ParamCheck('Q', Q, _.union(_.map(foreignkeylist, function (field) { return '|' + field; }), ['|_action']), false)) {
      selecttype = 'multiple';
    }
    else { 
      //Display missing keys
      _this.ParamCheck('Q', Q, _.map(keylist, function (key) { return '&' + key; }), true);
      Helper.GenError(req, res, -4, 'Invalid Parameters');
      return; 
    }
  }
  else {
    is_insert = (_.isEmpty(Q)) || (Q && ('_action' in Q) && (Q['_action'] == 'insert'));
    is_browse = (Q && ('_action' in Q) && (Q['_action'] == 'browse'));
    if (!_this.ParamCheck('Q', Q, _.union(_.map(keylist, function (key) { return '|' + key; }), ['|_action']), false)) {
      is_insert = true;
      if (!_this.ParamCheck('Q', Q, _.union(_.map(_.union(crumbfieldlist, lovkeylist), function (field) { return '|' + field; }), ['|_action']), true)) {
        Helper.GenError(req, res, -4, 'Invalid Parameters'); return;
      }
    }
  }
  if (!_this.ParamCheck('P', P, [])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  
  var nokey = (('nokey' in model) && (model.nokey));
  if (nokey) is_insert = false;
  if (model.unbound) is_insert = false;
  
  var sql_ptypes = [];
  var sql_params = {};
  var verrors = {};
  var allfields = this.getFieldsByName(model.fields, allfieldslist);
  var sql_allkeys = [];
  var datalockqueries = [];
  var sortfields = [];
  
  //Add Keys to where
  if (!nokey) {
    if ((selecttype == 'single')) _.each(keylist, function (val) { sql_allkeys.push(val); });
    else if (selecttype == 'multiple') _.each(foreignkeylist, function (val) { if (val in Q) sql_allkeys.push(val); });
  }
  var sql_allkeyfields = this.getFieldsByName(model.fields, sql_allkeys);
  
  //Add DataLock parameters to SQL
  var skipDataLocks = [];
  if(is_insert) skipDataLocks = skipDataLocks.concat(keylist);
  this.getDataLockSQL(req, model, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery) { datalockqueries.push(datalockquery); }, null, fullmodelid, { skipDataLocks: skipDataLocks });
  
  if (selecttype == 'multiple') {
    var dsort = new Array();
    if ('sort' in model) dsort = model['sort'];
    var unsortedkeys = keylist.slice();
    _.each(dsort, function (val) {
      if (!_.isString(val)) throw new Error('Invalid sort string');
      if (val.length < 2) throw new Error('Invalid sort string');
      var sortfield = val.substring(1);
      var sortdir = val[0];
      if (sortdir == 'v') sortdir = 'desc';
      else if (sortdir == '^') sortdir = 'asc';
      else throw new Error('Invalid sort string');
      if (!_.includes(allfieldslist, sortfield)) throw new Error('Invalid sort field ' + sortfield);
      
      var field = _this.getFieldByName(model.fields, sortfield);
      sortfields.push({ 'field': sortfield, 'dir': sortdir, 'sql': (field.sqlsort || '') });
      
      if (_.includes(unsortedkeys, sortfield)) unsortedkeys = _.without(unsortedkeys, sortfield);
    });
    if (unsortedkeys.length > 0) _.each(unsortedkeys, function (keyname) {
      sortfields.push({ 'field': keyname, 'dir': 'asc', 'sql': '' });
    });
  }
  
  var keys = [];
  if (is_insert && !Helper.hasModelAction(req, model, 'I')) { Helper.GenError(req, res, -11, 'Invalid Model Access - ' + model.id + ' Insert'); return; }
  if (!is_insert && !nokey && !model.unbound) {
    //Add dynamic parameters from query string	
    if (selecttype == 'single') keys = this.getKeys(model.fields);
    else if (selecttype == 'multiple') keys = this.getFields(req, model.fields, 'F');
    for (var i = 0; i < keys.length; i++) {
      var field = keys[i];
      var fname = field.name;
      if (fname in Q) {
        var dbtype = _this.getDBType(field);
        sql_ptypes.push(dbtype);
        sql_params[fname] = _this.DeformatParam(field, Q[fname], verrors);
      }
      else if (selecttype == 'single') { _this.jsh.Log.warning('Missing parameter ' + fname); Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
    }
    if (selecttype == 'single') verrors = _.merge(verrors, model.xvalidate.Validate('K', sql_params));
    else if (selecttype == 'multiple') verrors = _.merge(verrors, model.xvalidate.Validate('F', sql_params, undefined, undefined, undefined, { ignoreUndefined: true }));
    if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  }
  
  var sql = db.sql.getModelForm(_this.jsh, model, selecttype, allfields, sql_allkeyfields, datalockqueries, sortfields);
  
  //Return applicable drop-down lists
  var dbtasks = [{},{}];
  if (!is_insert && !model.unbound) dbtasks[0][fullmodelid] = function (dbtrans, callback) {
    var dbfunc = db.Row;
    if (selecttype == 'multiple') dbfunc = db.Recordset;
    dbfunc.call(db, req._DBContext, sql, sql_ptypes, sql_params, dbtrans, function (err, rslt, stats) {
      if ((err == null) && (rslt == null)) err = Helper.NewError('Record not found', -1);
      if (err != null) { err.model = model; err.sql = sql; }
      else {
        if (stats) stats.model = model;
        if ((rslt != null) && (selecttype == 'single') && (keylist.length == 1)) {
          var keyval = sql_params[keylist[0]];
          //Decrypt encrypted fields
          if (encryptedfields.length > 0) {
            if (keys.length != 1) throw new Error('Encryption requires one key');
            _.each(encryptedfields, function (field) {
              var encval = rslt[field.name];
              if (encval == null) return;
              if (field.type == 'encascii') {
                if (!(field.password in _this.jsh.Config.passwords)) throw new Error('Encryption password not defined.');
                var decipher = crypto.createDecipher('aes128', keyval + _this.jsh.Config.passwords[field.password]);
                decipher.update(encval);
                rslt[field.name] = decipher.final().toString('ascii');
              }
            });
          }
          //Verify files exist on disk
          if (filelist.length > 0) {
            //For each file
            var filerslt = {};
            async.each(filelist, function (file, filecallback) {
              var filefield = _this.getFieldByName(model.fields, file);
              var fpath = _this.jsh.Config.datadir + filefield.controlparams.data_folder + '/' + (filefield.controlparams.data_file_prefix||file) + '_' + keyval;
              if (filefield.controlparams._data_file_has_extension) fpath += '%%%EXT%%%';
              HelperFS.getExtFileName(fpath, function(err, filename){
                if(err){
                  filerslt[file] = false;
                  return filecallback(null);
                }
                HelperFS.exists(filename, function (exists) {
                  filerslt[file] = exists;
                  return filecallback(null);
                });
              });
            }, function (err) {
              if (err != null){
                _this.jsh.Log.error(err);
                return callback(Helper.NewError('Error performing file operation', -99999));
              }
              _.merge(rslt, filerslt);
              callback(null, rslt, stats);
            });
            return;
          }
        }
        else if ((rslt != null) && (selecttype == 'multiple')) {
          if (filelist.length > 0) { throw new Error('Files not supported on FORM-M'); }
          if (encryptedfields.length > 0) { throw new Error('Encryption not supported on FORM-M'); }
        }
      }
      callback(err, rslt, stats);
    });
  }
  else if (is_insert && (selecttype == 'multiple')) {
    dbtasks[0][fullmodelid] = function (dbtrans, callback) {
      var rslt = [];
      callback(null, rslt);
    };
  }
  //Default Values
  var has_unbound_field_with_default = false;
  _.each(model.fields, function(field){ if(field.unbound && field.default) has_unbound_field_with_default = true; });
  if (is_insert || (selecttype == 'multiple') || has_unbound_field_with_default) {
    if(_this.addDefaultTasks(req, res, model, Q, dbtasks[1])===false) return;
  }

  //Titles
  var targetperm = 'U';
  if(is_browse) targetperm = 'B';
  else if(is_insert) targetperm = 'I';
  else if(selecttype == 'multiple') targetperm = 'U';
  if(_this.addTitleTasks(req, res, model, Q, dbtasks[1], targetperm)===false) return;

  //Breadcrumbs
  if(_this.addBreadcrumbTasks(req, res, model, Q, dbtasks[1], targetperm)===false) return;
  //LOV
  if(_this.addLOVTasks(req, res, model, Q, dbtasks[1], { action: targetperm })===false) return;
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  return dbtasks;
}

exports.putModelForm = function (req, res, fullmodelid, Q, P, onComplete) {
  var _this = this;
  var model = this.jsh.getModel(req, fullmodelid);
  if (!Helper.hasModelAction(req, model, 'I')) { Helper.GenError(req, res, -11, 'Invalid Model Access for '+fullmodelid); return; }
  var fieldlist = this.getFieldNames(req, model.fields, 'I');
  var filelist = this.getFileFieldNames(req, model.fields, 'I');
  var encryptedfields = this.getEncryptedFields(req, model.fields, 'I');
  if ((encryptedfields.length > 0) && !(req.secure) && (!_this.jsh.Config.system_settings.allow_insecure_http_encryption)) { Helper.GenError(req, res, -51, 'Encrypted fields require HTTPS connection'); return; }
  var db = _this.jsh.getModelDB(req, fullmodelid);
  
  var Pcheck = _.map(fieldlist, function (field) { return '&' + field; });
  Pcheck = Pcheck.concat(_.map(filelist, function (file) { return '|' + file; }));
  if (!_this.ParamCheck('Q', Q, [])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  if (!_this.ParamCheck('P', P, Pcheck)) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  
  //Add to P
  //Add to fieldlist
  //Add extra parameters to sql
  //getFieldsByName
  var sql_ptypes = [];
  var sql_params = {};
  var sql_extfields = [];
  var sql_extvalues = [];
  var verrors = {};
  var param_datalocks = [];
  var vfiles = {};
  var fileops = [];
  var enc_sql_ptypes = [];
  var enc_sql_params = {};
  var enc_datalockqueries = [];
  var hashfields = {};
  async.eachSeries(filelist, _this.ProcessFileParams.bind(_this, req, res, model, P, fieldlist, sql_extfields, sql_extvalues, fileops, vfiles), function (err) {
    if (err != null) return;
    
    //Remove any encrypted fields from the initial update
    _.each(encryptedfields, function (field) {
      _.remove(fieldlist, function (val) { return val == field.name; });
      if (field.type == 'encascii') {
        if ('hash' in field) {
          var hashfield = _.find(model.fields, function (xfield) { return xfield.name == field.hash; });
          if (typeof hashfield == 'undefined') throw new Error('Field ' + field.name + ' hash is not defined.');
          hashfields[field.name] = hashfield;
        }
      }
    });
    
    var keys = _this.getKeys(model.fields);
    
    //Set up Encryption SQL and Parameters
    if (encryptedfields.length > 0) {
      //Add dynamic keys to parameters
      _.each(keys, function (key) {
        var dbtype = _this.getDBType(key);
        enc_sql_ptypes.push(dbtype);
        enc_sql_params[key.name] = '%%%' + key.name + '%%%';
      });
      //Add Encryption SQL Parameters
      _.each(encryptedfields, function (field) {
        enc_sql_ptypes.push(_this.getDBType(field));
        var fname = field.name;
        if (fname in P) {
          enc_sql_params[fname] = _this.DeformatParam(field, P[fname], verrors);
          if ('hash' in field) {
            enc_sql_ptypes.push(_this.getDBType(hashfields[field.name]));
            enc_sql_params[hashfields[field.name].name] = null;
          }
        }
        else throw new Error('Missing parameter ' + fname);
      });
      //Add DataLock parameters to Encryption SQL 
      _this.getDataLockSQL(req, model, model.fields, enc_sql_ptypes, enc_sql_params, verrors, function (datalockquery) { enc_datalockqueries.push(datalockquery); });
    }
    
    var subs = [];
    //Add fields from post
    var fields = _this.getFieldsByName(model.fields, fieldlist);
    if (fields.length == 0) return onComplete(null, {});
    _.each(fields, function (field) {
      var fname = field.name;
      if (fname in P) {
        var dbtype = _this.getDBType(field);
        sql_ptypes.push(dbtype);
        if (P[fname] == '%%%' + fname + '%%%') { subs.push(fname); P[fname] = ''; }
        sql_params[fname] = _this.DeformatParam(field, P[fname], verrors);
        //Add PreCheck, if type='F'
        if (Helper.hasAction(field.actions, 'F')) {
          _this.getDataLockSQL(req, model, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery, dfield) {
            if (dfield != field) return false;
            param_datalocks.push({ pname: fname, datalockquery: datalockquery, field: dfield });
            return true;
          },undefined,model.id + ': '+fname);
        }
      }
      else throw new Error('Missing parameter ' + fname);
    });

    var ignore_subs = _.map(subs, function(val){ return '_obj.'+val });
    verrors = _.merge(verrors, model.xvalidate.Validate('I', _.merge(vfiles, enc_sql_params, sql_params), '', ignore_subs));
    if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
    
    var dbsql = db.sql.putModelForm(_this.jsh, model, fields, keys, sql_extfields, sql_extvalues, encryptedfields, hashfields, enc_datalockqueries, param_datalocks);
    
    _.each(subs, function (fname) { sql_params[fname] = '%%%' + fname + '%%%'; });
    var dbtasks = {};
    dbtasks[fullmodelid] = function (dbtrans, callback, transtbl) {
      sql_params = _this.ApplyTransTblEscapedParameters(sql_params, transtbl);
      db.Row(req._DBContext, dbsql.sql, sql_ptypes, sql_params, dbtrans, function (err, rslt, stats) {
        if (stats) stats.model = model;
        if ((err == null) && (rslt != null) && (_this.jsh.map.rowcount in rslt) && (rslt[_this.jsh.map.rowcount] == 0)) err = Helper.NewError('No records affected', -3, stats);
        if (err != null) { err.model = model; err.sql = dbsql.sql; }
        else if (fileops.length > 0) {
          //Move files, if applicable
          var keyval = '';
          if (keys.length == 1) keyval = rslt[keys[0].name];
          else throw new Error('File uploads require one key');
          return _this.ProcessFileOperations(keyval, fileops, rslt, stats, callback);
        }
        callback(err, rslt, stats);
      });
    };
    if (encryptedfields.length > 0) {
      if (keys.length != 1) throw new Error('Encryption requires one key');
      dbtasks['enc_' + fullmodelid] = function (dbtrans, callback, transtbl) {
        if (typeof dbtrans == 'undefined') return callback(Helper.NewError('Encryption must be executed within a transaction', -50), null);
        enc_sql_params = _this.ApplyTransTblEscapedParameters(enc_sql_params, transtbl);
        var transvars = _this.getTransVars(transtbl);
        var keyval = transvars[keys[0].name];
        //Encrypt Data
        _.each(encryptedfields, function (field) {
          var clearval = enc_sql_params[field.name];
          if (field.type == 'encascii') {
            if (clearval.length == 0) {
              enc_sql_params[field.name] = null;
              if ('hash' in field) { enc_sql_params[hashfields[field.name].name] = null; }
            }
            else {
              if (!(field.password in _this.jsh.Config.passwords)) throw new Error('Encryption password not defined.');
              var cipher = crypto.createCipher('aes128', keyval + _this.jsh.Config.passwords[field.password]);
              cipher.update(clearval, 'ascii');
              enc_sql_params[field.name] = cipher.final();
              if ('hash' in field) {
                var hashfield = hashfields[field.name];
                if (!(hashfield.salt in _this.jsh.Config.salts)) throw new Error('Hash salt not defined.');
                enc_sql_params[hashfield.name] = crypto.createHash('sha1').update(clearval + _this.jsh.Config.salts[hashfield.salt]).digest();
              }
            }
          }
        });
        db.Row(req._DBContext, dbsql.enc_sql, enc_sql_ptypes, enc_sql_params, dbtrans, function (err, rslt, stats) {
          if (stats) stats.model = model;
          if ((err == null) && (rslt != null) && (_this.jsh.map.rowcount in rslt) && (rslt[_this.jsh.map.rowcount] == 0)) err = Helper.NewError('No records affected', -3, stats);
          if (err != null) { err.model = model; err.sql = dbsql.enc_sql; }
          callback(err, rslt, stats);
        });
      };
    }
    if (fileops.length > 0) dbtasks['_POSTPROCESS'] = function (callback) {
      _this.ProcessFileOperationsDone(fileops, callback);
    }
    return onComplete(null, dbtasks);
  });
}

exports.postModelForm = function (req, res, fullmodelid, Q, P, onComplete) {
  var _this = this;
  if (!this.jsh.hasModel(req, fullmodelid)) throw new Error("Error: Model " + fullmodelid + " not found in collection.");
  var model = this.jsh.getModel(req, fullmodelid);
  if (!Helper.hasModelAction(req, model, 'U')) { Helper.GenError(req, res, -11, 'Invalid Model Access for '+fullmodelid); return; }
  
  var fieldlist = this.getFieldNames(req, model.fields, 'U');
  var keylist = this.getKeyNames(model.fields);
  var filelist = this.getFileFieldNames(req, model.fields, 'U');
  var encryptedfields = this.getEncryptedFields(req, model.fields, 'U');
  if ((encryptedfields.length > 0) && !(req.secure) && (!_this.jsh.Config.system_settings.allow_insecure_http_encryption)) { Helper.GenError(req, res, -51, 'Encrypted fields require HTTPS connection'); return; }
  var db = _this.jsh.getModelDB(req, fullmodelid);
  
  var Pcheck = _.map(fieldlist, function (field) { return '&' + field; });
  Pcheck = Pcheck.concat(_.map(filelist, function (file) { return '|' + file; }));
  if (!_this.ParamCheck('Q', Q, _.map(keylist, function (key) { return '&' + key; }))) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  if (!_this.ParamCheck('P', P, Pcheck)) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  
  var sql_ptypes = [];
  var sql_params = {};
  var sql_extfields = [];
  var sql_extvalues = [];
  var verrors = {};
  var vfiles = {};
  var vignorefiles = [];
  var fileops = [];
  var hashfields = {};
  var datalockqueries = [];
  var param_datalocks = [];
  
  async.eachSeries(filelist, _this.ProcessFileParams.bind(_this, req, res, model, P, fieldlist, sql_extfields, sql_extvalues, fileops, vfiles), function (err) {
    if (err != null) return;
    _.each(filelist, function (file) { if (!(file in P)) vignorefiles.push('_obj.' + file); });
    
    _.each(encryptedfields, function (field) {
      if (field.type == 'encascii') {
        if ('hash' in field) {
          var hashfield = _.find(model.fields, function (xfield) { return xfield.name == field.hash; });
          if (typeof hashfield == 'undefined') throw new Error('Field ' + field.name + ' hash is not defined.');
          hashfields[field.name] = hashfield;
        }
      }
    });
    
    //Add key from query string	
    var keys = _this.getKeys(model.fields);
    _.each(keys, function (field) {
      var fname = field.name;
      if (fname in Q) {
        var dbtype = _this.getDBType(field);
        sql_ptypes.push(dbtype);
        sql_params[fname] = _this.DeformatParam(field, Q[fname], verrors);
      }
      else throw new Error('Missing parameter ' + fname);
    });
    
    //Remove blank password fields from fields array
    var fields = _this.getFieldsByName(model.fields, fieldlist, function(field){
      if((field.name in P)&&
         (field.control=='password')&&
         ((typeof P[field.name]=='undefined')||(P[field.name]===null)||(P[field.name]===''))&&
         !(field.controlparams && field.controlparams.update_when_blank))
        return false;
      return true;
    });
    var dbtasks = {};

    //Add fields from post
    if (fields.length > 0){
      _.each(fields, function (field) {
        var fname = field.name;
        if(field.sqlupdate==='') return;
        if (fname in P) {
          var dbtype = _this.getDBType(field);
          sql_ptypes.push(dbtype);
          sql_params[fname] = _this.DeformatParam(field, P[fname], verrors);
          //Add PreCheck, if type='F'
          if (Helper.hasAction(field.actions, 'F')) {
            _this.getDataLockSQL(req, model, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery, dfield) {
              if (dfield != field) return false;
              param_datalocks.push({ pname: fname, datalockquery: datalockquery, field: dfield });
              return true;
            });
          }
        }
        else throw new Error('Missing parameter ' + fname);
      });
      
      //Add DataLock parameters to SQL 
      _this.getDataLockSQL(req, model, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery) { datalockqueries.push(datalockquery); });
      
      verrors = _.merge(verrors, model.xvalidate.Validate('UK', _.merge(vfiles, sql_params), '', vignorefiles, req._roles));
      if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
      
      if (encryptedfields.length > 0) {
        //Add encrypted field
        var keyval = '';
        if (keys.length == 1) keyval = sql_params[keys[0].name];
        else throw new Error('File uploads require one key');
        _.each(encryptedfields, function (field) {
          var clearval = sql_params[field.name];
          if (clearval.length == 0) {
            sql_params[field.name] = null;
            if ('hash' in field) {
              var hashfield = hashfields[field.name];
              sql_ptypes.push(_this.getDBType(hashfield));
              sql_params[hashfield.name] = null;
            }
          }
          else {
            if (field.type == 'encascii') {
              if (!(field.password in _this.jsh.Config.passwords)) throw new Error('Encryption password not defined.');
              var cipher = crypto.createCipher('aes128', keyval + _this.jsh.Config.passwords[field.password]);
              cipher.update(clearval, 'ascii');
              sql_params[field.name] = cipher.final();
              if ('hash' in field) {
                var hashfield = hashfields[field.name];
                if (!(hashfield.salt in _this.jsh.Config.salts)) throw new Error('Hash salt not defined.');
                sql_ptypes.push(_this.getDBType(hashfield));
                sql_params[hashfield.name] = crypto.createHash('sha1').update(clearval + _this.jsh.Config.salts[hashfield.salt]).digest();;
              }
            }
          }
        });
      }
      
      var sql = db.sql.postModelForm(_this.jsh, model, fields, keys, sql_extfields, sql_extvalues, hashfields, param_datalocks, datalockqueries);
      
      dbtasks[fullmodelid] = function (dbtrans, callback, transtbl) {
        sql_params = _this.ApplyTransTblEscapedParameters(sql_params, transtbl);
        db.Row(req._DBContext, sql, sql_ptypes, sql_params, dbtrans, function (err, rslt, stats) {
          if (stats) stats.model = model;
          if ((err == null) && (rslt != null) && (_this.jsh.map.rowcount in rslt) && (rslt[_this.jsh.map.rowcount] == 0)) err = Helper.NewError('No records affected', -3, stats);
          if (err != null) { err.model = model; err.sql = sql; }
          else if (fileops.length > 0) {
            //Set keyval and move files, if applicable
            var keyval = '';
            if (keys.length == 1) keyval = sql_params[keys[0].name];
            else throw new Error('File uploads require one key');
            return _this.ProcessFileOperations(keyval, fileops, rslt, stats, callback);
          }
          callback(err, rslt, stats);
        });
      };
    }
    else if(fileops.length > 0){
      verrors = _.merge(verrors, model.xvalidate.Validate('UK', _.merge(vfiles, sql_params), '', vignorefiles, req._roles));
      if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
      
      dbtasks[fullmodelid] = function(dbtrans, callback, transtbl){
        sql_params = _this.ApplyTransTblEscapedParameters(sql_params, transtbl);
        var keyval = '';
        if (keys.length == 1) keyval = sql_params[keys[0].name];
        else throw new Error('File uploads require one key');
        return _this.ProcessFileOperations(keyval, fileops, {}, {}, callback);
      };
    }

    if (fileops.length > 0) dbtasks['_POSTPROCESS'] = function (callback) {
      _this.ProcessFileOperationsDone(fileops, callback);
    }

    return onComplete(null, dbtasks);
  });
}

exports.deleteModelForm = function (req, res, fullmodelid, Q, P, onComplete) {
  if (!this.jsh.hasModel(req, fullmodelid)) throw new Error("Error: Model " + fullmodelid + " not found in collection.");
  var _this = this;
  var model = this.jsh.getModel(req, fullmodelid);
  if (!Helper.hasModelAction(req, model, 'D')) { Helper.GenError(req, res, -11, 'Invalid Model Access for '+fullmodelid); return; }
  var keylist = this.getKeyNames(model.fields);
  var fieldlist = this.getFieldNames(req, model.fields, 'D');
  var filelist = this.getFileFieldNames(req, model.fields, '*');
  var db = _this.jsh.getModelDB(req, fullmodelid);
  
  var Qcheck = _.map(keylist, function (key) { return '&' + key; });
  Qcheck = Qcheck.concat(_.map(fieldlist, function (field) { return '|' + field; }));

  if (!_this.ParamCheck('Q', Q, Qcheck)) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  if (!_this.ParamCheck('P', P, [])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  
  var sql_ptypes = [];
  var sql_params = {};
  var verrors = {};
  var datalockqueries = [];
  var keys = _this.getKeys(model.fields);
  
  _.each(keys, function (field) {
    var fname = field.name;
    if (fname in Q) {
      var dbtype = _this.getDBType(field);
      sql_ptypes.push(dbtype);
      sql_params[fname] = _this.DeformatParam(field, Q[fname], verrors);
    }
    else throw new Error('Missing parameter ' + fname);
  });
  
  //Add DataLock parameters to SQL 
  _this.getDataLockSQL(req, model, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery) { datalockqueries.push(datalockquery); });
  
  verrors = _.merge(verrors, model.xvalidate.Validate('K', sql_params));
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  
  var sql = db.sql.deleteModelForm(_this.jsh, model, keys, datalockqueries);
  
  var dbtasks = {};
  dbtasks[fullmodelid] = function (dbtrans, callback) {
    db.Row(req._DBContext, sql, sql_ptypes, sql_params, dbtrans, function (err, rslt, stats) {
      if (stats) stats.model = model;
      if ((err == null) && (rslt != null) && (_this.jsh.map.rowcount in rslt) && (rslt[_this.jsh.map.rowcount] == 0)) err = Helper.NewError('No records affected', -3, stats);
      if (err != null) { err.model = model; err.sql = sql; }
      callback(err, rslt, stats);
    });
  };
  //Add post-processing task to delete any files
  if (filelist.length > 0) {
    if (keys.length == 1) keyval = sql_params[keys[0].name];
    else throw new Error('File uploads require one key');
    if ((typeof keyval == 'undefined') || !keyval) return callback(Helper.NewError('Invalid file key', -13), null);
    
    var fileops = [];
    _.each(filelist, function (file) {
      var filefield = _this.getFieldByName(model.fields, file);
      //Delete file in post-processing
      fileops.push({ op: 'move', src: _this.jsh.Config.datadir + filefield.controlparams.data_folder + '/' + (filefield.controlparams.data_file_prefix||file) + '_' + keyval + ((filefield.controlparams._data_file_has_extension)?'%%%EXT%%%':''), dst: '' });
      //Delete thumbnails in post-processing
      if (filefield.controlparams.thumbnails) for (var tname in filefield.controlparams.thumbnails) {
        fileops.push({ op: 'move', src: _this.jsh.Config.datadir + filefield.controlparams.data_folder + '/' + (filefield.controlparams.data_file_prefix||field.name) + '_' + tname + '_' + keyval + ((filefield.controlparams._data_file_has_extension)?'%%%EXT%%%':''), dst: '' });
      }
    });
    dbtasks['_POSTPROCESS'] = function (callback) {
      _this.ProcessFileOperationsDone(fileops, callback);
    }
  }
  return onComplete(null, dbtasks);
}

return module.exports;