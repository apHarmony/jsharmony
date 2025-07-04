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
$.fn.$find = function(){ return $.fn.find.apply(this, arguments); };
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

  XBarcode.EnableScanner = function (jobj, onBarcodeEnd, options){
    options = _.extend({
      onBarcodeStart: null, // function(e){}  (May be fired multiple times, per start key)
      startKeys: ['^17', '^66', '^85'],
      endKeys: ['13'],
      autoEnd: false,
    }, options);
    if (typeof jobj.data('keydown_focus') !== 'undefined') return;
    var isScanning = false;
    var scanTimer = null;
    var AUTOENDSCAN_TIMEOUT = 500;
    var autoEndScan = function(){
      if(scanTimer) clearTimeout(scanTimer);
      scanTimer = null;
      if(isScanning){
        isScanning = false;
        if (onBarcodeEnd) onBarcodeEnd.call(jobj[0]);
      }
    };
    jobj.data('keydown_focus', '');
    jobj.keydown(function (e) {
      for(var i=0;i<options.startKeys.length;i++){
        var startKey = (options.startKeys[i]).toString();
        if(startKey){
          var startKeyCtrl = startKey[0]=='^';
          if(startKeyCtrl) startKey = startKey.substr(1);
          startKey = parseInt(startKey);
          if((e.which === startKey) && (!!e.ctrlKey == !!startKeyCtrl)){
            e.preventDefault();
            if(!isScanning){
              if(options.onBarcodeStart) options.onBarcodeStart(e); // May be fired multiple times
              if(options.autoEnd){
                isScanning = true;
                scanTimer = setTimeout(autoEndScan, AUTOENDSCAN_TIMEOUT);
              }
            }
            return;
          }
        }
      }
      for(i=0;i<options.endKeys.length;i++){
        var endKey = (options.endKeys[i]).toString();
        if(endKey){
          var endKeyCtrl = endKey[0]=='^';
          if(endKeyCtrl) endKey = endKey.substr(1);
          endKey = parseInt(endKey);
          if((e.which === endKey) && (!!e.ctrlKey == !!endKeyCtrl)){
            isScanning = false;
            if(scanTimer){ clearTimeout(scanTimer); scanTimer = null; }
            if (onBarcodeEnd){
              if (onBarcodeEnd.call(this) === false) {
                e.preventDefault();
                e.stopImmediatePropagation();
                return;
              }
            }
          }
        }
      }
      if(isScanning && scanTimer && options.autoEnd){
        clearTimeout(scanTimer);
        scanTimer = setTimeout(autoEndScan, AUTOENDSCAN_TIMEOUT);
      }
      jobj.data('keydown_focus','1');
    });
    jobj.blur(function (e) { jobj.data('keydown_focus',''); });
    jobj.keyup(function (e) {
      if (jobj.data('keydown_focus') != '1') return;
    });
  };

  return XBarcode;
};