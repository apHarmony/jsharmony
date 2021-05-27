# =========
# jsharmony
# =========

Rapid Application Development (RAD) Platform for Node.js Database Application Development

Explore the Quickstart Tutorials and Documentation at <http://tutorials.jsharmony.com>

## Installation

npm install jsharmony --save

## Usage

```javascript
var jsHarmony = require('jsharmony');
var pgsqlDBDriver = require('jsharmony-db-pgsql');
var jsh = new jsHarmony();
jsh.DBConfig['default'] = { host: "server.domain.com", database: "DBNAME", user: "DBUSER", password: "DBPASS", _driver: new pgsqlDBDriver() };
jsh.Run();
```

See database drivers jsharmony-db-pgsql and jsharmony-db-mssql for connection strings.

The system requires a "data" folder in the same folder as the root application file.
An alternative path can be specified in the jsh.Config.appbasepath variable.
The "models" folder will be automatically generated in the application base path (jsh.Config.appbasepath).

jsh.Config.server configures the server settings:

```javascript
jsh.Config.server = {
  'http_port': 3000,
  'https_port': 0,
  'https_cert': 'c:/wk/bk/cert/localhost-cert.pem',
  'https_key': 'c:/wk/bk/cert/localhost-key.pem',
  'https_ca': 'c:/wk/bk/cert/localhost-ca.pem',
};
jsh.Run();
```

Static authentication can be enabled via:

```javascript
jsh.Init(function(){
  jsh.Sites['main'].Merge({
    auth: jsHarmony.Auth.Static([
      {user_id: 1, user_name: 'Andrew', user_email: 'andrew@domain.com', password: 'SAMPLE_PASSWORD', _roles: ['SYSADMIN']},
      {user_id: 2, user_name: 'Steve', user_email: 'steve@domain.com', password: 'SAMPLE_PASSWORD', _roles: ['BROWSE']},
    ])
  });
  jsh.Run();
});
```


## Tests

Before running tests, please create the data folder and configure the https certs in test\index.js.

npm test

## Release History

* 1.0.0 Initial Release
* 1.1.0 Modules