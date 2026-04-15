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
      onBarcodeReady: null, // function(){}  Ready for input
      onBarcodeStart: null, // function(e){}  (May be fired multiple times, per start key)
      startKeys: ['^17', '^66', '^85'],
      endKeys: ['13'],
      ignoreKeys: [],
      autoEnd: false,  // Call onBarcodeEnd after timeout
      onKey: null,     // function(e, isScanning){}
      destroyHandler: null, // [] Array of function(){}
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
      if(options.onBarcodeReady) options.onBarcodeReady();
    };
    jobj.data('keydown_focus', '');

    jobj.on('keydown.xbarcode', function (e) {
      function keyMatches(keyInfo){
        keyInfo = keyInfo.toString();
        if(keyInfo){
          var keyInfoCtrl = keyInfo[0]=='^';
          if(keyInfoCtrl) keyInfo = keyInfo.substr(1);
          keyInfo = parseInt(keyInfo);
          if((e.which === keyInfo) && (!!e.ctrlKey == !!keyInfoCtrl)){
            return true;
          }
        }
        return false;
      }

      for(var i=0;i<options.startKeys.length;i++){
        if(keyMatches(options.startKeys[i])){
          e.preventDefault();
          if(isScanning) {
            if(options.autoEnd){
              if(scanTimer){ clearTimeout(scanTimer); scanTimer = null; }
              scanTimer = setTimeout(autoEndScan, AUTOENDSCAN_TIMEOUT);
            }
          }
          else if(!options.autoEnd || !scanTimer){
            if(options.onBarcodeStart) options.onBarcodeStart(e); // May be fired multiple times
            if(options.autoEnd){
              isScanning = true;
              scanTimer = setTimeout(autoEndScan, AUTOENDSCAN_TIMEOUT);
            }
          }
          return;
        }
      }
      //Ignore after start, so that autoend will be extended
      for(i=0;i<options.ignoreKeys.length;i++){
        if(keyMatches(options.ignoreKeys[i])){
          e.preventDefault();
          e.stopImmediatePropagation();
          if(isScanning && scanTimer && options.autoEnd){
            clearTimeout(scanTimer);
            scanTimer = setTimeout(autoEndScan, AUTOENDSCAN_TIMEOUT);
          }
          return;
        }
      }
      if(options.onKey) options.onKey(e, isScanning);
      for(i=0;i<options.endKeys.length;i++){
        if(keyMatches(options.endKeys[i])){
          if(isScanning){
            isScanning = false;
            if (onBarcodeEnd){
              if (onBarcodeEnd.call(this) === false) {
                e.preventDefault();
                e.stopImmediatePropagation();
                return;
              }
            }
          }
          else {
            e.preventDefault();
            e.stopImmediatePropagation();
            return;
          }
        }
      }
      if(isScanning && scanTimer && options.autoEnd){
        clearTimeout(scanTimer);
        scanTimer = setTimeout(autoEndScan, AUTOENDSCAN_TIMEOUT);
      }
      jobj.data('keydown_focus','1');
    });
    jobj.on('blur.xbarcode', function (e) { jobj.data('keydown_focus',''); });
    jobj.on('keyup.xbarcode', function (e) {
      if (jobj.data('keydown_focus') != '1') return;
    });
    if(options.onBarcodeReady) options.onBarcodeReady();
    if(options.destroyHandler) options.destroyHandler.push(function(){
      clearTimeout(scanTimer);
      jobj.off('.xbarcode');
      jobj.removeData('keydown_focus');
      scanTimer = null;
    });
  };

  return XBarcode;
};