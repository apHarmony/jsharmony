@echo off

rem Usage: clientcompiler.cmd [/prod]
rem   /prod    Compiles to public\js\jsHarmony.js instead of public\js\jsHarmony.dev.js

cd clientjs
rem call browserify jsHarmony.js | uglifyjs > ..\public\js\jsHarmony.js
rem call browserify jsHarmony.js > ..\public\js\jsHarmony.js

if "%1"=="/prod" goto prod

supervisor  -n exit -w ".","..\node_modules\jsharmony-validate","..\views\jsh_system.ejs" -e js -x browserify.cmd -- jsHarmony.js -o ..\public\js\jsHarmony.dev.js -t ./browserifyEJS.js -d
goto done

:prod
supervisor  -n exit -w ".","..\node_modules\jsharmony-validate","..\views\jsh_system.ejs" -e js -x cmd -- /c "browserify.cmd jsHarmony.js -t ./browserifyEJS.js | uglifyjs > ..\public\js\jsHarmony.js"
goto done

:done
cd ..