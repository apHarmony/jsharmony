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

var jsHarmony = require('./jsHarmony.js');
var jsHarmonyConfig = require('./jsHarmonyConfig.js');

function jsHarmonyModule(){
  this.jsh = null;  //Set to target during jsh.AddModule
  this.name = null; //Set to typename if not defined during jsh.AddModule
  this.typename = "jsHarmonyModule";
  this.Config = new jsHarmonyConfig.Base();
}
jsHarmonyModule.prototype.Init = function(cb){
  if(cb) return cb();
}
jsHarmonyModule.prototype.Application = function(){
  var jsh = new jsHarmony();
  jsh.AddModule(this);
  return jsh;
}

exports = module.exports = jsHarmonyModule;