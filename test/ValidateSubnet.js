/*
Copyright 2021 apHarmony

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
var Helper = require('../lib/Helper.js');
var assert = require('assert');

describe('ValidateSubnet',function(){
  it('Exact Match', function () {
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.255.255'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.254.255'), false);
    assert.strictEqual(Helper.ValidateSubnet('255.255.254.255','255.255.255.255'), false);
  });
  it('Subnet', function () {
    assert.strictEqual(Helper.ValidateSubnet('127.0.0.1','0.0.0.0/0'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.255.255/0'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.255.255/1'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.255.255/2'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.255.255/3'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.255.255/4'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.255.255/5'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.255.255/6'), true);
    assert.strictEqual(Helper.ValidateSubnet('254.255.255.255','255.255.255.255/7'), true);
    assert.strictEqual(Helper.ValidateSubnet('254.255.255.255','255.255.255.255/8'), false);
    assert.strictEqual(Helper.ValidateSubnet('254.255.255.255','255.255.255.255/9'), false);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.255.255/10'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.255.255/11'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.255.255/12'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.255.255/13'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.255.255/14'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.254.255.255','255.255.255.255/15'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.254.255.255','255.255.255.255/16'), false);
    assert.strictEqual(Helper.ValidateSubnet('255.254.255.255','255.255.255.255/17'), false);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.255.255/18'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.255.255/19'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.255.255/20'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.255.255/21'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.255.255/22'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.254.255','255.255.255.255/23'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.254.255','255.255.255.255/24'), false);
    assert.strictEqual(Helper.ValidateSubnet('255.255.254.255','255.255.254.255/25'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.254.255/26'), false);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.255','255.255.255.255/27'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.254.255','255.255.255.255/28'), false);
    assert.strictEqual(Helper.ValidateSubnet('255.255.254.255','255.255.255.255/29'), false);
    assert.strictEqual(Helper.ValidateSubnet('255.255.254.255','255.255.255.255/30'), false);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.254','255.255.255.255/31'), true);
    assert.strictEqual(Helper.ValidateSubnet('255.255.255.254','255.255.255.255/32'), false);
  });
});
