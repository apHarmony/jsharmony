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

var JSToken = require('./JSToken.js');
var scanner = require('./JSScanner.js');
var _ = require('lodash');

exports = module.exports = {};

exports.ReplaceAll = function (val, find, replace) {
  return val.split(find).join(replace);
}
exports.Parse = function (str, filename, options) {
  options = _.extend({
    src: str
    /* functions: { '@function_a': function(param1, param2){ return rslt; } } */
  }, options);
  var formatter = [];
  var rslt = {};
  var tokens = scanner.Scan(str, filename);
  var formatter = [];
  formatter.push({ Pre: '', Post: '' });
  if (tokens.length > 0) {
    formatter[0].Pre = tokens[0].Pre;
    tokens[0].Pre = '';
    rslt = exports.ParseTree(formatter, tokens, filename, options);
  }
  if ((tokens.length > 0) && (tokens[0].Name == 'END')) { formatter[0].Post = tokens[0].Post; tokens.shift(); }
  if (tokens.length > 0) throw new ParseError({ File: filename }, tokens[0], 'Invalid Syntax, Expected End of File');
  return { Tree: rslt, Formatter: formatter };
}

exports.ParseTree = function (formatter, tokens, filename, options) {
  var rslt = null;
  var token = null;
  var debuginfo = {
    File: filename,
    Expected: ""
  };
  
  function PeekToken() {
    if (tokens.length == 0) throw new ParseError(debuginfo, token, 'Unexpected end of file.');
    return tokens[0];
  }
  function Peek2Token() {
    if (tokens.length < 2) throw new ParseError(debuginfo, token, 'Unexpected end of file.');
    return tokens[1];
  }
  function NextToken() {
    if (tokens.length == 0) throw new ParseError(debuginfo, token, 'Unexpected end of file.');
    return tokens.shift();
  }
  
  token = NextToken();
  debuginfo.Expected = "STRING, NUMBER, LCBRACKET, LSBRACKET, FUNCTION, TRUE, FALSE, or NULL";
  //OBJECT
  if (token.Name == 'LCBRACKET') {
    rslt = {};
    var cur_item = '', last_item = '';
    do { 
      var spre = '', spost = '', vpre = '', vpost = '', vtoken = null, vmid = '';
      token = NextToken();
      debuginfo.Expected = "STRING, COMMA or RCBRACKET";
      cur_item = token.Name;
      if (token.Name == 'STRING') {
        if (last_item && (last_item != 'COMMA')) { debuginfo.Expected = "COMMA"; throw new ParseError(debuginfo, token); }
        spre = token.Pre;
        var vname = token.Value;
        debuginfo.Expected = "COLON";
        token = NextToken();
        if (token.Name != 'COLON') throw new ParseError(debuginfo, token);
        spost = token.Pre;
        if (tokens.length > 0) {
          var ptoken = PeekToken();
          vpre = ptoken.Pre;
          if ((ptoken.Name == 'STRING') || (ptoken.Name == 'NUMBER')) vtoken = ptoken;
        }
        var vformatter = [];
        if ((PeekToken().Name == 'LCBRACKET') && (Peek2Token().Name == 'RCBRACKET')) { vmid = Peek2Token().Pre; }
        if ((PeekToken().Name == 'LSBRACKET') && (Peek2Token().Name == 'RSBRACKET')) { vmid = Peek2Token().Pre; }
        var vval = exports.ParseTree(vformatter, tokens, filename, options);
        if (tokens.length > 0) vpost = PeekToken().Pre;
        rslt[vname] = vval;
        formatter.push({ S: vname, SPre: spre, SPost: spost, VPre: vpre, VPost: vpost, V: vformatter, VToken: vtoken, VMid: vmid });
      }
      else if (token.Name == 'COMMA') {
        if (last_item != 'STRING') { debuginfo.Expected = "STRING"; throw new ParseError(debuginfo, token); }
      }
      else if (token.Name == 'RCBRACKET') {
        if (last_item && (last_item == 'COMMA')) { }
        else if (last_item && (last_item != 'STRING')) { debuginfo.Expected = "STRING"; throw new ParseError(debuginfo, token); }
      }
      else throw new ParseError(debuginfo, token);
      last_item = cur_item;
    } while (token.Name != 'RCBRACKET');
  }
  else if (token.Name == 'LSBRACKET') {
    rslt = [];
    var cur_item = '', last_item = '';
    do {
      var ptoken = PeekToken();
      var vpre = '', vpost = '', vtoken = null, vmid = '';
      cur_item = ptoken.Name;
      if (ptoken.Name == 'RSBRACKET') {
        token = NextToken();
        //Allow trailing commas
        //if (last_item == 'COMMA') { debuginfo.Expected = "STRING, NUMBER, LCBRACKET, LSBRACKET, TRUE, FALSE, or NULL"; throw new ParseError(debuginfo, token); }
      }
      else if (ptoken.Name == 'COMMA') {
        token = NextToken();
        if (last_item == 'COMMA') { debuginfo.Expected = "STRING, NUMBER, LCBRACKET, LSBRACKET, TRUE, FALSE, or NULL"; throw new ParseError(debuginfo, token); }
      }
      else {
        if (last_item && (last_item != 'COMMA')) { debuginfo.Expected = "COMMA"; throw new ParseError(debuginfo, ptoken); }
        var vformatter = [];
        if (tokens.length > 0) {
          vpre = ptoken.Pre;
          if ((ptoken.Name == 'STRING') || (ptoken.Name == 'NUMBER')) vtoken = ptoken;
        }
        if ((PeekToken().Name == 'LCBRACKET') && (Peek2Token().Name == 'RCBRACKET')) { vmid = Peek2Token().Pre; }
        if ((PeekToken().Name == 'LSBRACKET') && (Peek2Token().Name == 'RSBRACKET')) { vmid = Peek2Token().Pre; }
        var aval = exports.ParseTree(vformatter, tokens, filename, options);
        if (tokens.length > 0) vpost = PeekToken().Pre;
        rslt.push(aval);
        formatter.push({ VPre: vpre, VPost: vpost, V: vformatter, I: rslt.length, VToken: vtoken, VMid: vmid  });
      }
      last_item = cur_item;
    } while (token.Name != 'RSBRACKET');
  }
  else if (token.Name == 'FUNCTION') {
    var funcToken = token;
    var funcName = funcToken.Value;
    if(!options || !options.functions || !options.functions[funcName]){
      debuginfo.Expected = "System Function (" + funcName + " not defined)";
      throw new ParseError(debuginfo, token);
    }

    token = NextToken();
    if(token.Name != 'LPAREN') { debuginfo.Expected = "LPAREN"; throw new ParseError(debuginfo, token); }

    var funcParams = [];
    var cur_item = '', last_item = '';
    do {
      var ptoken = PeekToken();
      var vpre = '', vpost = '', vtoken = null, vmid = '';
      cur_item = ptoken.Name;
      if (ptoken.Name == 'RPAREN') {
        token = NextToken();
        //Allow trailing commas
        //if (last_item == 'COMMA') { debuginfo.Expected = "STRING, NUMBER, LCBRACKET, LSBRACKET, TRUE, FALSE, or NULL"; throw new ParseError(debuginfo, token); }
      }
      else if (ptoken.Name == 'COMMA') {
        token = NextToken();
        if (last_item == 'COMMA') { debuginfo.Expected = "STRING, NUMBER, LCBRACKET, LSBRACKET, TRUE, FALSE, or NULL"; throw new ParseError(debuginfo, token); }
      }
      else {
        if (last_item && (last_item != 'COMMA')) { debuginfo.Expected = "COMMA"; throw new ParseError(debuginfo, ptoken); }
        var vformatter = [];
        if (tokens.length > 0) {
          vpre = ptoken.Pre;
          if ((ptoken.Name == 'STRING') || (ptoken.Name == 'NUMBER')) vtoken = ptoken;
        }
        if ((PeekToken().Name == 'LCBRACKET') && (Peek2Token().Name == 'RCBRACKET')) { vmid = Peek2Token().Pre; }
        if ((PeekToken().Name == 'LSBRACKET') && (Peek2Token().Name == 'RSBRACKET')) { vmid = Peek2Token().Pre; }
        var aval = exports.ParseTree(vformatter, tokens, filename, options);
        if (tokens.length > 0) vpost = PeekToken().Pre;
        funcParams.push(aval);
        formatter.push({ VPre: vpre, VPost: vpost, V: vformatter, I: funcParams.length, VToken: vtoken, VMid: vmid  });
      }
      last_item = cur_item;
    } while (token.Name != 'RPAREN');

    formatter[0].VSource = options.src.substr((funcToken.StartFilePos||1) - 1, token.FilePos - ((funcToken.StartFilePos||1) - 1));
    rslt = options.functions[funcName].apply(null, funcParams);
  }
  else if (token.Name == 'STRING') { rslt = token.Value; }
  else if (token.Name == 'NUMBER') {
    rslt = Number(token.Value);
    if (rslt == NaN) throw new ParseError(debuginfo, token);
  }
  else if (token.Name == 'TRUE') { rslt = true; }
  else if (token.Name == 'FALSE') { rslt = false; }
  else if (token.Name == 'NULL') { rslt = null; }
  else throw new ParseError(debuginfo, token);
  return rslt;
}

