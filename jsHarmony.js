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
var jsHarmonyExtensions = require('./jsHarmonyExtensions.js');
var jsHarmonySite = require('./jsHarmonySite.js');
var jsHarmonyServer = require('./jsHarmonyServer.js');
var jsHarmonyModule = require('./jsHarmonyModule.js');
var jsHarmonyLocale = require('./jsHarmonyLocale.js');
var jsHarmonyMailer = require('./lib/Mailer.js');
var Logger = require('./lib/Logger.js');

var XValidate = require('jsharmony-validate');
require('./lib/ext-validation.js')(XValidate);

function jsHarmony(config) {

  this.Config = new jsHarmonyConfig(config);
  this.Modules = {};
  this.Extensions = new jsHarmonyExtensions();
  this.Views = {};
  this.DBConfig = {};
  this.DB = {};
  this.Sites = {
    'main': new jsHarmonySite.Placeholder()
  };
  this.Servers = {};
  this.Log = new Logger(this);
  this.Mailer = undefined;
  this.Locale = new jsHarmonyLocale('en');
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
  this.CustomControls = {};
  this.CustomControlQueries = {};
  this.XValidate = XValidate;
  this.CustomFormatters = {};
  this.Popups = {};
  this.Cache = {};
  this.FontCache = {};
  this.AppSrv = null;
  this.map = {};
  this.uimap = {};
  this.isInitialized = false;
  this.isConfigLoaded = false;
  this.onLoadingConfig = null; //function(configFiles){ /* Re-order / modify configFiles array */ }
  this.Statistics = {
    StartTime: Date.now(),
    Counts: {
      InitErrors: 0,
      InitWarnings: 0,
      InitDeprecated: 0
    }
  };

  //Add jsHarmony Module
  this.Modules['jsharmony'] = new jsHarmonyModule.jsHarmonySystemModule(this);
}

//Add module (before Init/Run)
jsHarmony.prototype.AddModule = function(module){
  if(!module.name) module.name = module.typename;
  var moduleName = module.name;
  module.jsh = this;
  if(moduleName in this.Modules) throw new Error('Module '+moduleName+' already exists in jsh.Modules');
  this.Modules[moduleName] = module;
  //Initialize / Merge Module Config
  if(this.Config.modules[moduleName]) module.Config.Merge(this.Config.modules[moduleName], this, module.name);
  this.Config.modules[moduleName] = module.Config;
  //Run onModuleAdded event
  module.onModuleAdded(this);
};

jsHarmony.prototype.GetModule = function(moduleName){
  return this.Modules[moduleName];
};

