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

var DB = require('jsharmony-db');
var types = DB.types;
var _ = require('lodash');

exports = module.exports = {};

exports.getModelRecordset = function (ent, model, sql_filterfields, allfields, sortfields, searchfields, datalockqueries,
                                      rowstart, rowcount) {
  var sql = '';
  var rowcount_sql = '';
  var bcrumb_sql = '';
  var sql_suffix = '';
  
  sql_suffix = ' from ' + model.table + ' where ';
  
  //Generate SQL Suffix (where condition)
  if (('sqlwhere' in model) && model.sqlwhere) sql_suffix += model.sqlwhere;
  else sql_suffix += '1=1';
  //_.each(datalockfields, function (val) { sql_suffix += ' and ' + val + '=@datalock_' + val; });
  _.each(sql_filterfields, function (field) {
    if ('sqlwhere' in field) sql_suffix += ' and ' + parseSQL(ent, field.sqlwhere);
    else sql_suffix += ' and ' + field.name + '=@' + field.name;
  });
  sql_suffix += ' %%%DATALOCKS%%% %%%SEARCH%%%';
  
  //Generate beginning of select statement
  if (!('sqlselect' in model)) {
    sql = 'select ';
    for (var i = 0; i < allfields.length; i++) {
      var field = allfields[i];
      if (i > 0) sql += ',';
      if ('sqlselect' in field) sql += parseSQL(ent, field.sqlselect) + ' as ' + field.name;
      else sql += field.name;
      if ('lov' in field) sql += ',' + exports.getLOVFieldTxt(ent, model, field);
    }
    sql += sql_suffix + ' order by %%%SORT%%% limit %%%ROWCOUNT%%% offset %%%ROWSTART%%%';
  }
  else sql = parseSQL(ent, model.sqlselect);
  if (!('sqlrowcount' in model)) {
    rowcount_sql = 'select count(*) as cnt' + sql_suffix;
  }
  else rowcount_sql = parseSQL(ent, model.sqlrowcount);
  
  //Generate sort sql
  var sortstr = '';
  _.each(sortfields, function (sortfield) {
    if (sortstr != '') sortstr += ',';
    //Get sort expression
    sortstr += (sortfield.sql ? parseSQL(ent, sortfield.sql) : sortfield.field) + ' ' + sortfield.dir;
  });
  if (sortstr == '') sortstr = '1';
  
  var searchstr = '';
  var parseSort = function (_searchfields) {
    var rslt = '';
    _.each(_searchfields, function (searchfield) {
      if (_.isArray(searchfield)) {
        if (searchfield.length) rslt += ' (' + parseSort(searchfield) + ')';
      }
      else if (searchfield) rslt += ' ' + searchfield;
    });
    return rslt;
  }
  if (searchfields.length) searchstr = ' and (' + parseSort(searchfields) + ')';
  
  //Replace parameters
  sql = sql.replace('%%%ROWSTART%%%', rowstart);
  sql = sql.replace('%%%ROWCOUNT%%%', rowcount);
  sql = sql.replace('%%%SEARCH%%%', searchstr);
  sql = sql.replace('%%%SORT%%%', sortstr);
  rowcount_sql = rowcount_sql.replace('%%%SEARCH%%%', searchstr);
  
  var datalockstr = '';
  _.each(datalockqueries, function (datalockquery) { datalockstr += ' and ' + datalockquery; });
  sql = DB.util.ReplaceAll(sql, '%%%DATALOCKS%%%', datalockstr);
  rowcount_sql = DB.util.ReplaceAll(rowcount_sql, '%%%DATALOCKS%%%', datalockstr);
  
  return { sql: sql, rowcount_sql: rowcount_sql };
}

