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
var fs = require('fs');
var path = require('path');
var async = require('async');
var DB = require('jsharmony-db');
var Helper = require('./lib/Helper.js');
var HelperFS = require('./lib/HelperFS.js');
var AppSrv = require('./AppSrv.js');
var jsHarmonyConfig = require('./jsHarmonyConfig.js');
var jsHarmonySite = require('./jsHarmonySite.js');
var jsHarmonyServer = require('./jsHarmonyServer.js');
var jsHarmonyMailer = require('./lib/Mailer.js');
var Logger = require('./lib/Logger.js');

function jsHarmony(config) {

  this.Config = new jsHarmonyConfig(config);
  this.Modules = {};
  this.Views = {};
  this.DBConfig = {};
  this.DB = {};
  this.Sites = {
    'main': new jsHarmonySite.Placeholder()
  };
  this.Servers = {};
  this.Log = new Logger(this);
  this.Mailer = undefined;
  this.SystemErrors = [];

  this.EJS = {};
  this.Stylus = {
    /*
    'stylusName': {
      source: this.Config.moduledir+'....styl', //Stylus Source File
      path: '/....css',                 //URL for router
      //roles: { siteid: { "*":"B" } }, //(If roles are not defined, enable access by any role for all sites)
      public: true                      //Enable public unauthenticated access
      //css: 'cached css'               //Cached / evaluated css
    }
    */
  };
  this.Models = {}; //Do not access this directly - use getModel, hasModel
  this.CustomControls = [];
  this.CustomControlQueries = {};
  this.Popups = {};
  this.Cache = {};
  this.FontCache = {};
  this._IMAGEMAGICK_FIELDS = [];
  this.AppSrv = null;
  this.map = {};
  this.uimap = {};
  this.isInitialized = false;
}

//Add module (before Init/Run)
jsHarmony.prototype.AddModule = function(module){
  if(!module.name) module.name = module.typename;
  var moduleName = module.name;
  module.jsh = this;
  this.Modules[moduleName] = module;
  //Initialize / Merge Module Config
  if(this.Config.modules[moduleName]) module.Config.Merge(this.Config.modules[moduleName]);
  this.Config.modules[moduleName] = module.Config;
  //Run onModuleAdded event
  module.onModuleAdded(this);
}

jsHarmony.prototype.GetModule = function(moduleName){
  return this.Modules[moduleName];
}

//Load models and initialize the configuration
jsHarmony.prototype.Init = function(init_cb){
  var _this = this;
  if(_this.isInitialized){
    if(init_cb) init_cb();
    return;
  }

  //Load Configuration Files
  _this.Config.LoadJSConfigFolder(_this);
  _this.Config.LoadJSONConfigFolder(_this);

  var modeldirs = null;
  var defaultDBDriver = null;

  //Initialize Configuration
  async.waterfall([
    function(cb){ _this.Config.Init(cb); },
    function(cb){
      //Load Configuration Files from modules
      modeldirs = _this.getModelDirs();
      for (var i = 0; i < modeldirs.length; i++) {
        _this.Config.LoadJSONConfigFolder(_this, path.normalize(modeldirs[i].path + '../'));
      }

      //Create Required Folders
      requireFolder(_this.Config.datadir,'Data folder');
      HelperFS.createFolderIfNotExistsSync(_this.Config.localmodeldir);
      HelperFS.createFolderIfNotExistsSync(_this.Config.localmodeldir + 'reports');
      async.waterfall([
        async.apply(HelperFS.createFolderIfNotExists, _this.Config.logdir),
        async.apply(HelperFS.createFolderIfNotExists, _this.Config.datadir + 'temp'),
        async.apply(HelperFS.createFolderIfNotExists, _this.Config.datadir + 'temp/public'),
        async.apply(HelperFS.createFolderIfNotExists, _this.Config.datadir + 'temp/cmsfiles'),
        async.apply(HelperFS.createFolderIfNotExists, _this.Config.datadir + 'temp/report'),
      ], function (err, rslt) { if (err) _this.Log.error(err); });
      return cb();
    },
    function(cb){
      //Initialize Module Configs
      async.eachSeries(_this.Modules, function(module, module_cb){
        module.Config.Init(module_cb, _this);
      }, cb);
    },
    function(cb){
      Helper.triggerAsync(_this.Config.onConfigLoaded, cb, _this)
    },
    function(cb){
      //Load Views
      _this.LoadViews();
      if(!_this.Config.silentStart) console.log('Loading models...');
      return cb();
    },
    function(cb){
      //Load Database Drivers
      if(!_this.DBConfig['default']) { _this.DBConfig['default'] = { _driver: new DB.noDriver() }; }
      async.eachOfSeries(_this.DBConfig, function(db, dbid, db_cb){
        _this.InitDB(dbid, db_cb);
      }, function(){
        defaultDBDriver = _this.DBConfig['default']._driver.name;
        return cb();
      });
    },
    function(cb){
      _this.LoadDBSchemas(cb);
    },
    function(cb){
      //Configure Mailer
      if(!_this.Mailer) _this.Mailer = jsHarmonyMailer(_this.Config.mailer_settings, _this.Log.info);
      return cb();
    },
    function(cb){
      _this.Cache['application.js'] = '';
      _this.Cache['application.css'] = fs.readFileSync(path.dirname(module.filename)+'/jsHarmony.theme.css', 'utf8');
      for (var i = 0; i < modeldirs.length; i++) {
        var modeldir = modeldirs[i];
        if (fs.existsSync(modeldir.path)) _this.LoadModels(modeldir.path, modeldir, '', defaultDBDriver);
        if (fs.existsSync(modeldir.path + 'reports/')) _this.LoadModels(modeldir.path + 'reports/', modeldir, '_report_', defaultDBDriver);
        if (fs.existsSync(modeldir.path + 'js/')) _this.Cache['application.js'] += '\r\n' + _this.MergeFolder(modeldir.path + 'js/');
        if (fs.existsSync(modeldir.path + 'public_css/')) _this.Cache['application.css'] += '\r\n' + _this.MergeFolder(modeldir.path + 'public_css/');
      }
      _this.ParseMacros();
      _this.ParseDeprecated();
      _this.ParseInheritance();
      _this.ParseEntities();
      _this.ParsePopups();

      //Validate Configuration
      _this.Config.Validate(_this,'jsHarmony');
      for(var moduleName in _this.Modules){
        _this.Modules[moduleName].Config.Validate(_this,'module '+moduleName);
      }

      _this.map = _this.Config.field_mapping;
      _this.uimap = _this.Config.ui_field_mapping;
      for(var dbid in _this.DB){
        _this.AddGlobalSQLParams(_this.DB[dbid].SQLExt.Funcs, _this.map, 'jsh.map.');
      }

      //Load AppSrv
      _this.AppSrv = new _this.AppSrvClass(_this);
      return cb();
    },
    function(cb){
      //Initialize Modules
      async.eachSeries(_this.Modules, function(module, module_cb){
        module.Init(module_cb);
      }, cb);
    },
    function(cb){
      for(var siteid in _this.Sites){
        if(!_this.Sites[siteid].initialized){
          _this.Sites[siteid] = new jsHarmonySite(siteid, _this.Sites[siteid]);
          if(siteid=='main') _this.Config.server.add_default_routes = true;
        }
      }
      _this.isInitialized = true;
      if(!_this.Config.silentStart) console.log('::jsHarmony Server ready::');
      return cb();
    }
  ], init_cb);
};

