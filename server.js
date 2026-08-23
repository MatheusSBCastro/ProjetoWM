const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'database.json');
const IS_VERCEL = Boolean(process.env.VERCEL);
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-origin' } }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' } });

const seed = () => ({
  users: [
    { id: 1, name: 'Administrador Master WM', email: 'master@wm.com', password: bcrypt.hashSync('123456', 10), role: 'admin', consulting: true },
    { id: 2, name: 'Carlos Professor', email: 'professor@wm.com', password: bcrypt.hashSync('123456', 10), role: 'professor', consulting: false },
    { id: 3, name: 'Ana Aluna', email: 'aluno@wm.com', password: bcrypt.hashSync('123456', 10), role: 'aluno', professorId: 2, consulting: true, avatar: '/assets/ana-aluna.png' },
    { id: 4, name: 'Bruno Aluno', email: 'bruno@wm.com', password: bcrypt.hashSync('123456', 10), role: 'aluno', professorId: 2, consulting: false, avatar: '/assets/bruno-aluno.png' }
  ],
  exercises: [
    { id: 1, name: 'Agachamento livre', muscle: 'Pernas', equipment: 'Barra', gif: '/assets/agachamento-realista.png' },
    { id: 2, name: 'Afundo alternado', muscle: 'Pernas', equipment: 'Peso corporal', gif: '/assets/afundo-realista.png' }
  ],
  workouts: [{ id: 1, studentId: 3, professorId: 2, title: 'Treino A — Pernas', exercises: [
    { id: 1, name: 'Agachamento livre', sets: 4, reps: '10', rest: 90, gif: '/assets/agachamento-realista.png' },
    { id: 2, name: 'Afundo alternado', sets: 3, reps: '12 por perna', rest: 60, gif: '/assets/afundo-realista.png' }
  ]}],
  checkins: [], ratings: [], sessions: [],
  consulting: [{ id: 1, studentId: 3, title: 'Plano Consulting WM', diet: 'Café: ovos e frutas\nAlmoço: proteína, arroz e vegetais\nLanche: iogurte e castanhas\nJantar: proteína e vegetais', workoutNotes: 'Priorizar execução controlada e progressão semanal.' }]
});

function repairMojibake(value) {
  const replacements = { 'â€”': '—', 'â€“': '–', 'Â·': '·', 'Ã¡': 'á', 'ÃÁ': 'Á', 'Ã£': 'ã', 'Ãƒ': 'Ã', 'Ã©': 'é', 'Ã‰': 'É', 'Ãª': 'ê', 'Ã­': 'í', 'ÃÍ': 'Í', 'Ã³': 'ó', 'Ã“': 'Ó', 'Ãµ': 'õ', 'Ãº': 'ú', 'Ãš': 'Ú', 'Ã§': 'ç', 'Ã‡': 'Ç' };
  let changed = false;
  const visit = item => {
    if (typeof item === 'string') { let repaired=item; for(const [broken,correct] of Object.entries(replacements))repaired=repaired.split(broken).join(correct); if(repaired!==item)changed=true; return repaired; }
    if (Array.isArray(item)) { item.forEach((entry,index)=>item[index]=visit(entry)); return item; }
    if (item && typeof item === 'object') { Object.keys(item).forEach(key=>item[key]=visit(item[key])); return item; }
    return item;
  };
  visit(value); return changed;
}

function productionSeed() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email || password.length < 12) throw new Error('Configure ADMIN_EMAIL e ADMIN_PASSWORD (mÃ­nimo 12 caracteres).');
  return { users: [{ id: 1, name: 'Administrador WM', email, password: bcrypt.hashSync(password, 12), role: 'admin', consulting: true }], exercises: [], workouts: [], checkins: [], ratings: [], consulting: [], sessions: [] };
}

