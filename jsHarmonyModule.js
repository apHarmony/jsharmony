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

var jsHarmonyConfig = require('./jsHarmonyConfig.js');
var jsHarmonyModuleTransform = require('./jsHarmonyModuleTransform.js');
var jsHarmonyTranslator = require('./jsHarmonyTranslator.js');
var Helper = require('./Helper.js');
var async = require('async');

function jsHarmonyModule(name){
  var _this = this;
  this.jsh = null;  //Set to target during jsh.AddModule
  this.name = name||null; //Set to typename if not defined during jsh.AddModule
  this.typename = 'jsHarmonyModule';
  this.parent = null;    //Parent module name
  this.Config = new jsHarmonyConfig.Base();
  this.using = [
    //Array of namespaces to import
  ];
  this.transform = new jsHarmonyModuleTransform(this);
  this.translator = new jsHarmonyTranslator(this, {
    getLocale: function(){ return _this.jsh.Locale; },
    getLanguagePath: function(localeId){ if(!_this.Config.moduledir){ return ''; } return _this.Config.moduledir+'/locale/'+localeId+'.language.json'; },
  });
  this._t = function(){ return _this.jsh._t.apply(_this.jsh, arguments); }
  this._tN = function(){ return _this.jsh._tN.apply(_this.jsh, arguments); }
  this._tP = function(){ return _this.jsh._tP.apply(_this.jsh, arguments); }
  this._tPN = function(){ return _this.jsh._tPN.apply(_this.jsh, arguments); }

  //Populated in jsh.SetModuleNamespace, if not initially set
  this.schema = null;    //Database schema
  this.namespace = null; //jsHarmony Model Namespace
  this.dependencies = []; //List of module names

  //Events
  this.onFilterSQLScripts = null; //function(fileObj){ return true / false; }  Run for each SQL script, to decide whether to load it into memory
                                  // fileObj:: { name, path, type ("file" or "folder") }
}
jsHarmonyModule.prototype.getModelPath = function(){
  if(this.Config.moduledir) return this.Config.moduledir+'/models/';
  return undefined;
};
//Populate schema, namespace, and dependencies, or return false if parent not yet initialized
jsHarmonyModule.prototype.SetModuleNamespace = function(){
  var _this = this;
  var parentModule = null;
  if(_this.parent){
    parentModule = _this.jsh.Modules[_this.parent];
    if(parentModule.dependencies.indexOf(_this.name)<0) parentModule.dependencies.push(_this.name);
  }
  if(this.schema === null){
    if(parentModule) this.schema = parentModule.schema + '_' + this.name;
    else this.schema = this.name;
    this.schema = Helper.escapeCSSClass(this.schema.toLowerCase(),{ nodash: true });
  }
  if(this.namespace === null){
    if(parentModule) this.namespace = this.name;
    else this.namespace = this.name + '/';
  }
  var parentNamespace = (parentModule?parentModule.namespace:'');
  this.namespace = this.jsh.getCanonicalNamespace(this.namespace, parentNamespace);
  //Add trailing "/" to any "using"
  for(var i=0;i<this.using.length;i++){
    var upath = this.using[i];
    upath = this.jsh.getCanonicalNamespace(upath, parentNamespace);
    this.using[i] = upath;
  }
};
jsHarmonyModule.prototype.Init = function(cb){
  if(cb) return cb();
};
jsHarmonyModule.prototype.Application = function(){
  var jsHarmony = require('./jsHarmony.js');
  var jsh = new jsHarmony();
  jsh.AddModule(this);
  return jsh;
};
jsHarmonyModule.prototype.onModuleAdded = function(){
};

//Root Application Module
jsHarmonyModule.ApplicationModule = function(jsh){
  jsHarmonyModule.call(this,'application');
  this.jsh = jsh;
  this.typename = '';
  this.schema = null;
  this.namespace = '';
  this.Config.moduledir = jsh.Config.appbasepath;
};
jsHarmonyModule.ApplicationModule.prototype = new jsHarmonyModule();
jsHarmonyModule.ApplicationModule.prototype.getModelPath = function(){
  return this.jsh.Config.localmodeldir;
};

//Root jsHarmony System Module
jsHarmonyModule.jsHarmonySystemModule = function(jsh){
  jsHarmonyModule.call(this,'jsharmony');
  this.jsh = jsh;
  this.typename = 'jsHarmony';
  this.schema = null;
  this.namespace = 'jsHarmony/';
  this.Config = jsh.Config;
};
jsHarmonyModule.jsHarmonySystemModule.prototype = new jsHarmonyModule();

exports = module.exports = jsHarmonyModule;