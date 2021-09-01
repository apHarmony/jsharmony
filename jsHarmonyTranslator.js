/*
Copyright 2021 apHarmony

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
var async = require('async');
var path = require('path');
var process = require('process');
var fs = require('fs');
var Helper = require('./lib/Helper.js');
var HelperFS = require('./lib/HelperFS.js');
var jsHarmonyLocale = require('./jsHarmonyLocale.js')

function jsHarmonyTranslator(obj, config){
  var _this = this;
  this.obj = obj;
  this.language = {};
  this.config = _.extend({
    getLocale: null, //function(){ return locale; }
    getLanguagePath: function(localeId){ return path.join(process.cwd(), 'locale', localeId+'.language.json'); },
    catchall: [],
  }, config);
  if(!_this.config.getLocale){
    var defaultLocale = new jsHarmonyLocale('en');
    _this.config.getLocale = function(){ return defaultLocale; }
  }

  this.loadLanguages = function(localeIds, cb){
    if(!cb) cb = function(err){};
    async.each(localeIds, function(localeId, locale_cb){
      _this.loadLanguage(localeId, {}, locale_cb);
    }, cb);
  }

  this.loadLanguage = function(localeId, options, cb){
    options = _.extend({ async: true }, options);
    if(!cb) cb = function(err){};
    var languagePath = '';
    var languageJson = null;

    try{
      languagePath = _this.config.getLanguagePath(localeId);
    }
    catch(ex){
      console.error('Error getting language path for '+localeId+': '+ex.toString());
    }

    var readFile = options.async ?
      function(read_cb){
        if(!languagePath) return read_cb();
        fs.readFile(languagePath, 'utf8', read_cb);
      } :
      function(read_cb){
        if(!languagePath) return read_cb();
        try{
          var data = fs.readFileSync(languagePath, 'utf8');
          return read_cb(null, data);
        }
        catch(ex){
          return read_cb(ex);
        }
      }
    ;

    readFile(function(err, languageFile){
      if(err){
        if(HelperFS.fileNotFound(err)){}
        else console.error('Error loading '+languagePath+': '+err.toString());
      }
      languageFile = languageFile || '{}';
      try{
        languageJson = JSON.parse(languageFile);
      }
      catch(ex){
        console.error('Error parsing '+languagePath+': '+ex.toString());
      }
      _this.language[localeId] = languageJson || {};
      if(!('*' in _this.language[localeId])) _this.language[localeId]['*'] = {};
      return cb();
    });
  }

  this.translateParams = function(msgId, params, section, pluralIndex, options){
    var msg = _this.translate(msgId, section, pluralIndex, options);
    if(!msg) return msg;
    return Helper.ReplaceParams(msg, params);
  }

  this.translateParamsN = function(msgId, params, cnt, section, options){
    var pluralIndex = _this.config.getLocale().getPluralIndex(cnt);
    return _this.translateParams(msgId, params, section, pluralIndex, options);
  }

  this.translate = function(msgId, section, pluralIndex, options){
    if(!msgId) return '';
    if(!pluralIndex) pluralIndex = 0;
    var localeId = _this.config.getLocale().id;
    options = _.extend({ nullOnNotFound: false }, options);
    //If language is not loaded, load language from disk
    if(!(localeId in _this.language)) _this.loadLanguage(localeId, { async: false });
    if(!section) section = '*';
    var msg = null;
    if(section in _this.language[localeId]){
      if(msgId in _this.language[localeId][section]){
        msg = _this.language[localeId][section][msgId];
      }
    }
    if(!msg && (msgId in _this.language[localeId]['*'])){
      msg = _this.language[localeId][section][msgId];
    }
    if(msg){
      if(_.isString(msg)) return msg;
      if(_.isArray(msg)){
        if(msg.length > pluralIndex) return msg[pluralIndex];
        if(msg.length) return msg[0];
      }
    }
    if((typeof msg != 'undefined') && (msg === null)){
      for(var i=0;i<_this.config.catchall.length;i++){
        msg = _this.config.catchall.translate(msgId, section, pluralIndex, options);
        if((typeof msg != 'undefined') && (msg !== null)) return msg;
      }
    }
    if((typeof msg != 'undefined') && (msg !== null)){
      if(options.nullOnNotFound) return null;
      return msg;
    }
    if(options.nullOnNotFound) return null;
    return msgId;
  }
  this.translateN = function(msgId, cnt, section, options){
    var pluralIndex = _this.config.getLocale().getPluralIndex(cnt);
    return _this.translate(msgId, section, pluralIndex, options);
  }
}

exports = module.exports = jsHarmonyTranslator;