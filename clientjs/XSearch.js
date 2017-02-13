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

exports = module.exports = {};

//-----------
//SEARCHQUERY
//-----------
function SearchQuery(model) {
  this.Items = [];
  this.Fields = [];
  if (typeof model !== 'undefined') {
    var _this = this;
    _.each(model.Fields, function (field) {
      if (XExt.HasAccess(field.access, 'BS')) {
        var comparison_type = 'none';
        if ('lov' in field) comparison_type = 'lov';
        else if ('type' in field) {
          if ((field.type == 'varchar') || (field.type == 'char')) comparison_type = 'string';
          else if (_.includes(['bigint', 'int', 'smallint', 'decimal', 'datetime', 'date', 'time', 'bit'], field.type)) comparison_type = 'numeric';
          else if ((field.type == 'hash')) comparison_type = 'object';
        }
        var sfield = { "name": field.name, "caption": field.caption, "comparison_type": comparison_type };
        if (field.search_sound) sfield.search_sound = 1;
        _this.Fields.push(sfield);
      }
    });
  }
}
SearchQuery.prototype.GetValues = function (_PlaceholderID) {
  _this = this;
  _this.Items = [];
  $(_PlaceholderID + ' div.xfilter_expression').each(function (i, obj) {
    var v_value = $(obj).find('input.xfilter_value').val();
    var v_join = $(obj).find('input.xfilter_join').val();
    var v_comparison = $(obj).find('select.xfilter_comparison').val();
    if (!v_comparison) v_comparison = 'contains';
    _this.Items.push(new SearchItem($(obj).find('select.xfilter_column').val(), v_value, v_join, v_comparison));
  });
};
SearchQuery.prototype.HasUpdates = function (_PlaceholderID) {
  _this = this;
  var newitems = [];
  $(_PlaceholderID + ' div').each(function (i, obj) {
    var v_value = $(obj).find('input.xfilter_value').val();
    var v_join = $(obj).find('input.xfilter_join').val();
    var v_comparison = $(obj).find('input.xfilter_comparison').val();
    newitems.push(new SearchItem($(obj).find('select.xfilter_column').val(), v_value, v_join, v_comparison));
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
};

exports.SearchQuery = SearchQuery;
exports.SearchItem = SearchItem;