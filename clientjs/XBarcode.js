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

  function XBarcode(_Template, _Params) {
    this.Template = _Template;
    this.Server = jsh.globalparams.barcode_server;
    if (_Params) this.Params = _Params;
    else this.Params = {};
  }

  var XBarcode_Timer = null;

  function XBarcode_SetLoadEvents(onFail) {
    XBarcode_Timer = setTimeout(function () { XBarcode_Timeout(onFail); }, 10000);
  }
  function XBarcode_ClearLoadEvents() {
    jsh.xLoader.StopLoading(jsh.xfileuploadLoader);
    if (XBarcode_Timer) { clearTimeout(XBarcode_Timer); XBarcode_Timer = null; }
  }
  function XBarcode_Timeout(onFail) {
    XBarcode_ClearLoadEvents();
    jsh.XExt.Alert('Print Failed: Could not connect to Barcode Print Server.', onFail);
  }

  XBarcode.prototype.Print = function (_Params, onComplete, onFail) {
    var params = {};
    if (_Params) params = _.extend(this.Params, _Params);
    var url = this.Server + '/print/' + this.Template + '/?' + $.param(params);
    XBarcode_ClearLoadEvents();
    XBarcode_SetLoadEvents(onFail);
    
    jsh.xLoader.StartLoading(jsh.xfileuploadLoader);
    $.ajax({
      cache: false,
      url: url,
      jsonp: 'callback',
      dataType: 'jsonp',
      complete: function (data) {
        XBarcode_ClearLoadEvents();
        var jdata = data.responseJSON;
        if ((jdata instanceof Object) && ('_error' in jdata)) {
          if (jsh.DefaultErrorHandler(jdata._error.Number, jdata._error.Message)) { /* Do nothing */ }
          else if ((jdata._error.Number == -9) || (jdata._error.Number == -5)) { jsh.XExt.Alert(jdata._error.Message); }
          else { jsh.XExt.Alert('Error #' + jdata._error.Number + ': ' + jdata._error.Message); }
          return;
        }
        else if ((jdata instanceof Object) && ('_success' in jdata)) {
          if (onComplete) onComplete();
        }
        else {
          jsh.XExt.Alert('Error Printing Barcode: ' + JSON.stringify(data.responseJSON ? data.responseJSON : ''), onFail);
        }
      },
      error: function (err) { XBarcode_Timeout(onFail); }
    });
  };

  XBarcode.EnableScanner = function (jobj, onSuccess){
    if (typeof jobj.data('keydown_focus') !== 'undefined') return;
    jobj.data('keydown_focus', '');
    jobj.keydown(function (e) {
      if ((e.which == 17 && e.ctrlKey) || (e.which == 66 && e.ctrlKey) || (e.which == 85 && e.ctrlKey)) {
        e.preventDefault();
        return;
      }
      else if (e.keyCode == 13) { if (onSuccess) if (onSuccess.call(this) === false) { e.preventDefault(); e.stopImmediatePropagation(); return; } }
      jobj.data('keydown_focus','1');
    });
    jobj.blur(function (e) { jobj.data('keydown_focus',''); });
    jobj.keyup(function (e) {
      if (jobj.data('keydown_focus') != '1') return;
    });
  };

  return XBarcode;
};