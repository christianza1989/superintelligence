// A development child with write/process permissions denied and selected import-effect traps.
// Permission flags do not deny all network operations. This is not a purity proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';

const emit = fs.writeSync.bind(fs);
const cases = JSON.parse(fs.readFileSync(0, 'utf8'));
const sideEffects = [];
let importing = true;
const deny = (name) => function () { if (importing) sideEffects.push(name); throw new Error(`side effect forbidden: ${name}`); };
for (const name of ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'mkdir', 'mkdirSync', 'rm', 'rmSync', 'unlink', 'unlinkSync', 'rename', 'renameSync', 'createWriteStream', 'truncate', 'truncateSync', 'write', 'writeSync']) fs[name] = deny(`fs.${name}`);
for (const name of ['writeFile', 'appendFile', 'mkdir', 'rm', 'unlink', 'rename', 'truncate']) fsPromises[name] = deny(`fs.promises.${name}`);
for (const name of ['open', 'openSync']) {
  const original = fs[name].bind(fs);
  fs[name] = function (file, flags, ...rest) {
    if (flags !== 'r' && flags !== fs.constants.O_RDONLY) return deny(`fs.${name}(write)`)(file, flags, ...rest);
    return original(file, flags, ...rest);
  };
}
const openPromise = fsPromises.open.bind(fsPromises);
fsPromises.open = function (file, flags, ...rest) {
  if (flags !== 'r' && flags !== fs.constants.O_RDONLY) return deny('fs.promises.open(write)')(file, flags, ...rest);
  return openPromise(file, flags, ...rest);
};
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) childProcess[name] = deny(`child_process.${name}`);
net.Server.prototype.listen = deny('server.listen');
net.Socket.prototype.connect = deny('socket.connect');
dgram.Socket.prototype.bind = deny('dgram.bind');
dgram.Socket.prototype.send = deny('dgram.send');
http.request = deny('http.request'); http.get = deny('http.get');
https.request = deny('https.request'); https.get = deny('https.get');
globalThis.fetch = deny('fetch');
syncBuiltinESMExports();

const results = [];
let importError;
try {
  const module = await import(pathToFileURL(process.argv[2]).href);
  importing = false;
  assert.equal(typeof module.parseCsv, 'function', 'synchronous parseCsv export required');
  for (const item of cases) {
    try {
      if (item.invalid) assert.throws(() => module.parseCsv(item.text));
      else {
        const actual = module.parseCsv(item.text);
        assert.ok(!actual || typeof actual.then !== 'function', 'parseCsv must be synchronous');
        assert.deepEqual(actual, item.rows);
      }
      results.push({ id: item.id, status: 'pass' });
    } catch (error) { results.push({ id: item.id, status: 'fail', error: String(error.message).slice(0, 1500) }); }
  }
} catch (error) { importError = String(error.stack ?? error).slice(0, 2000); }
emit(1, JSON.stringify({
  sideEffects, cases: results,
  observedImportEffectCoverage: ['instrumented fs writes/open-for-write', 'server.listen', 'socket.connect', 'http/https request/get', 'datagram bind/send', 'global fetch', 'child_process creation'],
  unknowns: ['deferred effects after import completion', 'uninstrumented or bypassed entry points', 'hostile same-user interference'],
  ...(importError ? { importError } : {}),
}));
