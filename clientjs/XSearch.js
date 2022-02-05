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

  var XSearch = function(){ };

  //-----------
  //SEARCHQUERY
  //-----------
  function SearchQuery(xmodel) {
    this.xmodel = xmodel;
    this.Items = [];
    this.Fields = [];
    if (xmodel && xmodel.fields) {
      var _this = this;
      _.each(xmodel.fields, function (field) {
        if (jsh.XExt.hasAction(field.actions, 'BS') && !field.disable_search && !field.unbound) {
          var comparison_type = 'none';
          if (field.lov) comparison_type = 'lov';
          else if ('type' in field) {
            if ((field.type == 'varchar') || (field.type == 'char') || (field.type == 'binary')) comparison_type = 'string';
            else if (_.includes(['bigint', 'int', 'smallint', 'tinyint', 'decimal', 'float', 'time'], field.type)) comparison_type = 'numeric';
            else if (_.includes(['datetime', 'date'], field.type)) comparison_type = 'date';
            else if (_.includes(['hash', 'boolean'], field.type)) comparison_type = 'object';
          }
          var sfield = { 'name': field.name, 'caption': field.caption, 'comparison_type': comparison_type };
          if (field.search_sound) sfield.search_sound = 1;
          _this.Fields.push(sfield);
        }
      });
    }
  }
  SearchQuery.prototype.GetValues = function () {
    var _this = this;
    var _PlaceholderID = '';
    if(this.xmodel && this.xmodel && this.xmodel.controller && this.xmodel.controller.search) _PlaceholderID = this.xmodel.controller.search.PlaceholderID || '';
    _this.Items = [];
    var jSearchExpressions = jsh.$root(_PlaceholderID + ' div.xsearch_expression');
    for(var i=0;i<jSearchExpressions.length;i++){
      var jobj = $(jSearchExpressions[i]);
      var v_column = jobj.$find('select.xsearch_column').val();
      var v_value = jobj.$find('input.xsearch_value').val();
      var v_join = ((i==0) ? undefined : $(jSearchExpressions[i-1]).$find('select.xsearch_join').val());
      var v_comparison = jobj.$find('select.xsearch_comparison').val();
      if ((v_column==='ALL') || !v_comparison) v_comparison = 'contains';
      _this.Items.push(new SearchItem(v_column, v_value, v_join, v_comparison));
    }
  };
  SearchQuery.prototype.HasUpdates = function (_PlaceholderID) {
    var _this = this;
    var newitems = [];
    jsh.$root(_PlaceholderID + ' div').each(function (i, obj) {
      var v_value = $(obj).$find('input.xsearch_value').val();
      var v_join = $(obj).$find('input.xsearch_join').val();
      var v_comparison = $(obj).$find('select.xsearch_comparison').val();
      newitems.push(new SearchItem($(obj).$find('select.xsearch_column').val(), v_value, v_join, v_comparison));
    });
    if (newitems.length != _this.Items.length) return true;
    for (var i = 0; i < newitems.length; i++) {
      if (newitems[i].Column != _this.Items[i].Column) return true;
      if (newitems[i].Value != _this.Items[i].Value) return true;
      if (newitems[i].Join != _this.Items[i].Join) return true;
      if (newitems[i].Comparison != _this.Items[i].Comparison) return true;
    }
    return false;
  };

  function SearchItem(_Column, _Value, _Join, _Comparison) {
    this.Column = _Column;
    this.Value = _Value;
    this.Join = _Join;
    this.Comparison = _Comparison;
  }

  XSearch.SearchQuery = SearchQuery;
  XSearch.SearchItem = SearchItem;

  return XSearch;
};