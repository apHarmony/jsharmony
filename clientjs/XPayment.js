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

  function XPayment() {
    this.Loader = {};
    this.Initialized = false;
    this.Init();

    this.payment_id = '';
    this.payment_result_url = '';
    this.payment_onComplete = undefined;
    this.payment_onFail = undefined;
    this.payment_proxy = false;
    this.payment_result_url = '';
    this.fp_hash = '';
  }

  XPayment.prototype.Init = function () {
    if (this.Initialized) return;
    var _this = this;
    jsh.onPaymentProxyComplete = function (obj) {
      if (!_this.payment_proxy) return;
      jsh.xLoader.StopLoading(_this.Loader);
      _this.Result();
    };
    jsh.root.append('\
      <iframe id="'+jsh.getInstance()+'_xpaymentproxy" name="'+jsh.getInstance()+'_xpaymentproxy" src="about:blank" onload="'+jsh.getInstance()+'.onPaymentProxyComplete(this);" style="width:0;height:0;border:0px solid #fff;"></iframe>\
      <div class="xpaymentformcontainer" style="position:absolute;top:0px;left:0px;width:1px;height:1px;overflow:hidden;"></div>\
    ');
    this.Initialized = true;
  }
  XPayment.prototype.Submit = function(fp_data, payment_data, _payment_result_url, onComplete, onFail) {
    this.payment_id = fp_data.payment_id;
    this.payment_result_url = _payment_result_url;
    this.payment_onComplete = onComplete;
    this.payment_onFail = onFail;
    this.payment_proxy = true;
    this.fp_hash = fp_data.fp_hash;
    var d = {
      x_fp_hash : fp_data.fp_hash,
      x_fp_sequence : fp_data.fp_sequence,
      x_fp_timestamp : fp_data.fp_timestamp,
      x_login: fp_data.fp_login,
      x_type: 'AUTH_CAPTURE',
      x_amount: fp_data.fp_amount,
      x_relay_response: 'TRUE',
      x_relay_always: 'TRUE',
      x_version: '3.1',
      x_method: 'CC',
      x_invoice_num: fp_data.fp_invoice_id,
      x_po_num: fp_data.fp_invoice_id,
      x_description: fp_data.fp_description,
      x_cust_id: fp_data.fp_cust_id,
      x_card_num: payment_data.CC_NO,
      x_card_code: payment_data.CC_CVV,
      x_exp_date: payment_data.CC_EXPD_MM.toString() + payment_data.CC_EXPD_YYYY.toString(),
      x_first_name: payment_data.PACC_FName,
      x_last_name: payment_data.PACC_LName,
      x_address: (payment_data.PACC_Addr || ''),
      x_city: (payment_data.PACC_City || ''),
      x_state: payment_data.PACC_STATE,
      x_zip: payment_data.PACC_Zip,
      x_country: 'US'
    };
    var formhtml = '<form class="xpaymentform" method="post" target="'+jsh.getInstance()+'_xpaymentproxy">';
    _.each(d, function (val, key) {
      if (typeof val == 'undefined') return;
      formhtml += '<INPUT TYPE="HIDDEN" NAME="' + jsh.XExt.escapeHTML(key) + '" VALUE="' + jsh.XExt.escapeHTML(val) + '" />';
    });
    formhtml += '</form>';
    jsh.$root('.xpaymentformcontainer').html(formhtml);
    jsh.$root('.xpaymentform').attr('action', fp_data.fp_url);
    jsh.xLoader.StartLoading(this.Loader);
    jsh.$root('.xpaymentform').submit();
  }
  XPayment.prototype.Result = function() {
    var _this = this;
    //Verify Payment Result
    jsh.XPost.prototype.XExecutePost(_this.payment_result_url, { 'payment_id': _this.payment_id, 'fp_hash': _this.fp_hash }, function (rslt) {
      if ('_success' in rslt) {
        var PACC_STS = rslt['PACC_STS'];
        var PACC_PP_Result = rslt['PACC_PP_Result'];
        
        //Process result
        if (PACC_STS == 'PENDING') {
          jsh.XExt.Alert('Transaction Failed: ' + PACC_PP_Result + '\nPlease verify your credit card information and try again.', function (){
            if (typeof _this.payment_onFail != 'undefined') _this.payment_onFail(rslt);
          });
        }
        else {
          if (typeof _this.payment_onComplete != 'undefined') _this.payment_onComplete(rslt);
        }
      }
    });
  }

  return XPayment;
}