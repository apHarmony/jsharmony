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
var phantomjs = require('phantomjs'); //was phantomjs-prebuilt
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
var querystring = require('querystring');
//var _PHANTOM_ZOOM = true;
//var _PHANTOM_PATH_OVERRIDE = '';
var _PHANTOM_ZOOM = false;
var _PHANTOM_PATH_OVERRIDE = path.dirname(require.resolve('phantomjs'))+'\\phantom\\phantomjs.exe';

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
    _this.genReport(task.req, task.res, task.modelid, task.params, task.data, done);
  }, 1);
}

AppSrvRpt.prototype.queueReport = function (req, res, modelid, Q, P, params, onComplete) {
  if(!params) params = {};
  var thisapp = this.AppSrv;
  var jsh = thisapp.jsh;
  var _this = this;
  var model = thisapp.jsh.getModel(req, modelid);
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
  //if (fields.length == 0) return onComplete(null, null); //Commented to enable reports with no parameters
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
    if(params.output=='html'){
      return onComplete(null,_this.genReportContent(req, res, modelid, sql_params, rslt));
    }
    else{
      _this.phqueue.push({ req: req, res: res, modelid: modelid, params: sql_params, data: rslt }, onComplete);
    }
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

AppSrvRpt.prototype.genReportContent = function(req, res, modelid, params, data){
  var rslt = { header: '', body: '', footer: '' };
  var _this = this;
  if (modelid.indexOf('_report_') != 0) throw new Error('Model '+modelid+' is not a report');
  var reportid = modelid.substr(8);
  var model = _this.AppSrv.jsh.getModel(req, modelid);
  var ejsname = 'reports/' + reportid;
  var ejsbody = _this.AppSrv.jsh.getEJS(ejsname,function(){});
  var ejsbody_header = _this.AppSrv.jsh.getEJS(ejsname+'.header',function(){});
  var ejsbody_footer = _this.AppSrv.jsh.getEJS(ejsname+'.footer',function(){});
  for (var i = model._inherits.length - 1; i >= 0; i--) {
    var ejsid = model._inherits[i];
    if (ejsid.substr(0, 8) == '_report_') {
      ejsid = ejsid.substr(8);
      if (ejsbody == null) ejsbody = _this.AppSrv.jsh.getEJS('reports/' + ejsid,function(){});
      if (ejsbody_header == null) ejsbody_header = _this.AppSrv.jsh.getEJS('reports/' + ejsid + '.header',function(){});
      if (ejsbody_footer == null) ejsbody_footer = _this.AppSrv.jsh.getEJS('reports/' + ejsid + '.footer',function(){});
    }
  }

  if(model.pageheader){
    var pageheader = model.pageheader;
    if (_.isArray(pageheader)) pageheader = pageheader.join('');
    ejsbody_header = pageheader+(ejsbody_header||'');
  }
  if(!ejsbody_header) ejsbody_header = '';
  if(model.pagefooter){
    var pagefooter = model.pagefooter;
    if (_.isArray(pagefooter)) pagefooter = pagefooter.join('');
    ejsbody_footer = pagefooter+(ejsbody_footer||'');
  }
  if(!ejsbody_footer) ejsbody_footer = '';

  if (ejsbody == null) ejsbody = 'REPORT BODY NOT FOUND';
  if (global.debug_params.report_debug) {
    ejsbody = ejsbody.replace(/{{(.*?)}}/g, '<%=ejsext.null_log($1,\'$1\')%>');
    ejsbody_header = ejsbody_header.replace(/{{(.*?)}}/g, '<%=ejsext.null_log($1,\'$1\')%>');
    ejsbody_footer = ejsbody_footer.replace(/{{(.*?)}}/g, '<%=ejsext.null_log($1,\'$1\')%>');
  }
  else {
    ejsbody = ejsbody.replace(/{{/g, '<%=(');
    ejsbody = ejsbody.replace(/}}/g, '||\'\')%>');
    ejsbody_header = ejsbody_header.replace(/{{/g, '<%=(');
    ejsbody_header = ejsbody_header.replace(/}}/g, '||\'\')%>');
    ejsbody_footer = ejsbody_footer.replace(/{{/g, '<%=(');
    ejsbody_footer = ejsbody_footer.replace(/}}/g, '||\'\')%>');
  }
  rslt.body = ejs.render(ejsbody, {
    model: model,
    moment: moment,
    _this: _this,
    ejsext: ejsext,
    data: data,
    params: params,
    _: _,
    filename: _this.AppSrv.jsh.getEJSFilename(ejsname)
  });

  if(ejsbody_header){
    rslt.header = _this.RenderEJS(ejsbody_header, { 
      model: model, 
      moment: moment, 
      _this: _this,
      ejsext: ejsext,
      data: data,
      params: params,
      _: _,
      pageNum: '{{pageNum}}', 
      numPages: '{{numPages}}' 
    });
  }

  if(ejsbody_footer){
    rslt.footer = _this.RenderEJS(ejsbody_footer, { 
      model: model, 
      moment: moment, 
      _this: _this,
      ejsext: ejsext,
      data: data,
      params: params,
      _: _,
      pageNum: '{{pageNum}}', 
      numPages: '{{numPages}}' 
    });
  }

  return rslt;
}

AppSrvRpt.prototype.genReport = function (req, res, modelid, params, data, done) {
  var report_folder = global.datadir + 'temp/report/';
  var _this = this;
  if (modelid.indexOf('_report_') != 0) throw new Error('Model is not a report');
  var reportid = modelid.substr(8);
  var model = _this.AppSrv.jsh.getModel(req, modelid);

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

              var rptcontent = _this.genReportContent(req, res, modelid, params, data);

              //page.set('viewportSize',{width:700,height:800},function(){
              
              var dpi = 1.3 * 72;
              var default_border = '1cm';//Math.floor(0.5 * dpi) + 'px';
              var default_header = '1cm';//Math.floor(0.4 * dpi) + 'px';
              
              var pagesettings = {
                format: 'letter',
                orientation: 'portrait',
                border: default_border,
              };
              var headerzoomcss = '';
              if(_PHANTOM_ZOOM) headerzoomcss += '<style type="text/css">body{zoom:0.75;}</style>';
              var headerheight = default_header;
              var footerheight = default_header;
              if ('headerheight' in model) headerheight = model.headerheight;
              if ('footerheight' in model) footerheight = model.footerheight;
              if (rptcontent.header) {
                var pageheaderjs = model.pageheaderjs;
                if (_.isArray(pageheaderjs)) pageheaderjs = pageheaderjs.join('');
                if(!pageheaderjs) pageheaderjs = 'return txt;';

                var headcontent = "function (pageNum, numPages) { var txt = " + JSON.stringify(headerzoomcss) + ' + ' +
                  JSON.stringify(rptcontent.header) +
                  "; txt = txt.replace(/{{pageNum}}/g,pageNum); txt = txt.replace(/{{numPages}}/g,numPages); var postproc = function(pageNum, numPages, txt){"+pageheaderjs+"}; txt = postproc(pageNum, numPages, txt); return txt; }";
                pagesettings.header = {
                  height: headerheight,
                  contents: ph.callback(headcontent)
                };
              }
              if (rptcontent.footer) {
                var pagefooterjs = model.pagefooterjs;
                if (_.isArray(pagefooterjs)) pagefooterjs = pagefooterjs.join('');
                if(!pagefooterjs) pagefooterjs = 'return txt;';

                var footcontent = "function (pageNum, numPages) { var txt = " + JSON.stringify(headerzoomcss) + ' + ' +
                  JSON.stringify(rptcontent.footer) +
                  "; txt = txt.replace(/{{pageNum}}/g,pageNum); txt = txt.replace(/{{numPages}}/g,numPages); var postproc = function(pageNum, numPages, txt){"+pagefooterjs+"}; txt = postproc(pageNum, numPages, txt); return txt; }";
                pagesettings.footer = {
                  height: footerheight,
                  contents: ph.callback(footcontent)
                };
              }
              if ('pagesettings' in model) pagesettings = _.merge(pagesettings, model.pagesettings);

              //Calculate page width
              var zoom = undefined;
              if(model.zoom) zoom = model.zoom;

              var borderLeft = 0;
              var borderRight = 0;
              var borderTop = 0;
              var borderBottom = 0;
              var pageWidth = 1; //px
              var pageHeight = 1; //px
              var headerHeightPx = 0;
              var footerHeightPx = 0;
              var dpi = 96;
              if(pagesettings.border || pagesettings.margin){
                var basemargin = pagesettings.margin;
                if(!basemargin) basemargin = pagesettings.border;
                if(_.isString(basemargin)) basemargin = parseUnitsPx(basemargin,dpi);
                if(_.isNumber(basemargin)){
                  borderLeft = basemargin;
                  borderRight = basemargin;
                  borderTop = basemargin;
                  borderBottm = basemargin;
                }
                else {
                  if(basemargin.left) borderLeft = parseUnitsPx(basemargin.left,dpi);
                  if(basemargin.right) borderRight = parseUnitsPx(basemargin.right,dpi);
                  if(basemargin.top) borderTop = parseUnitsPx(basemargin.top,dpi);
                  if(basemargin.bottom) borderBottom = parseUnitsPx(basemargin.bottom,dpi);
                }
              }
              if(pagesettings.format){
                var fmt = pagesettings.format.toLowerCase();
                var w = 1;
                var h = 1;
                if(fmt=='a3'){ w = 297; h=420; }
                else if(fmt=='a4'){ w=210; h=297; }
                else if(fmt=='a5'){ w=148; h=210; }
                else if(fmt=='legal'){ w=215.9; h=355.6; }
                else if(fmt=='letter'){ w=215.9; h=279.4; }
                else if(fmt=='tabloid'){ w=279.4; h=431.8; }
                if(pagesettings.orientation == 'landscape'){
                  _w = w;
                  w = h;
                  h = _w;
                }
                pageWidth = (w / (25.4)) * dpi;
                pageHeight = (w / (25.4)) * dpi;
              }
              if(pagesettings.width) pageWidth = parseUnitsPx(pagesettings.width,dpi);
              if(pagesettings.height) pageHeight = parseUnitsPx(pagesettings.height,dpi);
              if(pagesettings.header && pagesettings.header.height) headerHeightPx = parseUnitsPx(pagesettings.header.height,dpi);
              if(pagesettings.footer && pagesettings.footer.height) footerHeightPx = parseUnitsPx(pagesettings.footer.height,dpi);
              
              var contentWidth = pageWidth - borderLeft - borderRight;
              var contentHeight = pageHeight - borderTop - borderBottom - headerHeightPx - footerHeightPx;
              if (global.debug_params.report_debug) { console.log('Calculated Page Size: '+contentHeight + 'x'+contentWidth); }

              contentWidth *= 0.998;
              contentHeight *= 0.998;

              var onLoadFinished = function (val) { //  /dev/stdout     path.dirname(module.filename)+'/out.pdf'
                var tmppdfpath = tmppath + '.pdf';
                if(_PHANTOM_ZOOM) page.evaluate(function(zoom,contentWidth){ if(!zoom) zoom = contentWidth/document.width; document.body.style.zoom=zoom; },zoom,contentWidth);
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
              };

              page.property('paperSize', pagesettings).then(function () {
                page.on('onLoadFinished', onLoadFinished).then(function () {
                  page.property('content', rptcontent.body).then(function () { /* Report Generation Complete */ }).catch(function (err) { global.log(err); });;
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

function parseUnitsPx(val,dpi){
  //mm,cm,in,px or no units = px
  if(!val) return 0;
  val = val.toLowerCase();
  //Get value in px
  if(val.indexOf('mm') >= 0){ val = Helper.ReplaceAll(val,'mm','').trim(); val = parseFloat(val) * dpi / 25.4; }
  else if(val.indexOf('cm') >= 0){ val = Helper.ReplaceAll(val,'cm','').trim(); val = parseFloat(val) * dpi / 2.54; }
  else if(val.indexOf('in') >= 0){ val = Helper.ReplaceAll(val,'in','').trim(); val = parseFloat(val) * dpi; }
  else if(val.indexOf('px') >= 0){ val = Helper.ReplaceAll(val,'px','').trim(); val = parseFloat(val); }
  if(isNaN(val)) return 0;
  return Math.floor(val);
}

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
  var phantomConfig = {
    onExit: function (code, signal) {
      if (code != 0) _this.phsession = null;
    },
    //Fault tolerance to generate new phantom if process crashes
    /*logger: {
      info: rptlogger,
      debug: rptlogger,
      warn: rptlogger,
      error: rptlogger
    }*/
  };
  if(_PHANTOM_PATH_OVERRIDE) phantomConfig.phantomPath = _PHANTOM_PATH_OVERRIDE;
  phantom.create(['--web-security=no'], phantomConfig).then(function (_phsession) {
    _this.phsession = _phsession;
    _this.phreqcount = 0;
    return callback(_this.phsession);
  }).catch(function (err) { global.log(err); });
}

AppSrvRpt.prototype.runReportJob = function (req, res, modelid, Q, P, onComplete) {
  var thisapp = this.AppSrv;
  var _this = this;
  var model = thisapp.jsh.getModel(req, modelid);
  if (!Helper.HasModelAccess(req, model, 'B')) { Helper.GenError(req, res, -11, 'Invalid Model Access'); return; }
  if (!('jobqueue' in model)) throw new Error(modelid + ' job queue not enabled');
  if (!thisapp.jobproc) throw new Error('Job Processor not configured');
  if (modelid.indexOf('_report_') != 0) throw new Error('Model '+modelid+' is not a report');
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