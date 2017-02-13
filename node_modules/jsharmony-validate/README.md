# ==================
# jsharmony-validate
# ==================

Validation functions for jsHarmony

## Installation

npm install jsharmony-validate --save

## Usage

```javascript
var XValidate = require('jsharmony-validate');
var v = new XValidate();
v.AddValidator('_obj.TESTNUMBER', 'Test Number', 'B', [XValidate._v_IsNumeric(), XValidate._v_Required()]);
var testobj = { TESTNUMBER: 'test value' };
var verrors = v.Validate('BIUD', testobj);
if (!_.isEmpty(verrors)) //Handle Validation Error
```

## Release History

* 1.0.2 Initial release