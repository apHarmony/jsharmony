call eslint --fix *.js
call eslint --fix lib\*.js
call eslint --fix render\*.js
call eslint --fix init\*.js
call eslint --fix routes\*.js
call eslint --config .eslintrc_test.js --fix test\*.js
call eslint --config .eslintrc_clientjs.js --ignore-pattern "crypto-md5-2.5.3.js" --ignore-pattern "jquery-1.11.2.js" --fix clientjs\*.js