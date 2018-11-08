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
var puppeteer = require('puppeteer');
var path = require('path');
var fs = require('fs');
var tmp = require('tmp');
var async = require('async');
var HelperFS = require('./lib/HelperFS.js');
var Helper = require('./lib/Helper.js');
var ejs = require('ejs');
var ejsext = require('./lib/ejsext.js');
var moment = require('moment');
var querystring = require('querystring');
var hummus = require('hummus');
var _HEADER_ZOOM = 0.75;
var _BROWSER_RECYCLE_COUNT = 50;

function AppSrvRpt(appsrv) {
  this.AppSrv = appsrv;
  this.browser = null;
  this.browserreqcount = 0;
  this.browserqueue = null;
  this.InitReportQueue();
  process.addListener('exit', function (code) { if (this.browser != null) { this.browser.close(); this.browser = null; } });
}

AppSrvRpt.prototype.InitReportQueue = function () {
  var _this = this;
  this.browserqueue = async.queue(function (task, done) {
    _this.genReport(task.req, task.res, task.modelid, task.params, task.data, done);
  }, 1);
}

AppSrvRpt.prototype.queueReport = function (req, res, modelid, Q, P, params, onComplete) {
  if(!params) params = {};
  var thisapp = this.AppSrv;
  var jsh = thisapp.jsh;
  var _this = this;
  var model = jsh.getModel(req, modelid);
  var db = params.db;
  var dbcontext = params.dbcontext;
  var errorHandler = function(num, txt, stats){ return Helper.GenError(req, res, num, txt, { stats: stats }); };
  if(params.errorHandler) errorHandler = params.errorHandler;
  if(req){
    if (!Helper.HasModelAccess(req, model, 'B')) { return errorHandler(-11, 'Invalid Model Access for '+modelid); }
    db = db || jsh.getModelDB(req, modelid);
    dbcontext = dbcontext || req._DBContext || 'report';
  }
  else if(!db) throw new Error('Either req or db is required.');

  //Validate Parameters
  var fieldlist = thisapp.getFieldNames(req, model.fields, 'B');
  _.map(fieldlist, function (field) { if (!(field in Q)) Q[field] = ''; });
  if (!thisapp.ParamCheck('Q', Q, _.map(fieldlist, function (field) { return '&' + field; }))) { return errorHandler(-4, 'Invalid Parameters'); }
  if (!thisapp.ParamCheck('P', P, [])) { return errorHandler(-4, 'Invalid Parameters'); }
  
  if(req && !params.fromBatch) jsh.Log.info("REPORT: " + req.originalUrl + " " + (req.user_id || '') + " " + (req.user_name || ''));
  
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
    else return errorHandler(-4, 'Missing parameter ' + fname);
  });
  verrors = _.merge(verrors, model.xvalidate.Validate('B', sql_params));
  if (!_.isEmpty(verrors)) { return errorHandler(-2, verrors[''].join('\n')); }

  if(model.batch && !params.fromBatch) return _this.batchReport(req, res, db, dbcontext, model, sql_ptypes, sql_params, verrors, errorHandler, Q, params, onComplete);
  
  var dbtasks = {};
  try{
    this.parseReportSQLData(req, db, dbcontext, model, sql_ptypes, sql_params, verrors, dbtasks, model.reportdata);
  }
  catch(err){
    jsh.Log.error(err);
    return errorHandler(-99999, err.toString());
  }
  
  db.ExecTasks(dbtasks, function (err, dbdata, stats) {
    if (err) {
      if(jsh.Config.debug_params.report_debug) console.log(err);
      return thisapp.AppDBError(req, res, err, stats, errorHandler);
    }
    if (dbdata == null) dbdata = {};
    _this.MergeReportData(dbdata, model.reportdata, null);
    if(params.output=='html'){
      return onComplete(null,_this.genReportContent(req, res, modelid, sql_params, dbdata));
    }
    else{
      _this.browserqueue.push({ req: req, res: res, modelid: modelid, params: sql_params, data: dbdata }, onComplete);
    }
  });
};