async function readDb() {
  if (pool) {
    await pool.query('CREATE TABLE IF NOT EXISTS wm_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    let result = await pool.query('SELECT data FROM wm_state WHERE id = 1');
    if (!result.rowCount) {
      const initial = IS_VERCEL ? productionSeed() : seed();
      await pool.query('INSERT INTO wm_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING', [JSON.stringify(initial)]);
      result = await pool.query('SELECT data FROM wm_state WHERE id = 1');
    }
    const db = result.rows[0].data;
    const textRepaired = repairMojibake(db);
    if (!Array.isArray(db.exercises)) {
      const unique = new Map();
      db.workouts.forEach(workout => workout.exercises.forEach(exercise => unique.set(exercise.name.toLowerCase(), { id: unique.size + 1, name: exercise.name, muscle: '', equipment: '', gif: exercise.gif || '' })));
      db.exercises = [...unique.values()];
      await pool.query('UPDATE wm_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1', [JSON.stringify(db)]);
    } else if (textRepaired) await pool.query('UPDATE wm_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1', [JSON.stringify(db)]);
    return db;
  }
  if (IS_VERCEL) throw new Error('DATABASE_URL nÃ£o configurada. Conecte um PostgreSQL ao projeto.');
  if (!fs.existsSync(DB_FILE)) { fs.mkdirSync(path.dirname(DB_FILE), { recursive: true }); fs.writeFileSync(DB_FILE, JSON.stringify(seed(), null, 2)); }
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (repairMojibake(db)) fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  if (!Array.isArray(db.exercises)) {
    const unique = new Map();
    db.workouts.forEach(workout => workout.exercises.forEach(exercise => unique.set(exercise.name.toLowerCase(), { id: unique.size + 1, name: exercise.name, muscle: '', equipment: '', gif: exercise.gif || '' })));
    db.exercises = [...unique.values()];
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }
  const admin = db.users.find(u => u.role === 'admin');
  if (admin && admin.email === 'adm@wm.com') {
    admin.name = 'Administrador Master WM'; admin.email = 'master@wm.com'; admin.consulting = true;
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }
  const mediaByExercise = { 'Agachamento livre': '/assets/agachamento-realista.png', 'Afundo alternado': '/assets/afundo-realista.png' };
  let mediaUpdated = false;
  db.workouts.forEach(workout => workout.exercises.forEach(exercise => {
    if (mediaByExercise[exercise.name] && exercise.gif !== mediaByExercise[exercise.name]) {
      exercise.gif = mediaByExercise[exercise.name]; mediaUpdated = true;
    }
  }));
  if (mediaUpdated) fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  const avatars = { 'aluno@wm.com': '/assets/ana-aluna.png', 'bruno@wm.com': '/assets/bruno-aluno.png' };
  let avatarsUpdated = false;
  db.users.forEach(item => { if (avatars[item.email] && item.avatar !== avatars[item.email]) { item.avatar = avatars[item.email]; avatarsUpdated = true; } });
  if (avatarsUpdated && !IS_VERCEL) fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  return db;
}
async function writeDb(db) {
  if (pool) { await pool.query('UPDATE wm_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1', [JSON.stringify(db)]); return; }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
function safeUser(u) { const { password, ...safe } = u; return safe; }
function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
async function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    const db = await readDb(); const now = Date.now();
    const session = (db.sessions || []).find(item => item.tokenHash === tokenHash(token) && new Date(item.expiresAt).getTime() > now);
    const user = session && db.users.find(item => item.id === session.userId);
    if (!user) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    req.user = { id: user.id, role: user.role }; next();
  } catch (error) { next(error); }
}
function only(...roles) { return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Acesso nÃ£o autorizado.' }); }

app.post('/api/login', loginLimiter, async (req, res) => {
  const db = await readDb();
  const user = db.users.find(u => u.email.toLowerCase() === String(req.body.email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(req.body.password || '', user.password)) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  const portal = String(req.body.portal || '');
  if (portal === 'consulting' && !user.consulting) return res.status(403).json({ error: 'Esta conta nÃ£o possui acesso ao Consulting WM.' });
  if (portal && portal !== 'consulting' && user.role !== portal && user.role !== 'admin') return res.status(403).json({ error: 'Esta conta nÃ£o possui acesso a este portal.' });
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  db.sessions = (db.sessions || []).filter(item => new Date(item.expiresAt).getTime() > Date.now());
  db.sessions.push({ tokenHash: tokenHash(token), userId: user.id, expiresAt });
  await writeDb(db);
  res.json({ token, user: safeUser(user) });
});

app.get('/api/me', auth, async (req, res) => res.json(safeUser((await readDb()).users.find(u => u.id === req.user.id))));
app.get('/api/dashboard', auth, async (req, res) => {
  const db = await readDb(); const today = new Date().toISOString().slice(0, 10);
  if (req.user.role === 'admin') return res.json({ users: db.users.map(safeUser), exercises: db.exercises || [], workouts: db.workouts, checkins: db.checkins.filter(c => c.date === today), ratings: db.ratings, consulting: db.consulting[0] || null });
  if (req.user.role === 'professor') {
    const students = db.users.filter(u => u.role === 'aluno' && u.professorId === req.user.id).map(safeUser);
    return res.json({ students, workouts: db.workouts.filter(w => w.professorId === req.user.id), checkins: db.checkins.filter(c => c.date === today), ratings: db.ratings.filter(r => students.some(s => s.id === r.studentId)) });
  }
  res.json({ workouts: db.workouts.filter(w => w.studentId === req.user.id), checkins: db.checkins.filter(c => c.date === today && c.studentId === req.user.id), ratings: db.ratings.filter(r => r.studentId === req.user.id), consulting: db.consulting.find(c => c.studentId === req.user.id) || null });
});

app.post('/api/users', auth, only('admin'), async (req, res) => {
  const db = await readDb();
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '').slice(0, 128);
  const role = String(req.body.role || '');
  if (!name || name.length > 100 || !email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email) || !['aluno', 'professor'].includes(role)) return res.status(400).json({ error: 'Preencha nome, e-mail válido e tipo de cadastro.' });
  if (password.length < 6) return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
  if (db.users.some(item => item.email.toLowerCase() === email)) return res.status(409).json({ error: 'JÃ¡ existe uma conta com este e-mail.' });
  const item = { id: Math.max(0, ...db.users.map(entry => entry.id)) + 1, name, email, password: bcrypt.hashSync(password, 12), role, consulting: Boolean(req.body.consulting) };
  if (role === 'aluno') { item.professorId = req.body.professorId ? Number(req.body.professorId) : null; item.avatar = '/assets/avatar-placeholder.svg'; }
  db.users.push(item); await writeDb(db); res.status(201).json(safeUser(item));
});

