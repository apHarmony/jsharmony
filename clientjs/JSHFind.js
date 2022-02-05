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

exports.parse = function (_q, options) {
  var q = _q;
  if (!options) options = {};
  if (q.indexOf('/') === 0) {
    var lqpos = q.lastIndexOf('/');
    if (lqpos > 0) {
      var qflags = q.substr(lqpos + 1);
      var flags = 'g';
      if (qflags.indexOf('i') >= 0) flags += 'i';
      if (qflags.indexOf('m') >= 0) flags += 'm';
      q = new RegExp(q.substr(1, lqpos - 1), flags);
    }
  }
  else {
    var exp = exports.escape(q);
    if(options.multiWord){
      q = q.split(/[ ,]+/);
      for(var i=0;i<q.length;i++){
        q[i] = q[i].trim();
        if(!q[i]){ q.splice(i,1); i--; }
      }
      var exp = '';
      for(var i=0;i<q.length;i++){
        if(exp) exp+='|';
        exp+=exports.escape(q[i]);
      }
      if(exp) exp = '('+exp + ')';
    }
    if (options.caseSensitive) q = new RegExp(exp,'g');
    else q = new RegExp(exp,'ig');
  }
  return q;
};

exports.search = function (data, q, fpath){
  //Search file for text
  var rslt = [];
  var m = [];
  var mlen = [];
  var pos = -1;
  if (q instanceof RegExp) {
    //Regular Expression
    var rm = null;
    while (rm = q.exec(data)) {
      m.push(rm.index);
      mlen.push(rm[0].length);
    }
  }
  else {
    //Use indexOf
    while ((pos = data.indexOf(q, pos + 1)) >= 0) {
      m.push(pos);
      mlen.push(q.length);
    }
  }
  //Get Lines / Line Numbers
  if (m.length) {
    var lineno = 0;
    var line = '';
    var i = 0;
    var lastpos = -1;
    pos = -1;
    while (i < m.length) {
      if (m[i] > pos) {
        lineno++;
        lastpos = pos;
        pos = data.indexOf('\n', pos + 1);
        if(pos==-1) pos = data.length-1;
        line = data.substr(lastpos + 1, pos - lastpos);
      }
      else {
        line = ReplaceAll(line, '\r', '');
        line = ReplaceAll(line, '\n', '');
        line = ReplaceAll(line, '\t', '  ');
        rslt.push({
          File: fpath,
          Line: lineno,
          Char: m[i] - (lastpos + 1) + 1,
          Len: mlen[i],
          Preview: line
        });
        i++;
      }
    }
  }
  return rslt;
};

exports.replace = function (data, q, val) {
  //Search file for text
  if (!(q instanceof RegExp)) q = exports.parse(q);
  return data.replace(q, val);
};

exports.numMatches = function (data, q) {
  if (!(q instanceof RegExp)) q = exports.parse(q);
  return (data.match(q) || []).length;
};

function ReplaceAll(val, find, replace) {
  return val.split(find).join(replace);
}

exports.escape = function(q) {
  return q.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
};