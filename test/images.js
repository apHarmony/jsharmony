/*
Copyright 2020 apHarmony

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

var path = require('path');
var HelperFS = require('../lib/HelperFS.js');
var _ = require('lodash');
var async = require('async');
var assert = require('assert');
var fs = require('fs');

var HelperImg = require('jsharmony-image-sharp');
//var HelperImg = require('jsharmony-image-magick');

var CREATE_EXPECTED_IMAGES = false;

var srcPath = path.join(__dirname, 'src/images/base');
var cmpPath = path.join(__dirname, 'data/images/expected');
var dstPath = path.join(__dirname, 'data/images/generated');

if(CREATE_EXPECTED_IMAGES) dstPath = cmpPath;

HelperFS.createFolderRecursiveSync(dstPath);

var TICK_DURATION = 50;
var ticks = 0;
var lastTickTime = new Date().getTime();
var hungTicks = 0;
var hungTickTime = 0;
var tickTimer = setInterval(function(){
  ticks++;
  var curTime = new Date().getTime();
  if(((curTime-lastTickTime) / TICK_DURATION) > 1.8){
    hungTicks++;
    hungTickTime += (curTime-lastTickTime);
  }
  lastTickTime = curTime;
}, TICK_DURATION);

function validateImage(src, dst, format, cb){
  var srcSize = null;
  var dstSize = null;
  async.waterfall([
    function(size_cb){
      if(!fs.existsSync(src)) return size_cb(new Error('Source image not found'));
      if(!fs.existsSync(dst)) return size_cb(new Error('Generated image not found'));
      var srcStat = fs.lstatSync(src);
      var dstStat = fs.lstatSync(dst);
      var srcFileSize = srcStat.size;
      var dstFileSize = dstStat.size;
      var fileSizeRatio = 1+(dstFileSize-srcFileSize)/srcFileSize;
      assert(fileSizeRatio<1.5,'Generated file size is larger than source by '+Math.round((fileSizeRatio-1)*100)+'%');
      return size_cb();
    },
    function(size_cb){
      HelperImg.size(src, function(err, size){
        if(err) return size_cb(err);
        if(!size) return size_cb(new Error('Source image size could not be identified'));
        srcSize = size;
        return size_cb();
      });
    },
    function(size_cb){
      HelperImg.size(dst, function(err, size){
        if(err) return size_cb(err);
        if(!size) return size_cb(new Error('Generated image size could not be identified'));
        dstSize = size;
        return size_cb();
      });
    },
    function(size_cb){
      if((srcSize.width != dstSize.width) || (srcSize.height != dstSize.height)) return size_cb(new Error('Invalid image size'));
      return size_cb();
    },
  ], function(err){
    if(err) return cb(err);
    return cb();
  });
}

var imageConversions = {
  'jpg': {
    src: path.join(srcPath,'building.jpg'),
    dst: ['jpg','gif','png','tif'],
  },
  'png': {
    src: path.join(srcPath,'logo.png'),
    dst: ['jpg','gif','png','tif'],
  },
  'svg': {
    src: path.join(srcPath,'camping.svg'),
    dst: ['svg','jpg','gif','png','tif'],
  },
  'gif': {
    src: path.join(srcPath,'logo.gif'),
    dst: ['jpg','gif','png','tif'],
  },
  'tif': {
    src: path.join(srcPath,'logo.tif'),
    dst: ['jpg','gif','png','tif'],
  },
};

describe('System',function(){
  it('Init', function (done) {
    HelperImg.init(function(err){
      return done(err);
    });
  });
  it('Get Driver', function (done) {
    assert(HelperImg.driver(), 'Image Library direct access via .driver() not available');
    return done();
  });
});

///*
describe('Resize',function(){

  function resizeOp(src, fname, dstSize, dstType, cb){
    var startTime = new Date().getTime();
    var startTicks = ticks;
    hungTicks = 0;
    hungTickTime = 0;
    HelperImg.resize(src, path.join(dstPath,fname), dstSize, dstType, function(err){
      if(err) return cb(err);
      var endTime = new Date().getTime();
      var endTicks = ticks;
      var tickTime = (endTicks - startTicks) * TICK_DURATION;
      var clockTime = (endTime - startTime);
      var tickDelay = Math.abs(clockTime - tickTime);
      assert(!hungTicks, 'Unexpected hang of '+hungTickTime+'ms');
      if(CREATE_EXPECTED_IMAGES) return cb();
      validateImage(path.join(cmpPath,fname), path.join(dstPath,fname), dstType, function(err){
        cb(err);
      });
    });
  }

  _.each(imageConversions, function(imageConversion, srcType){
    _.each(imageConversion.dst, function(dstType){
      if(dstType=='gif') return; //GIF not supported by Sharp
      it(srcType.toUpperCase() + ' -> ' + dstType.toUpperCase(), function (done) {
        this.timeout(5000);
        resizeOp(imageConversion.src, 'resize_base_'+srcType+'_'+dstType+'.'+dstType, [400,400], dstType, done);
      });
    });
  });

  it('JPG Upsize', function (done) {
    resizeOp(path.join(srcPath,'logo.png'), 'resize_upsize_jpg.jpg', [1000,700,{upsize:true}], 'jpg', done);
  });
  it('PNG Upsize (transparency)', function (done) {
    resizeOp(path.join(srcPath,'logo.png'), 'resize_upsize_png.png', [1000,700,{upsize:true}], 'png', done);
  });
  it('JPG No Upsize', function (done) {
    resizeOp(path.join(srcPath,'logo.png'), 'resize_no_upsize_jpg.jpg', [1000,700], 'jpg', done);
  });
  it('PNG No Upsize (transparency)', function (done) {
    resizeOp(path.join(srcPath,'logo.png'), 'resize_no_upsize_png.png', [1000,700], 'png', done);
  });
  it('JPG Extend', function (done) {
    resizeOp(path.join(srcPath,'logo.png'), 'resize_extend_jpg.jpg', [1000,700,{extend:true}], 'jpg', done);
  });
  it('PNG Extend (transparency)', function (done) {
    resizeOp(path.join(srcPath,'logo.png'), 'resize_extend_png.png', [1000,700,{extend:true}], 'png', done);
  });
  it('JPG Upsize + Extend', function (done) {
    resizeOp(path.join(srcPath,'logo.png'), 'resize_upsize_extend_jpg.jpg', [1000,700,{upsize:true,extend:true}], 'jpg', done);
  });
  it('PNG Upsize + Extend (transparency)', function (done) {
    resizeOp(path.join(srcPath,'logo.png'), 'resize_upsize_extend_png.png', [1000,700,{upsize:true,extend:true}], 'png', done);
  });
});
//*/

