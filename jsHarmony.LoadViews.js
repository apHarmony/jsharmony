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
var fs = require('fs');
var path = require('path');
var async = require('async');

module.exports = exports = {};

/************************
|    MANAGE EJS FILES   |
************************/
exports.getEJS = function (f, onError) {
  if (!(f in this.EJS)) this.EJS[f] = this.LoadEJS(f, onError);
  this.EJS[f] = this.LoadEJS(f, onError); //Disable caching
  return this.EJS[f];
}

exports.getEJSFilename = function (f) {
  var appDir = path.dirname(require.main.filename);
  var modeldirs = this.getModelDirs();
  var component = '';
  var basefilename = '';
  if(f.indexOf('/') >= 0){
    component = f.substr(0,f.indexOf('/'));
    basefilename = f.substr(f.indexOf('/')+1);
  }
  var fpath = '';
  var cpath = '';
  if (f.indexOf('reports/') == 0) {
    for (var i = modeldirs.length - 1; i >= 0; i--) {
      fpath = modeldirs[i].path + f + '.ejs';
      cpath = modeldirs[i].path + basefilename + '.ejs';
      if(component && (modeldirs[i].component==component) && fs.existsSync(cpath)) return cpath;
      if (fs.existsSync(fpath)) return fpath;
    }
  }
  fpath = appDir + '/views/' + f + '.ejs';
  if (fs.existsSync(fpath)) return fpath;
  for (var i = modeldirs.length - 1; i >= 0; i--) {
    fpath = path.normalize(modeldirs[i].path + '../views/' + f + '.ejs');
    cpath = path.normalize(modeldirs[i].path + '../views/' + basefilename + '.ejs');
    if(component && (modeldirs[i].component==component) && fs.existsSync(cpath)) return cpath;
    if (fs.existsSync(fpath)) return fpath;
  }
  fpath = appDir + '/views/' + f + '.ejs';
  return fpath;
}

exports.LoadEJS = function (f, onError) {
  var fpath = this.getEJSFilename(f);
  if (!fs.existsSync(fpath)) { 
    var errmsg = "EJS path not found: " + f + " at " + fpath;
    if(onError) onError(errmsg);
    else this.LogInit_ERROR(errmsg);
    return null; 
  }
  return fs.readFileSync(fpath, 'utf8')
}

exports.LoadViewsFolder = function (dpath, dont_overwrite) {
  var _this = this;
  if (!fs.existsSync(dpath)) return;
  var files = fs.readdirSync(dpath);
  for (var i = 0; i < files.length; i++) {
    if (files[i].indexOf('.ejs', files[i].length - 4) == -1) continue;
    var viewname = files[i].substr(0, files[i].length - 4);
    if(dont_overwrite && (viewname in _this.Views)) continue;
    _this.Views[viewname] = dpath + '/' + files[i];
  }
}

exports.LoadViews = function(){
  var modeldirs = this.getModelDirs();
  for (var i = modeldirs.length - 1; i >= 0; i--) {
    var fpath = path.normalize(modeldirs[i].path + '../views/');
    this.LoadViewsFolder(fpath, true);
  }
}

exports.LoadFilesToString = function(files,cb){
  var rslt = '';
  async.eachSeries(files, function(file, file_cb){
    fs.readFile(file,'utf8',function(err,data){
      if(err) return file_cb(err);
      rslt += data + "\r\n";
      return file_cb(null);
    });
  }, function(err){
    if(err) return cb(err);
    return cb(null, rslt);
  });
}

exports.getView = function (req, tmpl, options){
  if(!options) options = {};
  if(!tmpl) tmpl = req.jshsite.basetemplate;
  if(!options.disable_override && req._override_basetemplate) tmpl = req._override_basetemplate;
  if (tmpl in this.Views) return this.Views[tmpl];
  return tmpl;
}