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

exports = module.exports = function(jsh){

  function XImageLoader () {
    this.loadqueue = [];
    
    this.loaded = new Array();
    
    jsh.root.append('<img class="XImageLoader jsHarmonyElement jsHarmonyElement_'+jsh._instanceClass+'" style="position:absolute;top:0px;left:0px;z-index:0;visibility:hidden;" />');
    this.loaderimg = jsh.$root('.XImageLoader.jsHarmonyElement_'+jsh._instanceClass);
    
    this.PrependImages = function(imgarray){
      //Prepend array of images
      for(var i=0; i<imgarray.length; i++){
        this.loadqueue.unshift(imgarray[i]);
      }
      
    };
    
    this.PrependImage = function(img){
      //Append image
      this.loadqueue.unshift(img);
    };
    
    this.IsLoaded = function(img){
      //Check if slide is in loaded array, return true if yes, false if no
      if($.inArray(img,this.loaded) != -1) return true;
      return false;
    };
    
    this.StartLoad = function(){
      if(this.IsLoading) return;
      this.IsLoading = true;
      this.LoadNext();
    };
    
    this.IsLoading = false;
    
    this.LoadNext = function(){
      var me = this;
      //If Queue is empty, sleep for 1 second and run again
      if(this.loadqueue.length == 0){ this.IsLoading = false; return; }
      
      //Remove next slide from queue
      var img = this.loadqueue.shift();
      
      //Check if it already loaded
      if(this.IsLoaded(img)){
        this.LoadNext();
        return;
      }
      
      this.loaderimg.unbind('load');
      //Load next slide
      this.loaderimg.load(function(){
        //Possibly for the future - add it to the scene, hidden
        me.loaded.push(img);
        me.LoadNext();
      });
      this.loaderimg.attr('src',img);
    };
  }

  return XImageLoader;
};