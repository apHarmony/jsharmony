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

var fs = require('fs');
var Helper = require('./Helper.js');
var JSToken = require('./JSToken.js');
var scanner = require('./JSScanner.js');
var _ = require('lodash');

exports = module.exports = {};

exports.Parse = function (str, filename) {
  var formatter = [];
  var rslt = {};
  var tokens = scanner.Scan(str, filename);
  var formatter = [];
  formatter.push({ Pre: '', Post: '' });
  if (tokens.length > 0) {
    formatter[0].Pre = tokens[0].Pre;
    tokens[0].Pre = '';
    rslt = exports.ParseTree(formatter, tokens, filename);
  }
  if ((tokens.length > 0) && (tokens[0].Name == 'END')) { formatter[0].Post = tokens[0].Pre; tokens.shift(); }
  if (tokens.length > 0) throw new ParseError({ File: filename }, tokens[0], 'Invalid Syntax, Expected End of File');
  //Reverse = GenString(rslt, formatter, true)
  return {
    tree: rslt,
    formatter: formatter
  };
}

exports.ParseTree = function (formatter, tokens, filename){
  var rslt = null;
  var token = null;
  var debuginfo = {
    File: filename,
    Expected: ""
  };
  
  function PeekToken(){
    if (tokens.length == 0) throw new ParseError(debuginfo, token, 'Unexpected end of file.');
    return tokens[0];
  }
  function NextToken(){
    if (tokens.length == 0) throw new ParseError(debuginfo, token, 'Unexpected end of file.');
    return tokens.shift();
  }
  
  token = NextToken();
  debuginfo.Expected = "STRING, NUMBER, LCBRACKET, LSBRACKET, TRUE, FALSE, or NULL";
  //OBJECT
  if (token.Name == 'LCBRACKET') {
    rslt = {};
    do {
      var spre = '', spost = '', vpre = '', vpost = '', vmultiline = false;
      token = NextToken();
      debuginfo.Expected = "STRING, COMMA or RCBRACKET";
      if (token.Name == 'STRING') {
        spre = token.Pre;
        var vname = token.Value;
        debuginfo.Expected = "COLON";
        token = NextToken();
        if (token.Name != 'COLON') throw new ParseError(debuginfo, token);
        spost = token.Pre;
        if (tokens.length > 0) {
          var ptoken = PeekToken();
          vpre = ptoken.Pre;
          if ((ptoken.Name == 'STRING') && ptoken.Multiline) vmultiline = true;
        }
        var vformatter = [];
        var vval = exports.ParseTree(vformatter, tokens, filename);
        if (tokens.length > 0) vpost = PeekToken().Pre;
        rslt[vname] = vval;
        formatter.push({ S: vname, SPre: spre, SPost: spost, VPre: vpre, VPost: vpost, V: vformatter, VMultiline: vmultiline });
      }
      else if (token.Name == 'COMMA') { }
      else if (token.Name == 'RCBRACKET') { }
      else throw new ParseError(debuginfo, token);
    } while (token.Name != 'RCBRACKET');
  }
  else if (token.Name == 'LSBRACKET') {
    rslt = [];
    do {
      var ptoken = PeekToken();
      var vpre = '', vpost = '', vmultiline = false;
      if(ptoken.Name == 'RSBRACKET' || ptoken.Name == 'COMMA'){ token = NextToken(); }
      else {
        var vformatter = [];
        if (tokens.length > 0) {
          vpre = ptoken.Pre;
          if ((ptoken.Name == 'STRING') && ptoken.Multiline) vmultiline = true;

        }
        var aval = exports.ParseTree(vformatter, tokens, filename);
        if (tokens.length > 0) vpost = PeekToken().Pre;
        rslt.push(aval);
        formatter.push({ VPre: vpre, VPost: vpost, V: vformatter, I: rslt.length, VMultiline: vmultiline });
      }
    } while (token.Name != 'RSBRACKET');
  }
  else if (token.Name == 'STRING') { rslt = token.Value; }
  else if (token.Name == 'NUMBER') { rslt = Number(token.Value); /* XXX CATCH ERROR INVALID NUMBER */ }
  else if (token.Name == 'TRUE') { rslt = true; }
  else if (token.Name == 'FALSE') { rslt = false; }
  else if (token.Name == 'NULL') { rslt = null; }
  else throw new ParseError(debuginfo, token);
  return rslt;
}

