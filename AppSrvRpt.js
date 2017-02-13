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
var phantomjs = require('phantomjs');
var phantom = require('phantom');
var path = require('path');
var fs = require('fs');
var mime = require('mime');
var tmp = require('tmp');
var async = require('async');
var HelperFS = require('./lib/HelperFS.js');
var Helper = require('./lib/Helper.js');
var ejs = require('ejs');
var ejsext = require('./lib/ejsext.js');
var moment = require('moment');

function AppSrvRpt(appsrv) {
  this.AppSrv = appsrv;
  this.phsession = null;
  this.phreqcount = 0;
  this.phqueue = null;
  this.InitReportQueue();
  process.addListener('exit', function (code) { if (this.phsession != null) { this.phsession.exit(); this.phsession = null; } });
}

AppSrvRpt.prototype.InitReportQueue = function () {
  var _this = this;
  this.phqueue = async.queue(function (task, done) {
    _this.genReport(task.modelid, task.params, task.data, done);
  }, 1);
}

AppSrvRpt.prototype.queueReport = function (req, res, modelid, Q, P, onComplete) {
  var thisapp = this.AppSrv;
  var jsh = thisapp.jsh;
  var _this = this;
  var model = thisapp.jsh.Models[modelid];
  if (!Helper.HasModelAccess(req, model, 'B')) { Helper.GenError(req, res, -11, 'Invalid Model Access'); return; }
  //Validate Parameters
  var fieldlist = thisapp.getFieldNames(req, model.fields, 'B');
  _.map(fieldlist, function (field) { if (!(field in Q)) Q[field] = ''; });
  if (!thisapp.ParamCheck('Q', Q, _.map(fieldlist, function (field) { return '&' + field; }))) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  if (!thisapp.ParamCheck('P', P, [])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  
  global.log("REPORT: " + req.originalUrl + " " + (req.user_id || '') + " " + (req.user_name || ''));
  
  var sql_ptypes = [];
  var sql_params = {};
  var verrors = {};
  
  var fields = thisapp.getFieldsByName(model.fields, fieldlist);
  if (fields.length == 0) return onComplete(null, null);
  _.each(fields, function (field) {
    var fname = field.name;
    if (fname in Q) {
      var dbtype = thisapp.getDBType(field);
      sql_ptypes.push(dbtype);
      sql_params[fname] = thisapp.DeformatParam(field, Q[fname], verrors);
    }
    else throw new Error('Missing parameter ' + fname);
  });
  verrors = _.merge(verrors, model.xvalidate.Validate('B', sql_params));
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  
  var dbtasks = {};

  this.parseReportSQLData(req, res, model, sql_ptypes, sql_params, verrors, dbtasks, model.reportdata);
  
  thisapp.db.ExecTasks(dbtasks, function (err, rslt) {
    if (err != null) { thisapp.AppDBError(req, res, err); return; }
    if (rslt == null) rslt = {};
    _this.MergeReportData(rslt, model.reportdata, null);
    _this.phqueue.push({ req: req, res: res, modelid: modelid, params: sql_params, data: rslt }, onComplete);
  });
};

AppSrvRpt.prototype.parseReportSQLData = function (req, res, model, sql_ptypes, sql_params, verrors, dbtasks, rdata) {
  var thisapp = this.AppSrv;
  var _this = this;
  _.each(rdata, function (dparams, dname) {
    if (!('sql' in dparams)) throw new Error(dname + ' missing sql');
    //Add DataLock parameters to SQL 
    var datalockqueries = [];
    thisapp.getDataLockSQL(req, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery) { datalockqueries.push(datalockquery); }, dparams.nodatalock);
    var skipdatalock = false;
    if ('nodatalock' in dparams) {
      var skipdatalock = true;
      for (datalockid in req.jshconfig.datalock) {
        if (dparams.nodatalock.indexOf(datalockid) < 0) skipdatalock = false;
      }
    }
    
    var sql = thisapp.db.sql.parseReportSQLData(thisapp.jsh, dname, dparams, skipdatalock, datalockqueries);
    
    dbtasks[dname] = function (callback) {
      thisapp.db.Recordset(req._DBContext, sql, sql_ptypes, sql_params, function (err, rslt) {
        if ((err == null) && (rslt == null)) err = Helper.NewError('Record not found', -1);
        if (err != null) { err.model = model; err.sql = sql; }
        callback(err, rslt);
      });
    }
    
    if ('children' in dparams) _this.parseReportSQLData(req, res, model, sql_ptypes, sql_params, verrors, dbtasks, dparams.children);
  });
}

