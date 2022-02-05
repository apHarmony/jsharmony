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
var HelperFS = require('./lib/HelperFS.js');
var fs = require('fs');

module.exports = exports = {};

exports.getReport = function (req, res, fullmodelid, Q, P, callback) {
  if (!this.jsh.hasModel(req, fullmodelid)) throw new Error('Error: Report ' + fullmodelid + ' not found in collection.');
  var _this = this;
  if (typeof Q == 'undefined') Q = req.query;
  if (typeof P == 'undefined') P = req.body;
  if (typeof callback == 'undefined') callback = function (err, tmppath, dispose, dbdata) {
    if(err){ Helper.GenError(req, res, -99999, err.toString()); return; }

    /* Report Done */
    HelperFS.getFileStats(req, res, tmppath, function (err, stat) {
      if (err != null) return dispose();
      var fsize = stat.size;
      var model = _this.jsh.getModel(req, fullmodelid);
      var filename = fullmodelid + (model.format == 'xlsx' ? '.xlsx' : '.pdf');
      Helper.execif(model.ongetfilename,
        function(done){
          model.ongetfilename(function(rslt){
            if(rslt) filename = rslt.toString();
            return done();
          }, model, Q, P, req, dbdata);
        },
        function(){
          //Send MIME type
          if(model.format=='xlsx'){
            res.writeHead(200, {
              'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'Content-Length': fsize,
              'Content-Disposition': 'filename = ' + encodeURIComponent(filename)
            });
          }
          else {
            res.writeHead(200, {
              'Content-Type': 'application/pdf',
              'Content-Length': fsize,
              'Content-Disposition': 'filename = ' + encodeURIComponent(filename),
              'Cache-Control': 'no-cache',
            });
          }
          var rs = fs.createReadStream(tmppath);
          rs.pipe(res).on('finish', function () { dispose(); });
        }
      );
    });
  };
  
  this.rptsrv.queueReport(req, res, fullmodelid, Q, P, {}, callback);
};

exports.parseReportHTML = function(rptcontent){
  var _this = this;
  if(('body' in rptcontent) && !('header' in rptcontent) && !('footer' in rptcontent)) return '';
  var rslt = rptcontent.body;
  //Add Border
  var idx = rslt.indexOf('</head');
  if(idx < 0) idx = 0;
  rslt = rslt.substr(0,idx) + '<style type="text/css">body { border:2px solid #ccc; zoom:1 !important; }</style>' + rslt.substr(idx,rslt.length);
  //Add Header
  idx = rslt.indexOf('<body');
  if(idx < 0) idx = 0;
  else idx = rslt.indexOf('>',idx)+1;
  rslt = rslt.substr(0,idx) + rptcontent.header + rslt.substr(idx,rslt.length);
  //Add footer
  idx = rslt.indexOf('</body');
  if(idx < 0) idx = rslt.length;
  if(rptcontent.footer){
    rslt = rslt.substr(0,idx) + "<div style='clear:both;'>" + rptcontent.footer + '</div>' + rslt.substr(idx,rslt.length);
  }
  //Convert paths to relative
  rslt = rslt.replace(/(file:\/\/[^"'>]*)/gi,function(match,p1){
    p1 = p1.replace(_this.jsh.Config.datadir,'');
    if(Helper.endsWith(p1,'/node_modules/jsharmony/public/js/jsHarmony.js')) return '/js/jsHarmony.js';
    if(p1.lastIndexOf('/public/') >= 0) return p1.substr(p1.lastIndexOf('/public/')+7);
    return '';
  });
  return rslt;
};

exports.getReportHTML = function (req, res, fullmodelid, Q, P, callback) {
  if (!this.jsh.hasModel(req, fullmodelid)) throw new Error('Error: Report ' + fullmodelid + ' not found in collection.');
  var _this = this;
  if (typeof Q == 'undefined') Q = req.query;
  if (typeof P == 'undefined') P = req.body;
  if (typeof callback == 'undefined') callback = function (err, rptcontent) {
    /* Report Done */
    if(err){ Helper.GenError(req, res, -99999, err.toString()); return; }
    
    var rslt = '';
    if(_.isArray(rptcontent) && (rptcontent.length == 1)){
      rslt = _this.parseReportHTML(rptcontent[0]);
    }
    else if(_.isArray(rptcontent)){
      rslt = '<html><head></head><body>';
      for(var i=0;i<rptcontent.length;i++){
        rslt += '<iframe width="100%" height="500" src="data:text/html;base64,'+Buffer.from(_this.parseReportHTML(rptcontent[i])).toString('base64')+'"></iframe>';
      }
      rslt += '</body></html>';
    }
    else {
      rslt = _this.parseReportHTML(rptcontent);
    }
    
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8'
    });
    res.end(rslt);
  };
  
  this.rptsrv.queueReport(req, res, fullmodelid, Q, P, {output:'html'}, callback);
};

exports.getReportJob = function (req, res, fullmodelid, Q, P, callback) {
  if (!this.jsh.hasModel(req, fullmodelid)) throw new Error('Error: Report ' + fullmodelid + ' not found in collection.');
  if (typeof Q == 'undefined') Q = req.query;
  if (typeof P == 'undefined') P = req.body;
  if (typeof callback == 'undefined') callback = function () { /* Report Done */ };
  
  this.rptsrv.runReportJob(req, res, fullmodelid, Q, P, callback);
};

return module.exports;