AppSrvRpt.prototype.batchReport = function (req, res, db, dbcontext, model, sql_ptypes, sql_params, verrors, errorHandler, Q, params, onComplete) {
  var thisapp = this.AppSrv;
  var jsh = thisapp.jsh;
  var _this = this;
  if(!model.batch || !model.batch.sql) return errorHandler(-6, 'Batch reports require model.batch.sql');

  //Parameters should already be validated

  //Add DataLock parameters to SQL
  var datalockqueries = [];
  if(req){
    thisapp.getDataLockSQL(req, model, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery) { datalockqueries.push(datalockquery); });
  }
  
  var sql = db.sql.runReportBatch(jsh, model, datalockqueries);

  if(!req && (sql.indexOf('%%%DATALOCKS%%%')>=0)) throw new Error('Cannot use %%%DATALOCKS%%% in automated reports');
  
  var dbtasks = {};
  dbtasks['batchqueue'] = function (callback) {
    db.Recordset(dbcontext, sql, sql_ptypes, sql_params, function (err, rslt, stats) {
      if ((err == null) && (rslt == null)) err = Helper.NewError('Record not found', -1);
      if (err != null) { err.model = model; err.sql = sql; }
      if (stats) stats.model = model;
      callback(err, rslt, stats);
    });
  }
  
  db.ExecTasks(dbtasks, function (err, rslt, stats) {
    if (err) { return thisapp.AppDBError(req, res, err, stats, errorHandler); }
    if (rslt == null) rslt = {};
    var jobtasks = {};
    if(params.output=='html'){
      //Generate Batch HTML
      var rptrslt = [];
      async.eachSeries(rslt.batchqueue, function(batchparams, cb){
        batchparams = _.extend({}, Q, batchparams);
        thisapp.rptsrv.queueReport(req, res, model.id, batchparams, {}, _.extend({}, params, { db: db, dbcontext: dbcontext, errorHandler: errorHandler, fromBatch: true}), function (err, rptcontent) {
          if(err) return cb(err);
          rptrslt.push(rptcontent);
          return cb();
        });
      }, function(err){;
        if(err) return errorHandler(-99999, err);
        return onComplete(null, rptrslt);
      });
    }
    else {
      //Generate Batch PDF
      var report_folder = jsh.Config.datadir + 'temp/report/';
      HelperFS.createFolderIfNotExists(report_folder, function (err) {
        if (err) throw err;
        HelperFS.clearFiles(report_folder, jsh.Config.public_temp_expiration, -1, function () {
          tmp.file({ dir: report_folder }, function (batchtmperr, batchtmppath, batchtmpfd) {
            if (batchtmperr) return errorHandler(-99999, batchtmperr);
            var batchtmppdfpath = batchtmppath + '.pdf';
            var pdfWriter = hummus.createWriter(batchtmppdfpath);
            var batchdbdata = [];

            async.eachSeries(rslt.batchqueue, function(batchparams, cb){
              batchparams = _.extend({}, Q, batchparams);
              thisapp.rptsrv.queueReport(req, res, model.id, batchparams, {}, _.extend({}, params, { db: db, dbcontext: dbcontext, errorHandler: errorHandler, fromBatch: true}), function (err, tmppath, dispose, dbdata) {
                if(err) return cb(err);
                batchdbdata.push(dbdata);
                /* Report Done */ 
                HelperFS.getFileStats(req, res, tmppath, function (err, stat) {
                  if (err){ dispose(); return cb('Report file not found'); }
                  //Merge PDFs using PDFKit
                  pdfWriter.appendPDFPagesFromPDF(tmppath);
                  dispose();
                  return cb(null);
                });
              });
            }, function(err){
              var dispose = function(disposedone){
                fs.close(batchtmpfd, function () {
                  fs.unlink(batchtmppath, function (err) {
                    if(disposedone) disposedone();
                  });
                });
              }
              pdfWriter.end();
              if(err) return errorHandler(-99999, err);
              return onComplete(null, batchtmppdfpath, dispose, batchdbdata);
            });

          });
        });
      });
    }
  });
}