exports.getModelForm = function (ent, model, selecttype, allfields, sql_filterkeys, datalockqueries, sortfields) {
  var sql = '';
  
  if (!('sqlselect' in model)) {
    sql = 'select ';
    for (var i = 0; i < allfields.length; i++) {
      var field = allfields[i];
      if (i > 0) sql += ',';
      if ('sqlselect' in field) sql += parseSQL(ent, field.sqlselect) + ' as ' + field.name;
      else sql += field.name;
      if ('lov' in field) sql += ',' + exports.getLOVFieldTxt(ent, model, field);
    }
    var tbl = model.table;
    sql += ' from ' + tbl + ' where ';
    if (('sqlwhere' in model) && model.sqlwhere) sql += parseSQL(ent, model.sqlwhere);
    else sql += '1=1';
    sql += ' %%%DATALOCKS%%%';
    
    //Add Keys to where
    _.each(sql_filterkeys, function (val) { sql += ' and ' + val + '=@' + val; });
    
    if (selecttype == 'multiple') sql += ' order by %%%SORT%%%';
  }
  else sql = parseSQL(ent, model.sqlselect);
  
  var datalockstr = '';
  _.each(datalockqueries, function (datalockquery) { datalockstr += ' and ' + datalockquery; });
  sql = DB.util.ReplaceAll(sql, '%%%DATALOCKS%%%', datalockstr);
  
  if (selecttype == 'multiple') {
    //Generate sort sql
    var sortstr = '';
    _.each(sortfields, function (sortfield) {
      if (sortstr != '') sortstr += ',';
      //Get sort expression
      sortstr += (sortfield.sql ? parseSQL(ent, sortfield.sql) : sortfield.field) + ' ' + sortfield.dir;
    });
    if (sortstr == '') sortstr = '1';
    sql = sql.replace('%%%SORT%%%', sortstr);
  }
  
  return sql;
}

exports.getModelMultisel = function (ent, model, lovfield, allfieldslist, sql_filterkeys, datalockqueries, lov_datalockqueries, param_datalocks) {
  var sql = '';
  
  if (!('sqlselect' in model)) {
    var tbl = model.table;
    sql = 'select '+allfieldslist.join(',');
    sql += ' ,coalesce(' + ent.map.codeval + '::text,' + lovfield.name + '::text) ' + ent.map.codeval + ',coalesce(coalesce(codetxt::text,' + ent.map.codeval + '::text),' + lovfield.name + '::text) ' + ent.map.codetxt;
    sql += ' from (select * from ' + tbl + ' where 1=1 %%%DATALOCKS%%%';
    //Add Keys to where
    if (sql_filterkeys.length) _.each(sql_filterkeys, function (val) { sql += ' and ' + val + '=@' + val; });
    else sql += ' and 0=1';
    sql += ') ' + tbl;
    sql += ' full outer join (%%%LOVSQL%%%) multiparent on multiparent.' + ent.map.codeval + ' = ' + tbl + '.' + lovfield.name;
    sql += ' order by ' + ent.map.codeseq + ',' + ent.map.codetxt;
  }
  else sql = parseSQL(ent, model.sqlselect);
  
  var datalockstr = '';
  _.each(datalockqueries, function (datalockquery) { datalockstr += ' and ' + datalockquery; });
  sql = DB.util.ReplaceAll(sql, '%%%DATALOCKS%%%', datalockstr);
  
  //Add LOVSQL to SQL
  var lovsql = '';
  var lov = lovfield.lov;
  if ('sql' in lov) { lovsql = lov['sql']; }
  else if ('UCOD' in lov) { lovsql = 'select ' + ent.map.codeval + ',' + ent.map.codetxt + ',' + ent.map.codeseq + ' from UCOD_' + lov['UCOD'] + ' where (CODETDT is null or CODETDT>current_date)'; }
  else if ('GCOD' in lov) { lovsql = 'select ' + ent.map.codeval + ',' + ent.map.codetxt + ',' + ent.map.codeseq + ' from GCOD_' + lov['GCOD'] + ' where (CODETDT is null or CODETDT>current_date)'; }
  else throw new Error('LOV type not supported.');
  
  if ('sql' in lov) {
    //Add datalocks for dynamic LOV SQL
    var datalockstr = '';
    _.each(lov_datalockqueries, function (datalockquery) { datalockstr += ' and ' + datalockquery; });
    if (datalockstr) {
      if (!(lovsql.indexOf('%%%DATALOCKS%%%') >= 0)) throw new Error('LOV SQL missing %%%DATALOCKS%%% in query');
      lovsql = DB.util.ReplaceAll(lovsql, '%%%DATALOCKS%%%', datalockstr);
    }
    else lovsql = lovsql.replace('%%%DATALOCKS%%%', '');
  }
  
  sql = sql.replace('%%%LOVSQL%%%', lovsql);
  
  //Add datalocks for dynamic query string parameters
  _.each(param_datalocks, function (param_datalock) {
    sql = addDataLockSQL(sql, "select @" + param_datalock.pname + " as " + param_datalock.pname, param_datalock.datalockquery);
  });
  
  return sql;
}

