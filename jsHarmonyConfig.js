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
var os = require('os');

function jsHarmonyConfigBase(){
}
//Validate Configuration, if applicable
jsHarmonyConfigBase.prototype.Validate = function(jsh, desc){
  if(!jsh) throw new Error('jsHarmony object required for validation');
  if('_validProperties' in this){
    var props = _.keys(this);
    var diff = _.difference(props,this._validProperties,['_validProperties']);
    if(diff && diff.length){
      jsh.LogInit_ERROR('Invalid setting'+((diff.length>1)?'s':'')+(desc?' in '+desc:'')+' config: '+diff.join(', '));
    }  
  }

  return true;
}
//Initialize Configuration - Apply Default Values
jsHarmonyConfigBase.prototype.Init = function(cb){
  if(cb) return cb();
}
//Merge target configuration with existing
jsHarmonyConfigBase.prototype.Merge = function(config){
  _.merge(this, config);
}

/////////////////
//jsHarmonyConfig
/////////////////
function jsHarmonyConfig(config){
  //Custom application settings
  this.app_settings = { };
  //Salt used in front-end algorithms
  this.frontsalt = ''; //REQUIRED: Use a 60+ mixed character string
  //Customer Service / Support email displayed to users
  this.support_email = 'donotreply@company.com';
  //Email where errors get sent
  this.error_email  = '';
  //"From" email for auto-generated emails
  this.mailer_email = 'DO NOT REPLY <donotreply@company.com>';
  //Google API Settings
  this.google_settings = { API_KEY: '' };
  //Debug Settings
  this.debug_params = {
    jsh_error_level: 1,        //1 = ERROR, 2 = WARNING, 4 = INFO  :: Messages generated while parsing jsHarmony configs
    web_detailed_errors: true, //Be sure to set to false in production - you do not want error stack traces showing to users
    appsrv_requests: false,    //Record all APPSRV requests on LOG/CONSOLE

    pipe_log : true,           //Show LOG messages on CONSOLE
    hide_deprecated: false,    //Hide deprecated property error messages
    disable_email: false,      //Disable sending outgoing emails
    report_debug: false,       //Display report warnings (Null value, etc.)
    
    db_requests: false,        //Log every database request through DB.js
    db_error_sql_state: true,  //Log SQL state during DB error

    ignore_globals: [],        //Ignore these global variables in the client-side global monitor
  };
  //Number of rows returned per grid load
  this.default_rowlimit = 50;
  //Maximum number of rows returned in export
  this.export_rowlimit = 5000;
  //Maximum file upload size (50MB)
  this.max_filesize = 50000000;
  //Maximum file storage in User Temp Folder (50MB)
  this.max_user_temp_foldersize = 50000000;
  //Seconds before Public Temp Folder files are deleted on next upload.  Default is 5 minutes
  this.public_temp_expiration = 5 * 60;
  //Seconds before User Temp Folder files are deleted on next upload.  Default is 6 hours
  this.user_temp_expiration = 6 * 60 * 60;
  //jsHarmony System Settings
  this.system_settings = {
    //Make datalock lookups case-insensitive
    "case_insensitive_datalocks": true,
    //Do not check for ImageMagick on startup
    "ignore_imagemagick": false,
    //Enable direct http access to encrypted content
    "allow_insecure_http_encryption": false,
    //Suffix override for jsHarmony cookie name - default is _PORT, to enable multiple applications on the same domain
    "cookie_suffix": undefined,
    //Automatically add bindings to models
    "automatic_bindings": true,
    //Automatically add datalocks to model fields
    "automatic_datalocks": true,
    //Automatically add parameters to AppSrv functions if they are in the querystring, and automatically define foreign keys
    "automatic_parameters": true
  };
  //Valid file upload extensions
  this.valid_extensions = [".jpg", ".jpeg", ".pdf", ".png", ".gif", ".txt", ".xlsm", ".xls", ".xlsx", ".bak", ".zip", ".csv"];
  //Valid image extensions
  this.supported_images = ['.jpg','.jpeg','.gif','.png'];
  //Time before log entries are flushed to disk
  this.LogSleepDelay = 1000;
  //Application base path (containing models folder)
  this.appbasepath = '';
  //Data folder path (ending in /)
  this.datadir = '';
  //Log folder path (ending in /)
  this.logdir = '';
  //Folder containing local application models
  this.localmodeldir = '';
  //jsHarmony module path
  this.moduledir = path.dirname(module.filename);
  //Whether or not to display sample data instead of application server data
  this.use_sample_data = 0;
  //Show a message if the user does not have an HTML5 browser
  this.require_html5_after_login = true;
  //Whether or not the system is run in interactive (CLI) mode
  this.interactive = false;
  
  //Server configuration
  this.server = {
    http_port: 0,                 //HTTP Port
    request_timeout: 2*60*1000,   //Web request timeout
    add_default_routes: true      //Add default Express routes on init
    //http_ip: '0.0.0.0',         //HTTP IP
    //https_ip: '0.0.0.0',        //HTTPS IP
    //https_port: 0,              //HTTPS Port
    //https_cert: '',             //Path to https-cert.pem
    //https_key: '',              //Path to https-key.pem
    //https_ca: '',               //Path to https-ca.pem
  };
  if(process.env.PORT) this.server.http_port = process.env.PORT;
  if(process.env.TLSPORT) this.server.https_port = process.env.TLSPORT;

  //AppSrv Field Mapping
  this.field_mapping = {
    "user_id": "user_id",
    "user_hash": "user_hash",
    "user_status": "user_status",
    "user_email": "user_email",
    "user_name": "user_name",
    "user_firstname": "user_firstname",
    "user_lastname": "user_lastname",
    "user_last_ip": "user_last_ip",
    "user_last_tstmp": "user_last_tstmp",
    "user_role": "user_role",
    "rowcount": "xrowcount",
    "codeval": "codeval",
    "codetxt": "codetxt",
    "codeseq": "codseq",
    "codeparent": "codeparent",
  };
  //UI Field Mapping
  this.ui_field_mapping = {
    "codeval": "codeval",
    "codetxt": "codetxt",
    "codeparentid": "codeparentid",
    "codeicon": "codeicon",
    "codeid": "codeid",
    "codeparent": "codeparent",
    "codeseq": "codeseq",
    "codetype": "codetype"
  };
  //DB Schema Replacement
  this.schema_replacement = [];
  //Remote Queues
  this.queues = {};
  //Model Macros
  this.macros = {};
  //Dynamic Model Bindings
  this.dynamic_bindings = {};
  //Models for Help Listing
  this.help_view = {};
  //ID field for Help Listing
  this.help_panelid = "";
  //Default Button Definitions
  this.default_buttons = {
    "add": { "icon": "add", "text": "Add %%%CAPTION%%%", "actions": "I", "class": "xbuttonadd" },
    "edit": { "icon": "edit", "text": "Edit %%%CAPTION%%%" } 
  };
  //Model Groups for Dynamic Bindings
  this.model_groups = {};
  //Datalock Definitions
  this.datalocks = {};
  //Field Encryption Salts
  this.salts = {};
  //Field Encryption Passwords
  this.passwords = {};

  //Run function when jsHarmony server is started (to be removed / moved to callback)
  this.onServerReady = undefined; //function(servers){ };
  //Application title (to be removed / renamed to app_title, site_title moved to Site Config)
  this.site_title = "jsHarmony";
  //"Home" button URL (to be removed / moved to Site Config)
  this.home_url = "";
  //Public routes (to be removed / moved to Site Config)
  this.public_apps = [];
  //Private routes (to be removed / moved to Site Config)
  this.private_apps = [];

  //Additional CSS files for jsHarmony.css
  this.css_extensions = [
    path.dirname(module.filename) + '/public/jquery-ui/css/jquery-ui-1.10.3.custom.min.css',
    path.dirname(module.filename) + '/public/js/colorbox/colorbox.css',
  ];
  //Additional JS files for jsHarmony.js
  this.js_extensions = [];

  //Load jsHarmony in Silent Mode
  this.silentStart = false;

  //Modules
  this.modules = {};

  this._validProperties = _.keys(this);

  if(config) this.Merge(config);
}

