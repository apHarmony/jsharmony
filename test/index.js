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

var jsHarmony = require('../index');
var pgsqlDBDriver = require('jsharmony-db-pgsql');
global.dbconfig = { host: "server.domain.com", database: "DBNAME", user: "DBUSER", password: "DBPASS", _driver: new pgsqlDBDriver() };
global.appbasepath = __dirname;

describe('Basic HTTP',function(){
  it('Basic', function (done) {
    jsHarmony.Run(undefined,undefined,function(servers){
      for(var i=0;i<servers.length;i++) servers[i].close();
      done();
    });
  });
  it('Basic HTTPS', function (done) {
    jsHarmony.Run({ server:{
        https_port:0,
        https_cert: '/path/to/cert.pem',
        https_key: '/path/to/key.pem',
      } },undefined,function(servers){
      for(var i=0;i<servers.length;i++) servers[i].close();
      done();
    });
  });
  it('Basic HTTP/HTTPS', function (done) {
    jsHarmony.Run({ server:{
        http_port:0,
        https_port:0,
        https_cert: '/path/to/cert.pem',
        https_key: '/path/to/key.pem',
      } },undefined,function(servers){
      for(var i=0;i<servers.length;i++) servers[i].close();
      done();
    });
  });
  it('Static Auth', function (done) {
    jsHarmony.Run({
      auth: jsHarmony.Auth.Static([
        {user_id: 1, user_name: 'Andrew', user_email: 'andrew@domain.com', password: 'SAMPLE_PASSWORD', _roles: ['SYSADMIN']},
        {user_id: 2, user_name: 'Steve', user_email: 'steve@domain.com', password: 'SAMPLE_PASSWORD', _roles: ['BROWSE']},
      ])
    },undefined,function(servers){
      for(var i=0;i<servers.length;i++) servers[i].close();
      done();
    });
  });
});