exports.getTabCode = function (ent, model, selectfields, keylist, datalockqueries) {
  var sql = '';
  
  if (!('sqlselect' in model)) {
    sql = 'select ';
    for (var i = 0; i < selectfields.length; i++) {
      var field = selectfields[i];
      if (i > 0) sql += ',';
      if ('sqlselect' in field) sql += parseSQL(ent, field.sqlselect) + ' as ' + field.name;
      else sql += field.name;
    }
    var tbl = model.table;
    sql += ' from ' + tbl + ' where ';
    if (('sqlwhere' in model) && model.sqlwhere) sql += parseSQL(ent, model.sqlwhere);
    else sql += '1=1';
    sql += ' %%%DATALOCKS%%%';
    _.each(keylist, function (val) { sql += ' and ' + val + '=@' + val; });
  }
  else sql = parseSQL(ent, model.sqlselect);
  
  var datalockstr = '';
  _.each(datalockqueries, function (datalockquery) { datalockstr += ' and ' + datalockquery; });
  sql = DB.util.ReplaceAll(sql, '%%%DATALOCKS%%%', datalockstr);
  
  return sql;
}

exports.putModelForm = function (ent, model, fieldlist, keys, sql_extfields, sql_extvalues, encryptedfields, enc_datalockqueries, param_datalocks) {
  var sql = '';
  var enc_sql = '';
  
  var sql_fields = fieldlist.concat(sql_extfields).join(',');
  var sql_values = _.map(fieldlist, function (val) { return '@' + val; }).concat(sql_extvalues).join(',');
  if (!('sqlinsert' in model)) {
    var tbl = model.table;
    sql = 'with xrslt as (insert into ' + tbl + '(' + sql_fields + ') ';
    sql += ' values(' + sql_values + ')';
    //Add Keys to where
    if (keys.length == 1) sql += ' returning ' + keys[0].name + ' as ' + keys[0].name + ') select ' + keys[0].name + ' from xrslt;';
    else if (keys.length > 1) throw new Error('Multi-column keys not supported on insert.');
    else sql += ' returning 1) select count(*) xrowcount from xrslt;';
  }
  else {
    sql = parseSQL(ent, model.sqlinsert);
    sql = DB.util.ReplaceAll(sql, '%%%TABLE%%%', model.table);
    sql = DB.util.ReplaceAll(sql, '%%%FIELDS%%%', sql_fields);
    sql = DB.util.ReplaceAll(sql, '%%%VALUES%%%', sql_values);
  }
  
  if (encryptedfields.length > 0) {
    if (!('sqlinsertencrypt' in model)) {
      var tbl = model.table;
      enc_sql = 'with xrslt as (update ' + tbl + ' set ' + _.map(encryptedfields, function (field) { var rslt = field.name + '=@' + (field.name); if ('hash' in field) rslt += ',' + field.hash + '=@' + field.hash; return rslt; }).join(',');
      enc_sql += ' where 1=1 %%%DATALOCKS%%%';
      //Add Keys to where
      _.each(keys, function (key) {
        enc_sql += ' and ' + key.name + '=@' + key.name;
      });
      enc_sql += ' returning 1) select count(*) xrowcount from xrslt;';
    }
    else enc_sql = parseSQL(ent, model.sqlinsertencrypt);
    
    var enc_datalockstr = '';
    _.each(enc_datalockqueries, function (datalockquery) { enc_datalockstr += ' and ' + datalockquery; });
    enc_sql = DB.util.ReplaceAll(enc_sql, '%%%DATALOCKS%%%', datalockstr);
  }
  
  _.each(param_datalocks, function (param_datalock) {
    sql = addDataLockSQL(sql, "select @" + param_datalock.pname + " as " + param_datalock.pname, param_datalock.datalockquery);
  });
  
  return { sql: sql, enc_sql: enc_sql };
}

