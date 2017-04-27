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
var moment = require('moment');
var fs = require('fs');
var crypto = require('crypto');
var async = require('async');
var mime = require('mime');
var os = require('os');
var path = require('path');
var Helper = require('./Helper.js');

exports = module.exports = {};

exports.createFolderIfNotExists = function (path, callback) {
  if (!callback) callback = function () { };
  fs.mkdir(path, '0777', function (err) {
    if (err && err.code == 'EEXIST') return callback(null);
    if (err) return callback(err);
    return callback(null);
  });
};
exports.createFolderIfNotExistsSync = function (path) {
  if(fs.existsSync(path)) return;
  fs.mkdirSync(path, '0777');
};
exports.clearFiles = function (path, seconds, maxfoldersize, callback) {
  var totsize = 0;
  fs.readdir(path, function (err, files) {
    //if (err) throw err; 
    if (err) return callback(null); //Ignore errors on cleanup routine
    async.eachLimit(files, 10, function (file, fcallback) {
      var fpath = path + file;
      fs.stat(fpath, function (err, stat) {
        //if (err) throw err;
        if (err) return fcallback(null); //Ignore errors on cleanup routine
        var mtime = new Date(stat.mtime).getTime() / 1000;
        var curtime = new Date().getTime() / 1000;
        if ((curtime - mtime) > seconds) {
          fs.unlink(fpath, function (err) {
            //if (err) throw err;
            if (err) return fcallback(null); //Ignore errors on cleanup routine
            return fcallback(null);
          });
        }
        else {
          totsize += stat.size;
          return fcallback(null);
        }
      });
    }, function (err) {
      if ((maxfoldersize > 0) && (totsize > maxfoldersize)) {
        return callback(Helper.NewError('User exceeded max folder size',-36));
      }
      callback(err);
    });
  });
};
exports.genRandomFileName = function (path, ext, callback) {
  //DO NOT USE THIS IN PUBLIC FOLDERS - SEE MKSTEMP FOR MORE INFO
  var filename = crypto.randomBytes(4).readUInt32LE(0) + crypto.randomBytes(4).readUInt32LE(0);
  filename += ext;
  fs.exists(path + filename, function (exists) {
    if (exists) return exports.genRandomFileName(path, ext, callback);
    return callback(null, filename);
  });
};
exports.rename = fs.rename;
exports.renameNoOverwrite = function (oldPath, newPath, callback){
  fs.exists(newPath, function (exists) {
    if (!exists) return fs.rename(oldPath, newPath, callback);
    else return callback;
  });
}
exports.unlink = fs.unlink;
exports.exists = fs.exists;
exports.tryUnlink = function (path, callback) {
  fs.unlink(path, function (err) {
    if (err && (err.code == 'ENOENT')) return callback(null);
    if(err) return callback(err);
    return callback(null);
  });
};
exports.outputFile = function (req, res, path, fname, callback, options) {
  if (!options) options = {};
  fs.stat(path, function (err, stat) {
    if (err != null) return callback(err);
    var fsize = stat.size;
    //Get MIME type
    var head = {
      'Content-Type': mime.lookup(path),
      'Content-Length': stat.size,
      'Content-Disposition': 'attachment; filename = ' + encodeURIComponent(fname)
    }
    if (options.attachment === false) { delete head['Content-Disposition'];    }
    if (options.mime_override) head['Content-Type'] = mime.lookup(options.mime_override);
    res.writeHead(200, head);
    var rs = fs.createReadStream(path);
    rs.pipe(res);
  });
};
exports.outputContent = function (req, res, content, mime_type, head) {
  if(!head) head = {};
  if(!head['Content-Type']) head['Content-Type'] = mime_type; 
  if(!head['Content-Length']) head['Content-Length'] = content.length;
  res.writeHead(200, head);
  res.write(content);
  res.end();
};
exports.getFileStats = function (req, res, path, callback) {
  fs.stat(path, function (err, stat) {
    if (err != null) return callback(err, null);
    return callback(null, stat);
  });
};
exports.copyFile = function(source, target, cb) {
  if (source == '') return exports.tryUnlink(target, cb);

  var cbCalled = false;
  var rd = fs.createReadStream(source);
  rd.on("error", done);
  var wr = fs.createWriteStream(target);
  wr.on("error", done);
  wr.on("close", function (ex) { done(); });
  rd.pipe(wr);
  
  function done(err) {
    if (!cbCalled) { if (typeof err == 'undefined') err = null; cb(err); cbCalled = true; }
  }
};
exports.cleanFileName = function (fname){
  if (typeof fname === undefined) return '';
  if (fname === null) return '';
  
  fname = fname.toString();
  if (fname.length > 247) fname = fname.substr(0, 247);
  return fname.replace(/[\/\?<>\\:\*\|":]/g, '').replace(/[\x00-\x1f\x80-\x9f]/g, '').replace(/^\.+$/, '').replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, '');
}
exports.loadViews = function (dpath, prefix, dont_overwrite) {
  if(!global.views) global.views ={};
  if (!fs.existsSync(dpath)) return;
  files = fs.readdirSync(dpath);
  for (var i = 0; i < files.length; i++) {
    if (files[i].indexOf('.ejs', files[i].length - 4) == -1) continue;
    var viewname = files[i].substr(0, files[i].length - 4);
    if(dont_overwrite && (viewname in global.views)) continue;
    global.views[viewname] = dpath + '/' + files[i];
  }
}
exports.getView = function (req, tmpl, options){
  if(!options) options = {};
  if(!tmpl) tmpl = req.jshconfig.basetemplate;
  if(!options.disable_override && req._override_basetemplate) tmpl = req._override_basetemplate;
  if (('views' in global) && (tmpl in global.views)) return global.views[tmpl];
  return tmpl;
}
exports.gen404 = function (req, res) {
  res.status(404);
  res.render(exports.getView(req, '404', { disable_override: true }), {
  });
}
exports.staticSalt = function(base){
  return crypto.createHash('sha1').update(base+os.hostname()+"asdfj234vwsljklawdkf@#$Asdflkj2l34v2aSD234sadf").digest('hex').toString();
}
exports.funcRecursive = function (fpath, filefunc, dirfunc, cb){
  if ((fpath[fpath.length - 1] == '/') || (fpath[fpath.length - 1] == '\\')) fpath = fpath.substr(0, fpath.length - 1);
  fs.exists(fpath, function (exists) {
    if (!exists) return cb(null);
    fs.readdir(fpath, function (err, files) {
      if (err) return cb(err);
      async.eachSeries(files, function (file, files_cb) {
        var filepath = fpath + '/' + file;
        fs.lstat(filepath, function (lstat_err, stats) {
          if (lstat_err) return files_cb(lstat_err);
          if (stats.isDirectory()) {
            exports.funcRecursive(filepath, filefunc, dirfunc, files_cb);
          }
          else {
            if (!filefunc) files_cb();
            else filefunc(filepath, function (file_err) {
              if (file_err) return files_cb(file_err);
              files_cb();
            });
          }
        });
      }, function (files_err) {
        if (err) return cb(err);
        if (!dirfunc) cb(null);
        else dirfunc(fpath, function (dir_err) {
          if (dir_err) return cb(dir_err);
          cb(null);
        });
      });
    });
  });
}
exports.rmdirRecursive = function (fpath, cb){
  return exports.funcRecursive(fpath, function (filepath, file_cb) { //filefunc
    fs.unlink(filepath, file_cb);
  }, function (dirpath, dir_cb) { //dirfunc
    fs.rmdir(dirpath, dir_cb);
  }, cb);
}
exports.sanitizePath = function (folder){
  if (!folder) return '';
  var rslt = path.dirname(folder);
  if (!Helper.endsWith(rslt, '/')) rslt += '/';
  rslt += path.basename(folder);
  return rslt;
}