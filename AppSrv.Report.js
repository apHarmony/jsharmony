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

exports.getReport = function (req, res, modelid, Q, P, callback) {
  if (!this.jsh.hasModel(req, modelid)) throw new Error("Error: Report " + modelid + " not found in collection.");
  var _this = this;
  if (typeof Q == 'undefined') Q = req.query;
  if (typeof P == 'undefined') P = req.body;
  if (typeof callback == 'undefined') callback = function (err, tmppath, dispose) {
    /* Report Done */ 
    HelperFS.getFileStats(req, res, tmppath, function (err, stat) {
      if (err != null) return dispose();
      var fsize = stat.size;
      //Get MIME type
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': stat.size,
        'Content-Disposition': 'filename = ' + encodeURIComponent(modelid + '.pdf')
      });
      var rs = fs.createReadStream(tmppath);
      rs.pipe(res).on('finish', function () { dispose(); });
    });
  }
  
  this.rptsrv.queueReport(req, res, modelid, Q, P, {}, callback);
}

exports.getReportHTML = function (req, res, modelid, Q, P, callback) {
  if (!this.jsh.hasModel(req, modelid)) throw new Error("Error: Report " + modelid + " not found in collection.");
  var _this = this;
  if (typeof Q == 'undefined') Q = req.query;
  if (typeof P == 'undefined') P = req.body;
  if (typeof callback == 'undefined') callback = function (err, rptcontent) {
    /* Report Done */ 
    if(!rptcontent.body && !rptcontent.header && !rptcontent.footer) return res.end();
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
      rslt = rslt.substr(0,idx) + "<div style='clear:both;'>" + rptcontent.footer + "</div>" + rslt.substr(idx,rslt.length);
    }


    rslt = rslt.replace(/(file:\/\/[^"'>]*)/gi,function(match,p1){ 
      p1 = p1.replace(_this.jsh.Config.datadir,'');
      if(Helper.endsWith(p1,'/node_modules/jsharmony/public/js/jsHarmony.js')) return '/js/jsHarmony.js';
      if(p1.lastIndexOf('/public/') >= 0) return p1.substr(p1.lastIndexOf('/public/')+7);
      return ''; 
    });
    res.send(rslt);
    res.end();
  }
  
  this.rptsrv.queueReport(req, res, modelid, Q, P, {output:'html'}, callback);
}

exports.getReportJob = function (req, res, modelid, Q, P, callback) {
  if (!this.jsh.hasModel(req, modelid)) throw new Error("Error: Report " + modelid + " not found in collection.");
  var _this = this;
  if (typeof Q == 'undefined') Q = req.query;
  if (typeof P == 'undefined') P = req.body;
  if (typeof callback == 'undefined') callback = function () { /* Report Done */ };
  
  this.rptsrv.runReportJob(req, res, modelid, Q, P, callback);
}

return module.exports;