exports.postModelForm = function (ent, model, fields, keylist, sql_extfields, sql_extvalues, param_datalocks, datalockqueries) {
  var sql = '';
  
  if (!('sqlupdate' in model)) {
    var tbl = model.table;
    sql = 'with xrslt as (update ' + tbl + ' set ' + _.map(fields, function (field) { if (field && field.sqlupdate) return field.name + '=' + parseSQL(ent, field.sqlupdate); return field.name + '=@' + (field.name); }).join(',');
    if (sql_extfields.length > 0) {
      var sql_extsql = '';
      for (var i = 0; i < sql_extfields.length; i++) {
        if (sql_extsql != '') sql_extsql += ',';
        sql_extsql += sql_extfields[i] + '=' + sql_extvalues[i];
      }
      if (fields.length > 0) sql += ',';
      sql += sql_extsql;
    }
    sql += ' where 1=1 %%%DATALOCKS%%%';
    //Add Keys to where
    _.each(keylist, function (val) { sql += ' and ' + val + '=@' + val; });
    sql += ' returning 1) select count(*) xrowcount from xrslt;';
  }
  else sql = parseSQL(ent, model.sqlupdate);
  
  _.each(param_datalocks, function (param_datalock) {
    sql = addDataLockSQL(sql, "select @" + param_datalock.pname + " as " + param_datalock.pname, param_datalock.datalockquery);
  });
  
  var datalockstr = '';
  _.each(datalockqueries, function (datalockquery) { datalockstr += ' and ' + datalockquery; });
  sql = DB.util.ReplaceAll(sql, '%%%DATALOCKS%%%', datalockstr);
  
  return sql;
}

exports.postModelMultisel = function (ent, model, lovfield, lovvals, filterlist, param_datalocks, datalockqueries, lov_datalockqueries) {
  var sql = '';
  
  if (!('sqlupdate' in model)) {
    var tbl = model.table;
    sql = 'with xrslt_delete as (delete from ' + tbl + ' where 1=1 ';
    _.each(filterlist, function (val) { sql += ' and ' + val + '=@' + val; });
    if (lovvals.length > 0) {
      sql += ' and ' + lovfield.name + '::text not in (';
      for (var i = 0; i < lovvals.length; i++) { if (i > 0) sql += ','; sql += '@multisel' + i; }
      sql += ')';
    }
    sql += ' %%%DATALOCKS%%% returning 1),xrslt_insert as (';
    if (lovvals.length > 0) {
      sql += 'insert into ' + tbl + '(';
      sql += filterlist.join(',');
      sql += ',' + lovfield.name + ') select '
      _.each(filterlist, function (val) { sql += '@' + val + ','; });
      sql += ent.map.codeval + ' from (%%%LOVSQL%%%) multiparent where ' + ent.map.codeval + '::text in ('
      for (var i = 0; i < lovvals.length; i++) { if (i > 0) sql += ','; sql += '@multisel' + i; }
      sql += ') and ' + ent.map.codeval + ' not in (select ' + lovfield.name + ' from ' + tbl + ' where 1=1 ';
      _.each(filterlist, function (val) { sql += ' and ' + val + '=@' + val; });
      sql += ' %%%DATALOCKS%%%) returning 1'
    }
    else sql += 'select 1 where 1=0';
    sql += ') select (select count(*) from xrslt_delete)+(select count(*) from xrslt_insert) xrowcount;';
  }
  else sql = parseSQL(ent, model.sqlupdate);
  
  _.each(param_datalocks, function (param_datalock) {
    sql = addDataLockSQL(sql, "select @" + param_datalock.pname + " as " + param_datalock.pname, param_datalock.datalockquery);
  });
  
  var datalockstr = '';
  _.each(datalockqueries, function (datalockquery) { datalockstr += ' and ' + datalockquery; });
  sql = DB.util.ReplaceAll(sql, '%%%DATALOCKS%%%', datalockstr);
  
  //Add LOVSQL to SQL
  var lovsql = '';
  var lov = lovfield.lov;
  if ('sql' in lov) { lovsql = lov['sql']; }
  else if ('UCOD' in lov) { lovsql = 'select ' + ent.map.codeval + ',' + ent.map.codetxt + ',' + ent.map.codeseq + ' from UCOD_' + lov['UCOD'] + ' where (CODETDT is null or CODETDT>current_date)'; }
  else if ('GCOD' in lov) { lovsql = 'select ' + ent.map.codeval + ',' + ent.map.codetxt + ',' + ent.map.codeseq + ' from GCOD_' + lov['GCOD'] + ' where (CODETDT is null or CODETDT>current_date)'; }
  else throw new Error('LOV type not supported.');
  
  if ('sql' in lov) {
    var datalockstr = '';
    _.each(lov_datalockqueries, function (datalockquery) { datalockstr += ' and ' + datalockquery; });
    if (datalockstr && (lovsql.indexOf('%%%DATALOCKS%%%') < 0)) throw new Error(field.name + ' LOV missing %%%DATALOCKS%%% in query');
    lovsql = lovsql.replace('%%%DATALOCKS%%%', datalockstr);
  }
  sql = sql.replace('%%%LOVSQL%%%', lovsql);
  
  return sql;
}