//Initialize jsHarmony Express Server
jsHarmony.prototype.CreateServer = function(serverConfig, cb){
  var rslt = new jsHarmonyServer(serverConfig||this.Config.server, this);
  rslt.Init(function(){
    if(cb) return cb(rslt);
  });
};

//Initialize jsHarmony and start the server
jsHarmony.prototype.Run = function(onComplete){
  var _this = this;
  _this.Init(function(){
    //Run each module
    async.each(_this.Modules, function(module, module_cb){
      if(module.Run) return module.Run(module_cb);
      else return module_cb();
    }, function(){
      //If no module started a server, run the default server
      if(_.isEmpty(_this.Servers)){
        //Add default listener & server
        _this.CreateServer(_this.Config.server, function(server){
          _this.Servers['default'] = server;
          _this.Servers['default'].Run(onComplete);
        });
      }
      else{
        if(onComplete) onComplete();
        return;
      }
    });
  });
};

//Set the Job Processor
jsHarmony.prototype.SetJobProc = function(jobproc){
  this.AppSrv.JobProc = jobproc; 
}

jsHarmony.prototype.Auth = require('./lib/Auth.js');
jsHarmony.prototype.AppSrvClass = AppSrv;
jsHarmony.Auth = jsHarmony.prototype.Auth;
jsHarmony.lib = {};
jsHarmony.lib.Helper = Helper;
jsHarmony.lib.HelperFS = HelperFS;
jsHarmony.typename = 'jsHarmony';

jsHarmony.prototype = _.extend(jsHarmony.prototype, require('./jsHarmony.Render.js'));
jsHarmony.prototype = _.extend(jsHarmony.prototype, require('./jsHarmony.Helper.js'));
jsHarmony.prototype = _.extend(jsHarmony.prototype, require('./jsHarmony.LoadModels.js'));
jsHarmony.prototype = _.extend(jsHarmony.prototype, require('./jsHarmony.LoadSQL.js'));
jsHarmony.prototype = _.extend(jsHarmony.prototype, require('./jsHarmony.LoadViews.js'));

module.exports = jsHarmony;

function requireFolder(fpath,desc){
  if(!fs.existsSync(fpath)){
    if(!desc) desc = 'Path';
    console.log ("FATAL ERROR: "+desc+" "+fpath+" not found.");
    console.log("Please create this folder or change the config to use a different path.");
    process.exit(8);
  }
}