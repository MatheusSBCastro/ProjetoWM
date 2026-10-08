const fs = require('node:fs');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const { fixture } = require('../tests/auth-fixture');

async function run() {
  const output = path.join(__dirname, '..', '.visual-audit', 'motion');
  fs.mkdirSync(output, { recursive: true });
  const { app } = fixture({ disabled: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      baseURL: `http://127.0.0.1:${server.address().port}`,
      viewport: { width: 1440, height: 900 },
      recordVideo: { dir: output, size: { width: 1440, height: 900 } },
    });
    const page = await context.newPage();
    const video = page.video();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    // Frame spacing is intentional here: this records the entrance and hover motion.
    await page.waitForTimeout(1800);
    await page.mouse.move(260, 530, { steps: 20 });
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: /Sou aluno/ }).hover();
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: /Sou aluno/ }).click();
    await page.waitForTimeout(650);
    await page.getByLabel('Login', { exact: true }).fill('aluno');
    await page.getByLabel('Senha', { exact: true }).fill('teste123');
    await page.getByRole('button', { name: /Entrar no meu espaço/ }).click();
    await expect(page.locator('#userLabel')).toHaveText('Aluno Teste');
    await page.waitForTimeout(900);
    await page.getByRole('navigation').getByRole('button', { name: 'Meus treinos', exact: true }).click();
    await page.waitForTimeout(800);
    await page.getByRole('navigation').getByRole('button', { name: 'Visão geral', exact: true }).click();
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'Confirmar minha presença', exact: true }).click();
    await page.waitForTimeout(900);
    await context.close();
    await video.saveAs(path.join(output, 'gym-moviment-motion.webm'));
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ errors, recorded: 'gym-moviment-motion.webm' }, null, 2));
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(`Vídeo: ${path.join(output, 'gym-moviment-motion.webm')}`);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