exports.postModelExec = function (ent, model, param_datalocks, datalockqueries) {
  var sql = parseSQL(ent, model.sqlexec);
  
  _.each(param_datalocks, function (param_datalock) {
    sql = addDataLockSQL(sql, "select @" + param_datalock.pname + " as " + param_datalock.pname, param_datalock.datalockquery);
  });
  
  var datalockstr = '';
  _.each(datalockqueries, function (datalockquery) { datalockstr += ' and ' + datalockquery; });
  sql = DB.util.ReplaceAll(sql, '%%%DATALOCKS%%%', datalockstr);
  
  return sql;
}

exports.deleteModelForm = function (ent, model, keylist, datalockqueries) {
  var sql = '';
  
  if (!('sqldelete' in model)) {
    var tbl = model.table;
    sql += 'with xrslt as (delete from ' + tbl + ' where 1=1 %%%DATALOCKS%%%';
    _.each(keylist, function (val) { sql += ' and ' + val + '=@' + val; });
    sql += ' returning 1) select count(*) xrowcount from xrslt;';
  }
  else sql = parseSQL(ent, model.sqldelete);
  
  var datalockstr = '';
  _.each(datalockqueries, function (datalockquery) { datalockstr += ' and ' + datalockquery; });
  sql = DB.util.ReplaceAll(sql, '%%%DATALOCKS%%%', datalockstr);
  
  return sql;
}

exports.Download = function (ent, model, fieldlist, keys, datalockqueries) {
  var sql = '';
  
  if (!('sqldownloadselect' in model)) {
    var tbl = model.table;
    sql = 'select ' + fieldlist.join(',') + ' from ' + tbl + ' where 1=1 %%%DATALOCKS%%%';
    //Add Keys to where
    _.each(keys, function (val) { sql += ' and ' + val + '=@' + val; });
  }
  else sql = parseSQL(ent, model.sqldownloadselect);
  
  var datalockstr = '';
  _.each(datalockqueries, function (datalockquery) { datalockstr += ' and ' + datalockquery; });
  sql = DB.util.ReplaceAll(sql, '%%%DATALOCKS%%%', datalockstr);
  
  return sql;
}

