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

var _ = require('lodash');
var nodemailer = require('nodemailer');
var nodeMailerHtmlToText = require('nodemailer-html-to-text').htmlToText;

function jsHarmonyFactoryMailer(mailer_settings, log){
  if(!log) log = function(msg){ console.log(msg); };
  var rslt;

  if(!mailer_settings)
    throw new Error('Missing global mailer_settings');
  if(mailer_settings.type == 'smtp')
    rslt = nodemailer.createTransport(_.extend({ pool: true }, mailer_settings));
  else if(mailer_settings.type == 'ses'){
    var aws = require('@aws-sdk/client-ses');
    var ses = new aws.SES({
      apiVersion: '2010-12-01',
      region: mailer_settings.region || 'us-east-1',
      accessKeyId: mailer_settings.accessKeyId,
      secretAccessKey: mailer_settings.secretAccessKey,
    });
    var sendingRate = mailer_settings.rateLimit || 10;
    rslt = nodemailer.createTransport(_.extend({ SES: { ses: ses, aws: aws }, sendingRate: sendingRate }, mailer_settings));
  }
  else
    throw new Error('Invalid mailer type: ' + mailer_settings.type);

  rslt.use('compile', nodeMailerHtmlToText());

  rslt.on('log', log);

  return rslt;
}

exports = module.exports = jsHarmonyFactoryMailer;