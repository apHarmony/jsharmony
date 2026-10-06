@echo off

rem Usage: make.cmd

cd src

supervisor  -n exit -w "." -e js -x cmd -- /c "browserify.cmd jsHarmonyClientTest.js -o ..\host.js"

cd ..