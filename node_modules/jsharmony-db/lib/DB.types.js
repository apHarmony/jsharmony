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

function dbtype(_name, params){
  this.name = _name;
  if (params) for (var param in params) this[param] = params[param];
}

exports.MAX = 'MAX';

exports.Char = function (length) { return new dbtype('Char', { 'length': length }); }
exports.VarChar = function (length) { return new dbtype('VarChar', { 'length': length }); }
exports.NVarChar = exports.VarChar; //Alias

exports.BigInt = new dbtype('BigInt');
exports.Int = new dbtype('Int');
exports.SmallInt = new dbtype('SmallInt');
exports.Bit = new dbtype('Bit');

exports.Decimal = function (prec_h, prec_l) { return new dbtype('Decimal', { 'prec_h': prec_h, 'prec_l': prec_l }); }
exports.Date = new dbtype('Date');
exports.Time = function (prec) { return new dbtype('Time', { 'prec': prec }); }
exports.DateTime = function (prec) { return new dbtype('DateTime', { 'prec': prec }); }
exports.DateTime2 = exports.DateTime; //Alias

exports.VarBinary = function (length) { return new dbtype('VarBinary', { 'length': length }); }