exports.parseReportSQLData = function (ent, dname, dparams, skipdatalock, datalockqueries) {
  var sql = parseSQL(ent, dparams.sql);
  var datalockstr = '';
  _.each(datalockqueries, function (datalockquery) { datalockstr += ' and ' + datalockquery; });
  if (!skipdatalock && (sql.indexOf('%%%DATALOCKS%%%') < 0)) { throw new Error('DataLocks missing in ' + dname + ' sql'); }
  
  sql = DB.util.ReplaceAll(sql, '%%%DATALOCKS%%%', datalockstr);
  
  return sql;
}

exports.runReportJob = function (ent, model, datalockqueries) {
  var sql = parseSQL(ent, model.jobqueue.sql);
  
  var datalockstr = '';
  _.each(datalockqueries, function (datalockquery) { datalockstr += ' and ' + datalockquery; });
  if (sql.indexOf('%%%DATALOCKS%%%') < 0) throw new Error('DataLocks missing in ' + model.id + ' job queue sql');
  sql = DB.util.ReplaceAll(sql, '%%%DATALOCKS%%%', datalockstr);
  
  return sql;
}

exports.getCMS_M = function (aspa_object) {
  return 'select M_Desc from ' + aspa_object + '_M where M_ID=1';
}

exports.getSearchTerm = function (ent, field, pname, search_value, comparison) {
  var sqlsearch = '';
  var fsql = field.name;
  if (field.sql_search) fsql = parseSQL(ent, field.sql_search);
  var ftype = field.type;
  var dbtype = null;
  switch (ftype) {
    case 'bit':
      dbtype = types.Bit;
      if (comparison == '<>') { sqlsearch = fsql + ' <> @' + pname; }
      else sqlsearch = fsql + ' = @' + pname;
    case 'bigint':
    case 'int':
    case 'smallint':
      dbtype = types.BigInt;
      if (comparison == '<>') { sqlsearch = fsql + ' <> @' + pname; }
      else if (comparison == '>') { sqlsearch = fsql + ' > @' + pname; }
      else if (comparison == '<') { sqlsearch = fsql + ' < @' + pname; }
      else if (comparison == '>=') { sqlsearch = fsql + ' >= @' + pname; }
      else if (comparison == '<=') { sqlsearch = fsql + ' <= @' + pname; }
      else sqlsearch = fsql + ' = @' + pname;
      break;
    case 'decimal':
      if (comparison == '<>') { sqlsearch = fsql + ' <> @' + pname; }
      else if (comparison == '>') { sqlsearch = fsql + ' > @' + pname; }
      else if (comparison == '<') { sqlsearch = fsql + ' < @' + pname; }
      else if (comparison == '>=') { sqlsearch = fsql + ' >= @' + pname; }
      else if (comparison == '<=') { sqlsearch = fsql + ' <= @' + pname; }
      else sqlsearch = fsql + ' = @' + pname;
      break;
    case 'varchar':
    case 'char':
      if (comparison == '=') { sqlsearch = fsql + ' = @' + pname; }
      else if (comparison == '<>') { sqlsearch = fsql + ' <> @' + pname; }
      else if (comparison == 'notcontains') { search_value = '%' + search_value + '%'; sqlsearch = fsql + ' not like @' + pname; }
      else if (comparison == 'beginswith') { search_value = search_value + '%'; sqlsearch = fsql + ' like @' + pname; }
      else if (comparison == 'endswith') { search_value = '%' + search_value; sqlsearch = fsql + ' like @' + pname; }
      else if ((comparison == 'soundslike') && (field.sql_search_sound)) { sqlsearch = parseSQL(ent, field.sql_search_sound).replace('%%%FIELD%%%', '@' + pname); }
      else { search_value = '%' + search_value + '%'; sqlsearch = fsql + ' like @' + pname; }
      dbtype = types.VarChar(search_value.length);
      break;
    case 'datetime':
    case 'date':
      dbtype = types.DateTime(7);
      if (comparison == '<>') { sqlsearch = fsql + ' <> @' + pname; }
      else if (comparison == '>') { sqlsearch = fsql + ' > @' + pname; }
      else if (comparison == '<') { sqlsearch = fsql + ' < @' + pname; }
      else if (comparison == '>=') { sqlsearch = fsql + ' >= @' + pname; }
      else if (comparison == '<=') { sqlsearch = fsql + ' <= @' + pname; }
      else sqlsearch = fsql + ' = @' + pname;
      break;
    case 'time':
      if (comparison == '<>') { sqlsearch = fsql + ' <> @' + pname; }
      else if (comparison == '>') { sqlsearch = fsql + ' > @' + pname; }
      else if (comparison == '<') { sqlsearch = fsql + ' < @' + pname; }
      else if (comparison == '>=') { sqlsearch = fsql + ' >= @' + pname; }
      else if (comparison == '<=') { sqlsearch = fsql + ' <= @' + pname; }
      else sqlsearch = fsql + ' = @' + pname;
      break;
      if (comparison == '<>') { sqlsearch = fsql + ' <> @' + pname; }
      else sqlsearch = fsql + ' = @' + pname;
      break;
    default: throw new Error('Search type ' + field.name + '/' + ftype + ' not supported.');
  }
  
  if (comparison == 'null') { sqlsearch = fsql + ' is null'; }
  else if (comparison == 'notnull') { sqlsearch = fsql + ' is not null'; }
  
  return { sql: sqlsearch, dbtype: dbtype, search_value: search_value };
}

