exports = module.exports = function(appConfig, installerParams, callback){
  appConfig.body += "\r\n";
  appConfig.body += "  //Server Settings\r\n";
  appConfig.body += "  //config.server.http_port = 8080;\r\n";
  appConfig.body += "  //config.server.https_port = 8081;\r\n";
  appConfig.body += "  //config.server.https_cert = 'path/to/https-cert.pem';\r\n";
  appConfig.body += "  //config.server.https_key = 'path/to/https-key.pem';\r\n";
  appConfig.body += "  //config.server.https_ca = 'path/to/https-ca.crt';\r\n";
  appConfig.body += "  config.frontsalt = "+JSON.stringify(installerParams.xlib.getSalt(60))+";\r\n";
  return callback();
}