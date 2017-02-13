# =========
# jsharmony
# =========

Rapid Application Development (RAD) Platform for Node.js Database Application Development

## Installation

npm install jsharmony --save

## Usage

```javascript
var jsHarmony = require('jsharmony');
var pgsqlDBDriver = require('jsharmony-db-pgsql');
global.dbconfig = { host: "server.domain.com", database: "DBNAME", user: "DBUSER", password: "DBPASS", _driver: new pgsqlDBDriver() };
var app = jsHarmony.Run();
```

See database drivers jsharmony-db-pgsql and jsharmony-db-mssql for connection strings.

The system requires a "data" folder in the same folder as the root application file.
An alternative path can be specified in the global.appbasepath variable.
The "models" folder will be automatically generated in the application base path (global.appbasepath).

jsHarmony.Run accepts a variety of system configurations:

```javascript
var app = jsHarmony.Run({server:{
  'http_port': 3000,
  'https_port': 0,
  'https_cert': 'c:/wk/bk/cert/localhost-cert.pem',
  'https_key': 'c:/wk/bk/cert/localhost-key.pem',
}});
```

```javascript
var app = jsHarmony.App(); //Returns Express instance
app.listen(8080);
```

```javascript
var app = jsHarmony.Run({
  auth: jsHarmony.Auth.Static([
    {user_id: 1, user_name: 'Andrew', user_email: 'andrew@domain.com', password: 'SAMPLE_PASSWORD', _roles: ['SYSADMIN']},
    {user_id: 2, user_name: 'Steve', user_email: 'steve@domain.com', password: 'SAMPLE_PASSWORD', _roles: ['BROWSE']},
  ])
});
```


## Tests

npm test

## Release History

* 1.0.0 Initial Release