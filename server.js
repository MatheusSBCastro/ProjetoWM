const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'troque-esta-chave-em-producao';
const DB_FILE = path.join(__dirname, 'data', 'database.json');
const IS_VERCEL = Boolean(process.env.VERCEL);
let memoryDb = null;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const seed = () => ({
  users: [
    { id: 1, name: 'Administrador Master WM', email: 'master@wm.com', password: bcrypt.hashSync('123456', 10), role: 'admin', consulting: true },
    { id: 2, name: 'Carlos Professor', email: 'professor@wm.com', password: bcrypt.hashSync('123456', 10), role: 'professor', consulting: false },
    { id: 3, name: 'Ana Aluna', email: 'aluno@wm.com', password: bcrypt.hashSync('123456', 10), role: 'aluno', professorId: 2, consulting: true },
    { id: 4, name: 'Bruno Aluno', email: 'bruno@wm.com', password: bcrypt.hashSync('123456', 10), role: 'aluno', professorId: 2, consulting: false }
  ],
  workouts: [{ id: 1, studentId: 3, professorId: 2, title: 'Treino A — Pernas', exercises: [
    { id: 1, name: 'Agachamento livre', sets: 4, reps: '10', rest: 90, gif: '/assets/agachamento-realista.png' },
    { id: 2, name: 'Afundo alternado', sets: 3, reps: '12 por perna', rest: 60, gif: '/assets/afundo-realista.png' }
  ]}],
  checkins: [], ratings: [],
  consulting: [{ id: 1, studentId: 3, title: 'Plano Consulting WM', diet: 'Café: ovos e frutas\nAlmoço: proteína, arroz e vegetais\nLanche: iogurte e castanhas\nJantar: proteína e vegetais', workoutNotes: 'Priorizar execução controlada e progressão semanal.' }]
});

function readDb() {
  if (IS_VERCEL) {
    if (!memoryDb) memoryDb = seed();
    return memoryDb;
  }
  if (!fs.existsSync(DB_FILE)) { fs.mkdirSync(path.dirname(DB_FILE), { recursive: true }); fs.writeFileSync(DB_FILE, JSON.stringify(seed(), null, 2)); }
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
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
  return db;
}
function writeDb(db) {
  if (IS_VERCEL) { memoryDb = db; return; }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
function safeUser(u) { const { password, ...safe } = u; return safe; }
function auth(req, res, next) {
  try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET); next(); }
  catch { res.status(401).json({ error: 'Sessão inválida ou expirada.' }); }
}
function only(...roles) { return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Acesso não autorizado.' }); }

app.post('/api/login', (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.email.toLowerCase() === String(req.body.email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(req.body.password || '', user.password)) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  res.json({ token: jwt.sign(safeUser(user), SECRET, { expiresIn: '12h' }), user: safeUser(user) });
});

app.get('/api/me', auth, (req, res) => res.json(safeUser(readDb().users.find(u => u.id === req.user.id))));
app.get('/api/dashboard', auth, (req, res) => {
  const db = readDb(); const today = new Date().toISOString().slice(0, 10);
  if (req.user.role === 'admin') return res.json({ users: db.users.map(safeUser), workouts: db.workouts, checkins: db.checkins.filter(c => c.date === today), ratings: db.ratings, consulting: db.consulting[0] || null });
  if (req.user.role === 'professor') {
    const students = db.users.filter(u => u.role === 'aluno' && u.professorId === req.user.id).map(safeUser);
    return res.json({ students, workouts: db.workouts.filter(w => w.professorId === req.user.id), checkins: db.checkins.filter(c => c.date === today), ratings: db.ratings.filter(r => students.some(s => s.id === r.studentId)) });
  }
  res.json({ workouts: db.workouts.filter(w => w.studentId === req.user.id), checkins: db.checkins.filter(c => c.date === today && c.studentId === req.user.id), ratings: db.ratings.filter(r => r.studentId === req.user.id), consulting: db.consulting.find(c => c.studentId === req.user.id) || null });
});

app.post('/api/checkin', auth, (req, res) => {
  const db = readDb(); const today = new Date().toISOString().slice(0, 10);
  const studentId = req.user.role === 'aluno' ? req.user.id : Number(req.body.studentId);
  const student = db.users.find(u => u.id === studentId && u.role === 'aluno');
  if (!student || (req.user.role === 'professor' && student.professorId !== req.user.id)) return res.status(403).json({ error: 'Aluno não autorizado.' });
  let item = db.checkins.find(c => c.studentId === studentId && c.date === today);
  if (!item) { item = { id: Date.now(), studentId, professorId: student.professorId, date: today, student: false, professor: false, startedAt: null }; db.checkins.push(item); }
  if (req.user.role === 'aluno') item.student = true;
  if (req.user.role === 'professor') item.professor = true;
  if (item.student && item.professor && !item.startedAt) item.startedAt = new Date().toISOString();
  writeDb(db); res.json(item);
});

app.post('/api/ratings', auth, only('aluno'), (req, res) => {
  const score = Number(req.body.score); if (score < 1 || score > 5) return res.status(400).json({ error: 'A nota deve ser de 1 a 5.' });
  const db = readDb(); const item = { id: Date.now(), studentId: req.user.id, score, comment: String(req.body.comment || '').slice(0, 500), createdAt: new Date().toISOString() };
  db.ratings.push(item); writeDb(db); res.status(201).json(item);
});

app.put('/api/workouts/:id', auth, only('admin'), (req, res) => {
  const db = readDb(); const i = db.workouts.findIndex(w => w.id === Number(req.params.id));
  if (i < 0) return res.status(404).json({ error: 'Treino não encontrado.' });
  db.workouts[i] = { ...db.workouts[i], title: req.body.title || db.workouts[i].title, exercises: Array.isArray(req.body.exercises) ? req.body.exercises : db.workouts[i].exercises };
  writeDb(db); res.json(db.workouts[i]);
});

app.listen(PORT, () => console.log(`Projeto WM em http://localhost:${PORT}`));
