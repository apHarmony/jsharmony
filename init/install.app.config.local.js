/*
Copyright 2020 apHarmony

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

exports = module.exports = function(appConfig, installerParams, callback){
  var localParams = appConfig.params.jsharmony || {};

  appConfig.header += "var path = require('path');\r\n";

  appConfig.body += "\r\n";
  appConfig.body += "  //Server Settings\r\n";
  appConfig.body += "  //config.server.http_port = 8080;\r\n";
  appConfig.body += "  //config.server.https_port = 8081;\r\n";

  appConfig.body += (localParams.https_cert) ?
                    "  config.server.https_cert = "+localParams.https_cert+";\r\n" :
                    "  //config.server.https_cert = 'path/to/https-cert.pem';\r\n";

  appConfig.body += (localParams.https_key) ?
                    "  config.server.https_key = "+localParams.https_key+";\r\n" :
                    "  //config.server.https_key = 'path/to/https-key.pem';\r\n";

  appConfig.body += (localParams.https_ca) ?
                    "  config.server.https_ca = "+localParams.https_ca+";\r\n" :
                    "  //config.server.https_ca = 'path/to/https-ca.pem';\r\n";

  appConfig.body += "  config.frontsalt = "+JSON.stringify(installerParams.xlib.getSalt(60))+";\r\n";

  return callback();
}