///*
describe('Crop',function(){

  function cropOp(src, fname, dstSize, dstType, cb){
    var startTime = new Date().getTime();
    var startTicks = ticks;
    hungTicks = 0;
    hungTickTime = 0;
    HelperImg.crop(src, path.join(dstPath,fname), dstSize, dstType, function(err){
      if(err) return cb(err);
      var endTime = new Date().getTime();
      var endTicks = ticks;
      var tickTime = (endTicks - startTicks) * TICK_DURATION;
      var clockTime = (endTime - startTime);
      var tickDelay = Math.abs(clockTime - tickTime);
      assert(!hungTicks, 'Unexpected hang of '+hungTickTime+'ms');
      if(CREATE_EXPECTED_IMAGES) return cb();
      validateImage(path.join(cmpPath,fname), path.join(dstPath,fname), dstType, function(err){
        cb(err);
      });
    });
  }

  _.each(imageConversions, function(imageConversion, srcType){
    _.each(imageConversion.dst, function(dstType){
      if(dstType=='gif') return; //GIF not supported by Sharp
      if(dstType=='svg') return; //GIF not supported by Sharp
      it(srcType.toUpperCase() + ' -> ' + dstType.toUpperCase(), function (done) {
        this.timeout(5000);
        cropOp(imageConversion.src, 'crop_base_'+srcType+'_'+dstType+'.'+dstType, [400,400], dstType, done);
      });
    });
  });

  it('JPG Upsize', function (done) {
    cropOp(path.join(srcPath,'logo.png'), 'crop_upsize_jpg.jpg', [1000,700], 'jpg', done);
  });
  it('PNG Upsize', function (done) {
    cropOp(path.join(srcPath,'logo.png'), 'crop_upsize_png.png', [1000,700], 'png', done);
  });
});
//*/

///*
describe('Resample',function(){

  function resampleOp(src, fname, dstType, cb){
    var startTime = new Date().getTime();
    var startTicks = ticks;
    hungTicks = 0;
    hungTickTime = 0;
    HelperImg.resample(src, path.join(dstPath,fname), dstType, function(err){
      if(err) return cb(err);
      var endTime = new Date().getTime();
      var endTicks = ticks;
      var tickTime = (endTicks - startTicks) * TICK_DURATION;
      var clockTime = (endTime - startTime);
      var tickDelay = Math.abs(clockTime - tickTime);
      assert(!hungTicks, 'Unexpected hang of '+hungTickTime+'ms');
      return cb();
    });
  }

  _.each(imageConversions, function(imageConversion, srcType){
    _.each(imageConversion.dst, function(dstType){
      if(dstType=='gif') return; //GIF not supported by Sharp
      it(srcType.toUpperCase() + ' -> ' + dstType.toUpperCase(), function (done) {
        this.timeout(15000);
        resampleOp(imageConversion.src, 'resample_base_'+srcType+'_'+dstType+'.'+dstType, dstType, done);
      });
    });
  });
});
//*/

after(function(){
  clearInterval(tickTimer);
})
