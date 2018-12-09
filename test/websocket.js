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
var WebSocket = require('ws');
var path = require('path');
var os = require('os');
var fs = require('fs');

var path_authConfig = path.join(os.homedir(),'jsharmony/auth.json');
if(fs.existsSync(path_authConfig)){
  authConfig = JSON.parse(fs.readFileSync(path_authConfig,'utf8'));
  console.log('\r\n==== Loading auth config ====\r\n'+JSON.stringify(authConfig,null,4)+'\r\n');
}
var authCookie = 'account_8080_main=' + encodeURIComponent('j:{ "username":"'+authConfig.username+'", "password":"'+authConfig.password+'", "remember":true, "tstmp":"'+authConfig.tstmp+'"}');

describe('WebSocket', function(){
  it('Basic', function (done) {
    this.timeout(50000);
    var options = {
      headers: {
        'Cookie': authCookie
      }
    };
    var socket = new WebSocket("ws://localhost:8080/_log", options);
    socket.onmessage = function(e){
      console.log(e.data);
    }
    socket.onopen = function(e){
      var settings = {
        sources: {
          system:true,
          webserver:true,
          //database:true,
          //authentication:true
        }
      };
      socket.send(JSON.stringify({ setSettings: settings }));
      socket.send(JSON.stringify({ getHistory: true }));
    }
    setTimeout(function(){ socket.close(); setTimeout(done, 500); }, 50000);
  });
});