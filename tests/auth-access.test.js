const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { fixture } = require('./auth-fixture');
const digest = token => crypto.createHash('sha256').update(token).digest('hex');

async function withApi(t, options) {
  const f = fixture(options);
  const server = f.app.listen(0);
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (route, body, token, extraHeaders = {}) => {
    const response = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  };
  return { ...f, api };
}
const professorLogin = { portal: 'professor', login: 'professor', password: 'teste123' };
const googleLogin = (role, overrides = {}) => ({ portal: role, credential: JSON.stringify({ sub: `google-${role}`, email: `${role === 'professor' ? 'professor' : 'aluno'}@gmail.com`, email_verified: true, ...overrides }) });

test('professor precisa de aprovação em cada login, bloqueando APIs antes da decisão', async t => {
  const { api } = await withApi(t);
  const login = await api('/api/login', professorLogin);
  assert.equal(login.status, 202);
  assert.equal(login.data.user, undefined);
  assert.equal((await api('/api/dashboard', undefined, login.data.token)).status, 403);
  assert.equal((await api('/api/me', undefined, login.data.token)).status, 403);
  assert.equal((await api('/api/checkin', {}, login.data.token)).status, 403);
  const requests = await api('/api/access-requests', undefined, 'admin-token');
  assert.equal(requests.data.length, 1);
  assert.equal(requests.data[0].tokenHash, undefined);
  assert.equal((await api(`/api/access-requests/${requests.data[0].id}`, { decision: 'approved' }, 'admin-token')).status, 200);
  assert.equal((await api('/api/access-status', undefined, login.data.token)).data.status, 'approved');
  assert.equal((await api('/api/dashboard', undefined, login.data.token)).status, 200);
  const next = await api('/api/login', professorLogin);
  assert.equal(next.status, 202);
  assert.notEqual(next.data.token, login.data.token);
  assert.equal((await api('/api/dashboard', undefined, next.data.token)).status, 403);
});

test('recusa, expiração e cancelamento não liberam acesso', async t => {
  const { api, getDb, setDb } = await withApi(t);
  const login = await api('/api/login', professorLogin);
  const requests = await api('/api/access-requests', undefined, 'admin-token');
  const route = `/api/access-requests/${requests.data[0].id}`;
  assert.equal((await api(route, { decision: 'denied' }, 'admin-token')).status, 200);
  assert.equal((await api('/api/access-status', undefined, login.data.token)).data.status, 'denied');
  assert.equal((await api('/api/dashboard', undefined, login.data.token)).status, 403);
  assert.equal((await api(route, { decision: 'approved' }, 'admin-token')).status, 409);
  const next = await api('/api/login', professorLogin);
  const db = getDb();
  db.sessions.find(item => item.tokenHash === digest(next.data.token)).expiresAt = new Date(0).toISOString();
  setDb(db);
  assert.equal((await api('/api/access-status', undefined, next.data.token)).status, 401);
  const cancelled = await api('/api/login', professorLogin);
  await api('/api/logout', {}, cancelled.data.token);
  assert.equal((await api('/api/access-status', undefined, cancelled.data.token)).status, 401);
  assert.equal((await api('/api/access-requests', undefined, 'admin-token')).data.length, 0);
});

test('aluno entra direto e não pode aprovar professores; ADM mantém palavra-chave', async t => {
  const { api } = await withApi(t);
  const student = await api('/api/login', { portal: 'aluno', login: 'aluno', password: 'teste123' });
  assert.equal(student.status, 200);
  assert.equal((await api('/api/access-requests', undefined, student.data.token)).status, 403);
  assert.equal((await api('/api/access-requests/fake', { decision: 'approved' }, student.data.token)).status, 403);
  assert.equal((await api('/api/login', { portal: 'admin', keyword: 'matheusemiguel' })).status, 200);
  assert.equal((await api('/api/login', { portal: 'admin', keyword: 'errada' })).status, 401);
  await api('/api/logout', {}, student.data.token);
  assert.equal((await api('/api/dashboard', undefined, student.data.token)).status, 401);
});