AppSrvRpt.prototype.MergeReportData = function (data, tree, parent) {
  var _this = this;
  _.each(tree, function (leaf, name) {
    if ('children' in leaf) _this.MergeReportData(data, leaf.children, name);
    //Post-order traversal
    if (parent == null) return;
    if (!(parent in data)) throw new Error('No parent result set found for ' + name);
    if (!(name in data)) throw new Error('No result set found for ' + name);
    var pdata = data[parent];
    var cdata = data[name];
    var bindings = leaf.bindings;
    for (var i = 0; i < pdata.length; i++) {
      var prow = pdata[i];
      var pskip = false;
      _.each(bindings, function (bparent, bchild) {
        if (!(bparent in prow)) throw new Error('Parent result set ' + parent + ' missing binding ' + bparent);
        if (prow[bparent] === null) pskip = true;
      });
      prow[name] = [];
      if (pskip) continue;
      for (var j = 0; j < cdata.length; j++) {
        var crow = cdata[j];
        var bmatch = true;
        _.each(bindings, function (bparent, bchild) {
          if (!(bchild in crow)) throw new Error('Child result set ' + name + ' missing binding ' + bchild);
          if (crow[bchild] === null) bmatch = false;
          else if (prow[bparent] !== crow[bchild]) bmatch = false;
        });
        if (bmatch) {
          prow[name].push(crow);
          cdata.splice(j, 1);
          j--;
        }
      }
    }
    delete data[name];
  });
  //Parse tree bottom-up
  //  If leaf has no parent, return
  //  For each parent row
  //    Create array of CHILDNAME
  //      Add all records matching binding into CHILDNAME
  //  Delete leaf
}

function stringToAscii(s) {
  var ascii = "";
  if (s.length > 0)
    for (i = 0; i < s.length; i++) {
      var c = "" + s.charCodeAt(i);
      while (c.length < 3)
        c = "0" + c;
      ascii += c;
    }
  return (ascii);
}

AppSrvRpt.prototype.genReport = function (modelid, params, data, done) {
  var report_folder = global.datadir + 'temp/report/';
  var _this = this;
  if (modelid.indexOf('_report_') != 0) throw new Error('Model is not a report');
  var reportid = modelid.substr(8);
  HelperFS.createFolderIfNotExists(report_folder, function (err) {
    if (err) throw err;
    HelperFS.clearFiles(report_folder, global.public_temp_expiration, -1, function () {
      tmp.file({ dir: report_folder }, function (tmperr, tmppath, tmpfd) {
        if (tmperr) throw tmperr;
        _this.getPhantom(function (ph) {
          var page = null;
          try {
            ph.createPage().then(function (_page) {
              page = _page;
              
              var onLoadFinished = function (val) { //  /dev/stdout     path.dirname(module.filename)+'/out.pdf'
                var tmppdfpath = tmppath + '.pdf';
                page.render(tmppdfpath).then(function () {
                  var dispose = function (disposedone) {
                    page.close().then(function () {
                      page = null;
                      fs.close(tmpfd, function () {
                        fs.unlink(tmppath, function (err) {
                          if (typeof disposedone != 'undefined') disposedone();
                        });
                      });
                    }).catch(function (err) { global.log(err); });;
                  };
                  done(null, tmppdfpath, dispose);
                }).catch(function (err) { global.log(err); });
              }
              
              var ejsname = 'reports/' + reportid;
              var model = _this.AppSrv.jsh.Models[modelid];
              var ejsbody = _this.AppSrv.jsh.getEJS(ejsname);
              for (var i = model._inherits.length - 1; i >= 0; i--) {
                if (ejsbody != null) break;
                var ejsid = model._inherits[i];
                if (ejsid.substr(0, 8) == '_report_') {
                  ejsid = ejsid.substr(8);
                  ejsbody = _this.AppSrv.jsh.getEJS('reports/' + ejsid);
                }
              }
              if (ejsbody == null) ejsbody = 'REPORT BODY NOT FOUND';
              if (global.debug_params.report_debug) {
                ejsbody = ejsbody.replace(/{{(.*?)}}/g, '<%=ejsext.null_log($1,\'$1\')%>');
              }
              else {
                ejsbody = ejsbody.replace(/{{/g, '<%=(');
                ejsbody = ejsbody.replace(/}}/g, '||\'\')%>');
              }
              var body = ejs.render(ejsbody, {
                model: model,
                moment: moment,
                _this: _this,
                ejsext: ejsext,
                data: data,
                params: params,
                _: _,
                filename: _this.AppSrv.jsh.getEJSFilename(ejsname)
              });
              
              //page.set('viewportSize',{width:700,height:800},function(){
              
              var dpi = 1.3 * 72;
              var default_width = Math.floor(8.5 * dpi) + 'px';
              var default_height = Math.floor(11 * dpi) + ' px';
              var default_border = '1cm';//Math.floor(0.5 * dpi) + 'px';
              var default_header = '1cm';//Math.floor(0.4 * dpi) + 'px';
              
              var pagesettings = {
                format: 'letter',
                orientation: 'portrait',
                border: default_border,
              };
              var headerheight = default_header;
              var footerheight = default_header;
              if ('headerheight' in model) headerheight = model.headerheight;
              if ('footerheight' in model) footerheight = model.footerheight;
              if ('pageheader' in model) {
                var pageheader = model.pageheader;
                if (_.isArray(pageheader)) pageheader = pageheader.join('');
                var headcontent = "function (pageNum, numPages) { var txt = " +
                  JSON.stringify(_this.RenderEJS(pageheader, { model: model, moment: moment, data: data, pageNum: '{{pageNum}}', numPages: '{{numPages}}' })) +
                  "; txt = txt.replace(/{{pageNum}}/g,pageNum); txt = txt.replace(/{{numPages}}/g,numPages); return txt; }";
                pagesettings.header = {
                  height: headerheight,
                  contents: ph.callback(headcontent)
                };
              }
              if ('pagefooter' in model) {
                var pagefooter = model.pagefooter;
                if (_.isArray(pagefooter)) pagefooter = pagefooter.join('');
                var footcontent = "function (pageNum, numPages) { var txt = " +
                  JSON.stringify(_this.RenderEJS(pagefooter, { model: model, moment: moment, data: data, pageNum: '{{pageNum}}', numPages: '{{numPages}}' })) +
                  "; txt = txt.replace(/{{pageNum}}/g,pageNum); txt = txt.replace(/{{numPages}}/g,numPages); return txt; }";
                pagesettings.footer = {
                  height: footerheight,
                  contents: ph.callback(footcontent)
                };
              }
              if ('pagesettings' in model) pagesettings = _.merge(pagesettings, model.pagesettings);
              /*
              if (pagesettings.orientation == 'portrait') {
                if (!('height' in pagesettings)) pagesettings.height = default_height;
                if (!('width' in pagesettings)) pagesettings.width = default_width;
              }
              else if (pagesettings.orientation == 'landscape') {
                if (!('height' in pagesettings)) pagesettings.height = default_width;
                if (!('width' in pagesettings)) pagesettings.width = default_height;
              }
              */
              page.property('paperSize', pagesettings).then(function () {
                page.on('onLoadFinished', onLoadFinished).then(function () {
                  page.property('content', body).then(function () { /* Report Generation Complete */ }).catch(function (err) { global.log(err); });;
                });
              }).catch(function (err) { global.log(err); });
              //page.set('viewportSize',{width:3700,height:3800});
            }).catch(function (err) { global.log(err); });;
          } catch (err) {
            try { if (page != null) page.close(); } catch (ex) { }
            return done(Helper.NewError("Error occurred during report generation (" + err.toString() + ')', -99999), null);
          }
        }); //, { dnodeOpts: { weak: false } }
      });
    });
  });
};

