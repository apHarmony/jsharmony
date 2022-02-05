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
    var file_orig_name = path.basename(xfile.originalFilename);
    var file_path = xfile.path;
    var file_ext = path.extname(path.basename(file_orig_name)).toLowerCase(); //Get extension
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
        if (_.isObject(err) && ('number' in err) && (err.number == -36)) return Helper.GenError(req, res, -36, 'User exceeded max temp folder size');
        return Helper.GenError(req, res, -99999, 'Error occurred during file operation (' + err.toString() + ')');
      }
      else {
        rslt = { '_success': 1, 'file_size': file_size, 'file_token': file_token, 'file_orig_name': file_orig_name, 'file_extension': file_ext };
        if (req.jsproxyid) return res.end(Helper.js_proxy(req, rslt));
        else return res.end(JSON.stringify(rslt));
      }
    });
  });
};

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
    //var file_size = xfile.size;
    var file_orig_name = path.basename(xfile.originalFilename);
    var file_path = xfile.path;
    var file_ext = path.extname(path.basename(file_orig_name)).toLowerCase(); //Get extension
    if (!_.includes(jsh.Config.valid_extensions, file_ext)) { return Helper.GenError(req, res, -32, 'File extension is not supported.'); }
    
    async.waterfall([
      async.apply(HelperFS.createFolderIfNotExists, cmsfiles_folder),
      async.apply(HelperFS.clearFiles, public_folder, jsh.Config.public_temp_expiration, -1),
      function (callback) {
        fs.exists(cmsfiles_folder + file_orig_name, function (exists) {
          if (exists) return callback({ number: -37, message: 'File already exists' });
          else return callback(null);
        });
      },
      function (callback) { HelperFS.rename(file_path, (cmsfiles_folder + file_orig_name), callback); }
    ], function (err, rslt) {
      //Handle error or return result
      if (err) {
        if (_.isObject(err) && ('number' in err) && (err.number == -36)) return Helper.GenError(req, res, -36, 'User exceeded max temp folder size');
        else if (_.isObject(err) && ('number' in err) && (err.number == -37)) return res.send('File name already exists on server - cannot overwrite');
        return Helper.GenError(req, res, -99999, 'Error occurred during file operation (' + err.toString() + ')');
      }
      else {
        var rhtml = '\
          <script type="text/javascript">\
            (function(){\
              var funcNum = ' + req.query.CKEditorFuncNum + ';\
              var url = "' + Helper.getFullURL(req, req.baseurl) + 'cmsfiles/' + file_orig_name + '";\
              var message = "Uploaded file successfully";\
              window.parent.CKEDITOR.tools.callFunction(funcNum, url, message);\
            })();\
          </script>';
        return res.end(rhtml);
      }
    });
  });
};

exports.ClearUpload = function (req, res) {
  var jsh = this.jsh;
  if (!('_DBContext' in req) || (req._DBContext == '') || (req._DBContext == null)) { return Helper.GenError(req, res, -30, 'Invalid file upload request.'); }
  var user_folder = jsh.Config.datadir + 'temp/' + req._DBContext + '/';
  HelperFS.clearFiles(user_folder, -1, -1, function (err) {
    res.end(JSON.stringify({ '_success': 1 }));
  });
};