exports.getDefaultTasks = function (ent, dflt_sql_fields) {
  var sql = '';
  var sql_builder = '';
  
  for (var i = 0; i < dflt_sql_fields.length; i++) {
    var field = dflt_sql_fields[i];
    var fsql = parseSQL(ent, field.sql);
    
    var datalockstr = '';
    _.each(field.datalockqueries, function (datalockquery) { datalockstr += ' and ' + datalockquery; });
    if (datalockstr && (fsql.indexOf('%%%DATALOCKS%%%') < 0)) throw new Error(field.name + ' Default missing %%%DATALOCKS%%% in query');
    fsql = fsql.replace('%%%DATALOCKS%%%', datalockstr);
    
    _.each(field.param_datalocks, function (param_datalock) {
      sql = addDataLockSQL(sql, "select @" + param_datalock.pname + " as " + param_datalock.pname, param_datalock.datalockquery);
    });
    
    if (sql_builder) sql_builder += ',';
    sql_builder += '(' + fsql + ') as "' + field.name + '"';
  }
  
  if (sql_builder) sql += 'select ' + sql_builder;
  
  return sql;
}

exports.getLOV = function (ent, fname, lov, datalockqueries, param_datalocks) {
  var sql = '';
  
  if ('sql' in lov) { sql = parseSQL(ent, lov['sql']); }
  else if ('sql2' in lov) { sql = parseSQL(ent, lov['sql2']); }
  else if ('sqlmp' in lov) { sql = parseSQL(ent, lov['sqlmp']); }
  else if ('UCOD' in lov) { sql = 'select ' + ent.map.codeval + ',' + ent.map.codetxt + ' from UCOD_' + lov['UCOD'] + ' where (CODETDT is null or CODETDT>current_date) order by ' + ent.map.codeseq + ',' + ent.map.codetxt; }
  else if ('UCOD2' in lov) { sql = 'select ' + ent.map.codeval + '1 as ' + ent.map.codeparent + ',' + ent.map.codeval + '2 as ' + ent.map.codeval + ',' + ent.map.codetxt + ' from UCOD2_' + lov['UCOD2'] + ' where (CODETDT is null or CODETDT>current_date) order by ' + ent.map.codeseq + ',' + ent.map.codetxt; }
  else if ('GCOD' in lov) { sql = 'select ' + ent.map.codeval + ',' + ent.map.codetxt + ' from GCOD_' + lov['GCOD'] + ' where (CODETDT is null or CODETDT>current_date) order by ' + ent.map.codeseq + ',' + ent.map.codetxt; }
  else if ('GCOD2' in lov) { sql = 'select ' + ent.map.codeval + '1 as ' + ent.map.codeparent + ',' + ent.map.codeval + '2 as ' + ent.map.codeval + ',' + ent.map.codetxt + ' from GCOD2_' + lov['GCOD2'] + ' where (CODETDT is null or CODETDT>current_date) order by ' + ent.map.codeseq + ',' + ent.map.codetxt; }
  else sql = 'select 1 as ' + ent.map.codeval + ',1 as ' + ent.map.codetxt + ' where 1=0';
  
  var datalockstr = '';
  _.each(datalockqueries, function (datalockquery) { datalockstr += ' and ' + datalockquery; });
  if (datalockstr && (sql.indexOf('%%%DATALOCKS%%%') < 0)) throw new Error(fname + ' LOV missing %%%DATALOCKS%%% in query');
  sql = sql.replace('%%%DATALOCKS%%%', datalockstr);
  
  _.each(param_datalocks, function (param_datalock) {
    sql = addDataLockSQL(sql, "select @" + param_datalock.pname + " as " + param_datalock.pname, param_datalock.datalockquery);
  });
  
  return sql;
}

