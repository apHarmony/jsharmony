/*
Copyright 2017 apHarmony

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

var XFormat = require('../clientjs/XFormat.js')();
var assert = require('assert');
var _ = require('lodash');
var moment = require('moment');

function testFormat(encode, decode, tests, xcompare){
  if(!xcompare) xcompare = function(a,b){ return a==b; };
  _.each(tests, function(test){
    test.args = test.args||[];
    test.auxin = test.auxin||[];
    var xargs = (test.args).slice(0);
    xargs.unshift(XFormat);
    var xencode = encode.bind.apply(encode, xargs);
    var xdecode = decode.bind.apply(decode, xargs);
    assert(xcompare(xencode(test.in),test.out),'Encode(In)==Out '+test.in);
    assert(xcompare(xdecode(xencode(test.in)),xdecode(test.in)),'Decode(Encode(In))==Decode(In) '+test.in);
    assert(xcompare(xdecode(xdecode(xencode(test.in))),xdecode(test.in)),'Decode(Decode(Encode(In)))==Decode(In) '+test.in);
    _.each(test.auxin, function(auxin){
      assert(xcompare(xdecode(auxin),xdecode(test.in)),'Decode(AuxIn)==Decode(In) '+auxin);
      assert(xcompare(xdecode(xdecode(auxin)),xdecode(test.in)),'Decode(Decode(AuxIn))==Decode(In) '+auxin);
      assert(xcompare(xdecode(xdecode(auxin)),xdecode(auxin)),'Decode(Decode(AuxIn))==Decode(AuxIn) '+auxin);
    });
  });
}

describe('XFormat',function(){
  it('phone', function () {
    testFormat(XFormat.phone, XFormat.phone_decode, [
      { in: '2342342345', out: '(234) 234-2345', auxin: ['1-234-234-2345', '11112342342345','234 234 2345'] },
    ]);
  });
  //date(format)
  it('date', function () {
    testFormat(XFormat.date, XFormat.date_decode, [
      { in: '2019-02-21T00:00:00.000', out: '02/21/2019', args: ['MM/DD/YYYY'], auxin: ['2019-02-21','2/21/2019'] },
    ], function(a,b){
      return a==b;
    });
  });
  //tstmp
  it('tstmp', function () {
    testFormat(XFormat.tstmp, XFormat.tstmp_decode, [
      { in: '2019-02-21T14:02:00.000', out: '02/21/19 14:02', auxin: [] },
    ], function(a,b){
      return a==b;
    });
  });
  //MMDDYY
  it('MMDDYY', function () {
    testFormat(XFormat.MMDDYY, XFormat.MMDDYY_decode, [
      { in: '2019-02-21T00:00:00.000', out: '02/21/19', auxin: [] },
    ], function(a,b){
      return a==b;
    });
  });
  //decimal(numdigits)
  it('decimal', function () {
    testFormat(XFormat.decimal, XFormat.decimal, [
      { in: 1, out: '1.00', args: [2] },
      { in: 1111, out: '1111.00', args: [2] },
      { in: 1.11, out: '1.11', args: [2] },
      { in: 1.1111, out: '1.11', args: [2] },
      { in: 1.116, out: '1.12', args: [2] },
      { in: 1111.1111, out: '1111.11', args: [2], auxin: ['1111.1111  \t'] },
      { in: 11111111, out: '11111111.00', args: [2] },
      { in: 11111111.1111, out: '11111111.11', args: [2] },
      { in: '.1111', out: '0.11', args: [2] },
      { in: '11111111111', out: '11111111111.00', args: [2] },
    ]);
  });
  //decimalext(numdigits)
  it('decimalext', function () {
    testFormat(XFormat.decimalext, XFormat.decimalext, [
      { in: 1, out: '1.00', args: [2] },
      { in: 1111, out: '1111.00', args: [2] },
      { in: 1.11, out: '1.11', args: [2] },
      { in: 1.1111, out: '1.1111', args: [2] },
      { in: 1.116, out: '1.116', args: [2] },
      { in: 1111.1111, out: '1111.1111', args: [2], auxin: ['1111.1111  \t'] },
      { in: 11111111, out: '11111111.00', args: [2] },
      { in: 11111111.1111, out: '11111111.1111', args: [2] },
      { in: '.1111', out: '0.1111', args: [2] },
      { in: '11111111111', out: '11111111111.00', args: [2] },
    ]);
  });
  //decimalcomma(numdigits)
  it('decimalcomma', function () {
    testFormat(XFormat.decimalcomma, XFormat.decimalcomma_decode, [
      { in: 1, out: '1.00', args: [2] },
      { in: 1111, out: '1,111.00', args: [2] },
      { in: 1.11, out: '1.11', args: [2] },
      { in: 1.1111, out: '1.11', args: [2] },
      { in: 1.116, out: '1.12', args: [2] },
      { in: 1111.1111, out: '1,111.11', args: [2], auxin: ['1111.1111  \t'] },
      { in: 11111111, out: '11,111,111.00', args: [2] },
      { in: 11111111.1111, out: '11,111,111.11', args: [2] },
      { in: '.1111', out: '0.11', args: [2] },
      { in: '11111111111', out: '11,111,111,111.00', args: [2] },
    ]);
  });
  //comma
  it('comma', function () {
    testFormat(XFormat.comma, XFormat.comma_decode, [
      { in: '1', out: '1' },
      { in: '1111', out: '1,111' },
      { in: '1.1111', out: '1.1111' },
      { in: '1111.1111', out: '1,111.1111', auxin: ['1111.1111  \t'] },
      { in: '11111111', out: '11,111,111' },
      { in: '11111111.1111', out: '11,111,111.1111' },
      { in: '.1111', out: '.1111' },
      { in: '11111111111', out: '11,111,111,111' },
    ]);
  });
  //ssn
  it('ssn', function () {
    testFormat(XFormat.ssn, XFormat.ssn_decode, [
      { in: '222334444', out: '222-33-4444', auxin: ['222 33 4444'] },
    ]);
  });
  //ein
  it('ein', function () {
    testFormat(XFormat.ein, XFormat.ein_decode, [
      { in: '223333333', out: '22-3333333', auxin: ['22 3333333'] },
    ]);
  });
  //time
  it('time', function () {
    testFormat(XFormat.time, XFormat.time_decode, [
      { in: '1970-01-01T15:02:01.123', out: '03:02:01.123 pm', args: ['hh:mm:ss.SSS a'], auxin: ['15:02:01.123'] },
    ], function(a,b){
      return a==b;
    });
  });
  //bool
  it('bool', function () {
    testFormat(XFormat.bool, XFormat.bool_decode, [
      { in: true, out: 'true', auxin: ['TRUE','T','Y','YES','ON','1'] },
      { in: false, out: 'false', auxin: ['FALSE','F','N','NO','OFF','0'] },
    ]);
  });
});