jsHarmonyConfig.prototype = new jsHarmonyConfigBase();

jsHarmonyConfig.prototype.Init = function(cb){
  if(!this.appbasepath) this.appbasepath = path.dirname(require.main.filename);
  if(!this.datadir) this.datadir = this.appbasepath + '/data/';
  if(!this.logdir) this.logdir = this.datadir + 'log/';
  if(!this.localmodeldir) this.localmodeldir = this.appbasepath + '/models/';
  if(cb) return cb();
}
jsHarmonyConfig.prototype.Merge = function(config){
  if(config){
    for(var prop in config){
      //Handle modules
      if(prop=='modules'){
        for(var moduleName in config.modules){
          if((moduleName in this.modules) && (this.modules[moduleName].prototype) && (this.modules[moduleName].prototype.Merge)){
            this.modules[moduleName].Merge(config.modules[moduleName]);
          }
          else {
            _.merge(this.modules[moduleName], config.modules[moduleName]);
          }
        }
      }
      //Merge arrays
      else if(_.includes(['public_apps','private_apps','schema_replacement','css_extensions','js_extensions'],prop)) this[prop] = this[prop].concat(config[prop]);
      //Replace objects
      else if(_.includes(['valid_extensions','supported_images','server'],prop)) this[prop] = config[prop];
      //Merge first level objects
      else if(_.includes(['default_buttons', 'field_mapping', 'ui_field_mapping', 'salts', 'passwords', 'macros', 'model_groups', 'dynamic_bindings'],prop)){
        for (var elem in config[prop]) this[prop][elem] = config[prop][elem];
      }
      //Fully merge any other objects
      else if(_.isObject(this[prop])) _.merge(this[prop], config[prop]);
      //Replace any other values
      else this[prop] = config[prop];
    }
  }
}

