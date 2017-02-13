# ============
# jsharmony-db
# ============

jsHarmony Database Core

## Installation

npm install jsharmony-db --save

## Usage

```javascript
var DB = require('jsharmony-db');
var cols = {
  'col1': DB.types.BigInt,
  'col2': DB.types.VarChar(50),
  'col3': DB.types.NVarChar(DB.types.MAX),
};
```

## Release History

* 1.0.0 Initial release