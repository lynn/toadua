#!/usr/bin/env node
const fs = require('fs'),
    http = require('http'),
      lo = require('lodash'),
     api = require('./backend.js'),
      hk = require('./housekeeping.js'),
      tr = require('./transaction.js');
require('object.fromentries').shim();

const REQUEST_BODY_SIZE_LIMIT = 1 << 14;

const fourohfour = static('404.html', 'text/html'),
  routes = {
  '/':          static('index.html',  'text/html'),
  '/style.css': static('style.css',   'text/css'),
  '/main.js':   static('frontend.js', 'application/javascript'),
  '/vue.js':    static('vue-production.js', 'application/javascript'),
  '/api':       api_handler
};

function api_handler(r, s, u) {
  let flip = (code, message) => {
    s.writeHead(code, {'content-type': 'text/plain; charset=utf-8'});
    s.write(message);
    s.end();
  };
  if(r.method === 'POST') {
    let body = '';
    r.on('data', data => {
      body += data;
      if(body.length > REQUEST_BODY_SIZE_LIMIT) {
        body = undefined;
        flip(413 /* Payload Too Large */, 'The request was too large.');
        r.connection.destroy();
      }
    });
    r.on('end', () => {
      let json;
      try {
        json = JSON.parse(body);
      } catch(e) {
        flip(400 /* Bad Request */, 'The request body could not be parsed as JSON.');
      }
      api(json, data => {
        data = data || { success: true };
        s.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        s.write(JSON.stringify(data));
        s.end();
      });
    });
  } else {
    flip(405 /* Method Not Allowed */, 'Expecting a POST request.');
  }
}

function static(fname, mime) {
  let f = fs.readFileSync(fname);
  let t = fs.statSync(fname).mtimeMs;
  return (r, s) => {
    let t_ = fs.statSync(fname).mtimeMs;
    if(t_ > t) f = fs.readFileSync(fname);
    s.writeHead(200, {
      'content-type': `${mime}; charset=utf-8`
    });
    s.write(f);
    s.end();
  };
}

function handler(r, s) {
  let url = new URL(r.url, 'https://uakci.pl');
  let handler = routes.hasOwnProperty(url.pathname) ?
    routes[url.pathname] : fourohfour;
  handler(r, s, url);
}

let server = http.createServer(handler);
server.listen(59138);
process.stderr.write('Server started!\n');

let intervals = {
       sync: setInterval(() => hk.  sync_resources(api),  3 * 60 * 1000),
       save: setInterval(() => hk.  sync_databases(api),  3 * 60 * 1000),
     backup: setInterval(() => hk.          backup(api),  1 * 60 * 1000),
  obsoleted: setInterval(() => hk.remove_obsoleted(api), 10 * 60 * 1000)
};

function bye() {
  process.stderr.write('Trying to exit gracefully\n');
  Object.values(intervals).forEach(clearInterval);
  server.close();
  while(Object.keys(tr.using).length) {}
  process.stderr.write('Trying to save database…\n');
  process.stderr.write(hk.sync_databases(api) ? 'Saved.\n'
                                              : 'Failed!\n');
  process.exitCode = 0;
}
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
