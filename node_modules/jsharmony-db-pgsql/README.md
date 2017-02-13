# ==================
# jsharmony-db-pgsql
# ==================

jsHarmony Database Connector for PostgreSQL

## Installation

npm install jsharmony-db-pgsql --save

## Usage

```javascript
var JSHpgsql = require('jsharmony-db-pgsql');
var JSHdb = require('jsharmony-db');
global.dbconfig = { _driver: new JSHpgsql(), host: "server.domain.com", database: "DBNAME", user: "DBUSER", password: "DBPASS" };
var db = new JSHdb();
db.Recordset('','select * from c where c_id >= @c_id',[JSHdb.types.BigInt],{'c_id': 10},function(err,rslt){
  console.log(rslt);
  done();
});
```

This library uses the NPM pg library.  Use any of the connection settings available in that library.

## Release History

* 1.0.0 Initial release