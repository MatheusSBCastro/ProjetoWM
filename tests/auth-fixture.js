const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const installAccess = require('../auth-access');

const root = path.join(__dirname, '..');
const digest = token => crypto.createHash('sha256').update(token).digest('hex');
const password = bcrypt.hashSync('teste123', 4);

function fixture(options = {}) {
  let state = JSON.stringify({
    users: [
      { id: 1, name: 'ADM', role: 'admin' },
      { id: 2, name: 'Professor Teste', role: 'professor', login: 'professor', email: 'professor@gmail.com', password },
      { id: 3, name: 'Aluno Teste', role: 'aluno', login: 'aluno', email: 'aluno@gmail.com', password },
    ],
    exercises: [], exerciseCatalogVersion: 'wm-500-pt-v3', workouts: [], checkins: [], ratings: [], consulting: [],
    sessions: [{ tokenHash: digest('admin-token'), userId: 1, expiresAt: new Date(Date.now() + 3600000).toISOString() }]
  });
  const fakeFs = { ...fs,
    readFileSync(file, ...args) { return String(file).endsWith('database.json') ? state : fs.readFileSync(file, ...args); },
    writeFileSync(file, data) { assert.ok(String(file).endsWith('database.json')); state = data; },
    existsSync(file) { return String(file).endsWith('database.json') || fs.existsSync(file); }
  };
  const context = {
    require: name => name === 'fs' ? fakeFs : name === './auth-access'
      ? (app, dependencies) => installAccess(app, { ...dependencies, clientId: options.disabled ? '' : 'test-client', verifyGoogle: async credential => {
        if (credential === 'invalid') throw new Error('Invalid token');
        return JSON.parse(credential);
      } }) : require(name),
    process: { env: {} }, __dirname: root, console, Buffer, module: { exports: {} }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'server.js'), 'utf8'), context);
  const app = context.module.exports;
  return { app, getDb: () => JSON.parse(state), setDb: db => { state = JSON.stringify(db); } };
}

module.exports = { fixture };
