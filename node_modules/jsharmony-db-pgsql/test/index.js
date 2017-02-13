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

var JSHpgsql = require('../index');
var JSHdb = require('jsharmony-db');
var assert = require('assert');

describe('Basic',function(){
  it('Select', function (done) {
    //Connect to database and get data
    var c_id = '10';
    global.dbconfig = { _driver: new JSHpgsql(), server: "server.domain.com", database: "DBNAME", user: "DBUSER", password: "DBPASS" };
    var db = new JSHdb();
    db.Recordset('','select * from c where c_id=@c_id',[JSHdb.types.BigInt],{'c_id': c_id},function(err,rslt){
      assert((rslt && rslt.length && (rslt[0].c_id==c_id)),'Success');
      done();
    });
  });
});