AppSrvRpt.prototype.parseReportSQLData = function (req, db, dbcontext, model, sql_ptypes, sql_params, verrors, dbtasks, rdata) {
  var thisapp = this.AppSrv;
  var jsh = thisapp.jsh;
  var _this = this;
  if(req){
    db = db || jsh.getModelDB(req, model.id);
    dbcontext = dbcontext || req._DBContext || 'report';
  }
  else if(!db) throw new Error('Either req or db is required.');
  _.each(rdata, function (dparams, dname) {
    if (!('sql' in dparams)) throw new Error(dname + ' missing sql');

    var datalockqueries = [];
    var skipdatalock = true;
    if(req){
      //Add DataLock parameters to SQL 
      thisapp.getDataLockSQL(req, model, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery) { datalockqueries.push(datalockquery); }, dparams.nodatalock);
      skipdatalock = false;
      if ('nodatalock' in dparams) {
        var skipdatalock = true;
        for (datalockid in req.jshsite.datalock) {
          if (Helper.arrayIndexOf(dparams.nodatalock,datalockid,{caseInsensitive:jsh.Config.system_settings.case_insensitive_datalocks}) < 0) skipdatalock = false;
        }
      }
    }
    
    var sql = db.sql.parseReportSQLData(jsh, dname, dparams, skipdatalock, datalockqueries);

    if(!req && (sql.indexOf('%%%DATALOCKS%%%')>=0)) throw new Error('Cannot use %%%DATALOCKS%%% in automated reports');
    
    dbtasks[dname] = function (callback) {
      db.Recordset(dbcontext, sql, sql_ptypes, sql_params, function (err, rslt, stats) {
        if ((err == null) && (rslt == null)) err = Helper.NewError('Record not found', -1);
        if (err != null) { err.model = model; err.sql = sql; }
        if (stats) stats.model = model;
        callback(err, rslt, stats);
      });
    }
    
    if ('children' in dparams) _this.parseReportSQLData(req, db, dbcontext, model, sql_ptypes, sql_params, verrors, dbtasks, dparams.children);
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
  var jsh = _this.AppSrv.jsh;
  if (modelid.indexOf('_report_') != 0) throw new Error('Model '+modelid+' is not a report');
  var reportid = modelid.substr(8);
  var model = jsh.getModel(req, modelid);
  var ejsname = 'reports/' + reportid;
  var ejsbody = jsh.getEJS(ejsname,function(){});
  var ejsbody_header = jsh.getEJS(ejsname+'.header',function(){});
  var ejsbody_footer = jsh.getEJS(ejsname+'.footer',function(){});
  for (var i = model._inherits.length - 1; i >= 0; i--) {
    var ejsid = model._inherits[i];
    if (ejsid.substr(0, 8) == '_report_') {
      ejsid = ejsid.substr(8);
      if (ejsbody == null) ejsbody = jsh.getEJS('reports/' + ejsid,function(){});
      if (ejsbody_header == null) ejsbody_header = jsh.getEJS('reports/' + ejsid + '.header',function(){});
      if (ejsbody_footer == null) ejsbody_footer = jsh.getEJS('reports/' + ejsid + '.footer',function(){});
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
  if (jsh.Config.debug_params.report_debug) {
    ejsbody = ejsbody.replace(/{{(.*?)}}/g, '<%=ejsext.null_log(jsh.Log,$1,\'$1\')%>');
    ejsbody_header = ejsbody_header.replace(/{{(.*?)}}/g, '<%=ejsext.null_log(jsh.Log,$1,\'$1\')%>');
    ejsbody_footer = ejsbody_footer.replace(/{{(.*?)}}/g, '<%=ejsext.null_log(jsh.Log,$1,\'$1\')%>');
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
    jsh: jsh,
    ejsext: ejsext,
    data: data,
    params: params,
    _: _,
    filename: jsh.getEJSFilename(ejsname)
  });

  if(ejsbody_header){
    rslt.header = _this.RenderEJS(ejsbody_header, { 
      model: model, 
      moment: moment, 
      _this: _this,
      jsh: jsh,
      ejsext: ejsext,
      data: data,
      params: params,
      _: _,
      pageNum: "<span class='pageNumber'></span>", 
      numPages: "<span class='totalPages'></span>" 
    });
  }

  if(ejsbody_footer){
    rslt.footer = _this.RenderEJS(ejsbody_footer, { 
      model: model, 
      moment: moment, 
      _this: _this,
      jsh: jsh,
      ejsext: ejsext,
      data: data,
      params: params,
      _: _,
      pageNum: "<span class='pageNumber'></span>", 
      numPages: "<span class='totalPages'></span>" 
    });
  }

  return rslt;
}

AppSrvRpt.prototype.genReport = function (req, res, modelid, params, data, done) {
  var _this = this;
  var jsh = _this.AppSrv.jsh;
  var report_folder = jsh.Config.datadir + 'temp/report/';
  if (modelid.indexOf('_report_') != 0) throw new Error('Model is not a report');
  var reportid = modelid.substr(8);
  var model = jsh.getModel(req, modelid);

  HelperFS.createFolderIfNotExists(report_folder, function (err) {
    if (err) throw err;
    HelperFS.clearFiles(report_folder, jsh.Config.public_temp_expiration, -1, function () {
      tmp.file({ dir: report_folder }, function (tmperr, tmppath, tmpfd) {
        if (tmperr) throw tmperr;
        _this.getBrowser(function (browser) {
          var page = null;
          try {
            browser.newPage().then(function (_page) {
              var tmppdfpath = tmppath + '.pdf';
              var tmphtmlpath = tmppath + '.html';
              page = _page;

              var rptcontent = _this.genReportContent(req, res, modelid, params, data);

              var pagesettings = {
                format: 'Letter',
                landscape: false,
                printBrackground: true,
                margin: {
                  top: '1cm',
                  bottom: '1cm',
                  left: '1cm',
                  right: '1cm',
                }
              };
              if ('pagesettings' in model) pagesettings = _.extend(pagesettings, model.pagesettings);
              pagesettings.path = tmppdfpath;

              var dpi = 96;
              var default_header = '1cm';//Math.floor(0.4 * dpi) + 'px';

              var headerheight = 0;
              var footerheight = 0;
              if(rptcontent.header){
                pagesettings.displayHeaderFooter = true;
                pagesettings.headerTemplate = rptcontent.header;
                headerheight = default_header;
                if ('headerheight' in model) headerheight = model.headerheight;
              }
              if(rptcontent.footer){
                pagesettings.displayHeaderFooter = true;
                pagesettings.footerTemplate = rptcontent.footer;
                footerheight = default_header;
                if ('footerheight' in model) footerheight = model.footerheight;
              }
              if(pagesettings.displayHeaderFooter) pagesettings.footerTemplate = pagesettings.footerTemplate || ' ';

              //page.set('viewportSize',{width:700,height:800},function(){
              
              //Calculate page width
              var marginLeft = 0;
              var marginRight = 0;
              var marginTop = 0;
              var marginBottom = 0;
              var pageWidth = 1; //px
              var pageHeight = 1; //px
              var headerHeightPx = 0;
              var footerHeightPx = 0;
              if(pagesettings.margin){
                var basemargin = pagesettings.margin;
                if(!basemargin) basemargin = 0;
                if(_.isString(basemargin)) basemargin = parseUnitsPx(basemargin,dpi);
                if(_.isNumber(basemargin)){
                  marginLeft = basemargin;
                  marginRight = basemargin;
                  marginTop = basemargin;
                  marginBottom = basemargin;
                }
                else {
                  if(basemargin.left) marginLeft = parseUnitsPx(basemargin.left,dpi);
                  if(basemargin.right) marginRight = parseUnitsPx(basemargin.right,dpi);
                  if(basemargin.top) marginTop = parseUnitsPx(basemargin.top,dpi);
                  if(basemargin.bottom) marginBottom = parseUnitsPx(basemargin.bottom,dpi);
                }
              }
              if(pagesettings.width) pageWidth = parseUnitsPx(pagesettings.width,dpi);
              if(pagesettings.height) pageHeight = parseUnitsPx(pagesettings.height,dpi);
              if(pagesettings.format){
                var fmt = pagesettings.format.toLowerCase();
                var w = 1;
                var h = 1;
                //Width and height in millimeters
                if(fmt=='a0'){ w = 841; h=1189; }
                if(fmt=='a1'){ w = 594; h=841; }
                if(fmt=='a2'){ w = 420; h=594; }
                if(fmt=='a3'){ w = 297; h=420; }
                else if(fmt=='a4'){ w=210; h=297; }
                else if(fmt=='a5'){ w=148; h=210; }
                else if(fmt=='a6'){ w=105; h=148; }
                else if(fmt=='a7'){ w=74; h=105; }
                else if(fmt=='legal'){ w=215.9; h=355.6; }
                else if(fmt=='letter'){ w=215.9; h=279.4; }
                else if(fmt=='tabloid'){ w=279.4; h=431.8; }
                else if(fmt=='ledger'){ w=279.4; h=431.8; }
                else return jsh.Log.error('Invalid report format: '+pagesettings.format)
                if(pagesettings.landscape){
                  _w = w;
                  w = h;
                  h = _w;
                }
                //Width and height in pixels
                pageWidth = (w / (25.4)) * dpi;
                pageHeight = (h / (25.4)) * dpi;
              }
              if(headerheight) headerHeightPx = parseUnitsPx(headerheight,dpi);
              if(footerheight) footerHeightPx = parseUnitsPx(footerheight,dpi);
              
              var contentWidth = pageWidth - marginLeft - marginRight;
              var contentHeight = pageHeight - marginTop - marginBottom - headerHeightPx - footerHeightPx;
              if (jsh.Config.debug_params.report_debug) { console.log('Calculated Page Size: '+contentHeight + 'x'+contentWidth); }

              pagesettings.margin = {
                top: (marginTop+headerHeightPx)+'px',
                right: marginRight+'px',
                bottom: (marginBottom+footerHeightPx)+'px',
                left: marginLeft+'px',
              }
              if(pagesettings.headerTemplate){
                pagesettings.headerTemplate = '<style type="text/css">#header{ padding:'+Math.round(marginTop*_HEADER_ZOOM)+'px '+Math.round(marginRight*_HEADER_ZOOM)+'px '+Math.round(marginBottom*_HEADER_ZOOM)+'px '+Math.round(marginLeft*_HEADER_ZOOM)+'px; -webkit-print-color-adjust: exact; }</style><div style="position:absolute;width:'+(contentWidth)+'px;font-size:12px;transform: scale('+_HEADER_ZOOM+'); transform-origin: top left;">'+pagesettings.headerTemplate+'</div>';
              }
              if(pagesettings.footerTemplate){
                pagesettings.footerTemplate = '<style type="text/css">#footer{ padding:'+Math.round(marginTop*_HEADER_ZOOM)+'px '+Math.round(marginRight*_HEADER_ZOOM)+'px '+Math.round(marginBottom*_HEADER_ZOOM)+'px '+Math.round(marginLeft*_HEADER_ZOOM)+'px; -webkit-print-color-adjust: exact; }</style><div style="position:absolute;width:'+(contentWidth)+'px;font-size:12px;transform: scale('+_HEADER_ZOOM+'); transform-origin: bottom left;">'+pagesettings.footerTemplate+'</div>';
              }

              var report_fonts = [].concat(jsh.Config.default_report_fonts||[]).concat(model.fonts||[]);
              jsh.loadFonts(report_fonts, function(err, font_css){
                if(err) return jsh.Log.error(err);
                var font_render = [];
                for(var i=0;i<report_fonts.length;i++){
                  var font = report_fonts[i];
                  var font_str = '';
                  if(font['font-family']) font_str += "font-family:'"+Helper.escapeCSS(font['font-family'].toString())+"';";
                  if(font['font-style']) font_str += "font-style:"+font['font-style'].toString()+";";
                  if(font['font-weight']) font_str += "font-weight:"+font['font-weight'].toString()+";";
                  if(font_str) font_render.push(font_str);
                }
                if(font_css){
                  if(pagesettings.headerTemplate) pagesettings.headerTemplate = '<style type="text/css">'+font_css+'</style>' + pagesettings.headerTemplate;
                  if(pagesettings.footerTemplate) pagesettings.footerTemplate = '<style type="text/css">'+font_css+'</style>' + pagesettings.footerTemplate;
                }

                //Sets styles and returns document width
                var onPageLoad = function(font_render,font_css){ 
                  if(!document||!document.body) return 0;
                  //Load CSS in header
                  var head = document.getElementsByTagName('head');
                  if(head.length) head = head[0];
                  if(head){
                    var css = document.createElement('style');
                    css.type='text/css';
                    css.innerHTML = font_css;
                    head.appendChild(css);
                  }
                  //Add fonts to body (otherwise using them in the page header / footer will cause a Page Crash)
                  if(font_render) for(var i=0;i<font_render.length;i++){
                    var fontElement = document.createElement('div');
                    fontElement.innerHTML = '&nbsp;';
                    fontElement.setAttribute('style', font_render[i]+'visibility:hidden;position:absolute;top:0px;left:0px;');
                    document.body.appendChild(fontElement);
                  }
                  document.body.style['-webkit-print-color-adjust'] = 'exact'; 
                  return document.body.clientWidth; 
                };

                fs.writeFile(tmphtmlpath, rptcontent.body||'','utf8',function(err){
                  if(err) return jsh.Log.error(err);
                  page.goto('file://'+tmphtmlpath, { waitUntil: 'networkidle0' })
                  .then(function(){
                    page.evaluate(onPageLoad, font_render, font_css).then(function(documentWidth){
                      if(documentWidth && !pagesettings.scale){
                        var scale = contentWidth * 0.998 / documentWidth;
                        if(scale < 0.1) scale = 0.1;
                        if(scale > 1) scale = 1;
                        pagesettings.scale = scale;
                      }
                      //page.emulateMedia('screen').then(function(){
                        page.pdf(pagesettings).then(function () {
                          var dispose = function (disposedone) {
                            page.close().then(function () {
                              page = null;
                              fs.close(tmpfd, function () {
                                fs.unlink(tmphtmlpath, function (err) {
                                  fs.unlink(tmppath, function (err) {
                                    if (typeof disposedone != 'undefined') disposedone();
                                  });
                                });
                              });
                            }).catch(function (err) { jsh.Log.error(err); });;
                          };
                          done(null, tmppdfpath, dispose, data);
                        }).catch(function (err) { jsh.Log.error(err); });
                      //}).catch(function (err) { jsh.Log.error(err); });
                    }).catch(function (err) { jsh.Log.error(err); });
                  })
                  .catch(function (err) { jsh.Log.error(err); });
                });
              });

            }).catch(function (err) { jsh.Log.error(err); });
          } catch (err) {
            var rpterr = Helper.NewError("Error occurred during report generation (" + err.toString() + ')', -99999);
            if (page != null){
              return page.close()
                .then(function(){ return done(rpterr, null); })
                .catch(function (err) { jsh.Log.error(err); return done(rpterr, null); });
            }
            else return done(rpterr, null);
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

AppSrvRpt.prototype.getBrowser = function (callback) {
  var _this = this;
  var jsh = _this.AppSrv.jsh;
  if (_this.browser) {
    //Recycle browser after _BROWSER_RECYCLE_COUNT uses
    _this.browserreqcount++;
    if (_this.browserreqcount >= _BROWSER_RECYCLE_COUNT) { 
      return _this.browser.close()
        .then(function(){ _this.browser = null; return _this.getBrowser(callback); })
        .catch(function(err){ jsh.Log.error('Cound not exit report renderer: '+err.toString()); });
    }
    else return callback(_this.browser);
  }
  jsh.Log.info('Launching Report Renderer');
  puppeteer.launch({ ignoreHTTPSErrors: true }) //, headless: false
    .then(function(rslt){
      _this.browser = rslt;
      _this.browser.on('disconnected', function(){
        _this.browser = null;
      });
      _this.browserreqcount = 0;
      return callback(_this.browser);
    })
    .catch(function(err){ jsh.Log.error(err); });
}

AppSrvRpt.prototype.runReportJob = function (req, res, modelid, Q, P, onComplete) {
  var thisapp = this.AppSrv;
  var jsh = thisapp.jsh;
  var _this = this;
  var model = jsh.getModel(req, modelid);
  if (!Helper.HasModelAccess(req, model, 'B')) { Helper.GenError(req, res, -11, 'Invalid Model Access for '+modelid); return; }
  if (!('jobqueue' in model)) throw new Error(modelid + ' job queue not enabled');
  if (!thisapp.JobProc) throw new Error('Job Processor not configured');
  if (modelid.indexOf('_report_') != 0) throw new Error('Model '+modelid+' is not a report');
  var reportid = modelid.substr(8);
  //Validate Parameters
  var fieldlist = thisapp.getFieldNames(req, model.fields, 'B');
  _.map(fieldlist, function (field) { if (!(field in Q)) Q[field] = ''; });
  var Qfields = _.map(fieldlist, function (field) { return '&' + field; });
  Qfields.push('|_test');
  if (!thisapp.ParamCheck('Q', Q, Qfields)) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  if (!thisapp.ParamCheck('P', P, [])) { Helper.GenError(req, res, -4, 'Invalid Parameters'); return; }
  
  var sql_ptypes = [];
  var sql_params = {};
  var verrors = {};
  var db = jsh.getModelDB(req, modelid);
  
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
  
  if (!('sql' in model.jobqueue)) throw new Error(modelid + ' missing job queue sql');
  
  //Add DataLock parameters to SQL 
  var datalockqueries = [];
  thisapp.getDataLockSQL(req, model, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery) { datalockqueries.push(datalockquery); });
  
  var sql = db.sql.runReportJob(jsh, model, datalockqueries);
  
  var dbtasks = {};
  dbtasks['jobqueue'] = function (callback) {
    db.Recordset(req._DBContext, sql, sql_ptypes, sql_params, function (err, rslt, stats) {
      if ((err == null) && (rslt == null)) err = Helper.NewError('Record not found', -1);
      if (err != null) { err.model = model; err.sql = sql; }
      if (stats) stats.model = model;
      callback(err, rslt, stats);
    });
  }
  
  db.ExecTasks(dbtasks, function (err, rslt, stats) {
    if (err != null) { thisapp.AppDBError(req, res, err, stats); return; }
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
        
        if(!thisapp.JobProc.AddDBJob(req, res, jobtasks, i, jrow, reportid, rparams)) return;
      }
      thisapp.JobProc.db.ExecTransTasks(jobtasks, function (err, rslt, stats) {
        if (err != null) { thisapp.AppDBError(req, res, err, stats); return; }
        else rslt = { '_success': _.size(jobtasks) };
        rslt['_stats'] = Helper.FormatStats(req, stats);
        res.send(JSON.stringify(rslt));
      });
    }
  });
};

module.exports = AppSrvRpt;