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

exports = module.exports = {};

function TokenBase(_Name, input) {
  this.Name = _Name;
  this.Pos = input.Pos;
  this.Line = input.Line;
  this.Pre = input.StartPre;
  this.StartPos = input.StartPos;
  this.StartLine = input.StartLine;
  this.FilePos = input.FilePos;
  this.StartFilePos = input.StartFilePos;
}

exports.LCBRACKET = function(input) { TokenBase.call(this,'LCBRACKET', input); }
exports.RCBRACKET = function(input) { TokenBase.call(this, 'RCBRACKET', input); }
exports.LSBRACKET = function(input) { TokenBase.call(this, 'LSBRACKET', input); }
exports.RSBRACKET = function(input) { TokenBase.call(this, 'RSBRACKET', input); }
exports.LPAREN = function(input) { TokenBase.call(this, 'LPAREN', input); }
exports.RPAREN = function(input) { TokenBase.call(this, 'RPAREN', input); }
exports.COLON = function(input) { TokenBase.call(this, 'COLON', input); }
exports.COMMA = function(input) { TokenBase.call(this, 'COMMA', input); }
exports.TRUE = function(input) { TokenBase.call(this, 'TRUE', input); }
exports.FALSE = function(input) { TokenBase.call(this, 'FALSE', input); }
exports.NULL = function (input) { TokenBase.call(this, 'NULL', input); }
exports.END = function (input, _post) { TokenBase.call(this, 'END', input); this.Post = _post; }

exports.STRING = function (input, _Value, _Multiline) {
  TokenBase.call(this, 'STRING', input);
  this.Value = _Value;
  this.Multiline = _Multiline;
}

exports.NUMBER = function(input, _Value, _Scientific) {
  TokenBase.call(this, 'NUMBER', input);
  this.Value = _Value;
  this.Orig = _Value;
  this.Scientific = _Scientific;
}

exports.FUNCTION = function (input, _Value, _Multiline) {
  TokenBase.call(this, 'FUNCTION', input);
  this.Value = _Value;
}