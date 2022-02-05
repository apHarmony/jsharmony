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
var jsHarmony = require('../index');
var assert = require('assert');
var _ = require('lodash');
var jsh = new jsHarmony();

var baseModel = {
  'key': 'value',
  'keyrem': 'value',
  'obj': {
    'oldprop': 2
  },
  'objrem1': {
    '__REMOVE__': true
  },
  'str': 'SAMPLE',
  'arr1': [
    {'item': 'field1', 'key': 'value1'},
    {'item': 'field2', 'key': 'value2'},
    {'item': 'field3', 'key': 'value3'},
    {'item': 'field4', 'key': 'value4'},
    {'name': 'fieldtest', 'key': 'valuetest'},
    {'item': 'fieldrem', 'key': 'valuerem'},
    {'item': 'fieldx', 'key': 'valuex'},
    {'item': 'field5', 'key': 'value5'},
  ],
  'arr2': [
    {'item': 'field1', 'key': 'value1'},
    {'item': 'field2', 'key': 'value2'},
  ],
};

var transform = {
  'key2': 'value2',
  'keyrem': '__REMOVEPROPERTY__',
  'obj': {
    '__REPLACE__': true,
    'newprop': 5
  },
  'objrem2': {
    '__REMOVE__': true
  },
  'str': {
    '__PREFIX__': '<<<',
    '__SUFFIX__': '>>>',
  },
  'arr1': [
    {'item': 'field7', 'key': 'value7', '__AFTER__': '__END__'},
    {'item': 'field6', 'key': 'value6'},
    {'item': 'field4-2', 'key': 'value4-2', '__AFTER__': 'item:field4'},
    {'item': 'field1-2', 'key': 'value1-2', '__AFTER__': 0},
    {'name': 'fieldtest2', 'key': 'valuetest2', '__AFTER__': 'fieldtest'},
    {'item': 'field0', 'key': 'value0', '__AFTER__': '__START__'},
    {'__MATCH__': 'item:field3', '__REPLACE__': true, 'item':'field3-new'},
    {'__MATCH__': 'item:field5', 'key':'value5-new'},
    {'__MATCH__': 'item:fieldx', '__AFTER__': 'item:field2'},
    {'__MATCH__': 'item:fieldrem', '__REMOVE__': true},
  ],
  'arr2': [
    {'__MATCH__': '*', '__REMOVE__': true},
    {'item': 'field3', 'key': 'value3'},
  ]
};

var expected = {
  'key': 'value',
  'key2': 'value2',
  'obj': {
    'newprop': 5
  },
  'str': '<<<SAMPLE>>>',
  'arr1': [
    {'item': 'field0', 'key': 'value0'},
    {'item': 'field1', 'key': 'value1'},
    {'item': 'field1-2', 'key': 'value1-2'},
    {'item': 'field2', 'key': 'value2'},
    {'item': 'fieldx', 'key': 'valuex'},
    {'item': 'field3-new'},
    {'item': 'field4', 'key': 'value4'},
    {'item': 'field4-2', 'key': 'value4-2'},
    {'name': 'fieldtest', 'key': 'valuetest'},
    {'name': 'fieldtest2', 'key': 'valuetest2'},
    {'item': 'field5', 'key': 'value5-new'},
    {'item': 'field6', 'key': 'value6'},
    {'item': 'field7', 'key': 'value7'},
  ],
  'arr2': [
    {'item': 'field3', 'key': 'value3'},
  ]
};

describe('Model Transforms', function(){
  it('Basic', function (done) {
    jsh.ApplyModelTransform(baseModel, transform);

    console.log(JSON.stringify(baseModel, null, 4));

    assert(_.isEqual(baseModel, expected));

    return done();
  });
});

/*
1. objects
  a. add property to existing object
    {"key": "value"}
  b. remove property
    {"key": "__REMOVEPROPERTY__"}
  c. replace entire object
    {
      "__REPLACE__": true
      "key": "value"
    }
  d. remove entire object
    {
      "__REMOVE__": true
    }

2. arrays
  a. add element
  [
    {"key": "value", "__AFTER__": "name:ZZZZZZZZ"} //property match, end if no match
    {"key": "value", "__AFTER__": 0} //index
    {"key": "value", "__AFTER__": "__START__"} //to start of array
    {"key": "value", "__AFTER__": "__END__"} //to end of array
    {"key": "value"} //to end of array
  ]
  b. update element
  [
    {"__MATCH__": "name:ZZZZZ", "key": "value"}
  ]
  c. remove element
  [
    {"__MATCH__": "name:ZZZZZ", "__REMOVE__": true}
  ]
  d. replace element
  [
    {"__MATCH__": "name:ZZZZZ", "__REPLACE__": true, "key": "value"}
  ]
  e. reorder element
  [
    {"__MATCH__": "name:ZZZZZ", "__AFTER__": 0}
  ]
  f. replace entire array:
  [
    {"__MATCH__": "*", "__REMOVE__": true}
    {"key": "value"}
  ]
  g. if this is a model.fields array - use "name" to match / overwrite fields

3. strings
  a. concatenate
    {
      "sql": {"__PREFIX__": "Prefix", "__SUFFIX__": "Suffix"}
    }
  b. replace
    {
      "sql": "New SQL"
    }
  c. remove
    {
      "sql": "__REMOVEPROPERTY__"
    }
*/