AppSrvRpt.prototype.RenderEJS = function (ejssrc, ejsdata) {
  return ejs.render(ejssrc, _.extend(ejsdata, { _: _, ejsext: ejsext }));
}

AppSrvRpt.prototype.getPhantom = function (callback) {
  var _this = this;
  if (_this.phsession) {
    //Recycle phantom after 50 users
    _this.phreqcount++;
    if (_this.phreqcount > 3) { _this.phsession.exit(); _this.phsession = null; }
    else return callback(_this.phsession);
  }
  global.log('Launching PhantomJS Report Renderer');
  var rptlogger = function () {
    var logtxt = '';
    for (var i = 0; i < arguments.length; i++) {
      if (!arguments[i]) continue;
      logtxt += arguments[i].toString() + ' - ';
    }
    if (!logtxt || (logtxt.indexOf('NOOP command') >= 0)) return;
    global.log(logtxt);
  };
  phantom.create(['--web-security=no'], {
    //Fault tolerance to generate new phantom if process crashes
    onExit: function (code, signal) {
      if (code != 0) _this.phsession = null;
    },
    /*logger: {
      info: rptlogger,
      debug: rptlogger,
      warn: rptlogger,
      error: rptlogger
    }*/
  }).then(function (_phsession) {
    _this.phsession = _phsession;
    _this.phreqcount = 0;
    return callback(_this.phsession);
  }).catch(function (err) { global.log(err); });
}