exports.GenString = function(val, formatter, isChild, parentf, options){
  var rslt = ''
  if (!formatter) formatter = [{ Pre:'', Post:'' }];
  if (!isChild) rslt += formatter[0].Pre;
  if (formatter.length && formatter[0].VSource) rslt = formatter[0].VSource;
  else if (_.isArray(val)) {
    rslt += '[';
    var first = true;
    if (parentf && !val.length) rslt += parentf.VMid;
    for (var j = 0; j < val.length; j++) {
      if (!first) rslt += ',';
      first = false;
      var thisf = null;
      for (var i = 0; i < formatter.length; i++) {
        if (typeof (formatter[i].I) === 'undefined') continue;
        if (formatter[i].I.toString() == (j+1).toString()) { thisf = formatter[i]; }
      }
      var vformatter = [];
      if (!isChild) vformatter = formatter;
      else if (thisf) vformatter = thisf.V;
      if (thisf) rslt += thisf.VPre + exports.GenString(val[j], vformatter, true, thisf, options) + thisf.VPost;
      else rslt += exports.GenString(val[j], vformatter, true, thisf, options);
    }
    rslt += ']';
  }
  else if (_.isString(val)) {
    rslt = JSON.stringify(val);
    if (parentf && parentf.VToken && parentf.VToken.Multiline) { rslt = exports.ReplaceAll(rslt, '\\r\\n', '\\\r\n'); }
  }
  else if (_.isNumber(val)) {
    //Handle Scientific Notation
    if (parentf && parentf.VToken && (val == Number(parentf.VToken.Orig))) { rslt = parentf.VToken.Orig; }
    else {
      if (parentf && parentf.VToken) {
        if (parentf.VToken.Scientific) rslt = val.toExponential();
        else rslt = JSON.stringify(val);
      }
      else rslt = JSON.stringify(val);
    }
  }
  else if (val === null) rslt = 'null';
  else if (val === true) rslt = 'true';
  else if (val === false) rslt = 'false';
  else if (_.isObject(val)) {
    rslt += '{';
    if (parentf && _.isEmpty(val)) rslt += parentf.VMid;
    var first = true;
    for (var key in val) {
      if (!first) rslt += ',';
      first = false;
      var thisf = null;
      for(var i=0;i<formatter.length;i++){
        if (formatter[i].S == key) { thisf = formatter[i]; }
      }
      var vformatter = [];
      if (thisf) vformatter = thisf.V;
      if(_.isEmpty())
      if (thisf) rslt += thisf.SPre + JSON.stringify(key) + thisf.SPost + ':' + thisf.VPre + exports.GenString(val[key], vformatter, true, thisf, options) + thisf.VPost;
      else rslt += JSON.stringify(key) + ':' + exports.GenString(val[key], vformatter, true, thisf, options);
    }
    rslt += '}';
  }
  if (!isChild) rslt += formatter[0].Post;
  return rslt;
}

function ParseError(debuginfo, token, msg) {
  this.name = 'ParseError';
  this.file = debuginfo.File;
  this.message = '';
  if (msg) this.message = msg;
  if (debuginfo.Expected) this.message = "Expected: " + debuginfo.Expected;
  if(!this.message) this.message = 'Error Parsing';
  this.startpos = { line: token.StartLine, char: token.StartPos };
  this.endpos = { line: token.Line, char: token.Pos };
  this.stack = (new Error()).stack;
}
ParseError.prototype = Object.create(Error.prototype);
ParseError.prototype.constructor = ParseError;