const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const googleConfig = require('./google-client.json');

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const bearer = req => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
const active = session => new Date(session.expiresAt).getTime() > Date.now();

module.exports = function installAccess(app, { readDb, writeDb, safeUser, auth, only, loginLimiter, verifyGoogle, clientId = process.env.GOOGLE_CLIENT_ID ?? googleConfig.clientId }) {
  const google = new OAuth2Client();
  const verify = verifyGoogle || (async credential => (await google.verifyIdToken({ idToken: credential, audience: clientId })).getPayload());

  async function start(db, user, res, method) {
    const token = crypto.randomBytes(32).toString('base64url');
    const pending = user.role === 'professor';
    const session = {
      id: crypto.randomUUID(), tokenHash: hash(token), userId: user.id, method,
      status: pending ? 'pending' : 'approved', createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (pending ? 15 * 60 : 120 * 60) * 1000).toISOString()
    };
    db.sessions = (db.sessions || []).filter(active);
    db.sessions.push(session);
    await writeDb(db);
    res.status(pending ? 202 : 200).json(pending
      ? { status: 'pending', token, expiresAt: session.expiresAt }
      : { status: 'approved', token, user: safeUser(user) });
  }

  app.get('/api/auth-config', (req, res) => res.json({ googleClientId: clientId }));
  app.post('/api/login/google', loginLimiter, async (req, res) => {
    if (!clientId) return res.status(503).json({ error: 'O acesso com Google ainda não está disponível. Use login e senha.' });
    // The callback uses same-origin JSON fetch, never a cross-site form post.
    if (!req.is('application/json')) return res.status(415).json({ error: 'Formato inválido.' });
    if (req.get('origin') && new URL(req.get('origin')).host !== req.get('host')) return res.status(403).json({ error: 'Origem não autorizada.' });
    const { credential, portal } = req.body;
    if (!['aluno', 'professor'].includes(portal)) return res.status(400).json({ error: 'Escolha o portal de aluno ou professor.' });
    if (typeof credential !== 'string' || credential.length > 10000) return res.status(400).json({ error: 'Credencial inválida.' });
    let identity;
    try { identity = await verify(credential); } catch { return res.status(401).json({ error: 'Não foi possível validar sua conta Google. Tente novamente.' }); }
    if (!identity?.sub || !identity.email || identity.email_verified !== true) return res.status(401).json({ error: 'Use uma conta Google com e-mail verificado.' });
    const db = await readDb();
    const email = identity.email.toLowerCase();
    let user = db.users.find(item => item.googleSub === identity.sub);
    if (!user) {
      user = db.users.find(item => String(item.email || '').toLowerCase() === email && !item.googleSub);
      if (user && !email.endsWith('@gmail.com') && !identity.hd) return res.status(403).json({ error: 'Para este e-mail, use o login e a senha definidos pelo ADM.' });
    }
    if (!user || user.role !== portal) return res.status(403).json({ error: 'Esta conta não está cadastrada neste portal. Fale com o ADM.' });
    user.googleSub = identity.sub;
    return start(db, user, res, 'google');
  });

  app.get('/api/access-status', async (req, res) => {
    const db = await readDb();
    const token = bearer(req);
    const session = token && (db.sessions || []).find(item => item.tokenHash === hash(token) && active(item));
    if (!session) return res.status(401).json({ error: 'Solicitação expirada. Entre novamente.' });
    const user = db.users.find(item => item.id === session.userId);
    if (!user) return res.status(401).json({ error: 'Conta indisponível.' });
    if (session.status === 'approved') return res.json({ status: 'approved', user: safeUser(user) });
    res.json({ status: session.status || 'expired', expiresAt: session.expiresAt });
  });

  app.post('/api/logout', async (req, res) => {
    const token = bearer(req);
    if (token) {
      const db = await readDb();
      db.sessions = (db.sessions || []).filter(item => item.tokenHash !== hash(token));
      await writeDb(db);
    }
    res.json({ ok: true });
  });

  app.get('/api/access-requests', auth, only('admin'), async (req, res) => {
    const db = await readDb();
    res.json((db.sessions || []).filter(item => item.status === 'pending' && active(item)).flatMap(item => {
      const user = db.users.find(user => user.id === item.userId && user.role === 'professor');
      return user ? [{ id: item.id, name: user.name, email: user.email, method: item.method, createdAt: item.createdAt, expiresAt: item.expiresAt }] : [];
    }));
  });

  app.post('/api/access-requests/:id', auth, only('admin'), async (req, res) => {
    if (!['approved', 'denied'].includes(req.body.decision)) return res.status(400).json({ error: 'Decisão inválida.' });
    const db = await readDb();
    const session = (db.sessions || []).find(item => item.id === req.params.id && item.status === 'pending' && active(item));
    if (!session) return res.status(409).json({ error: 'Esta solicitação já foi respondida ou expirou.' });
    session.status = req.body.decision;
    session.decidedAt = new Date().toISOString();
    session.decidedBy = req.user.id;
    if (session.status === 'approved') session.expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    await writeDb(db);
    res.json({ status: session.status });
  });
  return { start };
};
