var XValidate = require('../index');
var assert = require('assert');

function isEmpty(obj) {
    for(var key in obj) {
        if(obj.hasOwnProperty(key))
            return false;
    }
    return true;
}

describe('Sample',function(){
  it('Sample', function (done) {
    var v = new XValidate();
    v.AddValidator('_obj.TESTNUMBER', 'Test Number', 'B', [XValidate._v_IsNumeric(), XValidate._v_Required()]);
    var testobj = { TESTNUMBER: 'test value' };
    var verrors = v.Validate('BIUD', testobj);
    assert(verrors[''][0]=='Test Number must be a whole number.','Failure');
    //verrors = { '': [ 'Test Number must be a whole number.' ] }
    var testobj = { TESTNUMBER: 1234 };
    var verrors = v.Validate('BIUD', testobj);
    //verrors = {}
    assert(isEmpty(verrors),'Success');
    done();
  });
});