/*
Copyright 2024 apHarmony

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
var Helper = require('../lib/Helper.js');
var assert = require('assert');

describe('Compare', function(){
  it('Basic', function (done) {
    var prevData = [
      { key1: 3, key2: 'c', val1: 'green', val2: 'dog' },
      { key1: 3, key2: 'a', val1: 'orange', val2: 'dog' },
      { key1: 3, key2: 'b', val1: 'orange', val2: 'cat' },
      { key1: 1, key2: 'a', val1: 'red', val2: 'dog' },
      { key1: 1, key2: 'b', val1: 'red', val2: 'cat' },
      { key1: 1, key2: 'c', val1: 'black', val2: 'dog' },
      { key1: 2, key2: 'a', val1: 'black', val2: 'cat' },
      { key1: 5, key2: 'a', val1: 'gray', val2: 'cat' },
      { key1: 7, key2: 'a', val1: 'grey', val2: 'cat' },
      { key1: 9, key2: 'a', val1: 'color1', val2: 'cat' },
      { key1: 11, key2: 'a', val1: 'color2', val2: 'cat' },
    ];
    
    var newData = [
      { key1: 2, key2: 'a', val1: 'black', val2: 'cat' },
      { key1: 1, key2: 'a', val1: 'red', val2: 'dog' },
      { key1: 1, key2: 'b', val1: 'red', val2: 'mouse' },
      { key1: 1, key2: 'c', val1: 'black', val2: 'mouse' },
      { key1: 4, key2: 'b', val1: 'orange', val2: 'cat' },
      { key1: 4, key2: 'a', val1: 'orange', val2: 'dog' },
      { key1: 4, key2: 'c', val1: 'green', val2: 'dog' },
      { key1: 5, key2: 'a', val1: 'gray', val2: 'cat' },
      { key1: 6, key2: 'a', val1: 'blue', val2: 'cat' },
      { key1: 8, key2: 'a', val1: 'color3', val2: 'cat' },
      { key1: 10, key2: 'a', val1: 'color4', val2: 'cat' },
    ];

    var rslt = [];
    var expected_rslt = [
      { op: 'equal', val: { key1: 1, key2: 'a', val1: 'red', val2: 'dog' } },
      { op: 'update', val: { key1: 1, key2: 'b', val1: 'red', val2: 'mouse' } },
      { op: 'update', val: { key1: 1, key2: 'c', val1: 'black', val2: 'mouse' } },
      { op: 'equal', val: { key1: 2, key2: 'a', val1: 'black', val2: 'cat' } },
      { op: 'delete', val: { key1: 3, key2: 'a', val1: 'orange', val2: 'dog' } },
      { op: 'delete', val: { key1: 3, key2: 'b', val1: 'orange', val2: 'cat' } },
      { op: 'delete', val: { key1: 3, key2: 'c', val1: 'green', val2: 'dog' } },
      { op: 'insert', val:  { key1: 4, key2: 'a', val1: 'orange', val2: 'dog' } },
      { op: 'insert', val: { key1: 4, key2: 'b', val1: 'orange', val2: 'cat' } },
      { op: 'insert', val: { key1: 4, key2: 'c', val1: 'green', val2: 'dog' } },
      { op: 'equal', val: { key1: 5, key2: 'a', val1: 'gray', val2: 'cat' } },
      { op: 'insert', val: { key1: 6, key2: 'a', val1: 'blue', val2: 'cat'  } },
      { op: 'delete', val: { key1: 7, key2: 'a', val1: 'grey', val2: 'cat' } },
      { op: 'insert', val: { key1: 8, key2: 'a', val1: 'color3', val2: 'cat' } },
      { op: 'delete', val: { key1: 9, key2: 'a', val1: 'color1', val2: 'cat' } },
      { op: 'insert', val: { key1: 10, key2: 'a', val1: 'color4', val2: 'cat' } },
      { op: 'delete', val: { key1: 11, key2: 'a', val1: 'color2', val2: 'cat' } },
    ];
  
    Helper.compare(prevData, newData, {
      keys: ['key1','key2'],
      caseInsensitiveKeys: true,
      onEqual: function(rowNew, rowPrev, row_cb){ rslt.push({ op: 'equal', val: rowNew }); return row_cb(); },
      onInsert: function(rowNew, row_cb){ rslt.push({ op: 'insert', val: rowNew }); return row_cb(); },
      onUpdate: function(rowNew, rowPrev, row_cb){ rslt.push({ op: 'update', val: rowNew }); return row_cb(); },
      onDelete: function(rowPrev, row_cb){ rslt.push({ op: 'delete', val: rowPrev }); return row_cb(); },
    }, function(err){
      assert.deepStrictEqual(rslt, expected_rslt, 'Compare Result');
      return done();
    });
  });
});
