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

exports = module.exports = function (XValidate) {
  XValidate._v_MaxSize = function (_max) {
    return (new Function('_caption', '_val', '\
    if(!_val) return "";\
    if(_val.size > ' + _max + ') return _caption+" is too large (maximum ' + _max + ' bytes).";\
    return "";'));
  };
  XValidate._v_Extension = function (_extarr) {
    if(!_extarr) _extarr = [];
    return (new Function('_caption', '_val', '\
    if(!_val) return "";\
    var validext = ' + JSON.stringify(_extarr) + ';\
    var foundext = false;\
    for(var i=0;i<validext.length;i++){ if(validext[i].toUpperCase() == _val.ext.toUpperCase()) foundext = true; }\
    if(!foundext) return _caption+" must have one of the following file types: ' + _extarr.join(' ') + '";\
    return "";'));
  };
      //
};