test('sessões antigas de professor também são bloqueadas', async t => {
  const { api, getDb, setDb } = await withApi(t);
  const db = getDb();
  db.sessions.push({ tokenHash: digest('old-professor'), userId: 2, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  setDb(db);
  assert.equal((await api('/api/dashboard', undefined, 'old-professor')).status, 403);
});

test('Google vincula aluno por identidade e professor aguarda ADM', async t => {
  const { api, getDb } = await withApi(t);
  const student = await api('/api/login/google', googleLogin('aluno'));
  assert.equal(student.status, 200);
  assert.equal(student.data.user.role, 'aluno');
  assert.equal(getDb().users.find(u => u.id === 3).googleSub, 'google-aluno');
  const professor = await api('/api/login/google', googleLogin('professor'));
  assert.equal(professor.status, 202);
  assert.equal((await api('/api/dashboard', undefined, professor.data.token)).status, 403);
  const requests = await api('/api/access-requests', undefined, 'admin-token');
  assert.equal(requests.data[0].method, 'google');
  await api(`/api/access-requests/${requests.data[0].id}`, { decision: 'approved' }, 'admin-token');
  assert.equal((await api('/api/dashboard', undefined, professor.data.token)).status, 200);
  assert.equal((await api('/api/login/google', googleLogin('professor'))).status, 202);
});

test('Google rejeita identidade inválida, não cadastrada e portal incorreto', async t => {
  const { api } = await withApi(t);
  assert.equal((await api('/api/login/google', { portal: 'aluno', credential: 'invalid' })).status, 401);
  assert.equal((await api('/api/login/google', googleLogin('aluno', { email_verified: false }))).status, 401);
  assert.equal((await api('/api/login/google', googleLogin('aluno', { email: 'desconhecido@gmail.com' }))).status, 403);
  assert.equal((await api('/api/login/google', { ...googleLogin('aluno'), portal: 'professor' })).status, 403);
  assert.equal((await api('/api/login/google', { ...googleLogin('aluno'), portal: 'admin' })).status, 400);
  assert.equal((await api('/api/login/google', googleLogin('aluno'), undefined, { Origin: 'https://outro.example' })).status, 403);
});

test('Google impede troca de identidade e vínculo automático de e-mail externo', async t => {
  const { api, getDb, setDb } = await withApi(t);
  await api('/api/login/google', googleLogin('aluno'));
  assert.equal((await api('/api/login/google', googleLogin('aluno', { sub: 'outra-pessoa' }))).status, 403);
  const db = getDb();
  db.users[1].email = 'professor@example.com';
  setDb(db);
  assert.equal((await api('/api/login/google', googleLogin('professor', { email: 'professor@example.com' }))).status, 403);
});

test('configuração ausente mantém login convencional e informa indisponibilidade do Google', async t => {
  const { api } = await withApi(t, { disabled: true });
  assert.equal((await api('/api/auth-config')).data.googleClientId, '');
  assert.equal((await api('/api/login/google', googleLogin('aluno'))).status, 503);
  assert.equal((await api('/api/login', professorLogin)).status, 202);
});

test('ADM define login e senha de alunos e professores sem expor a senha', async t => {
  const { api, getDb } = await withApi(t);
  for (const role of ['aluno', 'professor']) {
    const body = { name: 'Novo ' + role, email: `novo-${role}@gmail.com`, login: `novo-${role}`, password: 'segredo123', role };
    const created = await api('/api/users', body, 'admin-token');
    assert.equal(created.status, 201);
    assert.equal(created.data.password, undefined);
    assert.ok(bcrypt.compareSync(body.password, getDb().users.find(u => u.id === created.data.id).password));
    assert.equal((await api('/api/login', { login: body.login, password: body.password, portal: role })).status, role === 'professor' ? 202 : 200);
    assert.equal((await api('/api/users', { ...body, email: `duplicado-${role}@gmail.com` }, 'admin-token')).status, 409);
  }
});
