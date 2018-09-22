/**
 * @license Copyright (c) 2003-2015, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or http://ckeditor.com/license
 */

CKEDITOR.editorConfig = function( config ) {
	// Define changes to default configuration here. For example:
	// config.language = 'fr';
  // config.uiColor = '#AADC6E';
  var _BASEURL = '';
  for(var i=0;i<window.jsHarmony.Instances.length;i++){
    _BASEURL = window.jsHarmony.Instances[i]._BASEURL;
  }
  config.filebrowserUploadUrl = _BASEURL + '_ul/ckeditor';
  config.extraPlugins = 'pastebase64';

  config.toolbar = [
    ['Styles', 'Format', 'Font', 'FontSize'],
    '/',
    ['Bold', 'Italic', 'Underline', 'StrikeThrough', '-', 'Undo', 'Redo', '-', 'Cut', 'Copy', 'Paste', 'Find', 'Replace', '-', 'Outdent', 'Indent', '-', 'Print'],
    '/',
    ['NumberedList', 'BulletedList', '-', 'JustifyLeft', 'JustifyCenter', 'JustifyRight', 'JustifyBlock'],
    ['Image', 'Table', '-', 'Link', 'Flash', 'Smiley', 'TextColor', 'BGColor', 'Source']
  ];
};
