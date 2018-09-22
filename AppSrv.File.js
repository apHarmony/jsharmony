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
var async = require('async');
var path = require('path');
var multiparty = require('multiparty');
var HelperFS = require('./lib/HelperFS.js');
var fs = require('fs');
var imagick = require('gm').subClass({ imageMagick: true });

module.exports = exports = {};

exports.Upload = function (req, res) {
  var jsh = this.jsh;
  if (!('_DBContext' in req) || (req._DBContext == '') || (req._DBContext == null)) { return Helper.GenError(req, res, -30, 'Invalid file upload request.'); }
  var temp_folder = jsh.Config.datadir + 'temp/';
  var public_folder = temp_folder + 'public/';
  var user_folder = temp_folder + req._DBContext + '/';
  var form = new multiparty.Form({ maxFilesSize: jsh.Config.max_filesize, uploadDir: (public_folder) });
  form.parse(req, function (err, fields, files) {
    //Handle Error
    if (err != null) {
      if (('code' in err) && (err.code == 'ETOOBIG')) { return Helper.GenError(req, res, -31, 'Upload file exceeded maximum file size.'); }
      jsh.Log.error(err);
      return Helper.GenError(req, res, -30, 'Invalid file upload request.');
    }
    
    var prevtoken = '';
    if ((fields != null) && ('prevtoken' in fields) && (_.isString(fields.prevtoken[0]))) prevtoken = path.basename(fields.prevtoken[0]);
    
    if (files == null) { return Helper.GenError(req, res, -30, 'Invalid file upload request.'); }
    if (!('file' in files)) { return Helper.GenError(req, res, -30, 'Invalid file upload request.'); }
    if (files.file.length != 1) { return Helper.GenError(req, res, -30, 'Invalid file upload request.'); }
    
    var xfile = files.file[0];
    var file_size = xfile.size;
    var file_token = '';
    var file_origname = path.basename(xfile.originalFilename);
    var file_path = xfile.path;
    var file_ext = path.extname(path.basename(file_origname)).toLowerCase(); //Get extension
    if (!_.includes(jsh.Config.valid_extensions, file_ext)) { return Helper.GenError(req, res, -32, 'File extension is not supported.'); }
    
    async.waterfall([
      async.apply(HelperFS.createFolderIfNotExists, user_folder),
      async.apply(HelperFS.clearFiles, user_folder, jsh.Config.user_temp_expiration, jsh.Config.max_user_temp_foldersize),
      async.apply(HelperFS.clearFiles, public_folder, jsh.Config.public_temp_expiration, -1),
      async.apply(HelperFS.genRandomFileName, user_folder, file_ext),
      function (fname, callback) { file_token = fname; callback(null); },
      function (callback) { HelperFS.rename(file_path, (user_folder + file_token), callback); },
      function (callback) { if (prevtoken != '') { HelperFS.tryUnlink(user_folder + prevtoken, callback); } else callback(null); }
    ], function (err, rslt) {
      //Handle error or return result
      if (err) {
        if (_.isObject(err) && ('number' in err) && (err.number == -36)) return Helper.GenError(req, res, -36, "User exceeded max temp folder size");
        return Helper.GenError(req, res, -99999, "Error occurred during file operation (" + err.toString() + ')');
      }
      else {
        rslt = { '_success': 1, 'FILE_SIZE': file_size, 'FILE_TOKEN': file_token, 'FILE_ORIGNAME': file_origname, 'FILE_EXT': file_ext };
        if (req.jsproxyid) return res.end(Helper.js_proxy(req, rslt));
        else return res.end(JSON.stringify(rslt));
      }
    });
  });
}

