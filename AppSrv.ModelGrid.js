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
var HelperFS = require('./lib/HelperFS.js');
var _ = require('lodash');
var async = require('async');
var csv = require('csv');

module.exports = exports = {};

exports.getModelRecordset = function (req, res, fullmodelid, Q, P, rowlimit, options) {
  var _this = this;
  if (!options) options = {};
  var model = this.jsh.getModel(req, fullmodelid);
  if (!Helper.hasModelAction(req, model, 'B')) { Helper.GenError(req, res, -11, _this._tP('Invalid Model Access for @fullmodelid', { fullmodelid })); return; }
  var fieldlist = this.getFieldNames(req, model.fields, 'B');
  var filelist = this.getFileFieldNames(req, model.fields, 'B');
  var keylist = this.getKeyNames(model.fields);
  var allfieldslist = _.union(keylist, fieldlist);
  var availablesortfieldslist = this.getFieldNames(req, model.fields, 'BFK');
  var searchlist = this.getFieldNames(req, model.fields, 'FKS');
  searchlist = _.union(this.getFieldNames(req, model.fields, 'B', function(field){ if(field.disable_search){ return false; } return true; }), searchlist);
  searchlist = _.union(keylist, searchlist);
  var encryptedfields = this.getFields(req, model.fields, '*', function(field){ return field.type=='encascii'; });
  if (encryptedfields.length > 0) throw new Error('Encrypted fields not supported on GRID (field.type=encascii)');
  encryptedfields = this.getEncryptedFields(req, model.fields, 'S'); //Encrypted fields can be used for search
  if ((encryptedfields.length > 0) && !(req.secure) && (!_this.jsh.Config.system_settings.allow_insecure_http_encryption)) { Helper.GenError(req, res, -51, 'Encrypted / hash fields require HTTPS connection'); return; }
  var db = _this.jsh.getModelDB(req, fullmodelid);
  var dbcontext = _this.jsh.getDBContext(req, model, db);
  if ('d' in Q) P = JSON.parse(Q.d);
  
  if (!_this.ParamCheck('Q', Q, ['|rowstart', '|rowcount', '|sort', '|search', '|searchjson', '|d', '|meta', '|getcount'])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  if (!_this.ParamCheck('P', P, _.map(_.union(searchlist, ['_action']), function (search) { return '|' + search; }))) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }

  var getcount = ((('rowcount' in Q) && (Q.rowcount == -1)) || Q.getcount);
  var is_insert = (('_action' in P) && (P['_action'] == 'insert'));
  var is_browse = (('_action' in P) && (P['_action'] == 'browse'));
  delete P['_action'];

  //getQueryVars
  //Add query vars to Default, etc.
  
  var sql_ptypes = [];
  var sql_params = {};
  var verrors = {};
  var searchfields = this.getFieldsByName(model.fields, searchlist);
  var allfields = this.getFieldsByName(model.fields, allfieldslist);
  var sql_searchfields = [];
  _.each(searchfields, function (field) { if (field.name in P) { sql_searchfields.push(field); } });
  var sortfields = [];
  var searchparams = [];
  var datalockqueries = [];
  
  //Merge sort parameters with parameters from querystring
  var dsort = new Array();
  if (('sort' in Q) && (Q['sort'] != '')) dsort = JSON.parse(Q['sort']);
  else if ('sort' in model) dsort = model['sort'];
  
  //Check against allfieldslist
  var unsortedkeys = keylist.slice();
  _.each(dsort, function (val) {
    if (!_.isString(val)) throw new Error('Invalid sort string');
    if (val.length < 2) throw new Error('Invalid sort string');
    var sortfield = val.substring(1);
    var lovtxtfield = '';
    if(sortfield.indexOf('__'+_this.jsh.map.code_txt+'__')==0){
      lovtxtfield = sortfield;
      sortfield = sortfield.substr(_this.jsh.map.code_txt.length + 4);
    }
    var sortdir = val[0];
    if (sortdir == 'v') sortdir = 'desc';
    else if (sortdir == '^') sortdir = 'asc';
    else throw new Error('Invalid sort string');
    if (!_.includes(availablesortfieldslist, sortfield)) throw new Error('Invalid sort field ' + sortfield);
    
    let field = _this.getFieldByName(model.fields, sortfield);
    var sortfieldname = sortfield;
    if(lovtxtfield && field.lov && !field.lov.showcode) sortfieldname = lovtxtfield;
    sortfields.push({ 'field': sortfieldname, 'dir': sortdir, 'sql': (field.sqlsort || '') });
    
    if (_.includes(unsortedkeys, sortfield)) unsortedkeys = _.without(unsortedkeys, sortfield);
  });
  if (unsortedkeys.length > 0) _.each(unsortedkeys, function (keyname) {
    sortfields.push({ 'field': keyname, 'dir': 'asc', 'sql': '' });
  });
  
  //Set search parameters
  if (('searchjson' in Q) && (Q.searchjson != '')) {
    var search_items = [];
    try{
      search_items = JSON.parse(Q.searchjson);
    }
    catch(ex){
      Helper.GenError(req, res, -4, 'Invalid Parameters');
      return;
    }
    var search_join = 'and';
    if (_.isArray(search_items) && (search_items.length > 0)) {
      for (let i = 0; i < search_items.length; i++) {
        var search_column = search_items[i].Column;
        var search_value = search_items[i].Value;
        var search_comparison = 'contains';
        if ('Comparison' in search_items[i]) search_comparison = search_items[i].Comparison;
        if ('Join' in search_items[i]) search_join = search_items[i].Join;
        if (typeof search_column == 'undefined') continue;
        if (typeof search_value == 'undefined') continue;
        if (!(_.includes(['>', '<', '>=', '<=', '=', '<>', 'contains', 'notcontains', 'beginswith', 'endswith', 'null', 'notnull', 'soundslike'], search_comparison))) continue;
        if ((search_join != 'and') && (search_join != 'or')) continue;
        search_value = search_value.toString().trim();
        if ((search_value == '') && (search_comparison != 'null') && (search_comparison != 'notnull')) continue;
        search_column = search_column.toString();
        if (search_column != 'ALL') {
          var found_col = false;
          _.each(searchlist, function (searchlistcol) {
            if (search_column == searchlistcol) { search_column = searchlistcol; found_col = true; }
          });
          if (!found_col) throw new Error('Invalid search field ' + search_column);
        }
        //Process search item
        if (search_column == 'ALL') {
          if (searchlist.length == 0) continue;
          var searchall = [];
          var searchlistfields = this.getFieldsByName(model.fields, searchlist);
          _.each(searchlistfields, function (field) {
            if(field.disable_search_all) return;
            if(!('disable_search_all' in field) && field.disable_search) return;
            var searchtermsql = _this.addSearchTerm(req, model, field, i, search_value, search_comparison, sql_ptypes, sql_params, verrors, { search_all: true });
            if (searchtermsql) {
              if (searchall.length) searchall.push('or');
              searchall.push(searchtermsql);
            }
          });
          if (searchall.length) {
            if (searchparams.length) searchparams.push(search_join);
            searchparams.push(searchall);
          }
        }
        else {
          let field = this.getFieldByName(model.fields, search_column);
          var searchtermsql = this.addSearchTerm(req, model, field, i, search_value, search_comparison, sql_ptypes, sql_params, verrors);
          if (searchtermsql) {
            if (searchparams.length) searchparams.push(search_join);
            searchparams.push(searchtermsql);
          }
        }
      }
    }
  }
  
  if (model.grid_require_search && !searchparams.length) searchparams.push('1=0');
  
  //Apply rowstart
  var rowstart = 0;
  if ('rowstart' in Q) rowstart = parseInt(Q['rowstart']);
  if (rowstart <= 0) rowstart = 0;
  
  //Apply rowcount
  if (typeof rowlimit == 'undefined') {
    if ('rowlimit' in model) rowlimit = model.rowlimit;
    else rowlimit = _this.jsh.Config.default_rowlimit;
  }
  var rowcount = rowlimit;
  if ('rowcount' in Q) {
    rowcount = parseInt(Q['rowcount']);
    if (rowcount <= 0) rowcount = rowlimit;
    if (rowcount > rowlimit) rowcount = rowlimit;
  }
  
  var keys = searchfields;
  for (let i = 0; i < keys.length; i++) {
    let field = keys[i];
    var fname = field.name;
    if ((fname in P) && !(fname in sql_params)) {
      var dbtype = _this.getDBType(field);
      sql_ptypes.push(dbtype);
      sql_params[fname] = _this.DeformatParam(field, P[fname], verrors);
    }
  }
  for (let i = 0; i < model.fields.length; i++){
    let field = model.fields[i];
    if(field.lov && field.lov.sqlselect && field.lov.sqlselect_params){
      for(var j = 0; j < field.lov.sqlselect_params.length; j++){
        if(!(field.lov.sqlselect_params[j] in P)){ Helper.GenError(req, res, -99999, model.id + ' > ' + field.name + ': Missing lov.sqlselect parameter @'+field.lov.sqlselect_params[j] + ' - grid parameters must be passed in the querystring or bindings.  The lov.sqlselect is inserted into the grid select statement; if this is a per-record lookup, use the expression LOVSQLTABLE.FIELD = MODELTABLE.FIELD'); return; }
      }
    }
  }
  //Add DataLock parameters to SQL
  this.getDataLockSQL(req, model, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery) { datalockqueries.push(datalockquery); }, null, fullmodelid);
  verrors = _.merge(verrors, model.xvalidate.Validate('BFK', sql_params, undefined, undefined, undefined, { ignoreUndefined: true }));
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  
  var dbsql = db.sql.getModelRecordset(_this.jsh, model, sql_searchfields, allfields, sortfields, searchparams, datalockqueries, rowstart, rowcount + 1);
  
  //Add dynamic parameters from query string
  var dbtasks = {};
  var dbtaskname = fullmodelid;
  if (!is_insert) {
    dbtasks[dbtaskname] = function (dbtans, callback) {
      db.Recordset(dbcontext, dbsql.sql, sql_ptypes, sql_params, dbtans, function (err, rslt, stats) {
        if (err != null) { err.model = model; err.sql = dbsql.sql; }
        else {
          if (stats) stats.model = model;
          if ((rslt != null) && (rslt.length > rowcount)) {
            rslt.pop();
            rslt.push({ '_eof': false });
          }
          else rslt.push({ '_eof': true });

          //Verify files exist on disk
          if (filelist.length > 0) {
            if (keylist.length != 1) throw new Error('File download requires one key in the model');
            //For each row
            async.eachOfLimit(rslt, 4, function(row, rownum, rowcallback){
              if('_eof' in row) return rowcallback();
              var filerslt = {};
              var keyval = row[keylist[0]];
              if(!keyval) throw new Error('Cannot process file fields in row #'+rownum+'.  Key field not found in database select results.');
              //For each file field
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
              }, function(err){
                if(err) return rowcallback(err);
                _.merge(row, filerslt);
                return rowcallback();
              });
            }, function (err) {
              if (err != null){
                _this.jsh.Log.error(err);
                return callback(Helper.NewError('Error performing file operation', -99999));
              }
              callback(null, rslt, stats);
            });
            return;
          }
        }
        callback(err, rslt, stats);
      });
    };
  }
  else {
    dbtasks[fullmodelid] = function (dbtrans, callback) {
      var rslt = [];
      callback(null, rslt);
    };
  }
  
  if (getcount) {
    dbtasks['_count_' + dbtaskname] = function (dbtrans, callback) {
      db.Row(dbcontext, dbsql.rowcount_sql, sql_ptypes, sql_params, dbtrans, function (err, rslt, stats) {
        if ((err == null) && (rslt == null)) err = Helper.NewError('Count not found', -14);
        if (err != null) { err.model = model; err.sql = dbsql.rowcount_sql; }
        if (stats) stats.model = model;
        callback(err, rslt, stats);
      });
    };
  }
  if (Q.meta) {
    if(_this.addDefaultTasks(req, res, model, P, dbtasks)===false) return;
    if(_this.addLOVTasks(req, res, model, P, dbtasks, { action: (is_browse?'B':model.actions) })===false) return;
    if(_this.addBreadcrumbTasks(req, res, model, P, dbtasks, 'B')===false) return;
    if(_this.addTitleTasks(req, res, model, P, dbtasks, (is_browse?'B':'U'))===false) return;
  }
  return dbtasks;
};