exports.ParseFolder = function (path, prefix) {
  var fmodels = fs.readdirSync(path);
  if (typeof prefix == 'undefined') prefix = '';
  for (var i in fmodels) {
    var fname = path + '/' + fmodels[i];
    if (fname.indexOf('.json', fname.length - 5) == -1) continue;
    if (fmodels[i] == '_canonical.json') continue;
    var modelname = prefix + fmodels[i].replace('.json', '');
    //LogEntityError(_INFO, 'Loading ' + modelname);
    console.log('Loading ' + modelname);
    try {
      exports.Parse(fs.readFileSync(fname, 'utf8'), fname)
    }
    catch (ex) {
      console.error("-------------------------------------------");
      console.error("FATAL ERROR Parsing Model " + modelname);
      console.log(ex.name + ': "' + ex.message + '"');
      console.error("-------------------------------------------");
      process.exit(8);
      throw (ex);
    }
  }
};

function GenString(val, formatter, isRoot){
  //XXX Add multiline parsing
  var rslt = ''
  if (isRoot) rslt += formatter[0].Pre;
  if (_.isArray(val)) {
    rslt += '[';
    var first = true;
    for (var j = 0; j < val.length; j++) {
      if (!first) rslt += ',';
      first = false;
      var thisf = null;
      for (var i = 0; i < formatter.length; i++) {
        if (typeof (formatter[i].I) === 'undefined') continue;
        if (formatter[i].I.toString() == (j+1).toString()) { thisf = formatter[i]; }
      }
      var vformatter = [];
      if (isRoot) vformatter = formatter;
      else if (thisf) vformatter = thisf.V;
      if (thisf) rslt += thisf.VPre + GenString(val[j], vformatter) + thisf.VPost;
      else rslt += GenString(val[j], vformatter);
    }
    rslt += ']';
  }
  else if (_.isString(val)) rslt = JSON.stringify(val);
  else if (_.isNumber(val)) rslt = JSON.stringify(val);
  else if (val === null) rslt = 'null';
  else if (val === true) rslt = 'true';
  else if (val === false) rslt = 'false';
  else if (_.isObject(val)) {
    rslt += '{';
    var first = true;
    for (var key in val) {
      if (!first) rslt += ',';
      first = false;
      var thisf = null;
      for(var i=0;i<formatter.length;i++){
        if (formatter[i].S == key) { thisf = formatter[i]; }
      }
      var vformatter = [];
      //if (isRoot) vformatter = formatter;
      if (thisf) vformatter = thisf.V;
      if (thisf) rslt += thisf.SPre + JSON.stringify(key) + thisf.SPost + ':' + thisf.VPre + GenString(val[key], vformatter) + thisf.VPost;
      else rslt += JSON.stringify(key) + ':' + GenString(val[key], vformatter);
    }
    rslt += '}';
  }
  if (isRoot) rslt += formatter[0].Post;
  return rslt;
}

function ParseError(debuginfo, token, msg) {
  this.name = 'ParseError';
  this.message = 'Error Parsing ' + debuginfo.File + ', Line ' + token.Line + ', Char ' + token.Pos;
  if (msg) this.message += '\r\n' + msg;
  if (debuginfo.Expected) this.message += "\r\nExpected: "+debuginfo.Expected;
  this.stack = (new Error()).stack;
}
ParseError.prototype = Object.create(Error.prototype);
ParseError.prototype.constructor = ParseError;