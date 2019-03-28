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

exports = module.exports = function(jsh){

  function XGrid(_q,_TemplateID,_PlaceholderID,_CustomScroll,_Paging,_ScrollControl){
    this._this = this;
    this.TemplateID = _TemplateID;
    this.PlaceholderID = _PlaceholderID;
    this.ColSpan = jsh.$root(this.PlaceholderID).parent().find('thead th').length;
    this.q = _q;
    
    if(_CustomScroll === undefined) this.CustomScroll = ''; 
    else {
      if(lteIE7()){
        this.CustomScroll = '';
        _ScrollControl = _CustomScroll;
        jsh.$(_CustomScroll).css('overflow','auto');
      }
      else this.CustomScroll = _CustomScroll
    }
    
    if(_Paging === undefined) this.Paging = true;
    else this.Paging = _Paging;
    if(_ScrollControl === undefined) this.ScrollControl = window; 
    else this.ScrollControl = _ScrollControl;
    this.Sort = new Array();
    this.Search = '';
    this.SearchJSON = '';
    this.scrolledPastBottom = false;
    this.lastDocumentHeight = 0;
    this.scrollPrevious = 0;
    this.scrollFunc = null;
    this.EOF = true;
    this.NoResultsMessage = 'No results %%%FORSEARCHPHRASE%%%';
    this.NoDataMessage = null;
    this.RequireSearchMessage = 'Please search';
    this.RowCount = 0;
    this.AutoLoadMore = true;
    if(this.Paging) this.EnableScrollUpdate();
    this.IsLoading = false;
    this.TemplateHTMLFunc = null;
    this.LastColumns = new Array(); //Used in Tool Search
    this.Formatters = new Array(); //Used in Tool Search
    this.LastData = null;
    this.Data = null;
    this.PreProcessResult = null;
    this.OnBeforeSelect = null;
    this.OnRowBind = null;
    this.OnMetaData = null; //(data)
    this.OnDBRowCount = null;
    this.OnResetDataSet = null; //()
    this.OnRender = null; //(ejssource,data)
    this.OnLoadMoreData = null; //()
    this.OnLoadComplete = null;
    this.OnLoadError = null;
    this.RequireSearch = false;
    this.State = {};
    this.Prop = {};
    this.GetMeta = true;
    this.GetDBRowCount = false;
    this.DBRowCount = -1;
    this.LOVs = {};
    this.defaults = {};
    this.bcrumbs = {};
    this.title = null;
  }

  //Passing 0,-1 for rowcount will return total rowcount
  XGrid.prototype.Load = function(rowstart,rowcount,onComplete,getCSV,onFail){
    if(this.IsLoading){
      return;
    }
    this.IsLoading = true;
    var loader = jsh.xLoader;
    if (typeof getCSV == 'undefined') getCSV = false;
    
    var rowstart = typeof rowstart !== 'undefined' ? rowstart : 0;
    var rowcount = typeof rowcount !== 'undefined' ? rowcount : 0;
    var _this = this;
    
    if(rowstart > 0){
      if(_this.EOF) return;
      jsh.$root(_this.PlaceholderID).find('tr.xtbl_loadmore').remove();
      jsh.$root(_this.PlaceholderID).append('<tr class="xtbl_loadmore"><td colspan="'+_this.ColSpan+'"><a href="#">Loading...</div></td></tr>');
    }
    var starttime = (new Date()).getTime();
    
    var reqdata = { rowstart: rowstart, rowcount: rowcount, sort: JSON.stringify(this.Sort), search: this.Search, searchjson: this.SearchJSON, d: JSON.stringify(this.Data) };
    if (this.GetMeta) reqdata.meta = 1;
    if (this.GetDBRowCount && (rowstart == 0)) {
      _this.DBRowCount = -1;
      reqdata.getcount = 1;
    }
    if (getCSV) {
      this.IsLoading = false;
      onComplete(jsh._BASEURL + '_csv/' + this.q + '/?'+$.param(reqdata));
      return;
    }
    if (this.OnBeforeSelect) this.OnBeforeSelect();
    if(loader) loader.StartLoading(_this);
    $.ajax({
      type:"GET",
      url:jsh._BASEURL+'_d/'+this.q+'/',
      data: reqdata,
      dataType: 'json',
      success:function(data){
        var loadtime = ((new Date()).getTime() - starttime);
        if((rowstart > 0) && (loadtime < 500)){
          window.setTimeout(function(){ _this.ProcessData(data,rowstart,onComplete,reqdata); },500-loadtime);
        }
        else { _this.ProcessData(data,rowstart,onComplete,reqdata); }
      },
      error: function (data) {
        if(loader) loader.StopLoading(_this);
        _this.IsLoading = false;
        if (_this.OnLoadComplete) _this.OnLoadComplete();
        if (onComplete) onComplete();

        var jdata = data.responseJSON;
        if ((jdata instanceof Object) && ('_error' in jdata)) {
          if (jsh.DefaultErrorHandler(jdata._error.Number, jdata._error.Message)) { }
          else if (_this.OnLoadError && _this.OnLoadError(jdata._error)) { }
          else if ((jdata._error.Number == -9) || (jdata._error.Number == -5)) { jsh.XExt.Alert(jdata._error.Message); }
          else { jsh.XExt.Alert('Error #' + jdata._error.Number + ': ' + jdata._error.Message); }
          if (onFail) onFail(jdata._error);
          return;
        }
        if (onFail && onFail(data)) { }
        else if (_this.OnLoadError && _this.OnLoadError(jdata._error)) { }
        else if (('status' in data) && (data.status == '404')) { jsh.XExt.Alert('(404) The requested page was not found.'); }
        else if (jsh._debug) jsh.XExt.Alert('An error has occurred: ' + data.responseText);
        else jsh.XExt.Alert('An error has occurred.  If the problem continues, please contact the system administrator for assistance.');
      }
    });
  };
  XGrid.prototype.ProcessData = function(data,rowstart,onComplete,reqdata){
    var _this = this;
    var loader = jsh.xLoader;
    if(rowstart > 0){
      jsh.$root(_this.PlaceholderID).find('tr.xtbl_loadmore').remove();
    }
    if ((data instanceof Object) && ('_error' in data)) {
      if (jsh.DefaultErrorHandler(data['_error'].Number, data['_error'].Message)) { }
      else if ((data._error.Number == -9) || (data._error.Number == -5)) { jsh.XExt.Alert(data._error.Message); }
      else { jsh.XExt.Alert('Error #' + data._error.Number + ': ' + data._error.Message); }
    }
    else {
      if (_this.GetMeta) {
        _this.GetMeta = false;
        if ('_defaults' in data) { _this.defaults = data['_defaults']; }
        if ('_bcrumbs' in data) { _this.bcrumbs = data['_bcrumbs']; }
        if ('_title' in data) { _this.title = data['_title']; }
        for (var tbl in data) {
          if (tbl.indexOf('_LOV_') == 0) {
            _this.LOVs[tbl.substring(5)] = data[tbl];
          }
        }
        if (_this.OnMetaData) _this.OnMetaData(data);
      }
      if (('_count_' + this.q) in data) {
        var dcount = data['_count_' + this.q];
        if ((dcount != null)) _this.DBRowCount = dcount['cnt'];
        _this.OnDBRowCount();
        //if ((dcount != null) && (dcount.length == 1)) onComplete(dcount[0]['cnt']);
        //else { jsh.XExt.Alert('Error retrieving total row count.'); }
        //onComplete = null;  //Clear onComplete event, already handled
      }
      if ((data[this.q].length == 0) && ((_this.NoResultsMessage) || (_this.RequireSearch && _this.RequireSearchMessage))) {
        _this.EOF = true;
        _this.RenderNoResultsMessage({ search: (((reqdata.search||'').trim()) || ((reqdata.searchjson||'').trim())) });
        _this.RowCount = 0;
        if (_this.OnResetDataSet) _this.OnResetDataSet(data);
      }
      else {
        if (_this.PreProcessResult) _this.PreProcessResult(data);
        var ejssource = "";
        if (_this.TemplateHTMLFunc != null) {
          ejssource = _this.TemplateHTMLFunc(data, rowstart);
          if (ejssource === false) {
            if(loader) loader.StopLoading(_this);
            _this.IsLoading = false;
            _this.Load();
            return;
          }
        }
        else ejssource = jsh.$root(_this.TemplateID).html();
        
        if (rowstart == 0) {
          jsh.$root(_this.PlaceholderID).empty();
          _this.RowCount = 0;
          if (_this.OnResetDataSet) _this.OnResetDataSet(data);
        }
        if (ejssource) {
          ejssource = ejssource.replace(/<#/g, '<%').replace(/#>/g, '%>')
          if (data[this.q] && _this.OnRender) _this.OnRender(ejssource, data);
          else {
            var ejsrslt = jsh.ejs.render(ejssource, {
              rowid: undefined,
              datatable: data[this.q],
              xejs: jsh.XExt.xejs,
              jsh: jsh,
              instance: jsh.getInstance()
            });
            jsh.$root(_this.PlaceholderID).append(ejsrslt);
            _this.RowCount = jsh.$root(_this.PlaceholderID).find('tr').length;
          }
        }
        _this.EOF = data['_eof_' + this.q];
        if ((_this.Paging) && (!_this.EOF)) {
          jsh.$root(_this.PlaceholderID).append('<tr class="xtbl_loadmore"><td colspan="' + _this.ColSpan + '"><a href="#">Load More Data</div></td></tr>');
          jsh.$root(_this.PlaceholderID).find('.xtbl_loadmore').click(function () {
            if (_this.OnLoadMoreData) { _this.OnLoadMoreData(); return false; }
            _this.Load(_this.RowCount);
            return false;
          });
        }
        if (_this.CustomScroll != '') {
          jsh.$(_this.CustomScroll).mCustomScrollbar("update");
        }
      }
    }
    if(loader) loader.StopLoading(_this);
    _this.IsLoading = false;
    if (_this.OnLoadComplete) _this.OnLoadComplete();
    if(onComplete) onComplete();
  }
  XGrid.prototype.RenderNoResultsMessage = function(options){
    if(!options) options = { search: false };
    var _this = this;
    var noresultsmessage = _this.NoResultsMessage.replace(/%%%FORSEARCHPHRASE%%%/g, (($.trim(_this.Search) != '')?'for selected search phrase':''));
    if (_this.RequireSearch && !options.search) noresultsmessage = _this.RequireSearchMessage;
    else if (!options.search && _this.NoDataMessage) noresultsmessage = _this.NoDataMessage;
    jsh.$root(_this.PlaceholderID).html('<tr class="xtbl_noresults"><td colspan="' + _this.ColSpan + '" align="center" class="xtbl_noresults">' + noresultsmessage + '</td></tr>');
  }
  XGrid.prototype.ResetSortGlyphs = function (tblobj){
    var xhtml_thead = tblobj.find('thead tr');
    xhtml_thead.find("th").removeClass('sortAsc').removeClass('sortDesc');
    if (!this.Sort || (this.Sort.length == 0)) return;
    
    var xhtml_th = tblobj.find('.thead' + this.Sort[0].substring(1));
    if (this.Sort[0][0] == '^') { xhtml_th.addClass('sortAsc'); }
    else { xhtml_th.addClass('sortDesc'); }
  }
  XGrid.prototype.AddSort = function(obj,col){
    var newdir = '^';
    for(var i = 0; i < this.Sort.length; i++){
      if(this.Sort[i].substring(1)==col){
        if(i==0){
          var curdir = this.Sort[i].substring(0,1);
          if(curdir == '^') newdir = 'v';
        }
        this.Sort.splice(i,1);
        i--;
      }
    }
    var xhtml_th = $(obj).parent();
    var xhtml_thead = xhtml_th.parent();
    if(newdir == '^'){ xhtml_thead.find("th").removeClass('sortAsc').removeClass('sortDesc'); xhtml_th.addClass('sortAsc'); }
    else{ xhtml_thead.find("th").removeClass('sortAsc').removeClass('sortDesc'); xhtml_th.addClass('sortDesc'); }
    this.Sort.unshift(newdir+col);
    this.Load();
    return false;
  }
  XGrid.prototype.NewSearch = function(txt){
    this.Search = txt;
    this.Load();
    return false;
  }
  XGrid.prototype.NewSearchJSON = function(txt, cb){
    this.SearchJSON = txt;
    this.Load(undefined,undefined,cb);
    return false;
  }
  XGrid.prototype._WindowOnScrollBottom = function(callback){
    var _this = this;
    _this.scrollFunc = function(){
      var curDocumentHeight = _this._getDocumentHeight();
      if(curDocumentHeight != _this.lastDocumentHeight){
        _this.lastDocumentHeight = curDocumentHeight;
        _this.scrolledPastBottom = false;
      }
      var pastBottom = (($(window).height() + $(window).scrollTop()) >= (curDocumentHeight));
      if(!_this.scrolledPastBottom && pastBottom) {
        callback($(window).height() + $(window).scrollTop());
        _this.scrolledPastBottom = true;
      } else {
        if(!pastBottom) _this.scrolledPastBottom = false;
      }
      _this.scrollPrevious = $(window).scrollTop();
    };
    jsh.$(_this.ScrollControl).scroll(_this.scrollFunc);
  }
  XGrid.prototype._getDocumentHeight = function() {
    return Math.max(
        Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
        Math.max(document.body.offsetHeight, document.documentElement.offsetHeight),
        Math.max(document.body.clientHeight, document.documentElement.clientHeight)
    );
  }
  XGrid.prototype._ControlOnScrollBottom = function(callback){
    var _this = this;
    _this.scrollFunc = function () {
      var pastBottom = ((jsh.$(_this.ScrollControl).outerHeight() + jsh.$(_this.ScrollControl).scrollTop()) >= jsh.$(_this.ScrollControl).get(0).scrollHeight);
      //console.log((jsh.$(_this.ScrollControl).outerHeight()+jsh.$(_this.ScrollControl).scrollTop()) + ">=" + jsh.$(_this.ScrollControl).get(0).scrollHeight);
      if (!_this.scrolledPastBottom && pastBottom) {
        callback(jsh.$(_this.ScrollControl).height() + jsh.$(_this.ScrollControl).scrollTop());
        _this.scrolledPastBottom = true;
      } else {
        if (!pastBottom) _this.scrolledPastBottom = false;
      }
      _this.scrollPrevious = jsh.$(_this.ScrollControl).scrollTop();
    };
    jsh.$(_this.ScrollControl).scroll(_this.scrollFunc);
  }
  XGrid.prototype.EnableScrollUpdate = function() {
    var _this = this;
    var updateFunc = function(){
      if(_this.AutoLoadMore){
        if(!_this.EOF){
          _this.Load(_this.RowCount);
        }
      }
    };
    if(_this.CustomScroll != ''){
      jsh.$(_this.CustomScroll).mCustomScrollbar({
        theme:"dark",
        autoScrollOnFocus: false,
        scrollButtons:{ enable:true },
        scrollInertia:0,
        callbacks:{
          onTotalScroll: updateFunc
        }
      });
    }
    else if(this.ScrollControl == window) this._WindowOnScrollBottom(updateFunc);
    else this._ControlOnScrollBottom(updateFunc);
  }
  XGrid.prototype.Destroy = function (){
    var _this = this;
    if (_this.CustomScroll != '') { jsh.$(_this.CustomScroll).mCustomScrollbar("destroy"); }
    else { jsh.$(_this.ScrollControl).unbind('scroll', _this.scrollFunc); }
  }

  return XGrid;
}