exports.getLOVFieldTxt = function (ent, model, field) {
  var rslt = '';
  if (!field || !field.lov) return rslt;
  var lov = field.lov;
  
  var valsql = field.name;
  if ('sqlselect' in field) valsql += parseSQL(ent, field.sqlselect);
  
  var parentsql = '';
  if ('parent' in lov) {
    _.each(model.fields, function (pfield) {
      if (pfield.name == lov.parent) {
        if ('sqlselect' in pfield) parentsql += parseSQL(ent, pfield.sqlselect);
        else parentsql = pfield.name;
      }
    })
  }
  
  if ('sqlselect' in lov) { rslt = parseSQL(ent, lov['sqlselect']); }
  else if ('UCOD' in lov) { rslt = 'select ' + ent.map.codetxt + ' from UCOD_' + lov['UCOD'] + ' where ' + ent.map.codeval + '=(' + valsql + ')'; }
  else if ('UCOD2' in lov) {
    if (!parentsql) throw new Error('Parent field not found in LOV.');
    rslt = 'select ' + ent.map.codetxt + ' from UCOD2_' + lov['UCOD2'] + ' where ' + ent.map.codeval + '1=(' + parentsql + ') and ' + ent.map.codeval + '2=(' + valsql + ')';
  }
  else if ('GCOD' in lov) { rslt = 'select ' + ent.map.codetxt + ' from GCOD_' + lov['GCOD'] + ' where ' + ent.map.codeval + '=(' + valsql + ')'; }
  else if ('GCOD2' in lov) {
    if (!parentsql) throw new Error('Parent field not found in LOV.');
    rslt = 'select ' + ent.map.codetxt + ' from GCOD2_' + lov['GCOD2'] + ' where ' + ent.map.codeval + '1=(' + parentsql + ') and ' + ent.map.codeval + '2=(' + valsql + ')';
  }
  else rslt = "select NULL";
  
  rslt = '(' + rslt + ') as __' + ent.map.codetxt + '__' + field.name;
  return rslt;
}

exports.getBreadcrumbTasks = function (ent, model, datalockqueries, bcrumb_sql_fields) {
  var sql = parseSQL(ent, model.breadcrumbs.sql);
  _.each(datalockqueries, function (datalockquery) {
    sql = addDataLockSQL(sql, "%%%BCRUMBSQLFIELDS%%%", datalockquery);
  });
  if (bcrumb_sql_fields.length) {
    var bcrumb_sql = 'select ';
    for (var i = 0; i < bcrumb_sql_fields.length; i++) {
      if (i > 0) bcrumb_sql += ',';
      bcrumb_sql += "@" + bcrumb_sql_fields[i] + " as " + bcrumb_sql_fields[i];
    }
    sql = DB.util.ReplaceAll(sql, '%%%BCRUMBSQLFIELDS%%%', bcrumb_sql);
  }
  return sql;
}

function addDataLockSQL(sql, dsql, dquery){
  return "do $$begin if not exists(select * from ("+dsql+") dual where " + dquery + ") then raise exception 'INVALID ACCESS'; end if; end$$; \r\n" + sql;
}

function parseSQL(ent, sql) {
  return DB.ParseSQL(sql, ent);
}