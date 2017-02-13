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

var DB = require('../index');
var assert = require('assert');

function isEmpty(obj) {
    for(var key in obj) {
        if(obj.hasOwnProperty(key))
            return false;
    }
    return true;
}

describe('Basic',function(){
  it('Types', function (done) {
    assert((DB.types.VarChar(50).length==50),'Success');
    done();
  });
  it('ParseSQL', function (done) {
    var sql = DB.ParseSQL([
      "select * from",
      "TEST"
    ]);
    assert((sql=="select * from TEST"),'Success');
    done();
  });
  it('ParseSQL ENT', function (done) {
    var ent = {SQL:{'sample':'select * from TEST'}};
    var sql = DB.ParseSQL('sample',ent);
    assert((sql=="select * from TEST"),'Success');
    done();
  });
  it('Util', function (done) {
    assert((DB.util.ReplaceAll('abcdefabc','abc','def')=='defdefdef'),'Success');
    done();
  });
  it('Log', function (done) {
    var did_log = false;
    global.log = function(){ did_log = true; }
    DB.log('Test Log');
    assert(did_log,'Success');
    done();
  });
});