var XValidate = require('./XValidate.js');
var assert = require('assert');

function isEmpty(obj) {
  for(var key in obj) {
    if(Object.prototypehasOwnProperty.call(obj, key))
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
    assert(verrors[''][0]=='Test Number must be a whole number (with no letters or symbols).','Failure');
    //verrors = { '': [ 'Test Number must be a whole number.' ] }
    testobj = { TESTNUMBER: 1234 };
    verrors = v.Validate('BIUD', testobj);
    //verrors = {}
    assert(isEmpty(verrors),'Success');
    done();
  });
  it('Equals', function (done) {
    var v = new XValidate();
    var verrors;
    v.AddValidator('_obj.confirm_password', 'Confirm Password', 'B', [XValidate._v_Equals('_obj.password','Password')]);
    var empty_confirm = { password: 'test value', confirm_password: '' };
    verrors = v.Validate('BIUD', empty_confirm);
    assert(verrors[''][0]=='Confirm Password must equal Password','Failure');
    var invalid_confirm = { password: 'test value', confirm_password: 'wrong value' };
    verrors = v.Validate('BIUD', invalid_confirm);
    assert(verrors[''][0]=='Confirm Password must equal Password','Failure');
    var valid_confirm = { password: 'test value', confirm_password: 'test value' };
    verrors = v.Validate('BIUD', valid_confirm);
    //verrors = {}
    assert(isEmpty(verrors),'Success');
    done();
  });
  it('SSN', function (done) {
    var v = new XValidate();
    var verrors;
    v.AddValidator('_obj.ssn', 'SSN', 'B', [XValidate._v_IsSSN()]);
    verrors = v.Validate('BIUD', { ssn: '' });
    assert(isEmpty(verrors),'SSN w/Empty String');
    verrors = v.Validate('BIUD', { ssn: Buffer.from('') });
    assert(isEmpty(verrors),'SSN w/Empty Buffer');
    verrors = v.Validate('BIUD', { ssn: undefined });
    assert(isEmpty(verrors),'SSN w/undefined value');
    verrors = v.Validate('BIUD', { ssn: null });
    assert(isEmpty(verrors),'SSN w/null value');
    verrors = v.Validate('BIUD', { ssn: '111' });
    assert(verrors[''][0]=='SSN must be in the format 999-99-9999','Partial SSN');
    verrors = v.Validate('BIUD', { ssn: '111-11-1111' });
    assert(isEmpty(verrors),'Full SSN');
    return done();
  });
  it('Required', function (done) {
    var v = new XValidate();
    var verrors;
    v.AddValidator('_obj.field', 'Field', 'B', [XValidate._v_Required()]);
    verrors = v.Validate('BIUD', { field: '' });
    assert(verrors[''][0]=='Field is required.','Required w/Empty String');
    verrors = v.Validate('BIUD', { field: Buffer.from('') });
    assert(verrors[''][0]=='Field is required.','Required w/Empty Buffer');
    verrors = v.Validate('BIUD', { field: undefined });
    assert(verrors[''][0]=='Field is required.','Required w/undefined value');
    verrors = v.Validate('BIUD', { field: null });
    assert(verrors[''][0]=='Field is required.','Required w/null value');
    verrors = v.Validate('BIUD', { field: '111' });
    assert(isEmpty(verrors),'Required w/Value');
    return done();
  });
});