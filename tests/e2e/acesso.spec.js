const { test, expect, login } = require('./fixtures');

test('seleciona e troca o perfil de acesso', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Gym Moviment/);
  await page.getByRole('button', { name: /Sou aluno/ }).click();
  await expect(page.getByLabel('Login', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Senha', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Trocar perfil' }).click();
  await page.getByRole('button', { name: /Administração/ }).click();
  await expect(page.getByLabel('Palavra-chave', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Login', { exact: true })).toBeHidden();
});

test('rejeita senha incorreta e permite uma nova tentativa válida', async ({ page }) => {
  await login(page, 'aluno', 'senha-incorreta');
  await expect(page.getByRole('alert')).not.toBeEmpty();
  await expect(page.getByRole('button', { name: 'Sair', exact: true })).toBeHidden();
  await page.getByLabel('Senha', { exact: true }).fill('teste123');
  await page.getByRole('button', { name: /Entrar no meu espaço/ }).click();
  await expect(page.locator('#userLabel')).toHaveText('Aluno Teste');
});

test('aluno confirma presença, mantém a sessão e sai', async ({ page }) => {
  await login(page, 'aluno');
  await expect(page.locator('#userLabel')).toHaveText('Aluno Teste');
  await page.getByRole('button', { name: 'Confirmar minha presença', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Presença confirmada', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.locator('#userLabel')).toHaveText('Aluno Teste');
  await expect(page.getByRole('button', { name: 'Presença confirmada', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByRole('button', { name: /Sou aluno/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /Sou aluno/ })).toBeVisible();
});

test('professor aguarda aprovação e pode cancelar a solicitação', async ({ page }) => {
  await login(page, 'professor');
  await expect(page.getByRole('heading', { name: 'Seu acesso está a caminho.' })).toBeVisible();
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem('wm_pending')).token);
  const response = await page.request.get('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } });
  expect(response.status()).toBe(403);
  await page.getByRole('button', { name: 'Voltar aos perfis' }).click();
  await expect(page.getByRole('button', { name: /Sou professor/ })).toBeVisible();
  const cancelled = await page.request.get('/api/access-status', { headers: { Authorization: `Bearer ${token}` } });
  expect(cancelled.status()).toBe(401);
});

for (const decision of ['aprova', 'recusa']) {
  test(`ADM ${decision} a entrada do professor`, async ({ page, browser, baseURL }) => {
    await login(page, 'professor');
    await expect(page.getByRole('heading', { name: 'Seu acesso está a caminho.' })).toBeVisible();
    const adminContext = await browser.newContext({ baseURL });
    try {
      const admin = await adminContext.newPage();
      await login(admin, 'admin', 'admin-test-key-123456');
      await expect(admin.locator('#userLabel')).toHaveText('ADM');
      await admin.getByRole('navigation').getByRole('button', { name: /^Aprovações/ }).click();
      const request = admin.locator('#approvalList article').filter({ hasText: 'Professor Teste' });
      await request.getByRole('button', { name: decision === 'aprova' ? 'Aprovar entrada' : 'Recusar', exact: true }).click();
      await expect(request).toHaveCount(0);
      if (decision === 'aprova') {
        await expect(page.locator('#userLabel')).toHaveText('Professor Teste');
        await expect(page.getByRole('navigation').getByRole('button', { name: 'Meus alunos', exact: true })).toBeVisible();
        await page.reload();
        await expect(page.locator('#userLabel')).toHaveText('Professor Teste');
      } else {
        await expect(page.locator('#pendingMessage')).toContainText('O ADM recusou esta entrada.');
        await expect(page.getByRole('button', { name: 'Sair', exact: true })).toBeHidden();
      }
    } finally {
      await adminContext.close();
    }
  });
}