//Load models and initialize the configuration
jsHarmony.prototype.Init = function(init_cb){
  var _this = this;
  if(_this.isInitialized){
    if(init_cb) init_cb();
    return;
  }

  _this.LogInit_PERFORMANCE('Starting '+(Date.now()-_this.Statistics.StartTime));

  //Load Configuration Files
  _this.Config.LoadJSConfigFolder(_this);
  _this.Config.LoadJSONConfigFolder(_this);

  var defaultDBDriver = null;

  //Initialize Configuration
  async.waterfall([
    function(cb){ _this.Config.Init(cb); },
    function(cb){
      _this.LogInit_PERFORMANCE('Loading Config '+(Date.now()-_this.Statistics.StartTime));

      //Add Application Module
      if(!_this.Modules['application']){
        _this.AddModule(new jsHarmonyModule.ApplicationModule(_this));
      }
      //Set Module Namespace, so that relative paths can be transformed to absolute
      _this.SetModuleNamespace();
      //Load Configuration Files from modules
      var modeldirs = _this.getModelDirs();
      for (var i = 0; i < modeldirs.length; i++) {
        _this.Config.LoadJSONConfigFolder(_this, path.normalize(modeldirs[i].path), _this.Modules[modeldirs[i].module]);
      }

      //Create Required Folders
      _this.requireFolder(_this.Config.datadir,'Data folder');
      HelperFS.createFolderIfNotExistsSync(_this.Config.localmodeldir);
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
      _this.LogInit_PERFORMANCE('Initializing Config '+(Date.now()-_this.Statistics.StartTime));

      //Initialize Module Configs
      async.eachSeries(_this.Modules, function(module, module_cb){
        module.Config.Init(module_cb, _this);
      }, cb);
    },
    function(cb){
      //Apply database-specific configurations
      var modeldirs = _this.getModelDirs();
      for(var dbid in _this.DBConfig){
        var dbconfig = _this.DBConfig[dbid];
        if(dbconfig && dbconfig._driver && dbconfig._driver.name){
          var driverName = dbconfig._driver.name;
          if(driverName in _this.Config.forDB){
            var driverConfigs = _this.Config.forDB[driverName];
            _.each(driverConfigs, function(driverConfig){
              if(!driverConfig.sourceModuleName) _this.Config.Merge(driverConfig, _this);
            });
            for (var i = 0; i < modeldirs.length; i++) {
              _.each(driverConfigs, function(driverConfig){
                if(driverConfig.sourceModuleName == modeldirs[i].module) _this.Config.Merge(driverConfig, _this);
              });
            }
          }
        }
      }
      return cb();
    },
    function(cb){
      Helper.triggerAsync(_this.Config.onConfigLoaded, cb, _this);
    },
    function(cb){
      _this.LogInit_PERFORMANCE('Transforming '+(Date.now()-_this.Statistics.StartTime));

      //Load Views
      _this.LoadViews();
      //Validate Module Transforms
      _.each(_this.Modules, function(module){
        module.transform.Validate();
      });
      return cb();
    },
    function(cb){
      _this.LogInit_PERFORMANCE('Loading Locales '+(Date.now()-_this.Statistics.StartTime));
      //Preload translations for current locale
      async.each(_this.Modules, function(module, module_cb){
        module.translator.loadLanguages([_this.Locale.id], module_cb);
      }, cb);
    },
    function(cb){
      _this.LogInit_PERFORMANCE('Loading DB '+(Date.now()-_this.Statistics.StartTime));

      //Load Database Drivers
      if(!_this.DBConfig['default']) { _this.DBConfig['default'] = { _driver: new DB.noDriver() }; }
      async.eachOfSeries(_this.DBConfig, function(db, dbid, db_cb){
        _this.LogInit_PERFORMANCE('Initializing DB '+dbid+' '+(Date.now()-_this.Statistics.StartTime));
        _this.InitDB(dbid, db_cb);
      }, function(){
        defaultDBDriver = _this.DBConfig['default']._driver.name;
        return cb();
      });
    },
    function(cb){
      _this.LogInit_PERFORMANCE('DB Driver Loaded Event '+(Date.now()-_this.Statistics.StartTime));
      Helper.triggerAsync(_this.Config.onDBDriverLoaded, cb, _this);
    },
    function(cb){
      _this.LogInit_PERFORMANCE('Loading Schemas '+(Date.now()-_this.Statistics.StartTime));

      if(!_this.Config.silentStart) _this.Log.console('Loading models...');
      _this.LoadDBSchemas(cb);
    },
    function(cb){
      _this.LogInit_PERFORMANCE('Loading SQL Objects '+(Date.now()-_this.Statistics.StartTime));
      _this.ParseSQLObjectInheritance();
      _this.ParseSQLObjects();
      return cb();
    },
    function(cb){
      //Configure Mailer
      if(!_this.Mailer && _this.Config.mailer_settings) _this.Mailer = jsHarmonyMailer(_this.Config.mailer_settings, _this.Log.info);
      return cb();
    },
    function(cb){
      if(!_this.Config.loadModels){ return cb(); }
      _this.isConfigLoaded = true;

      _this.LogInit_PERFORMANCE('Loading Models '+(Date.now()-_this.Statistics.StartTime));

      var modeldirs = _this.getModelDirs();
      _this.Cache['application.js'] = '';
      _this.Cache['application.css'] = '';
      if(_this.Config.theme && _this.Config.themes[_this.Config.theme]){
        _.each(_this.Config.themes[_this.Config.theme], function(css_path){
          if(css_path){
            for (var i = 0; i < modeldirs.length; i++) {
              var modeldir = modeldirs[i];
              var module_css_path = path.join(modeldir.path, '../themes', css_path);
              if (fs.existsSync(module_css_path)) _this.Cache['application.css'] += '\r\n' + fs.readFileSync(module_css_path, 'utf8');
            }
          }
        });
      }
      for (var i = 0; i < modeldirs.length; i++) {
        var modeldir = modeldirs[i];
        var prefix = modeldir.namespace||'';
        if (fs.existsSync(modeldir.path)) _this.LoadModels(modeldir.path, modeldir, prefix, defaultDBDriver, modeldir.module);
        if (fs.existsSync(modeldir.path + 'js/')) _this.Cache['application.js'] += '\r\n' + _this.MergeFolder(modeldir.path + 'js/', modeldir.module);
        if (fs.existsSync(modeldir.path + 'public_css/')) _this.Cache['application.css'] += '\r\n' + _this.MergeFolder(modeldir.path + 'public_css/', modeldir.module);
      }
      _this.LogInit_PERFORMANCE('Parsing Models '+(Date.now()-_this.Statistics.StartTime));
      _this.ParseMacros();
      _this.ParseDeprecated();
      _this.ParseModelInheritance();
      _this.ParseEntities();
      _this.ParsePopups();
      
      return cb();
    },
    function(cb){
      _this.LogInit_PERFORMANCE('Validating Config '+(Date.now()-_this.Statistics.StartTime));

      //Validate Configuration
      _this.Config.Validate(_this,'jsHarmony');
      for(var moduleName in _this.Modules){
        if(_this.Modules[moduleName].Config===_this.Config) continue;
        _this.Modules[moduleName].Config.Validate(_this,'module '+moduleName);
      }

      //Load Field Mapping
      _this.map = _this.Config.field_mapping;
      _this.uimap = _this.Config.ui_field_mapping;
      for(var dbid in _this.DB){
        _this.AddGlobalSQLParams(_this.DB[dbid].SQLExt.Funcs, _this.map, 'jsh.map.');
      }

      //Load AppSrv
      _this.AppSrv = new _this.AppSrvClass(_this);
      cb();
    },
    function(cb){
      _this.LogInit_PERFORMANCE('Initializing Modules '+(Date.now()-_this.Statistics.StartTime));

      //Initialize Modules
      async.eachSeries(_this.Modules, function(module, module_cb){
        module.Init(module_cb);
      }, cb);
    },
    function(cb){
      //Initialize Extensions
      _this.InitExtensions(cb);
    },
    function(cb){
      _this.LogInit_PERFORMANCE('Initializing Sites '+(Date.now()-_this.Statistics.StartTime));
      for(var siteid in _this.Sites){
        if(!_this.Sites[siteid].initialized){
          _this.Sites[siteid] = new jsHarmonySite(_this, siteid, _this.Sites[siteid]);
          if(siteid=='main') _this.Config.server.add_default_routes = true;
        }
      }
      _this.isInitialized = true;
      var loadTime = (Date.now()-_this.Statistics.StartTime);
      _this.Log.clearLastErrorFile();
      if(!_this.Config.silentStart){
        _this.Log.console('::jsHarmony Server ready:: '+(loadTime/1000).toFixed(2)+'s');
        var statsmsg = [];
        if(_this.Statistics.Counts.InitErrors) statsmsg.push('Errors: '+_this.Statistics.Counts.InitErrors);
        if(_this.Statistics.Counts.InitWarnings) statsmsg.push('Warnings: '+_this.Statistics.Counts.InitWarnings);
        if(_this.Statistics.Counts.InitDeprecated) statsmsg.push('Deprecated: '+_this.Statistics.Counts.InitDeprecated);
        if(statsmsg.length) _this.Log.console('  '+statsmsg.join(', '));
      }
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

//Initialize Module Namespaces / Schemas
jsHarmony.prototype.SetModuleNamespace = function(moduleName){
  var _this = this;
  //Set namespace of root modules
  if(!moduleName){
    for(var rootModuleName in _this.Modules){
      var module = _this.Modules[rootModuleName];
      if(module.parent) continue;
      _this.SetModuleNamespace(module.name);
    }
    return;
  }
  //Parse rest of modules in tree
  _this.Modules[moduleName].SetModuleNamespace();
  for(var childModuleName in _this.Modules){
    var childModule = _this.Modules[childModuleName];
    if(childModule.parent !== moduleName) continue;
    _this.SetModuleNamespace(childModuleName);
  }
};

//Set the Job Processor
jsHarmony.prototype.SetJobProc = function(jobproc){
  this.AppSrv.JobProc = jobproc;
};

//Require a folder in order to start jsHarmony
jsHarmony.prototype.requireFolder = function(fpath,desc){
  var _this = this;
  if(!fs.existsSync(fpath)){
    if(!desc) desc = 'Path';
    _this.Log.console('FATAL ERROR: '+desc+' '+fpath+' not found.');
    _this.Log.console('Please create this folder or change the config to use a different path.');
    process.exit(8);
  }
};

jsHarmony.prototype.getPrototype = function(){ return jsHarmony; };
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
jsHarmony.prototype = _.extend(jsHarmony.prototype, require('./jsHarmony.LoadTasks.js'));

module.exports = jsHarmony;
