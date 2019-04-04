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

// RenderTemplate.js
var HelperFS = require('../lib/HelperFS.js');
var _ = require('lodash');

exports = module.exports = {};

exports = module.exports = function(req,res,basetemplate,params){
  var jsh = this;
	req.jshsite.menu(req,res,jsh,params,function(){
    if(typeof req._override_title != 'undefined') params.title = req._override_title;
    if(typeof req._override_template != 'undefined') basetemplate = req._override_template;
		res.render(jsh.getView(req, basetemplate),_.extend({},{ _: _ },params));
	});
};

