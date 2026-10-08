const { test, expect, login } = require('./fixtures');

test('a chave ADM antiga é rejeitada também pela interface', async ({ page }) => {
  await login(page, 'admin', 'matheusemiguel');
  await expect(page.getByRole('alert')).toContainText('Palavra-chave incorreta.');
  await expect(page.getByRole('button', { name: 'Sair', exact: true })).toBeHidden();
});

test('os exercícios só chegam ao navegador do professor após os dois check-ins', async ({ page, browser, baseURL, appState }) => {
  const db = appState.getDb();
  db.users[2].professorId = 2;
  db.workouts = [{ id: 1, studentId: 3, title: 'Treino protegido', exercises: [{ id: 1, name: 'Agachamento protegido', sets: 3, reps: '10', rest: 60, gif: '/assets/avatar-placeholder.svg' }] }];
  appState.setDb(db);

  await login(page, 'professor');
  await expect(page.locator('#pendingAccess')).toBeVisible();
  const headers = { Authorization: 'Bearer admin-token' };
  const requests = await page.request.get('/api/access-requests', { headers }).then(response => response.json());
  expect((await page.request.post(`/api/access-requests/${requests[0].id}`, { headers, data: { decision: 'approved' } })).status()).toBe(200);
  await expect(page.locator('#userLabel')).toHaveText('Professor Teste');
  const professorToken = await page.evaluate(() => localStorage.getItem('wm_token'));
  async function exercises() {
    const response = await page.request.get('/api/dashboard', { headers: { Authorization: `Bearer ${professorToken}` } });
    expect(response.status()).toBe(200);
    return (await response.json()).workouts[0].exercises;
  }
  expect(await exercises()).toEqual([]);
  await page.getByRole('navigation').getByRole('button', { name: 'Meus alunos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Abrir demonstração de Agachamento protegido', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirmar presença', exact: true }).click();
  await expect(page.getByRole('button', { name: /Presença confirmada/ })).toBeDisabled();
  expect(await exercises()).toEqual([]);

  const studentContext = await browser.newContext({ baseURL });
  try {
    const student = await studentContext.newPage();
    await login(student, 'aluno');
    await expect(student.locator('#userLabel')).toHaveText('Aluno Teste');
    await student.getByRole('button', { name: 'Confirmar minha presença', exact: true }).click();
    await expect(student.getByRole('button', { name: 'Presença confirmada', exact: true })).toBeDisabled();
    await page.reload();
    await page.getByRole('navigation').getByRole('button', { name: 'Meus alunos', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Abrir demonstração de Agachamento protegido', exact: true })).toBeVisible();
    expect((await exercises())[0].name).toBe('Agachamento protegido');
  } finally {
    await studentContext.close();
  }
});