exports.Download = function (req, res, fullmodelid, keyid, fieldid, options) {
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
        return Helper.GenError(req, res, -99999, 'Error occurred during file operation (' + err.toString() + ')');
      }
    }, serveoptions);
  };
  
  if (fullmodelid == '_temp') {
    var fname = path.basename(keyid);
    var file_ext = path.extname(fname).toLowerCase(); //Get extension
    if ((file_ext == '') || (!_.includes(jsh.Config.valid_extensions, file_ext))) { return Helper.GenError(req, res, -32, 'File extension is not supported.'); }
    var fpath = jsh.Config.datadir + 'temp/' + req._DBContext + '/' + fname;
    serveFile(req, res, fpath, fname, file_ext);
  }
  else {
    if (!this.jsh.hasModel(req, fullmodelid)) throw new Error('Error: Model ' + fullmodelid + ' not found in collection.');
    var model = this.jsh.getModel(req, fullmodelid);
    var db = this.jsh.getModelDB(req, fullmodelid);
    //Verify model access
    if (!Helper.hasModelAction(req, model, 'B')) { Helper.GenError(req, res, -11, _this._tP('Invalid Model Access for @fullmodelid', { fullmodelid })); return; }
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
    if (!('controlparams' in field)) { throw new Error('File ' + fieldid + ' missing controlparams'); }
    if (!('sqlparams' in field.controlparams)) { throw new Error('File ' + fieldid + ' missing sqlparams'); }
    if ('file_extension' in field.controlparams.sqlparams) { fieldlist.push(field.controlparams.sqlparams.file_extension); }
    if ('file_name' in field.controlparams.sqlparams) { fieldlist.push(field.controlparams.sqlparams.file_name); }
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
      if(err) jsh.Log.error(err);
      if ((rslt == null) || (rslt.length != 1) || (rslt[0] == null)) { return Helper.GenError(req, res, -33, 'Download file not found.'); }
      var fname = keyid;
      if ('file_name' in field.controlparams.sqlparams) { fname = rslt[0][field.controlparams.sqlparams.file_name]; }
      else if ('file_extension' in field.controlparams.sqlparams) { fname += rslt[0][field.controlparams.sqlparams.file_extension]; }
      var fpath = jsh.Config.datadir + field.controlparams.data_folder + '/' + (field.controlparams.data_file_prefix||fieldid) + '_' + keyid;
      if ('thumb' in options) {
        if(('show_thumbnail' in field.controlparams) && (field.controlparams.show_thumbnail===options.thumb)){
          fpath = jsh.Config.datadir + field.controlparams.data_folder + '/' + (field.controlparams.data_file_prefix||fieldid) + '_' + field.controlparams.show_thumbnail + '_' + keyid;
        }
        else if (field.controlparams.thumbnails) for (var tname in field.controlparams.thumbnails) {
          fpath = jsh.Config.datadir + field.controlparams.data_folder + '/' + (field.controlparams.data_file_prefix||fieldid) + '_' + tname + '_' + keyid;
          break;
        }
      }
      if (field.controlparams._data_file_has_extension) fpath += '%%%EXT%%%';
      HelperFS.getExtFileName(fpath, function(err, filename){
        if(err) return Helper.GenError(req, res, -33, 'Download file not found.');
        var fext = path.extname(filename);
        if(field.controlparams._data_file_has_extension && !('file_extension' in field.controlparams.sqlparams)) fname += fext;
        serveFile(req, res, filename, fname, fext);
      });
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
    if ('file_size' in field.controlparams.sqlparams) {
      if (!_.includes(fieldlist, field.controlparams.sqlparams.file_size)) fieldlist.push(field.controlparams.sqlparams.file_size);
      if (!this.getFieldByName(model.fields, field.controlparams.sqlparams.file_size)) throw new Error(file + ' file_size parameter not defined as a field');
    }
    if ('file_extension' in field.controlparams.sqlparams) {
      if (!_.includes(fieldlist, field.controlparams.sqlparams.file_extension)) fieldlist.push(field.controlparams.sqlparams.file_extension);
      if (!this.getFieldByName(model.fields, field.controlparams.sqlparams.file_extension)) throw new Error(file + ' file_extension parameter not defined as a field');
    }
    if ('file_upload_timestamp' in field.controlparams.sqlparams) {
      if (!_.includes(sql_extfields, field.controlparams.sqlparams.file_upload_timestamp)){
        if (_.includes(fieldlist, field.controlparams.sqlparams.file_upload_timestamp)) Helper.remove(fieldlist, field.controlparams.sqlparams.file_upload_timestamp);
        sql_extfields.push(field.controlparams.sqlparams.file_upload_timestamp);
        if (!this.getFieldByName(model.fields, field.controlparams.sqlparams.file_upload_timestamp)) throw new Error(file + ' file_upload_timestamp parameter not defined as a field');
        var sql_TSTMP = _this.getSQL(model, jsh.map.timestamp);
        if(!sql_TSTMP) throw new Error('SQL macro '+jsh.map.timestamp+' needs to be defined: function should return timestamp for upload');
        sql_extvalues.push(_this.getSQL(model, sql_TSTMP));
      }
    }
    if ('file_upload_user' in field.controlparams.sqlparams) {
      if (!_.includes(sql_extfields, field.controlparams.sqlparams.file_upload_user)){
        if (_.includes(fieldlist, field.controlparams.sqlparams.file_upload_user)) Helper.remove(fieldlist, field.controlparams.sqlparams.file_upload_user);
        sql_extfields.push(field.controlparams.sqlparams.file_upload_user);
        if (!this.getFieldByName(model.fields, field.controlparams.sqlparams.file_upload_user)) throw new Error(file + ' file_upload_user parameter not defined as a field');
        var sql_CUSER = _this.getSQL(model, jsh.map.current_user);
        if(!sql_CUSER) throw new Error('SQL macro '+jsh.map.current_user+' needs to be defined: function should return User ID for upload');
        sql_extvalues.push(sql_CUSER);
      }
    }
    if (!('_DBContext' in req) || (req._DBContext == '') || (req._DBContext == null)) { return filecallback(Helper.GenError(req, res, -10, 'Invalid Login / Not Authenticated')); }
    var filedest = jsh.Config.datadir + field.controlparams.data_folder + '/' + (field.controlparams.data_file_prefix||file) + '_%%%KEY%%%';
    if (field.controlparams._data_file_has_extension) filedest += '%%%EXT%%%';
    if (P[file] == '') {
      if ('file_size' in field.controlparams.sqlparams) {
        if (field.controlparams.sqlparams.file_size in P) throw new Error('Parameter conflict - ' + field.controlparams.sqlparams.file_size);
        P[field.controlparams.sqlparams.file_size] = null;
      }
      if ('file_extension' in field.controlparams.sqlparams) {
        if (field.controlparams.sqlparams.file_extension in P) throw new Error('Parameter conflict - ' + field.controlparams.sqlparams.file_extension);
        P[field.controlparams.sqlparams.file_extension] = null;
      }
      //Delete File in main operation
      fileops.push({ op: 'move', src: '', dest: filedest });
      //Delete Thumbnails in main operation
      if (field.controlparams.thumbnails) for (var tname in field.controlparams.thumbnails) {
        var tdest = jsh.Config.datadir + field.controlparams.data_folder + '/' + (field.controlparams.data_file_prefix||field.name) + '_' + tname + '_%%%KEY%%%';
        if (field.controlparams._data_file_has_extension) filedest += '%%%EXT%%%';
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
        if ('file_size' in field.controlparams.sqlparams) {
          if (field.controlparams.sqlparams.file_size in P) throw new Error('Parameter conflict - ' + field.controlparams.sqlparams.file_size);
          P[field.controlparams.sqlparams.file_size] = file_size;
        }
        if ('file_extension' in field.controlparams.sqlparams) {
          if (field.controlparams.sqlparams.file_extension in P) throw new Error('Parameter conflict - ' + field.controlparams.sqlparams.file_extension);
          P[field.controlparams.sqlparams.file_extension] = file_ext;
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
            var tdest = jsh.Config.datadir + field.controlparams.data_folder + '/' + (field.controlparams.data_file_prefix||field.name) + '_' + tname + '_%%%KEY%%%';
            if (field.controlparams._data_file_has_extension) tdest += '.' + field.controlparams.thumbnails[tname].format;
            if (_.includes(jsh.Config.supported_images, file_ext)) {
              if (field.controlparams.thumbnails[tname].resize) fileops.push({ op: 'img_resize', src: fpath, dest: tdest, size: field.controlparams.thumbnails[tname].resize, format: field.controlparams.thumbnails[tname].format });
              else if (field.controlparams.thumbnails[tname].crop) fileops.push({ op: 'img_crop', src: fpath, dest: tdest, size: field.controlparams.thumbnails[tname].crop, format: field.controlparams.thumbnails[tname].format });
              else throw new Error('No thumbnail resize or crop operation in ' + field.name);
            }
          }
          
          filedest = Helper.ReplaceAll(filedest, '%%%EXT%%%', '.' + field.controlparams.image.format);
          if (field.controlparams.image.resize) fileops.push({ op: 'img_resize', src: fpath, dest: filedest, size: field.controlparams.image.resize, format: field.controlparams.image.format });
          else if (field.controlparams.image.crop) fileops.push({ op: 'img_crop', src: fpath, dest: filedest, size: field.controlparams.image.crop, format: field.controlparams.image.format });
          else fileops.push({ op: 'img_resample', src: fpath, dest: filedest, format: field.controlparams.image.format });
          fileops.push({ op: 'delete_on_complete', src: fpath });
        }
        else {
          //On completion (of entire SQL statement), move file (Add another dbtask to be executed)
          filedest = Helper.ReplaceAll(filedest, '%%%EXT%%%', file_ext);
          fileops.push({ op: 'move', src: fpath, dest: filedest });
        }
        
        filecallback(null);
      });
    }
  }
  else filecallback(null);
};