exports.exportCSV = function (req, res, dbtasks, fullmodelid, options) {
  var _this = this;
  var jsh = _this.jsh;
  if (!jsh.hasModel(req, fullmodelid)) throw new Error('Model not found');
  options = _.extend({ /* columns: '["column1","column2"]'  */ }, options);
  var model = jsh.getModel(req, fullmodelid);
  if(model.disable_csv_export) return Helper.GenError(req, res, -9, 'CSV Export of this data not supported');
  var db = _this.jsh.getModelDB(req, fullmodelid);
  if(options.columns){
    if(_.isString(options.columns)){
      try {
        options.columns = JSON.parse(options.columns);
      }
      catch (e) {
        return Helper.GenError(req, res, -4, 'Invalid Parameters: ' + e.toString());
      }
    }
    if(!_.isArray(options.columns)) return Helper.GenError(req, res, -4, 'Invalid Parameters');
  }
  //Get list of columns to display
  var exportColumns = _this.getFieldNames(req, model.fields, 'B', function(field){
    if(!('caption' in field)) return false;
    if(field.control=='hidden') return false;
    if(options.columns && !_.includes(options.columns, field.name)) return false;
    return true;
  });

  //Execute SQL
  dbtasks = _.reduce(dbtasks, function (rslt, dbtask, key) { rslt[key] = async.apply(dbtask, undefined); return rslt; }, {});
  db.ExecTasks(dbtasks, function (err, rslt, stats) {
    if (err != null) { _this.AppDBError(req, res, err, stats); return; }
    if (!(fullmodelid in rslt)) throw new Error('DB result missing model.');
    var eof = false;
    if (_.isArray(rslt[fullmodelid]) && (_.isObject(rslt[fullmodelid][rslt[fullmodelid].length - 1])) && ('_eof' in rslt[fullmodelid][rslt[fullmodelid].length - 1])) {
      var rslt_eof = rslt[fullmodelid].pop();
      eof = rslt_eof._eof;
    }
    //Add header
    if (rslt[fullmodelid].length > 0) {
      var header = {};
      var frow = _.extend({}, rslt[fullmodelid][0]);
      for (let fcol in frow) {
        //Ignore columns that should not be exported
        if(!_.includes(exportColumns, fcol)){ delete frow[fcol]; continue; }
        var field = _this.getFieldByName(model.fields, fcol);
        if (field && ('caption' in field)) { header[fcol] = field.caption_ext || field.caption; }
        else if (fcol.indexOf('__' + jsh.map.code_txt + '__') == 0) {
          field = _this.getFieldByName(model.fields, fcol.substr(('__' + jsh.map.code_txt + '__').length));
          if (field && ('caption' in field)) { header[fcol] = (field.caption_ext || field.caption || '') + ' Desc'; }
          else header[fcol] = fcol;
        }
        else header[fcol] = fcol;
      }
      rslt[fullmodelid].unshift(header);
      var dataidx = 1;
      //If data was truncated, add notification row
      if (!eof) {
        var eofrow = {};
        for (let fcol in frow) {
          eofrow[fcol] = '';
        }
        for (let fcol in frow) {
          eofrow[fcol] = 'Data exceeded limit of ' + _this.jsh.Config.export_rowlimit + ' rows, data has been truncated.';
          break;
        }
        rslt[fullmodelid].unshift(eofrow);
        dataidx++;
      }
      //Process data
      for (var i = dataidx; i < rslt[fullmodelid].length; i++) {
        var crow = rslt[fullmodelid][i];
        for (let ccol in crow) {
          if(!ccol) continue;
          //Overwrite code_val with code_txt
          if(Helper.beginsWith(ccol, '__'+jsh.map.code_txt+'__')){
            var lovval = crow[ccol];
            if(lovval !== null) crow[ccol.substr(jsh.map.code_txt.length+4)] = crow[ccol];
          }
          //Replace Dates with ISO String
          if (_.isDate(crow[ccol])) {
            crow[ccol] = crow[ccol].toISOString();//.replace('T', ' ').replace('Z', '');
          }
        }
        for (let ccol in crow) {
          if(!_.includes(exportColumns, ccol)){ delete crow[ccol]; continue; }
        }
      }
    }
    //No results found
    res.writeHead(200, {
      'Content-Type': 'text/csv',
      //'Content-Length': stat.size,
      'Content-Disposition': 'attachment; filename=' + encodeURIComponent(fullmodelid + '.csv')
    });
    csv.stringify(rslt[fullmodelid], { quotedString: true }).pipe(res);
  });
};

return module.exports;