exports.UploadCKEditor = function (req, res) {
  var jsh = this.jsh;
  if (!('_DBContext' in req) || (req._DBContext == '') || (req._DBContext == null)) { return Helper.GenError(req, res, -30, 'Invalid file upload request.'); }
  if (!Helper.HasRole(req, 'CMSFILES')) { Helper.GenError(req, res, -15, 'Invalid Access'); return; }
  var temp_folder = jsh.Config.datadir + 'temp/';
  var public_folder = temp_folder + 'public/';
  var cmsfiles_folder = jsh.Config.datadir + 'cmsfiles/';
  var form = new multiparty.Form({ maxFilesSize: jsh.Config.max_filesize, uploadDir: (public_folder) });
  form.parse(req, function (err, fields, files) {
    //Handle Error
    if (err != null) {
      if (('code' in err) && (err.code == 'ETOOBIG')) { return Helper.GenError(req, res, -31, 'Upload file exceeded maximum file size.'); }
      jsh.Log.error(err);
      return Helper.GenError(req, res, -30, 'Invalid file upload request.');
    }
    if (files == null) { return Helper.GenError(req, res, -30, 'Invalid file upload request.'); }
    if (!('upload' in files)) { return Helper.GenError(req, res, -30, 'Invalid file upload request.'); }
    if (files.upload.length != 1) { return Helper.GenError(req, res, -30, 'Invalid file upload request.'); }
    
    var xfile = files.upload[0];
    var file_size = xfile.size;
    var file_origname = path.basename(xfile.originalFilename);
    var file_path = xfile.path;
    var file_ext = path.extname(path.basename(file_origname)).toLowerCase(); //Get extension
    if (!_.includes(jsh.Config.valid_extensions, file_ext)) { return Helper.GenError(req, res, -32, 'File extension is not supported.'); }
    
    async.waterfall([
      async.apply(HelperFS.createFolderIfNotExists, cmsfiles_folder),
      async.apply(HelperFS.clearFiles, public_folder, jsh.Config.public_temp_expiration, -1),
      function (callback) {
        fs.exists(cmsfiles_folder + file_origname, function (exists) {
          if (exists) return callback({ number: -37, message: "File already exists" });
          else return callback(null);
        });
      },
      function (callback) { HelperFS.rename(file_path, (cmsfiles_folder + file_origname), callback); }
    ], function (err, rslt) {
      //Handle error or return result
      if (err) {
        if (_.isObject(err) && ('number' in err) && (err.number == -36)) return Helper.GenError(req, res, -36, "User exceeded max temp folder size");
        else if (_.isObject(err) && ('number' in err) && (err.number == -37)) return res.send("File name already exists on server - cannot overwrite");
        return Helper.GenError(req, res, -99999, "Error occurred during file operation (" + err.toString() + ')');
      }
      else {
        var rslt = "\
          <script type='text/javascript'>\
            (function(){\
              var funcNum = " + req.query.CKEditorFuncNum + ";\
              var url = \"" + Helper.getFullURL(req, req.baseurl) + "cmsfiles/" + file_origname + "\";\
              var message = \"Uploaded file successfully\";\
              window.parent.CKEDITOR.tools.callFunction(funcNum, url, message);\
            })();\
          </script>";
        return res.end(rslt);
      }
    });
  });
}

exports.ClearUpload = function (req, res) {
  var jsh = this.jsh;
  if (!('_DBContext' in req) || (req._DBContext == '') || (req._DBContext == null)) { return Helper.GenError(req, res, -30, 'Invalid file upload request.'); }
  var user_folder = jsh.Config.datadir + 'temp/' + req._DBContext + '/';
  HelperFS.clearFiles(user_folder, -1, -1, function (err) {
    res.end(JSON.stringify({ '_success': 1 }));
  });
}

