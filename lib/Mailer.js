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

var nodemailer = require('nodemailer');
var smtpPool = require('nodemailer-smtp-pool');
var sesTransport = require('nodemailer-ses-transport');
var nodeMailerHtmlToText = require('nodemailer-html-to-text').htmlToText;

function jsHarmonyFactoryMailer(mailer_settings, log){
  if(!log) log = function(msg){ console.log(msg); };
  var rslt;

  if(!mailer_settings)
    throw new Error('Missing global mailer_settings');
  if(mailer_settings.type == 'smtp')
    rslt = nodemailer.createTransport(smtpPool(mailer_settings));
  else if(mailer_settings.type == 'ses')
  rslt = nodemailer.createTransport(sesTransport(mailer_settings));
  else
    throw new Error('Invalid mailer type: ' + mailer_settings.type);

  rslt.use('compile', nodeMailerHtmlToText());

  rslt.on('log', log);

  return rslt;
}

exports = module.exports = jsHarmonyFactoryMailer;