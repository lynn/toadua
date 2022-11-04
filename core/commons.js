// commons.js
// common utilities

"use strict";

module.exports = pollute;

const fs = require('fs'),
    yaml = require('js-yaml').load,
  {EventEmitter} = require('events');

let config;

const old_log = console.log;

function log() {
  let date = new Date().toISOString()
    .replace(/[:-]/g, '')
    .replace('T', '.')
    .substring(4, 15);
  let message = Array.from(arguments).join(' ')
                 // padding the message so that it doesn't interfere
                 // with the timestamp column:
                 //                '\nMMDD.hhmmss <message>'
                 .split('\n').join('\n            ');
  old_log(`${date} ${message}`);
};

function deburr(s) {
  return s.normalize('NFD')
          .replace(/\p{M}+/gu, '')
          .replace(/’/gu, '\'')
          .split(/(?:(?!')\P{L})+/gu)
          .map(_ => _.toLowerCase().replace(/ı/g, 'i'))
          .filter(_ => _);
}

function deburrMatch(what, where, mode) {
  const predicate = [
    (a, b) => b.indexOf(a) != -1,
    (a, b) => a.indexOf(b) != -1,
    (a, b) => a == b,
  ][mode];
  let count = 0;
  for(let w of what)
    if(where.some(y => predicate(w, y)))
      count++;
  return count;
}
deburrMatch.CONTAINING = 0,
deburrMatch.CONTAINED  = 1,
deburrMatch.EXACT      = 2;

let interval_cache = [];
function setInterval_(...args) {
  let this_one = setInterval(...args).unref();
  interval_cache.push(this_one);
  return this_one;
}

function clearInterval_(i) {
  clearInterval(i);
  let index = interval_cache.indexOf(i);
  if(index !== -1) interval_cache.splice(index, 1);
}

function clearAllIntervals() {
  interval_cache.forEach(clearInterval);
  interval_cache.length = 0;
}

var emitter = new EventEmitter;
emitter.setMaxListeners(Infinity);
module.exports.emitter = emitter;
emitter.emit = function(ev, ...args) {
  // add event name as first arg
  return EventEmitter.prototype.emit.call(this, ev, ev, ...args);
};

// for ever-changing configuration files, etc.
const FluidConfig = {
  update() {
    let file;
    try {
      file = fs.readFileSync(this.fname)
      this.cache = yaml(file);
    } catch(e) {
      if(e.code == 'ENOENT') {
        log(`fluid_config '${this.fname}' absent from disk ` +
            '– not updating');
        return;
      } else throw e;
    }
    log(`updating fluid_config '${this.fname}' (${file.length}b read)`);
    this.emit('update', this.cache);
  },
  _maxListeners: Infinity
};
Object.setPrototypeOf(FluidConfig, new EventEmitter);
function fluid_config(fname, handler) {
  let f = () => {
    return f.cache;
  }
  f.fname = fname;
  Object.setPrototypeOf(f, FluidConfig);
  if(handler) f.on('update', handler);
  fs.watchFile(fname, {persistent: false}, () => {
    f.update();
  });
  f.update();
  return f;
}

const MAIN_CONFIG = 'config/config.yml',
   DEFAULT_CONFIG = `${__dirname}/../config/defaults.yml`;
// initialise the global config file
let  main_config = fluid_config(MAIN_CONFIG),
  default_config = yaml(fs.readFileSync(DEFAULT_CONFIG));
          config = () => ({...default_config, ...main_config()});
Object.setPrototypeOf(config, new EventEmitter);
config.update = () => main_config.update();
main_config.on('update', () => config.emit('update', config()));

function pollute(__filename, args) {
  // announce to the console that a file is going to be loaded
  if(!__filename) {
    throw new Error(
      'commons.js/pollute must be called with __filename');
  }
  if(args && args.port) default_config.port = args.port;
  let parts = __filename.split(/[\/\\]/);
  log(`loading file '${parts.slice(parts.length - 2).join('/')}'...`);
  
  console.log = log;
  return exported;
}

// a store for stuff and things
var store = {};

const exported = {store, deburr, deburrMatch,
                  setInterval:   setInterval_, 
                  clearInterval: clearInterval_, 
                  clearAllIntervals, fluid_config, config, require,
                  emitter};

for(let e in exported) module.exports[e] = exported[e];
