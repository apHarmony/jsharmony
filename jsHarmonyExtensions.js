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

function jsHarmonyExtensions(){
  this.image = {
    type: '',
    init: function(callback){ return callback(new Error("Image Extensions have not been enabled.  Please configure jsh.Extensions.image")); },
    driver: function(){ throw new Error("Image Extensions have not been enabled.  Please configure jsh.Extensions.image"); },
    getDriver: function(callback){ return callback(new Error("Image Extensions have not been enabled.  Please configure jsh.Extensions.image")); },
    resample: function(src, dest, format, callback){ return callback(new Error("Image Extensions have not been enabled - cannot resample.  Please configure jsh.Extensions.image")); },
    size: function(src, callback){ return callback(new Error("Image Extensions have not been enabled - cannot get size.  Please configure jsh.Extensions.image")); },
    crop: function(src, dest, destsize, format, callback){ return callback(new Error("Image Extensions have not been enabled - cannot crop.  Please configure jsh.Extensions.image")); },
    resize: function(src, dest, destsize, format, callback){ return callback(new Error("Image Extensions have not been enabled - cannot resize.  Please configure jsh.Extensions.image")); },
  };

  this.report = {
    type: '',
    init: function(callback){ return callback(new Error("Report Extensions have not been enabled.  Please configure jsh.Extensions.report")); },
    pdfMerge: function(){ throw new Error("Report Extensions have not been enabled.  Please configure jsh.Extensions.report"); },
    getPdfMerge: function(callback){ return callback(new Error("Report Extensions have not been enabled.  Please configure jsh.Extensions.report")); },
    puppeteer: function(){ throw new Error("Report Extensions have not been enabled.  Please configure jsh.Extensions.report"); },
    getPuppeteer: function(callback){ return callback(new Error("Report Extensions have not been enabled.  Please configure jsh.Extensions.report")); },
  };

  this.dependencies = {};

  this.logDependency = function(extension, desc){
    if(!this.dependencies[extension]) this.dependencies[extension] = [];
    this.dependencies[extension].push(desc);
  }
}

exports = module.exports = jsHarmonyExtensions;