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

/* eslint-disable quotes */

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
};
//Initialize Configuration - Apply Default Values
jsHarmonyConfigBase.prototype.Init = function(cb){
  if(cb) return cb();
};
//Merge target configuration with existing
jsHarmonyConfigBase.prototype.Merge = function(config, jsh, sourceModuleName, handlers){
  if(!handlers) handlers = {};
  for(var prop in config){
    if(!(prop in this)) this[prop] = config[prop];
    else if(prop in handlers) handlers[prop](this, config);
    else if(_.isArray(this[prop]) && _.isArray(config[prop])){ for(var j = 0;j<config[prop].length;j++) this[prop].push(config[prop][j]); }
    else if(_.isObject(this[prop])) _.merge(this[prop], config[prop]);
    else this[prop] = config[prop];
  }
};

/////////////////
//jsHarmonyConfig
/////////////////
function jsHarmonyConfig(config){
  //Application Name
  this.app_name = 'jsHarmony';
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
  this.google_settings = {
    api_key: '',
    unauthenticated_access: false,         //Send key to unauthenticated clients
  };
  //Debug Settings
  this.debug_params = {
    jsh_error_level: 3,        //Bitmask: 1 = ERROR, 2 = WARNING, 4 = INFO, 8 = PERFORMANCE  :: Messages generated while parsing jsHarmony configs
    appsrv_requests: false,    //Record all APPSRV requests on LOG/CONSOLE

    pipe_log : true,           //Show LOG messages on CONSOLE
    hide_deprecated: false,    //Hide deprecated property error messages
    disable_email: false,      //Disable sending outgoing emails
    report_debug: false,       //Display report warnings (Null value, etc.)
    report_interactive: false, //Launch Report Viewer in Interactive Mode - Show Browser in Desktop
    auth_debug: false,         //Debug Login / Authentication - Log Hashes
    delay_requests: 0,         //Add a delay of this many milliseconds to all router requests (for testing latency)
    debug_log_to_disk: false,  //Log debug messages to disk
    
    db_requests: false,        //Log every database request through DB.js
    db_raw_sql: false,         //Log raw database SQL requests
    db_log_level: 6,           //Bitmask: 2 = WARNING, 4 = NOTICES :: Database messages logged to the console / log
    db_error_sql_state: true,  //Log SQL state during DB error

    log_socket: true,          //Enable DEV users to connect via WebSockets and read log

    monitor_globals: false,    //Enable client-side monitoring of global / window variables: display a message if a new variable is found
    ignore_globals: [],        //Ignore these global variables in the client-side global monitor
    frontend_debug: false,     //Display informational debug messages from front-end JS

    dev_client_js: false,      //Redirect /js/jsHarmony.js to /js/jsHarmony.dev.js for development
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
  //Timeout for report generation (default 90 seconds)
  this.report_timeout = 90 * 1000;
  //jsHarmony System Settings
  this.system_settings = {
    //Make datalock lookups case-insensitive
    "case_insensitive_datalocks": true,
    //Do not check for Image Extension on startup
    "ignore_image_extension": false,
    //Do not check for Report Extension on startup
    "ignore_report_extension": false,
    //Enable direct http access to encrypted content
    "allow_insecure_http_encryption": false,
    //Suffix override for jsHarmony cookie name - default is _PORT, to enable multiple applications on the same domain
    "cookie_suffix": undefined,
    //Automatically add bindings to models
    "automatic_bindings": true,
    //Automatically add datalocks to model fields
    "automatic_datalocks": true,
    //Automatically add parameters to AppSrv functions if they are in the querystring, and automatically define foreign keys
    "automatic_parameters": true,
    //Automatically look up and apply database schema - data types, required fields, primary keys, controls
    "automatic_schema": { //Set "automatic_schema": false to disable any initial database schema lookup
      "metadata_captions": true, //Use system meta data for field captions and model titles
      "datatypes": true,         //Load datatypes from the database (type, length, precision, required validation, primary key, read-only)
      "attributes": true,        //Load extended attributes from the database (required validation, primary key, read-only)
      "controls": true,          //Load controls from the database
      "lovs": true,              //Load LOVs (List of Values - code/code2) from the database
      "keys": true               //Generate primary and foreign keys based on table keys
    },
    //Deprecated Options Compatibility
    "deprecated": {
      "disable_button_inheritance": { }, //Disable button inheritance for each Module in the array. ex: { "application": true }
      "disable_sqlwhere_on_form_update_delete": false, //Disable auto-adding sqlwhere conditions to update and delete SQL statements
    },
    //Model validation level - "standard", "strict"
    //  Strict: MISSING_CAPTION
    "validation_level": "standard"
  };
  //Valid file upload extensions
  this.valid_extensions = [".jpg", ".jpeg", ".pdf", ".png", ".svg", ".tif", ".tiff", ".gif", ".mp4", ".ogv", ".webm", ".mp3", ".wav", ".avi", ".txt", ".xlsm", ".xls", ".xlsx", ".bak", ".zip", ".csv"];
  //Valid image extensions
  this.supported_images = ['.jpg','.jpeg','.gif','.png','.svg'];
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
    "code_val": "code_val",
    "code_val1": "code_val1",
    "code_val2": "code_val2",
    "code_txt": "code_txt",
    "code_seq": "code_seq",
    "code_end_date": "code_end_date",
    "code_parent": "code_parent",
    "timestamp": "timestamp",
    "current_user": "current_user",
    "code_sys": "code_sys",
    "code_app": "code_app",
    "code2_sys": "code2_sys",
    "code2_app": "code2_app",
    "code": "code",
    "code2": "code2"
  };
  //UI Field Mapping
  this.ui_field_mapping = {
    "code_val": "code_val",
    "code_txt": "code_txt",
    "code_parent_id": "code_parent_id",
    "code_icon": "code_icon",
    "code_id": "code_id",
    "code_parent": "code_parent",
    "code_seq": "code_seq",
    "code_type": "code_type"
  };
  //DB Schema Replacement
  this.schema_replacement = [];
  //Remote Queues
  this.queues = {}; //queueid: { "actions": "BIUD", "roles": {"SYSADMIN":"*"} },
  //Model Macros
  this.macros = {};
  //Dynamic Model Bindings
  this.dynamic_bindings = {};
  //Default Button Definitions
  this.default_buttons = {
    "insert": { "icon": "insert", "text": "Add %%%CAPTION%%%", "class": "xbuttoninsert" },
    "update": { "icon": "update", "text": "Edit %%%CAPTION%%%" },
    "browse": { "icon": "browse", "text": "View %%%CAPTION%%%" }
  };
  //Model Groups for Dynamic Bindings
  this.model_groups = {};
  //Datalock Definitions
  this.datalocks = {};
  //Field Encryption Salts
  this.salts = {};
  //Field Encryption Passwords
  this.passwords = {};

  //When jsHarmony server is started
  this.onServerReady = []; //function(cb, servers){ return cb(); }
  //When jsHarmony config is loaded
  this.onConfigLoaded = []; //function(cb, jsh){ return cb(); }
  //When the database drivers are loaded, before the schema is read
  this.onDBDriverLoaded = [];  //function(cb, jsh){ return cb(); }
  //When a client tries to connect to a jsHarmony queue
  this.onQueueSubscribe = []; //function(cb, req, res, queueid){ return cb(); }

  //Theme CSS files
  this.themes = {
    'light': [ 'jsHarmony.theme.light.css' ],
    'classic': [ 'jsHarmony.theme.classic.css' ]
  };
  this.theme = 'light';
  //Additional CSS files for jsHarmony.css
  this.css_extensions = [
    path.dirname(module.filename) + '/public/jquery-ui/css/jquery-ui-1.10.3.custom.min.css',
    path.dirname(module.filename) + '/public/js/colorbox/colorbox.css',
  ];
  //Additional JS files for jsHarmony.js
  this.js_extensions = [];
  //Default report fonts
  this.default_report_fonts = [
    {
      "font-family": "Roboto",
      "font-style": "normal",
      "font-weight": 400,
      "src": "jsharmony/public/fonts/Roboto-Regular.ttf",
      "format": "truetype", //embedded-opentype, woff2, woff, truetype, svg
      "css": "body { font-family: 'Roboto'; }"
    },
    {
      "font-family": "Roboto",
      "font-style": "bold",
      "font-weight": 700,
      "src": "jsharmony/public/fonts/Roboto-Bold.ttf",
      "format": "truetype" //embedded-opentype, woff2, woff, truetype, svg
    }
  ];

  //Load jsHarmony in Silent Mode (without the standard console messages)
  this.silentStart = false;

  //Load models on startup (set to false for database / initialization scripting)
  this.loadModels = true;

  //Mailer settings
  this.mailer_settings = null; /*{
    //SMTP
    type: 'smtp',
    host: 'mail.company.com',
    port: 465,
    auth: {
      user: 'donotreply@company.com',
      pass: ''
    },
    secure: true,
    debug: false,
    tls: { rejectUnauthorized: false },
    maxConnections: 5,  //Max parallel SMTP connections
    maxMessages: 10     //Messages sent per SMTP connection

    //Amazon SES
    //type: 'ses',
    //accessKeyId: "xxx",
    //secretAccessKey: "xxx",
    //rateLimit: 10 // Messages per second
  };*/

  //Modules
  this.modules = {};

  //DB Specific Configuration
  this.forDB = {}; //{ pgsql: [ {config1}, {config2} ] }

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
};
jsHarmonyConfig.prototype.Merge = function(config, jsh, sourceModuleName){
  if(config){
    if(!sourceModuleName && config.sourceModuleName) sourceModuleName = config.sourceModuleName;
    for(var prop in config){
      //Handle modules
      if(prop=='sourceModuleName') continue;
      else if(prop=='modules'){
        for(var moduleName in config.modules){
          if((moduleName in this.modules) && (this.modules[moduleName].Merge)){
            this.modules[moduleName].Merge(config.modules[moduleName], jsh, sourceModuleName);
          }
          else {
            _.merge(this.modules[moduleName], config.modules[moduleName]);
          }
        }
      }
      //Merge arrays
      else if(_.includes(['schema_replacement','css_extensions','js_extensions'],prop)) this[prop] = this[prop].concat(config[prop]);
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
};

jsHarmonyConfig.prototype.LoadJSConfigFile = function(jsh, fpath){
  if(!fpath) throw new Error('Config file path is required');
  if (!fs.existsSync(fpath)) return;
  try{
    var transformConfig = require(fpath);
    transformConfig(jsh, jsh.Config, jsh.DBConfig);
  }
  catch(ex){
    jsh.LogInit_ERROR('Error loading config file: '+fpath + ', '+ex.toString()+' '+ex.stack);
    process.exit(1);
  }
};

jsHarmonyConfig.prototype.LoadJSConfigFolder = function(jsh, fpath){
  //Include appropriate config file based on Path
  if(!fpath) fpath = jsh.Config.appbasepath;
  if(!fpath) fpath = path.dirname(require.main.filename);

  //Create array of application path
  var fbasepath = fpath;
  var fbasename = '';
  var patharr = [];
  while ((fbasename = path.basename(fbasepath))) {
    patharr.unshift(fbasename);
    fbasepath = path.dirname(fbasepath);
  }
  var configFiles = [];
  //app.config.js
  configFiles.push(fpath + '/app.config.js');
  //Localized config
  configFiles.push(fpath + '/app.config.local.js');
  //Config based on Application Path
  if(patharr.length) configFiles.push(fpath + '/app.config.' + patharr.join('_') + '.js');
  //Config based on Hostname
  configFiles.push(fpath + '/app.config.' + os.hostname().toLowerCase() + '.js');
  //Enable client to reorder / add config files
  if(jsh.onLoadingConfig) jsh.onLoadingConfig(configFiles);
  //Load config files
  for(var i=0;i<configFiles.length;i++) this.LoadJSConfigFile(jsh, configFiles[i]);
};

jsHarmonyConfig.prototype.LoadJSONConfigFile = function(jsh, fpath, sourceModule, dbDriver){
  if(!fpath) throw new Error('Config file path is required');
  if (!fs.existsSync(fpath)) return;
  var config = jsh.ParseJSON(fpath, (sourceModule ? sourceModule.name : undefined), "Config");
  //Add namespace to model names
  if(config && sourceModule){
    if(config.model_groups){
      for (var model_group in config.model_groups){
        var model_group_members = config.model_groups[model_group];
        for(var i=0;i<model_group_members.length;i++){
          model_group_members[i] = jsHarmonyConfig.addNamespace(model_group_members[i], sourceModule);
        }
      }
    }
  }
  //Merge or delay-merge config
  if(dbDriver){
    //Add to database-specific config
    if(!(dbDriver in this.forDB)) this.forDB[dbDriver] = [];
    if(sourceModule) config.sourceModuleName = sourceModule.name;
    this.forDB[dbDriver].push(config);
  }
  else {
    //Merge config
    this.Merge(config, jsh, (sourceModule?sourceModule.name:undefined));
  }
};

jsHarmonyConfig.prototype.LoadJSONConfigFolder = function(jsh, fpath, sourceModule){
  var _this = this;

  //Include appropriate config file based on Path
  if(!fpath && jsh.Config.appbasepath) fpath = path.join(jsh.Config.appbasepath, 'models');
  if(!fpath) fpath = path.join(path.dirname(require.main.filename), 'models');
  else if(fpath.substr(fpath.length-1,1)=='/') fpath = fpath.substr(0,fpath.length-1);

  //Create array of application path
  var fbasepath = fpath;
  var fbasename = '';
  var patharr = [];
  while ((fbasename = path.basename(fbasepath))) {
    patharr.unshift(fbasename);
    fbasepath = path.dirname(fbasepath);
  }
  //Load app.config.js
  this.LoadJSONConfigFile(jsh, fpath + '/_config.json', sourceModule);
  //Load app.config.local.js
  this.LoadJSONConfigFile(jsh, fpath + '/_config.local.json', sourceModule);
  //Load config based on Application Path
  this.LoadJSONConfigFile(jsh, fpath + '/_config.' + patharr.join('_') + '.json', sourceModule);
  //Load config based on Hostname
  this.LoadJSONConfigFile(jsh, fpath + '/_config.' + os.hostname().toLowerCase() + '.json', sourceModule);
  //Load config based on Default Database Driver
  var dbDrivers = jsh.getDBDrivers();
  _.each(dbDrivers, function(dbDriver){
    _this.LoadJSONConfigFile(jsh, fpath + '/_config.' + dbDriver + '.json', sourceModule, dbDriver);
  });
  if(jsh.DBConfig['default'] && jsh.DBConfig['default']._driver){
    var defaultDBDriver = jsh.DBConfig['default']._driver.name;
    this.LoadJSONConfigFile(jsh, fpath + '/_config.' + defaultDBDriver + '.json', sourceModule);
  }
};

jsHarmonyConfig.Base = jsHarmonyConfigBase;

//Add namespace where applicable
jsHarmonyConfig.addNamespace = function(modelid, sourceModule){
  if(!sourceModule) return modelid;
  if(!modelid) return modelid;
  if(modelid[0]=='/') return modelid;
  return sourceModule.namespace + modelid;
};

exports = module.exports = jsHarmonyConfig;