AppSrvRpt.prototype.runReportJob = function (req, res, modelid, Q, P, onComplete) {
  var thisapp = this.AppSrv;
  var _this = this;
  var model = thisapp.jsh.Models[modelid];
  if (!Helper.HasModelAccess(req, model, 'B')) { Helper.GenError(req, res, -11, 'Invalid Model Access'); return; }
  if (!('jobqueue' in model)) throw new Error(modelid + ' job queue not enabled');
  if (!thisapp.jobproc) throw new Error('Job Processor not configured');
  if (modelid.indexOf('_report_') != 0) throw new Error('Model is not a report');
  var reportid = modelid.substr(8);
  //Validate Parameters
  var fieldlist = thisapp.getFieldNames(req, model.fields, 'B');
  var Qfields = _.map(fieldlist, function (field) { return '&' + field; });
  Qfields.push('|_test');
  if (!thisapp.ParamCheck('Q', Q, Qfields)) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  if (!thisapp.ParamCheck('P', P, [])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  
  var sql_ptypes = [];
  var sql_params = {};
  var verrors = {};
  
  var fields = thisapp.getFieldsByName(model.fields, fieldlist);
  if (fields.length == 0) return onComplete(null, {});
  _.each(fields, function (field) {
    var fname = field.name;
    if (fname in Q) {
      var dbtype = thisapp.getDBType(field);
      sql_ptypes.push(dbtype);
      sql_params[fname] = thisapp.DeformatParam(field, Q[fname], verrors);
    }
    else throw new Error('Missing parameter ' + fname);
  });
  verrors = _.merge(verrors, model.xvalidate.Validate('B', sql_params));
  if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
  
  var dbtasks = {};
  this.parseReportSQLData(req, res, model, sql_ptypes, sql_params, verrors, dbtasks, model.reportdata);
  
  if (!('sql' in model.jobqueue)) throw new Error(modelid + ' missing job queue sql');
  
  //Add DataLock parameters to SQL 
  var datalockqueries = [];
  thisapp.getDataLockSQL(req, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery) { datalockqueries.push(datalockquery); });
  
  var sql = thisapp.db.sql.runReportJob(thisapp.jsh, model, datalockqueries);
  
  var dbtasks = {};
  dbtasks['jobqueue'] = function (callback) {
    thisapp.db.Recordset(req._DBContext, sql, sql_ptypes, sql_params, function (err, rslt) {
      if ((err == null) && (rslt == null)) err = Helper.NewError('Record not found', -1);
      if (err != null) { err.model = model; err.sql = sql; }
      callback(err, rslt);
    });
  }
  
  thisapp.db.ExecTasks(dbtasks, function (err, rslt) {
    if (err != null) { thisapp.AppDBError(req, res, err); return; }
    if (rslt == null) rslt = {};
    if (('_test' in Q) && (Q._test == 1)) {
      for (var i = 0; i < rslt.jobqueue.length; i++) {
        var reporturl = req.baseurl + '_d/_report/' + reportid + '/?';
        var jrow = rslt.jobqueue[i];
        var rparams = {};
        var verrors = {};
        //Add each parameter to url
        _.each(fields, function (field) {
          var fname = field.name;
          if (fname in jrow) rparams[fname] = thisapp.DeformatParam(field, jrow[fname], verrors);
          else rparams[fname] = sql_params[fname];
          if (_.isDate(rparams[fname])) rparams[fname] = rparams[fname].toISOString();
        });
        verrors = _.merge(verrors, model.xvalidate.Validate('B', rparams));
        if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -99999, 'Error during job queue: ' + verrors[''].join('\n') + ' ' + JSON.stringify(rparams)); return; }
        reporturl += querystring.stringify(rparams);
        rslt.jobqueue[i] = _.merge({ 'Run Report': '<a href="' + reporturl + '" target="_blank">Run Report</a>' }, jrow);
      }
      res.send(Helper.renderTable(rslt.jobqueue));
      return;
    }
    else {
      var jobtasks = {};
      for (var i = 0; i < rslt.jobqueue.length; i++) {
        var jrow = rslt.jobqueue[i];
        var rparams = {};
        var verrors = {};
        //Add each parameter to url
        _.each(fields, function (field) {
          var fname = field.name;
          if (fname in jrow) rparams[fname] = thisapp.DeformatParam(field, jrow[fname], verrors);
          else rparams[fname] = sql_params[fname];
          if (_.isDate(rparams[fname])) rparams[fname] = rparams[fname].toISOString();
        });
        verrors = _.merge(verrors, model.xvalidate.Validate('B', rparams));
        if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -99999, 'Error during job queue: ' + verrors[''].join('\n') + ' ' + JSON.stringify(rparams)); return; }
        
        if(!thisapp.jobproc.AddDBJob(req, res, jobtasks, i, jrow, reportid, rparams)) return;
      }
      thisapp.db.ExecTransTasks(jobtasks, function (err, rslt) {
        if (err != null) { thisapp.AppDBError(req, res, err); return; }
        else rslt = { '_success': _.size(jobtasks) };
        res.send(JSON.stringify(rslt));
      });
    }
  });
};

module.exports = AppSrvRpt;