exports.Download = function (req, res, modelid, keyid, fieldid, options) {
  if (!options) options = {};
  if (!('_DBContext' in req) || (req._DBContext == '') || (req._DBContext == null)) { return Helper.GenError(req, res, -10, 'Invalid Login / Not Authenticated'); }
  if (!keyid) return Helper.GenError(req, res, -33, 'Download file not found.');
  if (req.query && (req.query.format=='js')) req.jsproxyid = 'xfiledownloader';
  var _this = this;
  var jsh = this.jsh;
  
  var serveFile = function (req, res, fpath, fname, fext) {
    var serveoptions = {};
    if (options.view) serveoptions = { attachment: false, mime_override: fext };
    HelperFS.outputFile(req, res, fpath, fname, function (err) {
      //Only executes upon error
      if (err != null) {
        if (('code' in err) && (err.code == 'ENOENT')) return Helper.GenError(req, res, -33, 'Download file not found.');
        return Helper.GenError(req, res, -99999, "Error occurred during file operation (" + err.toString() + ')');
      }
    }, serveoptions);
  };
  
  if (modelid == '_temp') {
    var fname = path.basename(keyid);
    var file_ext = path.extname(fname).toLowerCase(); //Get extension
    if ((file_ext == '') || (!_.includes(jsh.Config.valid_extensions, file_ext))) { return Helper.GenError(req, res, -32, 'File extension is not supported.'); }
    var fpath = jsh.Config.datadir + 'temp/' + req._DBContext + '/' + fname;
    serveFile(req, res, fpath, fname, fname);
  }
  else {
    if (!this.jsh.hasModel(req, modelid)) throw new Error("Error: Model " + modelid + " not found in collection.");
    var model = this.jsh.getModel(req, modelid);
    var db = this.jsh.getModelDB(req, modelid);
    //Verify model access
    if (!Helper.HasModelAccess(req, model, 'B')) { Helper.GenError(req, res, -11, 'Invalid Model Access for '+modelid); return; }
    if (model.unbound) { Helper.GenError(req, res, -11, 'Cannot run database queries on unbound models'); return; }
    //Get key name
    var keylist = this.getKeyNames(model.fields);
    var keys = this.getFieldsByName(model.fields, keylist);
    if (keys.length != 1) throw new Error('File downloads require one key');
    var filelist = this.getFileFieldNames(req, model.fields, 'B');
    var fieldlist = [keylist[0]];
    //Make sure fieldid is in fields
    if (!_.includes(filelist, fieldid)) return Helper.GenError(req, res, -33, 'Download file not found.');
    var field = this.getFieldByName(model.fields, fieldid);
    if (!('controlparams' in field)) { throw new Error('File ' + file + ' missing controlparams'); }
    if (!('sqlparams' in field.controlparams)) { throw new Error('File ' + file + ' missing sqlparams'); }
    if ('FILE_EXT' in field.controlparams.sqlparams) { fieldlist.push(field.controlparams.sqlparams.FILE_EXT); }
    if ('FILE_NAME' in field.controlparams.sqlparams) { fieldlist.push(field.controlparams.sqlparams.FILE_NAME); }
    //Get row from database
    var sql_ptypes = [];
    var sql_params = {};
    var verrors = {};
    var datalockqueries = [];
    var fields = _this.getFieldsByName(model.fields, fieldlist);
    
    //Add DataLock parameters to SQL 
    this.getDataLockSQL(req, model, model.fields, sql_ptypes, sql_params, verrors, function (datalockquery) { datalockqueries.push(datalockquery); });
    //Add keys as SQL parameters
    var keyfield = keys[0];
    var keyname = keyfield.name;
    var dbtype = _this.getDBType(keyfield);
    sql_ptypes.push(dbtype);
    sql_params[keyname] = this.DeformatParam(keyfield, keyid, verrors);
    
    verrors = _.merge(verrors, model.xvalidate.Validate('K', sql_params));
    if (!_.isEmpty(verrors)) { Helper.GenError(req, res, -2, verrors[''].join('\n')); return; }
    
    var sql = db.sql.Download(_this.jsh, model, fields, keys, datalockqueries);
    
    this.ExecRow(req._DBContext, sql, sql_ptypes, sql_params, function (err, rslt) {
      //Get extension, filename
      if ((rslt == null) || (rslt.length != 1) || (rslt[0] == null)) { return Helper.GenError(req, res, -33, 'Download file not found.'); }
      var fname = keyid;
      if ('FILE_NAME' in field.controlparams.sqlparams) { fname = rslt[0][field.controlparams.sqlparams.FILE_NAME]; }
      else if ('FILE_EXT' in field.controlparams.sqlparams) { fname += rslt[0][field.controlparams.sqlparams.FILE_EXT]; }
      else if (field.controlparams.image && field.controlparams.image.format) { fname += '.' + field.controlparams.image.format; }
      var fpath = jsh.Config.datadir + field.controlparams.data_folder + '/' + fieldid + '_' + keyid;
      if (options.thumb) {
        if (field.controlparams.thumbnails) for (var tname in field.controlparams.thumbnails) {
          fpath = jsh.Config.datadir + field.controlparams.data_folder + '/' + tname + '_' + keyid;
          break;
        }
      }
      serveFile(req, res, fpath, fname, fname);
    }, undefined, db);
  }
};

