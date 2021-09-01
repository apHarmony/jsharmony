var wclib = require('../WebConnect');
var wc = new wclib.WebConnect();

console.log('Expects true');
wc.req('https://localhost', 'GET', {}, {}, undefined, function(err, res, content){
}, { rejectUnauthorized: true });

console.log('Expects false');
wc.req('https://localhost', 'GET', {}, {}, undefined, function(err, res, content){
  //Expects false
}, { rejectUnauthorized: false });

console.log('Expects false');
wc.req('https://localhost', 'GET', {}, {}, undefined, function(err, res, content){
  //Expects false
});

console.log('Expects true');
wc.req('https://localhostx', 'GET', {}, {}, undefined, function(err, res, content){
}, { rejectUnauthorized: true });

console.log('Expects false');
wc.req('https://localhostx', 'GET', {}, {}, undefined, function(err, res, content){
  //Expects false
}, { rejectUnauthorized: false });

console.log('Expects undefined');
wc.req('https://localhostx', 'GET', {}, {}, undefined, function(err, res, content){
  //Expects undefined
});