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
var _ = require('lodash');

exports = module.exports = function(jsh){

  function XScanner(_Func, _Server, _Params) {
    this.Func = _Func;
    this.Server = jsh.globalparams.scanner_server;
    if (_Server) this.Server = _Server;
    if (_Params) this.Params = _Params;
    else this.Params = {};
  }

  var XScanner_Timer = null;

  function XScanner_SetLoadEvents(onFail) {
    XScanner_Timer = setTimeout(function () { XScanner_Timeout(onFail); }, 120000);
  }
  function XScanner_ClearLoadEvents() {
    jsh.xLoader.StopLoading(jsh.xfileuploadLoader);
    if (XScanner_Timer) { clearTimeout(XScanner_Timer); XScanner_Timer = null; }
  }
  function XScanner_Timeout(onFail) {
    XScanner_ClearLoadEvents();
    jsh.XExt.Alert('Scan Failed: Could not connect to Scanner Server.', onFail);
  }

  XScanner.prototype.Scan = function (_Params, onComplete, onFail) {
    if (!this.Server) return jsh.XExt.Alert('Scan server not defined.');
    var _this = this;
    var params = {};
    if (_Params) params = _.extend(this.Params, _Params);
    XScanner_ClearLoadEvents();
    XScanner_SetLoadEvents(onFail);
    
    //Make this a post request
    //Add document.cookie
    
    jsh.xLoader.StartLoading(jsh.xfileuploadLoader);
    
    jsh.XExt.getToken(function (token) {
      params = _.extend(params, token);
      params._func = _this.Func;
      var url = _this.Server + '/scan/?' + $.param(params);
      $.ajax({
        url: url,
        jsonp: 'callback',
        dataType: 'jsonp',
        complete: function (data) {
          XScanner_ClearLoadEvents();
          var jdata = data.responseJSON;
          if ((jdata instanceof Object) && ('_error' in jdata)) {
            if (jsh.DefaultErrorHandler(jdata._error.Number, jdata._error.Message)) { }
            else if ((jdata._error.Number == -9) || (jdata._error.Number == -5)) { jsh.XExt.Alert(jdata._error.Message); }
            else { jsh.XExt.Alert('Error #' + jdata._error.Number + ': ' + jdata._error.Message); }
            if (onFail) onFail(jdata._error);
            return;
          }
          else if ((jdata instanceof Object) && ('_success' in jdata)) {
            if (onComplete) onComplete(jdata);
          }
          else {
            jsh.XExt.Alert('Error Scanning: ' + JSON.stringify(data.responseJSON ? data.responseJSON : ''), onFail);
          }
        },
        error: function (err) { XScanner_Timeout(onFail); }
      });
    }, function () { //Token Generation Error
      XScanner_Timeout(onFail);
    });
  }

  return XScanner;
}