exports.ProcessFileParams = function (req, res, model, P, fieldlist, sql_extfields, sql_extvalues, fileops, vfiles, file, filecallback) {
  var _this = this;
  var jsh = this.jsh;
  var field = this.getFieldByName(model.fields, file);
  //Validate File field
  if (file in P) {
    if (!('controlparams' in field)) { throw new Error('File ' + file + ' missing controlparams'); }
    if (!('sqlparams' in field.controlparams)) { throw new Error('File ' + file + ' missing sqlparams'); }
    if ('FILE_SIZE' in field.controlparams.sqlparams) { fieldlist.push(field.controlparams.sqlparams.FILE_SIZE); if (!this.getFieldByName(model.fields, field.controlparams.sqlparams.FILE_SIZE)) throw new Error(file + ' FILE_SIZE parameter not defined as a field'); }
    if ('FILE_EXT' in field.controlparams.sqlparams) { fieldlist.push(field.controlparams.sqlparams.FILE_EXT); if (!this.getFieldByName(model.fields, field.controlparams.sqlparams.FILE_EXT)) throw new Error(file + ' FILE_EXT parameter not defined as a field'); }
    if ('FILE_UTSTMP' in field.controlparams.sqlparams) {
      sql_extfields.push(field.controlparams.sqlparams.FILE_UTSTMP);
      if (!('sqlparams' in req.jshsite)) { throw new Error('Config missing sqlparams'); }
      if (!('TSTMP' in req.jshsite.sqlparams)) { throw new Error('No TSTMP in sqlparams'); }
      if (!this.getFieldByName(model.fields, field.controlparams.sqlparams.FILE_UTSTMP)) throw new Error(file + ' FILE_UTSTMP parameter not defined as a field');
      sql_extvalues.push(_this.getSQL(model, req.jshsite.sqlparams.TSTMP));
    }
    if ('FILE_UU' in field.controlparams.sqlparams) {
      sql_extfields.push(field.controlparams.sqlparams.FILE_UU);
      if (!('sqlparams' in req.jshsite)) { throw new Error('Config missing sqlparams'); }
      if (!('CUSER' in req.jshsite.sqlparams)) { throw new Error('No CUSER in sqlparams'); }
      if (!this.getFieldByName(model.fields, field.controlparams.sqlparams.FILE_UU)) throw new Error(file + ' FILE_UU parameter not defined as a field');
      sql_extvalues.push(_this.getSQL(model, req.jshsite.sqlparams.CUSER));
    }
    if (!('_DBContext' in req) || (req._DBContext == '') || (req._DBContext == null)) { return filecallback(Helper.GenError(req, res, -10, 'Invalid Login / Not Authenticated')); }
    var filedest = jsh.Config.datadir + field.controlparams.data_folder + '/' + file + '_%%%KEY%%%';
    if (P[file] == '') {
      if ('FILE_SIZE' in field.controlparams.sqlparams) {
        if (field.controlparams.sqlparams.FILE_SIZE in P) throw new Error('Parameter conflict - ' + field.controlparams.sqlparams.FILE_SIZE);
        P[field.controlparams.sqlparams.FILE_SIZE] = null;
      }
      if ('FILE_EXT' in field.controlparams.sqlparams) {
        if (field.controlparams.sqlparams.FILE_EXT in P) throw new Error('Parameter conflict - ' + field.controlparams.sqlparams.FILE_EXT);
        P[field.controlparams.sqlparams.FILE_EXT] = null;
      }
      //Delete File in main operation
      fileops.push({ op: 'move', src: '', dest: filedest });
      //Delete Thumbnails in main operation
      if (field.controlparams.thumbnails) for (var tname in field.controlparams.thumbnails) {
        var tdest = jsh.Config.datadir + field.controlparams.data_folder + '/' + tname + '_%%%KEY%%%';
        fileops.push({ op: 'move', src: '', dest: tdest });
      }
      filecallback(null);
    }
    else {
      var fpath = '';
      //Separate model.id, keyid
      if (P[file].indexOf('_temp/') != 0) { return Helper.GenError(req, res, -34, 'File path not supported'); }
      var filekeyid = P[file].substr(('_temp/').length);
      var fname = path.basename(filekeyid);
      var file_ext = path.extname(fname).toLowerCase(); //Get extension
      if ((file_ext == '') || (!_.includes(jsh.Config.valid_extensions, file_ext))) { return filecallback(Helper.GenError(req, res, -32, 'File extension is not supported.')); }
      fpath = jsh.Config.datadir + 'temp/' + req._DBContext + '/' + fname;
      //Validate file exists, get stats (size + ext)
      HelperFS.getFileStats(req, res, fpath, function (err, stat) {
        if (err != null) { return filecallback(Helper.GenError(req, res, -33, 'File not found.')); }
        //Add parameters, make sure they don't conflict with existing parameters
        var file_size = stat.size;
        if ('FILE_SIZE' in field.controlparams.sqlparams) {
          if (field.controlparams.sqlparams.FILE_SIZE in P) throw new Error('Parameter conflict - ' + field.controlparams.sqlparams.FILE_SIZE);
          P[field.controlparams.sqlparams.FILE_SIZE] = file_size;
        }
        if ('FILE_EXT' in field.controlparams.sqlparams) {
          if (field.controlparams.sqlparams.FILE_EXT in P) throw new Error('Parameter conflict - ' + field.controlparams.sqlparams.FILE_EXT);
          P[field.controlparams.sqlparams.FILE_EXT] = file_ext;
        }
        //Perform validation, if necessary - MaxSize, Extension, Required
        vfiles[file] = {
          size: file_size,
          ext: file_ext
        };
        
        //Resize Image, if applicable
        if (field.controlparams.image && _.includes(jsh.Config.supported_images, file_ext)) {
          //Create Thumbnails, if applicable
          if (field.controlparams.thumbnails) for (var tname in field.controlparams.thumbnails) {
            var tdest = jsh.Config.datadir + field.controlparams.data_folder + '/' + tname + '_%%%KEY%%%';
            if (_.includes(jsh.Config.supported_images, file_ext)) {
              if (field.controlparams.thumbnails[tname].resize) fileops.push({ op: 'img_resize', src: fpath, dest: tdest, size: field.controlparams.thumbnails[tname].resize, format: field.controlparams.thumbnails[tname].format });
              else if (field.controlparams.thumbnails[tname].crop) fileops.push({ op: 'img_crop', src: fpath, dest: tdest, size: field.controlparams.thumbnails[tname].crop, format: field.controlparams.thumbnails[tname].format });
              else throw new Error('No thumbnail resize or crop operation in ' + field.name);
            }
          }
          
          if (field.controlparams.image.resize) fileops.push({ op: 'img_resize', src: fpath, dest: filedest, size: field.controlparams.image.resize, format: field.controlparams.image.format });
          else if (field.controlparams.image.crop) fileops.push({ op: 'img_crop', src: fpath, dest: filedest, size: field.controlparams.image.crop, format: field.controlparams.image.format });
          else throw new Error('No image resize or crop operation in ' + field.name);
          fileops.push({ op: 'delete_on_complete', src: fpath });
        }
        else {
          //On completion (of entire SQL statement), move file (Add another dbtask to be executed)
          fileops.push({ op: 'move', src: fpath, dest: filedest });
        }
        
        filecallback(null);
      });
    }
  }
  else filecallback(null);
};