exports.ProcessFileOperations = function (keyval, fileops, rslt, stats, callback) {
  var jsh = this.jsh;
  if ((typeof keyval == 'undefined') || !keyval) return callback(Helper.NewError('Invalid file key', -13), null);
  
  async.each(fileops, function (fileop, opcallback) {
    var filesrc = '';
    var filedest = '';
    if (fileop.src) filesrc = Helper.ReplaceAll(fileop.src, '%%%KEY%%%', keyval);
    if (fileop.dest) filedest = Helper.ReplaceAll(fileop.dest, '%%%KEY%%%', keyval);

    async.waterfall([
      function(filehandlercb){
        //Get src file extension
        HelperFS.getExtFileName(filesrc, function(err, filename){
          if(err) return callback(Helper.NewError('File not found', -33));
          filesrc = filename;
          return filehandlercb();
        });
      },
      function(filehandlercb){
        //Get dest file extension
        HelperFS.getExtFileName(filedest, function(err, filename){
          if(err) return callback(Helper.NewError('File not found', -33));
          filedest = filename;
          return filehandlercb();
        });
      },
    ], function(){
      if (fileop.op == 'move') {
        HelperFS.copyFile(fileop.src, filedest, function (fileerr) {
          if (fileerr != null) return opcallback(fileerr);
          return opcallback(null);
        });
      }
      else if (fileop.op == 'img_resample'){
        jsh.Extensions.image.resample(filesrc, filedest, fileop.format, opcallback);
      }
      else if (fileop.op == 'img_crop') {
        jsh.Extensions.image.crop(filesrc, filedest, fileop.size, fileop.format, opcallback);
      }
      else if (fileop.op == 'img_resize') {
        jsh.Extensions.image.resize(filesrc, filedest, fileop.size, fileop.format, opcallback);
      }
      else return opcallback(null);
    });
  }, function (fileerr) {
    if ((fileerr != null) && ('code' in fileerr) && (fileerr.code == 'ENOENT')) { /* Ignore this error */ }
    else if (fileerr != null) {
      jsh.Log.error(fileerr);
      return callback(Helper.NewError('Error committing file update.', -35), null);
    }
    return callback(null, rslt, stats);
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