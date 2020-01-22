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
var HelperFS = require('./lib/HelperFS.js');
var HelperRender = require('./lib/HelperRender.js');
var ejs = require('ejs');
var stylus = require('stylus');
var fs = require('fs');
var path = require('path');
var async = require('async');
var _ = require('lodash');

module.exports = exports = {};

/*******************
|    RENDER HTML   |
*******************/
exports.RenderListing = function (req) {
  let rslt = '<br/>&nbsp;';
  let modules = { 'Local':[] };
  for (let modelid in this.Models) {
    let module = this.Models[modelid].module||'Local';
    if(!(module in modules)) modules[module] = [];
    modules[module].push(modelid);
  }
  let has_models = false;
  for(let module in modules){
    let modelids = modules[module];
    modelids.sort();
    if(!modelids.length) continue;
    else has_models = true;
    rslt += '<h2>'+module+'</h2>';
    rslt += '<ul>';
    for (let i = 0; i < modelids.length; i++) {
      let modelid = modelids[i];
      rslt += '<li><a href="' + req.baseurl + modelid + '" target="_blank">' + modelid + '</a></li>';
    }
    rslt += '</ul>';
  }
  if(!has_models) rslt += 'No models found';
  return rslt;
};

exports.RenderFormStarter = function(req, fullmodelid){
  var _this = this;
  if (!_this.hasModel(req, fullmodelid)) throw new Error('Model ID not found: ' + fullmodelid);
  var model = _this.getModel(req, fullmodelid);
  var keys = _this.AppSrv.getKeyNames(model.fields);
  var foreignkeys = _this.AppSrv.getFieldNames(req, model.fields, 'F');
  var rslt = ejs.render(_this.getEJS('jsh_formstarter'), {
    model: model,
    keys: keys,
    foreignkeys: foreignkeys,
    instance: req.jshsite.instance,
    _: _,
    querystring: req.query,
    req: req,
    Helper: Helper
  });
  return rslt;
};

//Get global variables inserted into client window context
exports.getJSClientParams = function (req) {
  var _this = this;
  var rslt = '{';
  rslt += '_debug: ' + (req.jshsite.show_system_errors?'true':'false') + ',';
  rslt += '_BASEURL: \'' + req.baseurl + '\',';
  rslt += '_PUBLICURL: ' + JSON.stringify(req.jshsite.publicurl) + ',';
  rslt += 'forcequery: ' + JSON.stringify(req.forcequery) + ',';
  rslt += 'home_url: ' + JSON.stringify(req.jshsite.home_url) + ',';
  rslt += 'uimap: ' + JSON.stringify(_this.uimap) + ',';
  rslt += '_instance: ' + JSON.stringify(req.jshsite.instance) + ',';
  rslt += 'cookie_suffix: ' + JSON.stringify(Helper.GetCookieSuffix(req,_this)) + ',';
  if (req.isAuthenticated) {
    rslt += 'isAuthenticated: true,';
  }
  if (_this.Config.google_settings && _this.Config.google_settings.api_key){
    if(_this.Config.google_settings.unauthenticated_access || req.isAuthenticated){
      rslt += 'google_api_key: ' + JSON.stringify(_this.Config.google_settings.api_key) + ',';
    }
  }
  if (req._roles && ('DEV' in req._roles)){
    rslt += 'dev: 1,';
  }
  rslt += '}';
  return rslt;
};

exports.getJSLocals = function(req){
  return 'var jsh = '+req.jshsite.instance+';var $ = jsh.$;var _ = jsh._;var async = jsh.async;var moment=jsh.moment;var ejs = jsh.ejs;var XExt = jsh.XExt;var XPage = jsh.XPage;var XForm = jsh.XForm;var XValidate = jsh.XValidate;var XFormat = jsh.XFormat;var _GET = jsh._GET;var XBase = jsh.XBase; var XModels = jsh.XModels;';
};

exports.RenderView = function(view,ejsparams){
  var _this = this;
  return this.RenderEJS(_this.getEJS(view),ejsparams);
};

exports.RenderEJS = function(code,ejsparams){
  if(!ejsparams) ejsparams = {};
  if(!('ejsparams' in ejsparams)) ejsparams.ejsparams = ejsparams;
  return ejs.render(code,ejsparams);
};

exports.RouteView = function(ejsname, title, _options){
  var _this = this;
  return function(req, res, next){
    return HelperRender.reqGet(req, res, _this, ejsname, title, _options);
  };
}

exports.getSystemCSS = function(cb){
  var _this = this;
  if(_this.Cache['jsHarmony.css']) return cb(_this.Cache['jsHarmony.css']);
  else{
    var jshDir = path.dirname(module.filename);
    fs.readFile(jshDir + '/jsHarmony.css','utf8',function(err,data){
      if(err) _this.Log.error(err);
      else{
        _this.Cache['jsHarmony.css'] = data;
        _this.LoadFilesToString(_this.Config.css_extensions, function(err,extdata){
          if(err) _this.Log.error(err);
          _this.Cache['jsHarmony.css'] += "\r\n" + extdata;
          return cb(_this.Cache['jsHarmony.css']);
        });
      }
    });
  }
}

