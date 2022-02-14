1/*
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

const Auth = require('../lib/Auth.js');

// RenderLogout.js
exports = module.exports = function (req, res, onComplete) {
  const jsh = this;
  Auth.Logout(req, res, jsh);
  onComplete('<div>You have successfully logged out of the system. <a href="' + req.baseurl + 'login">Log back in.</a></div>');
};