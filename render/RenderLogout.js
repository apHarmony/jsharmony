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

var Helper = require('../lib/Helper.js');

// RenderLogout.js
exports = module.exports = function (req, res, onComplete) {
  var jsh = this;
  var account = {
    username: '',
    password: '',
    remember: false,
    tstmp: ''
  };
  var accountCookie = Helper.GetCookie(req, jsh, 'account');
  if (accountCookie) {
    if ('username' in accountCookie) account.username = accountCookie.username;
    if ('remember' in accountCookie) account.remember = (accountCookie.remember == 1);
  }
  var expiry = false;
  if (account.remember) expiry = new Date(Date.now() + 31536000000);
  Helper.ClearCookie(req, res, jsh, 'account', { 'path': req.baseurl });
  Helper.SetCookie(req, res, jsh, 'account', account, { 'expires': expiry, 'path': req.baseurl });
  delete req[jsh.map.user_id];
  req.isAuthenticated = false;
  onComplete('<div>You have successfully logged out of the system. <a href="' + req.baseurl + 'login">Log back in.</a></div>');
};