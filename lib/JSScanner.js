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

exports = module.exports = {};


//Scans JSON string and returns array of tokens
exports.Scan = function(str, filename) {
  var tokens = [];
  if (!str) return tokens;
  var input = { Pos: 0, Line: 1, File: filename, StartPos: 0, StartLine: 1, StartPre: '' };
  var strpos = 0;
  var strlen = str.length;
  var ws = '';
  
  function GetNextChar(no_newline) {
    if (strpos >= strlen) return '';
    var rslt = str[strpos];
    if (no_newline && ((rslt == '\r') || (rslt == '\n'))) return '';
    input.Pos++;
    strpos++;
    return rslt;
  }
  
  function PeekNextChar() {
    if (strpos >= strlen) return '';
    var rslt = str[strpos];
    return rslt;
  }
  
  function IsToken(c, val) {
    var nextchars = c + str.substr(strpos, val.length - 1);
    if (nextchars.toUpperCase() == val.toUpperCase()) {
      for (var i = 1; i < val.length; i++) GetNextChar();
      return true;
    }
    return false;
  }
  
  while (strpos < strlen) {
    var c = GetNextChar();
    input.StartLine = input.Line;
    input.StartPos = input.Pos;
    
    //White Space
    if (IsWhiteSpace(c)) {
      //if (c == '\t') ws += '  '; //XXX Change this
      //else ws += c;
      ws += c;
      if (c == '\n') { input.Line++; input.Pos = 0; }
      continue;
    }
    if (c == '/') {
      if (PeekNextChar() == '/') {
        ws += c;
        while ((c != '\n') && (c !== '')) {
          c = GetNextChar();
          ws += c;
        }
        if (c == '\n') { input.Line++; input.Pos = 0; }
        continue;
      }
    }
    
    input.StartPre = ws;
    ws = '';
    
    //String
    if (c == '"') {
      var val = '';
      var c = '';
      var isMultiline = false;
      do {
        if (c == '\\') {
          c = GetNextChar();
          if (c == 'b') c = '\b';
          else if (c == '"') c = '"';
          else if (c == '\\') c = '\\';
          else if (c == '/') c = '/';
          else if (c == 'f') c = '\f';
          else if (c == 'n') c = '\n';
          else if (c == 'r') c = '\r';
          else if (c == 't') c = '\t';
          else if (c == 'u') {
            //Get next 4 digits
            var usval = '';
            var uval = 0;
            usval += GetNextChar(true);
            usval += GetNextChar(true);
            usval += GetNextChar(true);
            usval += GetNextChar(true);
            try { uval = parseInt(usval, 16); }
            catch (ex) { throw new ScanError(input, 'Invalid Hex Escape Code: ' + uval); }
            c = String.fromCharCode(uval);
          }
          else if ((c == '\n') || ((c == '\r') && (PeekNextChar() == '\n'))) {
            if (c == '\r') { val += '\r'; c = GetNextChar(); }
            isMultiline = true;
          }
          else if (c == ' ') throw new ScanError(input, 'Invalid space after escape character: ' + c);
          else throw new ScanError(input, 'Invalid Escape Character: ' + c);
        }
        val += c;
        c = GetNextChar(true);
      } 
      while ((strpos < strlen) && (c != '"') && (c !== ''));
      //Error, unclosed string
      if ((c != '"') || (c === '')) { throw new ScanError(input, 'Unclosed string'); }
      //Add token
      tokens.push(new JSToken.STRING(input, val, isMultiline));
      continue;
    }
    
    //Number
    if (IsDigit(c) || (c == '-')) {
      var val = '';
      do {
        val += c;
        c = GetNextChar();
      } 
      while(IsDigit(c));
      if (val[0] == '0' && val.length > 1) { throw new ScanError(input, 'Invalid Number Format'); }
      if (val.substr(0, 2) == '-0' && val.length > 2) { throw new ScanError(input, 'Invalid Number Format'); }
      if (c == '.') {
        do {
          val += c;
          c = GetNextChar();
        } 
        while(IsDigit(c));
      }
      if ((c == 'e') || (c == 'E')) {
        val += c;
        c = GetNextChar();
        if ((c == '-') || (c == '+') || IsDigit(c)) {
          do {
            val += c;
            c = GetNextChar();
          } 
          while(IsDigit(c));
        }
        else throw new ScanError(input, 'Invalid Mantissa');
      }
      tokens.push(new JSToken.NUMBER(input, val));
      //Backtrack
      if(strpos != strlen) strpos--;
      continue;
    }
    
    if (c == '{') tokens.push(new JSToken.LCBRACKET(input));
    else if (c == '}') tokens.push(new JSToken.RCBRACKET(input));
    else if (c == '[') tokens.push(new JSToken.LSBRACKET(input));
    else if (c == ']') tokens.push(new JSToken.RSBRACKET(input));
    else if (c == ':') tokens.push(new JSToken.COLON(input));
    else if (c == ',') tokens.push(new JSToken.COMMA(input));
    else if (IsToken(c, 'null')) { tokens.push(new JSToken.NULL(input)); }
    else if (IsToken(c, 'true')) { tokens.push(new JSToken.TRUE(input)); }
    else if (IsToken(c, 'false')) { tokens.push(new JSToken.FALSE(input)); }
    else { throw new ScanError(input, 'Invalid Token: ' + c); }
  }
  tokens.push(new JSToken.END(input));
  return tokens;
}

function IsDigit(c, dot) {
  if (
    (c == '1') || (c == '2') || (c == '3') || (c == '4') ||
    (c == '5') || (c == '6') || (c == '7') || (c == '8') ||
    (c == '9') || (c == '0')
    ) return true;
  if (dot && (c == '.')) return true;
  return false;
}

function IsWhiteSpace(c) {
  return ((c == ' ') || (c == '\t') || (c == '\r') || (c == '\n'));
}

function ScanError(input, msg) {
  this.name = 'ScanError';
  this.message = 'Error Parsing ' + input.File + ', Line ' + input.StartLine + ', Char ' + input.StartPos + '\r\n' + msg;
  this.stack = (new Error()).stack;
}
ScanError.prototype = Object.create(Error.prototype);
ScanError.prototype.constructor = ScanError;
