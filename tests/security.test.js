const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { fixture } = require('./auth-fixture');

async function withApi(t, options) {
  const f = fixture(options);
  const server = f.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (route, body, token, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(base + route, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  return { ...f, api };
}

async function approvedProfessor(api) {
  const login = await api('/api/login', { portal: 'professor', login: 'professor', password: 'teste123' });
  assert.equal(login.status, 202);
  const requests = await api('/api/access-requests', undefined, 'admin-token');
  assert.equal((await api(`/api/access-requests/${requests.data[0].id}`, { decision: 'approved' }, 'admin-token')).status, 200);
  return login.data.token;
}

test('a chave pública antiga não permite entrar como ADM', async t => {
  const { api } = await withApi(t);
  assert.equal((await api('/api/login', { portal: 'admin', keyword: 'matheusemiguel' })).status, 401);
  assert.equal((await api('/api/login', { portal: 'admin', keyword: 'admin-test-key-123456' })).status, 200);
});

test('ADM sem chave configurada permanece bloqueado', async t => {
  const { api } = await withApi(t, { env: { ADMIN_KEYWORD: '' } });
  assert.equal((await api('/api/login', { portal: 'admin', keyword: 'matheusemiguel' })).status, 503);
});

test('ADM com chave curta permanece bloqueado', async t => {
  const { api } = await withApi(t, { env: { ADMIN_KEYWORD: 'curta' } });
  assert.equal((await api('/api/login', { portal: 'admin', keyword: 'curta' })).status, 503);
});

test('sessões ADM anteriores à configuração ou rotação da chave são revogadas', async t => {
  const { api, getDb, setDb } = await withApi(t);
  const db = getDb();
  delete db.sessions[0].adminKeyHash;
  setDb(db);
  assert.equal((await api('/api/dashboard', undefined, 'admin-token')).status, 401);
  assert.equal((await api('/api/access-status', undefined, 'admin-token')).status, 401);
  db.sessions[0].adminKeyHash = 'hash-de-chave-antiga';
  setDb(db);
  assert.equal((await api('/api/dashboard', undefined, 'admin-token')).status, 401);
  const login = await api('/api/login', { portal: 'admin', keyword: 'admin-test-key-123456' });
  assert.equal((await api('/api/dashboard', undefined, login.data.token)).status, 200);
});

test('professor não recebe os check-ins de alunos de outro professor', async t => {
  const { api, getDb, setDb } = await withApi(t);
  const db = getDb();
  db.users[2].professorId = 2;
  db.users.push({ id: 4, name: 'Outro Professor', role: 'professor' }, { id: 5, name: 'Outro Aluno', role: 'aluno', professorId: 4 });
  db.checkins = [{ id: 1, studentId: 5, professorId: 4, date: new Date().toISOString().slice(0, 10), student: true, professor: true }];
  setDb(db);
  const token = await approvedProfessor(api);
  const dashboard = await api('/api/dashboard', undefined, token);
  assert.equal(dashboard.status, 200);
  assert.deepEqual(dashboard.data.checkins, []);
});

test('API mantém os exercícios do professor bloqueados até os dois check-ins', async t => {
  const { api, getDb, setDb } = await withApi(t);
  const db = getDb();
  db.users[2].professorId = 2;
  db.workouts = [{ id: 1, studentId: 3, title: 'Treino privado', exercises: [{ id: 1, name: 'Exercício privado', sets: 3, reps: '10', rest: 60 }] }];
  setDb(db);
  const professor = await approvedProfessor(api);
  const student = await api('/api/login', { portal: 'aluno', login: 'aluno', password: 'teste123' });
  assert.deepEqual((await api('/api/dashboard', undefined, professor)).data.workouts[0].exercises, []);
  await api('/api/checkin', {}, student.data.token);
  assert.deepEqual((await api('/api/dashboard', undefined, professor)).data.workouts[0].exercises, []);
  await api('/api/checkin', { studentId: 3 }, professor);
  assert.equal((await api('/api/dashboard', undefined, professor)).data.workouts[0].exercises[0].name, 'Exercício privado');
});

test('aluno sem Consulting não recebe o plano premium pela API', async t => {
  const { api, getDb, setDb } = await withApi(t);
  const db = getDb();
  db.users[2].consulting = false;
  db.consulting.push({ id: 1, studentId: 3, diet: 'Plano restrito' });
  setDb(db);
  const student = await api('/api/login', { portal: 'aluno', login: 'aluno', password: 'teste123' });
  assert.equal((await api('/api/dashboard', undefined, student.data.token)).data.consulting, null);
});

test('fichas compartilhadas não expõem IDs de alunos fora do acesso autorizado', async t => {
  const { api, getDb, setDb } = await withApi(t);
  const db = getDb();
  db.users[2].professorId = 2;
  db.users.push({ id: 4, name: 'Outro aluno', role: 'aluno', professorId: 99 });
  db.workouts = [{ id: 1, studentIds: [3, 4], title: 'Ficha compartilhada', exercises: [] }];
  setDb(db);
  const student = await api('/api/login', { portal: 'aluno', login: 'aluno', password: 'teste123' });
  const professor = await approvedProfessor(api);
  for (const token of [student.data.token, professor]) {
    assert.deepEqual((await api('/api/dashboard', undefined, token)).data.workouts[0].studentIds, [3]);
  }
});

test('trocar o professor exige um novo check-in do responsável atual', async t => {
  const { api, getDb, setDb } = await withApi(t);
  const db = getDb();
  db.users[2].professorId = 99;
  db.workouts = [{ id: 1, studentId: 3, title: 'Ficha', exercises: [{ id: 1, name: 'Exercício' }] }];
  db.checkins = [{ studentId: 3, professorId: 99, date: new Date().toISOString().slice(0, 10), student: true, professor: true, startedAt: new Date().toISOString() }];
  setDb(db);
  const professor = await approvedProfessor(api);
  assert.equal((await api('/api/students/3/professor', { professorId: 2 }, 'admin-token', 'PATCH')).status, 200);
  const dashboard = (await api('/api/dashboard', undefined, professor)).data;
  assert.equal(dashboard.checkins[0].student, true);
  assert.equal(dashboard.checkins[0].professor, false);
  assert.deepEqual(dashboard.workouts[0].exercises, []);
  assert.equal((await api('/api/checkin', { studentId: 3 }, professor)).status, 200);
  assert.equal((await api('/api/dashboard', undefined, professor)).data.workouts[0].exercises[0].name, 'Exercício');
});

test('login rejeita senhas acima do limite do bcrypt sem aceitar o prefixo', async t => {
  const { api, getDb, setDb } = await withApi(t);
  const db = getDb();
  db.users[2].password = bcrypt.hashSync('a'.repeat(72), 4);
  setDb(db);
  assert.equal((await api('/api/login', { portal: 'aluno', login: 'aluno', password: 'a'.repeat(72) + 'b' })).status, 400);
});

test('avaliações rejeitam valores não numéricos e notas fracionadas', async t => {
  const { api } = await withApi(t);
  const student = await api('/api/login', { portal: 'aluno', login: 'aluno', password: 'teste123' });
  for (const score of ['inválida', 1.5, null]) assert.equal((await api('/api/ratings', { score }, student.data.token)).status, 400);
});