app.patch('/api/students/:id/professor', auth, only('admin'), async (req, res) => {
  const db = await readDb();
  const student = db.users.find(item => item.id === Number(req.params.id) && item.role === 'aluno');
  if (!student) return res.status(404).json({ error: 'Aluno nÃ£o encontrado.' });
  const professorId = req.body.professorId ? Number(req.body.professorId) : null;
  if (professorId && !db.users.some(item => item.id === professorId && item.role === 'professor')) return res.status(400).json({ error: 'Professor invÃ¡lido.' });
  student.professorId = professorId; await writeDb(db); res.json(safeUser(student));
});

app.post('/api/exercises', auth, only('admin'), async (req, res) => {
  const db = await readDb(); db.exercises ||= [];
  const name = String(req.body.name || '').trim();
  const muscle = String(req.body.muscle || '').trim();
  const equipment = String(req.body.equipment || '').trim();
  const gif = String(req.body.gif || '').trim();
  if (!name || name.length > 100 || muscle.length > 80 || equipment.length > 80 || gif.length > 500) return res.status(400).json({ error: 'Informe um nome válido e revise os limites dos campos.' });
  if (gif && !/^(https?:\/\/|\/)/i.test(gif)) return res.status(400).json({ error: 'A mídia deve ser uma URL http(s) ou um caminho iniciado por /.' });
  if (db.exercises.some(item => item.name.toLowerCase() === name.toLowerCase())) return res.status(409).json({ error: 'Este exercício já está cadastrado.' });
  const item = { id: Math.max(0, ...db.exercises.map(entry => Number(entry.id) || 0)) + 1, name, muscle, equipment, gif: gif || '/assets/avatar-placeholder.svg' };
  db.exercises.push(item); await writeDb(db); res.status(201).json(item);
});

