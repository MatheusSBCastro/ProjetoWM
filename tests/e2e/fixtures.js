const { test: base, expect } = require('@playwright/test');
const { fixture } = require('../auth-fixture');

const test = base.extend({
  appState: async ({}, use) => { await use(fixture({ disabled: true })); },
  baseURL: async ({ appState }, use) => {
    // Each test serves the real application with its own database in memory.
    const { app } = appState;
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    try {
      await use(`http://127.0.0.1:${server.address().port}`);
    } finally {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  },
});

async function login(page, role, password = 'teste123') {
  await page.goto('/');
  const portal = { aluno: /Sou aluno/, professor: /Sou professor/, admin: /Administração/ }[role];
  await page.getByRole('button', { name: portal }).click();
  if (role !== 'admin') await page.getByLabel('Login', { exact: true }).fill(role);
  await page.getByLabel(role === 'admin' ? 'Palavra-chave' : 'Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: /Entrar no meu espaço/ }).click();
}

module.exports = { test, expect, login };
