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

var urlparser = require('url');
var http = require('http');
var https = require('https');
var fs = require('fs');
var _ = require('lodash');
var querystring = require('querystring');
exports = module.exports = {};

/**************************
**  CLI Helper Functions **
**************************/
var xlib = require('./CLI.js');
xlib.isFormData = function(d){ return ((_.isObject(d)) && ('submit' in d) && (_.isFunction(d.submit))); };
xlib.merge = function (arr1, arr2) {
  var rslt = {};
  for (var key1 in arr1) rslt[key1] = arr1[key1];
  for (var key2 in arr2) rslt[key2] = arr2[key2];
  return rslt;
};

/**********************
**  Node Web Connect **
**********************/
function WebConnect() {
  
}
WebConnect.prototype.reqjson = function (url, method, post, headers, ftarget, callback, options) {
  this.req(url, method, post, headers, ftarget, function (err, res, rslt) {
    if (callback) {
      if (err) return callback(err, null, null, null);
      if (rslt && (rslt == '---SAVEDTOFILE---')) return callback(err, '---SAVEDTOFILE---', null, res);
      var rsltjson = null;
      try { rsltjson = JSON.parse(rslt); }
      catch (ex) { }
      return callback(null, rslt, rsltjson, res);
    }
  }, options);
};
WebConnect.prototype.req = function (url, method, post, headers, ftarget, callback, options) {
  if (typeof (url) == 'function') url = url();
  if (typeof (post) == 'function') post = post();
  options = _.extend({ authcookie: undefined, debug: false }, options);
  if (!xlib.isFormData(post) && (typeof (post) !== 'string')) post = querystring.stringify(post);
  var urlparts = urlparser.parse(url, true);
  var browser = http;
  if (url.substring(0, 6) == 'https:') browser = https;
  if (!urlparts.port) {
    if (url.substring(0, 6) == 'https:') { urlparts.port = 443; }
    else urlparts.port = 80;
  }
  var reqoptions = {
    host: urlparts.hostname,
    port: urlparts.port,
    path: urlparts.path,
    auth: urlparts.auth||null,
    method: method,
    timeout: 0
  };
  if (reqoptions.host == 'localhost') reqoptions.rejectUnauthorized = false;
  reqoptions.headers = {};
  if (options.authcookie) reqoptions.headers.Cookie = options.authcookie;
  if (post) {
    if (xlib.isFormData(post)) {
      reqoptions['headers'] = _.merge(reqoptions['headers'], post.getHeaders());
    }
    else {
      reqoptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      reqoptions.headers['Content-Length'] = post.length;
    }
  }
  if (headers) {
    reqoptions.headers = xlib.merge(reqoptions.headers, headers);
  }

  var req_is_complete = false;
  
  var req = browser.request(reqoptions, function (res) {
    // response is here
    if (options.debug) console.log(reqoptions.method + ' ' + url + "  Status: " + res.statusCode);
    
    var isdownload = false;
    //if (res.statusCode == 302) console.log('Redirect to ' + res.headers.location);
    if (options.debug) console.log('Response: ' + JSON.stringify(res.headers));
    if (ftarget && ('content-type' in res.headers) && (res.headers['content-type'].indexOf('text/plain') !== 0) && (res.headers['content-type'].indexOf('text/html') !== 0)) isdownload = true;
    if (!isdownload) res.setEncoding('utf8');
    
    var rslt = '';
    if (!isdownload){
      res.on('data', function (chunk) {
        if (options.debug) console.log('Data: ' + chunk);
        rslt += chunk;
			//Append chunk to file when working with large file sizes
			//fs.appendFile('testout.txt', chunk, function (err) { });
      });
    }
    res.on('end', function () {
      req_is_complete = true;
      if (callback) {
        if (isdownload) return; //Use the fout.on('finish') handler
        return callback(null, res, rslt);
      }
    });
    if (isdownload) {
      //console.log('Saving output to ' + ftarget);
      var fout = fs.createWriteStream(ftarget);
      fout.on('finish', function () {
        if (callback) {
          return callback(null, res, '---SAVEDTOFILE---');
        }
      });
      res.pipe(fout);
    }
  });
  
  req.on('error', function (err) {
    if (req_is_complete) return;
    if (callback) callback(err, null, null);
  });
  if (post) {
    if (xlib.isFormData(post)) {
      post.getLength(function (err, length) {
        req.setHeader('Content-Length', length);
        post.pipe(req);
      });
      return;
    }
    else req.write(post);
  }
  req.end();
};

exports.WebConnect = WebConnect;
exports.xlib = xlib;