jsHarmonyConfig.prototype.LoadJSConfigFile = function(jsh, fpath){
  if(!fpath) throw new Error('Config file path is required');
  if (!fs.existsSync(fpath)) return;
  try{
    var transformConfig = require(fpath);
    transformConfig(jsh, jsh.Config, jsh.DBConfig);
  }
  catch(ex){
    jsh.LogInit_ERROR('Error loading config file: '+fpath + ', '+ex.toString());
  }
}

jsHarmonyConfig.prototype.LoadJSConfigFolder = function(jsh, fpath){
  //Include appropriate config file based on Path
  if(!fpath) fpath = jsh.Config.appbasepath;
  if(!fpath) fpath = path.dirname(require.main.filename);

  //Create array of application path
  var fbasepath = fpath;
  var fbasename = '';
  var patharr = [];
  while (fbasename = path.basename(fbasepath)) {
    patharr.unshift(fbasename);
    fbasepath = path.dirname(fbasepath);
  }
  //Load app.config.js
  this.LoadJSConfigFile(jsh, fpath + '/app.config.js');
  //Load config based on Application Path
  if(patharr.length) this.LoadJSConfigFile(jsh, fpath + '/app.config.' + patharr.join('_') + '.js');
  //Load config based on Hostname
  this.LoadJSConfigFile(jsh, fpath + '/app.config.' + os.hostname().toLowerCase() + '.js');
}

jsHarmonyConfig.prototype.LoadJSONConfigFile = function(jsh, fpath){
  if(!fpath) throw new Error('Config file path is required');
  if (!fs.existsSync(fpath)) return;
  var config = jsh.ParseJSON(fpath, "Config");
  //Merge config
  this.Merge(config);
}

jsHarmonyConfig.prototype.LoadJSONConfigFolder = function(jsh, fpath){
  //Include appropriate config file based on Path
  if(!fpath) fpath = jsh.Config.appbasepath;
  if(!fpath) fpath = path.dirname(require.main.filename);
  else if(fpath.substr(fpath.length-1,1)=='/') fpath = fpath.substr(0,fpath.length-1);

  //Create array of application path
  var fbasepath = fpath;
  var fbasename = '';
  var patharr = [];
  while (fbasename = path.basename(fbasepath)) {
    patharr.unshift(fbasename);
    fbasepath = path.dirname(fbasepath);
  }
  fpath += '/models';
  //Load app.config.js
  this.LoadJSONConfigFile(jsh, fpath + '/_config.json');
  //Load config based on Application Path
  this.LoadJSONConfigFile(jsh, fpath + '/_config.' + patharr.join('_') + '.json');
  //Load config based on Hostname
  this.LoadJSONConfigFile(jsh, fpath + '/_config.' + os.hostname().toLowerCase() + '.json');
  //Load config based on Default Database Driver
  if(jsh.DBConfig['default'] && jsh.DBConfig['default']._driver){
    var defaultDBDriver = jsh.DBConfig['default']._driver.name;
    this.LoadJSONConfigFile(jsh, fpath + '/_config.' + defaultDBDriver + '.json');
  }
}

jsHarmonyConfig.Base = jsHarmonyConfigBase;

exports = module.exports = jsHarmonyConfig;