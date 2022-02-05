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
var fs = require('fs');
var jsParser = require('../lib/JSParser.js');
var assert = require('assert');

describe('Parser', function(){
  it('Basic', function (done) {
    var fname = 'parser.testObject.json';
    var ftext = fs.readFileSync(fname, 'utf8');
    var parseData = jsParser.Parse(ftext, fname, {
      functions: {
        '@samplefunc': function(param1, param2){
          return (param1||'').toString() + ' ' + (param2||'').toString();
        },
      }
    });

    var rslt = jsParser.GenString(parseData.Tree,parseData.Formatter);

    //console.log('--------------------------------------');
    //console.log(JSON.stringify(parseData.Tree, null, 4));
    //console.log('--------------------------------------');
    //console.log(ftext);
    //console.log('--------------------------------------');
    //console.log(rslt);
    //console.log('--------------------------------------');

    assert(ftext == rslt);

    return done();
  });
});
