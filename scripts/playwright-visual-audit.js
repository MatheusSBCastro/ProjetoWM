const fs = require('node:fs');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const { fixture } = require('../tests/auth-fixture');
const { login } = require('../tests/e2e/fixtures');
const AxeBuilder = require('@axe-core/playwright').default;

const label = process.argv[2] || 'latest';
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Use letras, números e hífens no nome da rodada.');
const output = path.join(__dirname, '..', '.visual-audit', label);
fs.mkdirSync(output, { recursive: true });

function visualFixture() {
  const f = fixture({ disabled: true });
  const db = f.getDb();
  db.users[2].professorId = 2;
  db.users[2].consulting = true;
  db.exercises = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data/exercise-library/selected-500.json'), 'utf8'));
  db.workouts = [{ id: 1, title: 'Treino A — Força e movimento', studentId: 3, professorId: 2,
    exercises: db.exercises.slice(0, 3).map(exercise => ({ ...exercise, sets: 3, reps: '12', rest: 60 })) }];
  db.consulting = [{ id: 1, studentId: 3, title: 'Seu plano de evolução', diet: 'Café da manhã: ovos, frutas e aveia\nAlmoço: proteína, arroz e vegetais\nLanche: iogurte e castanhas\nJantar: proteína e vegetais', workoutNotes: 'Priorize a execução controlada. Evolua as cargas com o acompanhamento do seu professor.' }];
  f.setDb(db);
  return f;
}

async function run() {
  const f = visualFixture();
  const server = f.app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const report = [];
  try {
    for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }, { name: 'small', width: 360, height: 800 }]) {
      const context = await browser.newContext({ viewport, baseURL, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      async function capture(name) {
        await page.evaluate(async () => {
          await Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
          await document.fonts.ready;
        });
        const audit = await page.evaluate(() => ({
          viewport: innerWidth, bodyWidth: document.documentElement.scrollWidth,
          overflow: [...document.querySelectorAll('body *')].filter(element => {
            if (element.closest('[aria-hidden="true"], .wm-transition-layer, .exercise-picker-list, #nav')) return false;
            const bounds = element.getBoundingClientRect();
            return bounds.width && bounds.height && (bounds.left < -1 || bounds.right > innerWidth + 1);
          }).slice(0, 8).map(element => ({ tag: element.tagName, class: element.className })),
          unnamedButtons: [...document.querySelectorAll('button')].filter(element => element.getClientRects().length && !element.closest('[hidden], [aria-hidden="true"]') && !(element.getAttribute('aria-label') || element.textContent.trim())).length,
        }));
        await page.screenshot({ path: path.join(output, `${name}-${viewport.name}.png`), fullPage: true, animations: 'disabled' });
        const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        report.push({ screen: `${name}/${viewport.name}`, ...audit, errors: [...errors], violations: accessibility.violations.map(issue => ({ id: issue.id, impact: issue.impact, nodes: issue.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })) });
      }
      await page.goto('/');
      await capture('01-portals');
      await page.getByRole('button', { name: /Sou aluno/ }).click();
      await capture('02-login');
      await login(page, 'aluno');
      await expect(page.locator('#userLabel')).toHaveText('Aluno Teste');
      await expect(page.locator('#content .hero')).toBeVisible();
      await capture('03-aluno');
      await page.getByRole('navigation').getByRole('button', { name: 'Meus treinos', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Treinos', exact: true })).toBeVisible();
      await capture('04-treinos');
      await page.locator('.exercise-media').first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await capture('05-exercicio');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByRole('navigation').getByRole('button', { name: 'Consulting WM', exact: true }).click();
      await expect(page.locator('#content .premium')).toBeVisible();
      await capture('06-consulting');
      await page.getByRole('button', { name: 'Sair', exact: true }).click();
      await login(page, 'professor');
      await expect(page.locator('#pendingAccess')).toBeVisible();
      await capture('07-professor-pendente');
      const authHeaders = { Authorization: 'Bearer admin-token' };
      const requests = await page.request.get('/api/access-requests', { headers: authHeaders }).then(response => response.json());
      await page.request.post(`/api/access-requests/${requests[0].id}`, { headers: authHeaders, data: { decision: 'approved' } });
      await expect(page.locator('#userLabel')).toHaveText('Professor Teste');
      await page.getByRole('navigation').getByRole('button', { name: 'Meus alunos', exact: true }).click();
      await expect(page.locator('#content .professor-student-card')).toBeVisible();
      await capture('08-professor');
      await page.getByRole('button', { name: 'Sair', exact: true }).click();
      await login(page, 'admin', 'admin-test-key-123456');
      await expect(page.locator('#userLabel')).toHaveText('ADM');
      await capture('09-admin');
      for (const [tab, name] of [['equipe', 'Equipe'], ['cadastros', 'Cadastros'], ['vinculos', 'Vínculos'], ['treinos', 'Treinos'], ['aprovacoes', /^Aprovações/], ['avaliacoes', 'Avaliações']]) {
        await page.getByRole('navigation').getByRole('button', { name, exact: typeof name === 'string' }).click();
        await capture(`10-admin-${tab}`);
      }
      await context.close();
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    const issues = report.filter(item => item.bodyWidth > item.viewport + 1 || item.overflow.length || item.unnamedButtons || item.errors.length || item.violations.length);
    console.log(JSON.stringify({ output, screens: report.length, issues: issues.map(item => ({ screen: item.screen, overflow: item.overflow, unnamedButtons: item.unnamedButtons, errors: item.errors, rules: item.violations.map(issue => issue.id) })) }, null, 2));
    if (issues.length) process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
