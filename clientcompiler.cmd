@echo off
cd clientjs
rem call browserify main.js | uglifyjs > ..\public\js\main.js
rem call browserify main.js > ..\public\js\main.js
supervisor  -n exit -w ".","..\node_modules\jsharmony-validate" -e js -x browserify.cmd -- main.js -o ..\public\js\main.js
cd ..