exports.getStylusCSS = function(stylusName, callback){
  var _this = this;
  var sync = false;
  if(!callback){
    sync = true;
    callback = function(err, rslt){ 
      if(err) throw err; 
      else return rslt; 
    };
  }
  if(!(stylusName in _this.Stylus)) return callback(new Error('Stylus CSS not defined for: '+stylusName));
  var stylusConfig = _this.Stylus[stylusName];
  if(typeof stylusConfig.css != 'undefined') return callback(null, stylusConfig.css);
  return HelperFS.readFile(stylusConfig.source,'utf8',sync,function(err,data){
    if(err) return callback(err);
    else {
      var stylusExec = stylus(data)
        .set('filename', stylusConfig.source)
        .define('url', stylus.url());
      var stylusFunc = function(stylusCallback){ stylusExec.render(stylusCallback); };
      if(sync) stylusFunc = function(stylusCallback){ var rslt = stylusExec.render(); return stylusCallback(null, rslt); };
      return stylusFunc(function(err, css){
        if(err) return callback(err);
        else {
          stylusConfig.css = css;
          return callback(null, css);
        }
      });
    }
  });
};

exports.loadFonts = function(fonts, callback){
  var _this = this;
  if(!fonts || !fonts.length) return callback(null,'');
  var modeldirs = _this.getModelDirs();
  var appDir = path.dirname(require.main.filename);

  function getFontPath(fontsrc){
    var module = '';
    var basefilename = '';
    if(fontsrc.indexOf('/') >= 0){
      module = fontsrc.substr(0,fontsrc.indexOf('/'));
      basefilename = fontsrc.substr(fontsrc.indexOf('/')+1);
    }
    //Absolute path
    var fpath = fontsrc;
    var cpath = '';
    if(fs.existsSync(fpath)) return fpath;
    //Relative path
    while((fontsrc[0]=='/')||(fontsrc[0]=='\\')) fontsrc = fontsrc.substr(1);
    if(!fontsrc) return '';
    fpath = appDir + '/' + fontsrc;
    if(fs.existsSync(fpath)) return fpath;
    for (var i = modeldirs.length - 1; i >= 0; i--) {
      fpath = path.normalize(modeldirs[i].path + '../' + fontsrc);
      cpath = path.normalize(modeldirs[i].path + '../' + basefilename);
      if(module && (modeldirs[i].module==module) && fs.existsSync(cpath)) return cpath;
      if (fs.existsSync(fpath)) return fpath;
    }
    return '';
  }

  var font_css = '';
  async.each(fonts, function(font,font_cb){
    if(!font.src){ _this.Log.error('Font '+(font['font-family']||'')+' missing src attribute for font file'); return font_cb(); }
    Helper.execif(!_this.FontCache[font.src],function(cache_cb){
      //Read font file and add to cache
      var fpath = getFontPath(font.src);
      if(!fpath){ _this.Log.error('Font not found: '+font.src); return font_cb(); }
      fs.readFile(fpath, function(err, data){
        if(err){ _this.Log.error('Error reading font: '+font.src+', '+err.toString()); return font_cb(); }
        _this.FontCache[font.src] = (new Buffer(data).toString('base64'));
        return cache_cb();
      });
    },function(){
      //Check if file extension is supported
      if(!font.format){
        var fext = path.extname(font.src);
        if(fext=='.ttf') font.format = 'truetype';
        else if(fext=='.woff') font.format = 'woff';
        else if(fext=='.woff2') font.format = 'woff2';
        else if(fext=='.eot') font.format = 'embedded-opentype';
        else if(fext=='.svg') font.format = 'svg';
        else { _this.Log.error('Font missing "format" attribute: '+font.src); return font_cb(); }
      }
      font.format = font.format.toLowerCase();
      if(!_.includes(['truetype','woff','woff2','embedded-opentype','svg'],font.format)) { _this.Log.error('Unsupported font format: '+font.format); return font_cb(); }

      //Generate font css
      font_css += '@font-face {';
      if(font['font-family']) font_css += "font-family:'"+Helper.escapeCSS(font['font-family'].toString())+"';";
      if(font['font-style']) font_css += 'font-style:'+font['font-style'].toString()+';';
      if(font['font-weight']) font_css += 'font-weight:'+font['font-weight'].toString()+';';
      font_css += 'src: ';
      if(font['local']){
        if(!_.isArray(font.local)) font.local = [font.local];
        for(var j=0;j<font.local.length;j++){
          font_css += "local('"+Helper.escapeCSS(font.local[j])+"'), ";
        }
      }

      //Get mime type
      var fmime = '';
      if(font.format=='truetype') fmime = 'application/x-font-ttf';
      else if(font.format=='woff') fmime = 'application/font-woff';
      else if(font.format=='woff2') fmime = 'application/font-woff2';
      else if(font.format=='embedded-opentype') fmime = 'application/vnd.ms-fontobject';
      else if(font.format=='svg') fmime = 'image/svg+xml';

      font_css += 'url("data:'+fmime+';base64,';
      font_css += _this.FontCache[font.src];
      font_css += '") ';
      font_css += "format('" + font.format + "'); ";
      font_css += '}\n';
      if(font.css) font_css += font.css + '\n';
      return font_cb();
    });
  }, function(err){
    if(err) return callback(err);
    return callback(null, font_css);
  });
};

//Return a 404 error page
exports.Gen404 = function (req, res) {
  res.status(404);
  if (req.accepts('html')) { res.render(this.getView(req, '404', { disable_override: true }), { url: req.url }); return; }
  if (req.accepts('json')) { res.send({ error: 'Not found' }); return; }
  res.type('txt').send('Not found');
};

exports.Redirect302 = Helper.Redirect302;
exports.RenderLogin = require('./render/RenderLogin.js');
exports.RenderLoginForgotPassword = require('./render/RenderLoginForgotPassword.js');
exports.RenderLoginForgotPasswordReset = require('./render/RenderLoginForgotPasswordReset.js');
exports.RenderLogout = require('./render/RenderLogout.js');
exports.RenderTemplate = require('./render/RenderTemplate.js');