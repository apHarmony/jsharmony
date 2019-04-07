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
exports.createFolderRecursiveSync = function (fpath) {
  fpath = path.resolve(fpath);
  if(fs.existsSync(fpath)) return;
  exports.createFolderRecursiveSync(path.dirname(fpath));
  fs.mkdirSync(fpath, '0777');
}
exports.touchSync = function(fpath){
  if(fs.existsSync(fpath)) return;
  fs.closeSync(fs.openSync(fpath, 'w'));
}
exports.clearFiles = function (dpath, seconds, maxfoldersize, callback) {
  var totsize = 0;
  fs.readdir(dpath, function (err, files) {
    //if (err) throw err; 
    if (err) return callback(null); //Ignore errors on cleanup routine
    async.eachLimit(files, 10, function (file, fcallback) {
      var fpath = path.join(dpath, file);
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
      'Content-Disposition': 'attachment; filename=' + encodeURIComponent(fname)
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
exports.getExtFileName = function(fpath, cb){
  if(fpath && (fpath.indexOf('%%%EXT%%%')>=0)){
    var rxstr = Helper.escapeRegEx(path.basename(fpath));
    rxstr = Helper.ReplaceAll(rxstr, '%%%EXT%%%', '(.*?)');
    var rx=RegExp("^"+rxstr+"$");
    fs.readdir(path.dirname(fpath), function(err, files){
      for(var i=0;i<files.length;i++){
        var file = files[i];
        var m = file.match(rx);
        if(m){
          fpath = path.dirname(fpath) + '/' + file;
          return cb(null, fpath);
        }
      }
      return cb(new Error('File not found'));
    });
  }
  else return cb(null, fpath);
}
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
exports.cleanPath = function (fname){
  if (typeof fname === undefined) return '';
  if (fname === null) return '';
  
  fname = fname.toString();
  if (fname.length > 247) fname = fname.substr(0, 247);
  return fname.replace(/[\?<>:\*\|":]/g, '').replace(/[\x00-\x1f\x80-\x9f]/g, '').replace(/^\.+$/, '').replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, '');
}
exports.staticSalt = function(base){
  return crypto.createHash('sha1').update(base+os.hostname()+"asdfj234vwsljklawdkf@#$Asdflkj2l34v2aSD234sadf").digest('hex').toString();
}
exports.funcRecursive = function (fpath, filefunc, dirfunc, options, cb, relativepath){
  options = _.extend({ dir_before_file: false }, options||{});
  if ((fpath[fpath.length - 1] == '/') || (fpath[fpath.length - 1] == '\\')) fpath = fpath.substr(0, fpath.length - 1);
  relativepath = relativepath || '';
  fs.exists(fpath, function (exists) {
    if (!exists) return cb(null);
    fs.readdir(fpath, function (err, files) {
      if (err) return cb(err);
      var skip = false;
      async.waterfall([
        //Pre-directory operation
        function(op_cb){
          if(!options.dir_before_file) return op_cb(null);
          if (!dirfunc) return op_cb(null);
          else dirfunc(fpath, relativepath, function (dir_err) {
            if (dir_err===false) skip = true;
            if (dir_err) return op_cb(dir_err);
            return op_cb(null);
          });
        },
        //File operations
        function(op_cb){
          if(skip) return op_cb(null);
          async.eachSeries(files, function (file, files_cb) {
            var filepath = path.join(fpath, file);
            var filerelativepath = path.join(relativepath, file);
            fs.lstat(filepath, function (lstat_err, stats) {
              if (lstat_err) return files_cb(lstat_err);
              if (stats.isDirectory()) {
                exports.funcRecursive(filepath, filefunc, dirfunc, options, files_cb, filerelativepath);
              }
              else {
                if (!filefunc) files_cb();
                else filefunc(filepath, filerelativepath, function (file_err) {
                  if (file_err) return files_cb(file_err);
                  files_cb();
                });
              }
            });
          }, op_cb);
        },
        //Post-directory operation
        function(op_cb){
          if(skip) return op_cb(null);
          if(options.dir_before_file) return op_cb(null);
          if (!dirfunc) return op_cb(null);
          else dirfunc(fpath, relativepath, function (dir_err) {
            if (dir_err) return op_cb(dir_err);
            return op_cb(null);
          });
        }
      ], cb);
    });
  });
}
exports.rmdirRecursive = function (fpath, cb){
  return exports.funcRecursive(fpath, function (filepath, relativepath, file_cb) { //filefunc
    fs.unlink(filepath, file_cb);
  }, function (dirpath, relativepath, dir_cb) { //dirfunc
    fs.rmdir(dirpath, dir_cb);
  }, undefined, cb);
}
exports.copyRecursive = function (source, target, options, cb){
  options = _.extend({
    forEachFile: function(filepath, targetpath, cb){ return cb(true); },
    forEachDir: function(dirpath, targetpath, cb){ return cb(true); }
  }, options);
  return exports.funcRecursive(source, function (filepath, relativepath, file_cb) { //filefunc
    var targetpath = path.join(target, relativepath);
    options.forEachDir(filepath, targetpath, function(copy){
      if(!copy) return file_cb();
      exports.copyFile(filepath, path.join(target, relativepath), file_cb);
    });
  }, function (dirpath, relativepath, dir_cb) { //dirfunc
    var targetpath = path.join(target, relativepath);
    options.forEachDir(dirpath, targetpath, function(create){
      if(!create) return dir_cb(false);
      exports.createFolderIfNotExists(targetpath, dir_cb);
    });
  }, { dir_before_file: true }, cb);
}
exports.rmdirRecursiveSync = function (fpath){
  if (fs.existsSync(fpath)) {
    fs.readdirSync(fpath).forEach(function(entry) {
      var entry_path = path.join(fpath, entry);
      if (fs.lstatSync(entry_path).isDirectory()) {
        exports.rmdirRecursiveSync(entry_path);
      } else {
        fs.unlinkSync(entry_path);
      }
    });
    fs.rmdirSync(fpath);
  }
}
exports.sanitizePath = function (folder){
  if (!folder) return '';
  var rslt = path.dirname(folder);
  if (!Helper.endsWith(rslt, '/')) rslt += '/';
  rslt += path.basename(folder);
  return rslt;
}
exports.readFile = function(path, options, sync, onComplete){
  if(sync){
    var txt = fs.readFileSync(path, options);
    return onComplete(null, txt);
  }
  else {
    fs.readFile(path, options, onComplete);
  }
}