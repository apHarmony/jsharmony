/*
Copyright 2026 apHarmony

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

function hasEntries(obj){
  return obj && (typeof obj.entries === 'function');
}

function eachEntry(obj, f){
  var entries = obj.entries();
  var item = null;
  while((item = entries.next()) && !item.done){
    if(f(item.value[1], item.value[0])===false) return;
  }
}

function isIterable(obj){
  return obj && (typeof obj[Symbol.iterator] === 'function');
}

function iterate(obj, f){
  var iterator = obj[Symbol.iterator]();
  var item = null;
  while((item = iterator.next()) && !item.done){
    if(f(item.value)===false) return;
  }
}

function isArrayLike(val){
  return val && (typeof val.length === 'number') && (exports.isArray(val) || isIterable(val) || hasEntries(val));
}

exports.each = function(items, f){
  if(!items || !f) return;
  if(exports.isArray(items)){
    items.forEach(f);
  }
  else if(hasEntries(items)) eachEntry(items, f);
  else if(isIterable(items)) iterate(items, f);
  else {
    for(var key in items){
      if(f(items[key], key)===false) return;
    }
  }
};

exports.isString = function(val){
  return (typeof val === 'string');
};

exports.isArray = function(val){
  return Array.isArray(val);
};

exports.isNumber = function(val){
  return (typeof val === 'number');
};

exports.isFunction = function(val){
  return (typeof val === 'function');
};

exports.includes = function(items, val){
  if(!items) return false;
  var found = false;
  exports.each(items, function(ival, ikey){
    if(ival === val){ found = true; return false; }
  });
  return found;
};
exports.contains = exports.includes;

exports.extend = function(){
  var rslt = {};
  if(arguments.length >= 1) rslt = arguments[0] || {};
  for(var i=1;i<arguments.length;i++){
    var item = arguments[i];
    if(!item) continue;
    for(var key in item){
      rslt[key] = item[key];
    }
  }
  return rslt;
};

exports.map = function(items, f){
  if(!items) return [];
  var rslt = isArrayLike(items) ? [] : {};
  exports.each(items, function(ival, ikey){
    rslt[ikey] = f(ival, ikey);
  });
  return rslt;
};

exports.uniq = function(items){
  if(!items|| !isArrayLike(items)) return [];
  var rslt = [];
  exports.each(items, function(ival, ikey){
    if(!exports.contains(rslt, ival)) rslt.push(ival);
  });
  return rslt;
};

exports.compact = function(items){
  if(!items) return [];
  var isArray = exports.isArray(items);
  var rslt = isArray ? [] : {};
  exports.each(items, function(ival, ikey){
    if(ival){
      if(isArray) rslt.push(ival);
      else rslt[ikey] = ival;
    }
  });
  return rslt;
};

exports.flatMap = function(items, f){
  if(!items) return [];
  var rslt = [];
  exports.each(items, function(ival, ikey){
    var irslt = f(ival, ikey);
    if(isArrayLike(irslt)){
      exports.each(f(ival, ikey), function(childval, childkey){
        rslt.push(childval);
      });
    }
    else {
      rslt.push(irslt);
    }
  });
  return rslt;
};
