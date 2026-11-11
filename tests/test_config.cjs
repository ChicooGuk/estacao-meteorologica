const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../dashboard/config.js'), 'utf8');
function load(host) {
  const window = {location: {hostname: host}};
  vm.runInNewContext(source, {window});
  return window;
}
for (const host of ['estacao-metedologica.web.app', 'estacao-metedologica.firebaseapp.com']) {
  const value = load(host).ESTACAO_API_BASE;
  assert.ok(value, 'Firebase deve configurar a API publica');
  const url = new URL(value);
  assert.equal(url.protocol, 'https:');
  assert.match(url.hostname, /^[a-z0-9-]+\.trycloudflare\.com$/);
  assert.equal(url.pathname, '/');
  assert.equal(url.search, '');
}
for (const host of ['localhost', '127.0.0.1', '192.168.1.12', 'example.com']) {
  assert.equal(load(host).ESTACAO_API_BASE, undefined, 'Outras origens devem usar a API local');
}
console.log('Configuracao: API Cloudflare nos dois hosts Firebase; acesso local preservado.');