exports.ProcessFileOperations = function (keyval, fileops, rslt, callback) {
  var jsh = this.jsh;
  if ((typeof keyval == 'undefined') || !keyval) return callback(Helper.NewError('Invalid file key', -13), null);
  
  async.each(fileops, function (fileop, opcallback) {
    var filesrc = '';
    var filedest = '';
    if (fileop.src) filesrc = Helper.ReplaceAll(fileop.src, '%%%KEY%%%', keyval);
    if (fileop.dest) filedest = Helper.ReplaceAll(fileop.dest, '%%%KEY%%%', keyval);
    
    if (fileop.op == 'move') {
      HelperFS.copyFile(fileop.src, filedest, function (fileerr) {
        if (fileerr != null) return opcallback(fileerr);
        return opcallback(null);
      });
    }
    else if (fileop.op == 'img_crop') {
      //Calculate w/h + x/y
      //Optionally override output format
      var img = imagick(filesrc);
      img.size(function (err, size) {
        if (err) return opcallback(err);
        var cropw = fileop.size[0];
        var croph = fileop.size[1];
        var outerw = cropw;
        var outerh = croph;
        if ((size.width / cropw) > (size.height / croph)) {
          outerw = Math.round(size.width * (croph / size.height));
        }
        else {
          outerh = Math.round(size.height * (cropw / size.width));
        }
        var cropx = (outerw - cropw) / 2;
        var cropy = (outerh - croph) / 2;
        
        if (fileop.format) {
          img.setFormat(fileop.format);
          if (_.includes(['jpeg', 'jpg'], fileop.format)) img.flatten();
        }
        img.quality(90);
        img.resize(outerw, outerh);
        img.crop(cropw, croph, cropx, cropy);
        img.repage(0, 0, 0, 0);
        img.noProfile().write(filedest, function (err) {
          if (err) return opcallback(err);
          return opcallback(null);
        });
      });
    }
    else if (fileop.op == 'img_resize') {
      var img = imagick(filesrc);
      var imgoptions = {};
      if ((fileop.size.length >= 3) && fileop.size[2]) imgoptions = fileop.size[2];
      if (fileop.format) {
        img.setFormat(fileop.format);
        if (_.includes(['jpeg', 'jpg'], fileop.format)) { img.flatten(); }
      }
      img.quality(90);
      if (imgoptions.upsize) {
        img.resize(fileop.size[0], fileop.size[1]);
      }
      else img.resize(fileop.size[0], fileop.size[1], '>');
      if (imgoptions.extend) {
        img.gravity('Center').extent(fileop.size[0], fileop.size[1]);
      }
      img.noProfile().write(filedest, function (err) {
        if (err) return opcallback(err);
        return opcallback(null);
      });
    }
    else return opcallback(null);
  }, function (fileerr) {
    if ((fileerr != null) && ('code' in fileerr) && (fileerr.code == 'ENOENT')) { /* Ignore this error */ }
    else if (fileerr != null) {
      jsh.Log.error(fileerr);
      return callback(Helper.NewError('Error committing file update.', -35), null);
    }
    return callback(null, rslt);
  });
};

exports.ProcessFileOperationsDone = function (fileops, callback) {
  async.eachSeries(fileops, function (fileop, opcallback) {
    if ((fileop.op == 'move') || (fileop.op == 'delete_on_complete')) {
      if (fileop.src == '') return opcallback(null);
      HelperFS.unlink(fileop.src, function (err) { opcallback(null); });
    }
    else return opcallback(null);
  }, function (err) { callback(null, null); });
};

return module.exports;