app.post('/api/workouts', auth, only('admin'), async (req, res) => {
  const db = await readDb(); db.exercises ||= [];
  const title = String(req.body.title || '').trim();
  const studentId = Number(req.body.studentId);
  const student = db.users.find(item => item.id === studentId && item.role === 'aluno');
  const entries = Array.isArray(req.body.exercises) ? req.body.exercises : [];
  if (!title || title.length > 100 || !student) return res.status(400).json({ error: 'Informe o nome do treino e selecione um aluno válido.' });
  if (!entries.length || entries.length > 50) return res.status(400).json({ error: 'Adicione de 1 a 50 exercícios ao treino.' });
  const exercises = [];
  for (const entry of entries) {
    const registered = db.exercises.find(item => item.id === Number(entry.exerciseId));
    const sets = Number(entry.sets), rest = Number(entry.rest); const reps = String(entry.reps || '').trim();
    if (!registered || !Number.isInteger(sets) || sets < 1 || sets > 20 || !reps || reps.length > 40 || !Number.isInteger(rest) || rest < 0 || rest > 1800) return res.status(400).json({ error: 'Revise exercício, séries, repetições e descanso.' });
    exercises.push({ id: registered.id, name: registered.name, sets, reps, rest, gif: registered.gif });
  }
  const item = { id: Math.max(0, ...db.workouts.map(entry => Number(entry.id) || 0)) + 1, studentId, professorId: student.professorId || null, title, exercises };
  db.workouts.push(item); await writeDb(db); res.status(201).json(item);
});

app.post('/api/checkin', auth, async (req, res) => {
  const db = await readDb(); const today = new Date().toISOString().slice(0, 10);
  const studentId = req.user.role === 'aluno' ? req.user.id : Number(req.body.studentId);
  const student = db.users.find(u => u.id === studentId && u.role === 'aluno');
  if (!student || (req.user.role === 'professor' && student.professorId !== req.user.id)) return res.status(403).json({ error: 'Aluno nÃ£o autorizado.' });
  let item = db.checkins.find(c => c.studentId === studentId && c.date === today);
  if (!item) { item = { id: Date.now(), studentId, professorId: student.professorId, date: today, student: false, professor: false, startedAt: null }; db.checkins.push(item); }
  if (req.user.role === 'aluno') item.student = true;
  if (req.user.role === 'professor') item.professor = true;
  if (item.student && item.professor && !item.startedAt) item.startedAt = new Date().toISOString();
  await writeDb(db); res.json(item);
});

app.post('/api/ratings', auth, only('aluno'), async (req, res) => {
  const score = Number(req.body.score); if (score < 1 || score > 5) return res.status(400).json({ error: 'A nota deve ser de 1 a 5.' });
  const db = await readDb(); const item = { id: Date.now(), studentId: req.user.id, score, comment: String(req.body.comment || '').slice(0, 500), createdAt: new Date().toISOString() };
  db.ratings.push(item); await writeDb(db); res.status(201).json(item);
});

app.put('/api/workouts/:id', auth, only('admin'), async (req, res) => {
  const db = await readDb(); const i = db.workouts.findIndex(w => w.id === Number(req.params.id));
  if (i < 0) return res.status(404).json({ error: 'Treino nÃ£o encontrado.' });
  db.workouts[i] = { ...db.workouts[i], title: req.body.title || db.workouts[i].title, exercises: Array.isArray(req.body.exercises) ? req.body.exercises : db.workouts[i].exercises };
  await writeDb(db); res.json(db.workouts[i]);
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
app.use((error, req, res, next) => { console.error(error.message); res.status(500).json({ error: IS_VERCEL ? 'Erro interno do servidor.' : error.message }); });

app.listen(PORT, () => console.log(`Projeto WM em http://localhost:${PORT}`));

