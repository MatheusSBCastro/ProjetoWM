const AxeBuilder = require('@axe-core/playwright').default;
const { test, expect, login } = require('./fixtures');

async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
}

test('entrada mantém o conteúdo dentro da tela de 360 a 1440 pixels', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await settle(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const heading = await page.locator('.story-copy h1').boundingBox();
    expect(heading.x).toBeGreaterThanOrEqual(0);
    expect(heading.x + heading.width).toBeLessThanOrEqual(width);
    const firstPortal = await page.getByRole('button', { name: /Sou aluno/ }).boundingBox();
    expect(firstPortal.height).toBeGreaterThanOrEqual(44);
  }
  expect(errors).toEqual([]);
});

test('permite pausar a animação e preserva a escolha ao recarregar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Pausar animação', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retomar animação', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.movement-object img').evaluate(element => getComputedStyle(element).animationPlayState)).toBe('paused');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Retomar animação', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Retomar animação', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pausar animação', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('respeita movimento reduzido sem impedir login e navegação por teclado', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Pausar animação', exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);
  await page.getByRole('button', { name: /Sou aluno/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Login', { exact: true })).toBeFocused();
  await page.keyboard.type('aluno');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Senha', { exact: true })).toBeFocused();
  await page.keyboard.type('teste123');
  await page.keyboard.press('Enter');
  await expect(page.locator('#userLabel')).toHaveText('Aluno Teste');
  await page.getByRole('button', { name: 'Sair', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /Sou aluno/ })).toBeVisible();
});

test('entrada e painel do aluno passam na análise automática de acessibilidade', async ({ page }) => {
  await page.goto('/');
  await settle(page);
  const entrance = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(entrance.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) }))).toEqual([]);
  await login(page, 'aluno');
  await expect(page.locator('#userLabel')).toHaveText('Aluno Teste');
  await settle(page);
  const dashboard = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(dashboard.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) }))).toEqual([]);
});
