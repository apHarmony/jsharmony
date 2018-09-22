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

var $ = require('./jquery-1.11.2');

exports = module.exports = {};

function StartLoading(obj){
	if(!(LoadQueue.contains(obj))) LoadQueue.push(obj);
	if(IsLoading) return;
	$('body').css('cursor','wait');
	IsLoading = true;
	$('input').blur();
	$('#xloadingbox').stop().fadeTo(0,0);
	$('#xloadingblock').show();
	$('#xloadingbox').fadeTo(2000,1);
}

function StopLoading(obj){
	LoadQueue.remove(obj);
	if(LoadQueue.length != 0) return;
	IsLoading = false;
	$('#xloadingbox').stop();
	var curfade = GetOpacity(document.getElementById('xloadingbox'));
	$('#xloadingbox').fadeTo(500*curfade,0,function(){ if(!IsLoading){  $('#xloadingblock').hide(); } });
	$('body').css('cursor','');
}