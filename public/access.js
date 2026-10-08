let pendingAccess = null, pendingTimer, adminTimer, accessRequests = [], googleLoading;

async function completeLogin(result) {
  if (result.status === 'pending') {
    pendingAccess = { token: result.token, portal: currentPortal };
    sessionStorage.setItem('wm_pending', JSON.stringify(pendingAccess));
    showPendingAccess();
    return;
  }
  clearTimeout(pendingTimer);
  pendingAccess = null;
  sessionStorage.removeItem('wm_pending');
  token = result.token;
  user = result.user;
  localStorage.setItem('wm_token', token);
  localStorage.setItem('wm_user', JSON.stringify(user));
  localStorage.setItem('wm_portal', currentPortal);
  await boot();
}

function showPendingAccess() {
  wmMotion.swapAccess(() => {
  $('#portalPicker').hidden = true;
  $('#loginCard').hidden = true;
  $('#pendingAccess').hidden = false;
  $('#pendingMessage').textContent = 'Sua entrada foi enviada ao ADM. Aguarde a aprovação para acessar seus alunos e treinos.';
  });
  clearTimeout(pendingTimer);
  pollAccess();
}

async function pollAccess() {
  const pending = pendingAccess;
  if (!pending) return;
  try {
    const response = await fetch('/api/access-status', { headers: { Authorization: `Bearer ${pending.token}` } });
    const result = await response.json();
    if (pendingAccess !== pending) return;
    if (!response.ok || ['denied', 'expired'].includes(result.status)) {
      $('#pendingMessage').textContent = result.status === 'denied'
        ? 'O ADM recusou esta entrada. Fale com o administrador para esclarecer seu acesso.'
        : 'Esta solicitação expirou. Volte e entre novamente para solicitar acesso.';
      sessionStorage.removeItem('wm_pending');
      return;
    }
    if (result.status === 'approved') {
      currentPortal = pending.portal;
      $('#pendingAccess').hidden = true;
      await completeLogin({ ...result, token: pending.token });
      return;
    }
    $('#pendingMessage').textContent = 'Solicitação enviada ao ADM. Aguardando aprovação para liberar seu acesso. Esta tela será atualizada automaticamente.';
  } catch {
    if (pendingAccess !== pending) return;
    $('#pendingMessage').textContent = 'Sem conexão no momento. Tentando consultar a aprovação novamente…';
  }
  if (pendingAccess === pending) pendingTimer = setTimeout(pollAccess, 4000);
}

async function cancelAccess() {
  const pending = pendingAccess;
  pendingAccess = null;
  clearTimeout(pendingTimer);
  sessionStorage.removeItem('wm_pending');
  if (pending) await fetch('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${pending.token}` } }).catch(() => {});
  $('#pendingAccess').hidden = true;
  backToPortals();
}

function approvalSummary() {
  return `<section class="card approval-summary"><div><h3>Acessos de professores</h3><p id="approvalCount" aria-live="polite">${accessRequests.length} solicitação(ões) aguardando aprovação.</p></div><button onclick="show('aprovacoes')">Analisar acessos</button></section>`;
}

function approvalCards() {
  return accessRequests.map(item => `<article class="card"><h3>${esc(item.name)}</h3><p>${esc(item.email)}</p><p class="muted">${item.method === 'google' ? 'Conta Google' : 'Login e senha'} · ${esc(new Date(item.createdAt).toLocaleString('pt-BR'))}</p><div class="actions"><button onclick="decideAccess('${esc(item.id)}','approved',this)">Aprovar entrada</button><button class="button-secondary" onclick="decideAccess('${esc(item.id)}','denied',this)">Recusar</button></div></article>`).join('') || emptyState('shield', 'Tudo em dia por aqui.', 'Novas solicitações de professores aparecerão aqui para sua aprovação.');
}

function approvals() {
  return `<section class="hero"><p class="eyebrow">CONTROLE DE ACESSO</p><h2>Aprovar professores</h2><p>Cada nova entrada precisa da sua aprovação. Solicitações expiram em 15 minutos; acessos aprovados duram até 2 horas.</p></section><p id="approvalError" class="error" role="status"></p><div id="approvalList" class="grid">${approvalCards()}</div>`;
}

async function updateApprovals() {
  try {
    accessRequests = await api('/api/access-requests');
    if ($('#approvalList')) $('#approvalList').innerHTML = approvalCards();
    if ($('#approvalCount')) $('#approvalCount').textContent = `${accessRequests.length} solicitação(ões) aguardando aprovação.`;
    const tab = document.querySelector('[data-tab="aprovacoes"]');
    if (tab) tab.querySelector('.nav-label').textContent = `Aprovações${accessRequests.length ? ` (${accessRequests.length})` : ''}`;
    if ($('#approvalError')) $('#approvalError').textContent = '';
  } catch (error) {
    if ($('#approvalError')) $('#approvalError').textContent = `Não foi possível atualizar: ${error.message}`;
  }
}

function startApprovalUpdates() {
  clearTimeout(adminTimer);
  const tick = async () => {
    if (user?.role !== 'admin') return;
    await updateApprovals();
    adminTimer = setTimeout(tick, 4000);
  };
  tick();
}

async function decideAccess(id, decision, button) {
  button.disabled = true;
  try {
    await api(`/api/access-requests/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ decision }) });
    await updateApprovals();
  } catch (error) {
    if ($('#approvalError')) $('#approvalError').textContent = error.message;
    button.disabled = false;
  }
}

async function renderGoogleLogin() {
  const area = $('#googleAccess');
  const portal = currentPortal;
  area.hidden = !['aluno', 'professor'].includes(portal);
  if (area.hidden) return;
  $('#googleButton').replaceChildren();
  $('#googleMessage').textContent = 'Carregando acesso Google…';
  try {
    const config = await api('/api/auth-config');
    if (currentPortal !== portal) return;
    if (!config.googleClientId) {
      $('#googleMessage').textContent = 'O acesso com Google ainda não está disponível. Entre com seu login e senha.';
      return;
    }
    if (!googleLoading) googleLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => { script.remove(); googleLoading = null; reject(new Error('Falha ao carregar Google')); };
      document.head.append(script);
    });
    await googleLoading;
    if (currentPortal !== portal) return;
    google.accounts.id.initialize({ client_id: config.googleClientId, auto_select: false, callback: async response => {
      if (currentPortal !== portal || pendingAccess) return;
      try {
        const result = await api('/api/login/google', { method: 'POST', body: JSON.stringify({ credential: response.credential, portal }) });
        await completeLogin(result);
      } catch (error) { $('#loginError').textContent = error.message; }
    } });
    google.accounts.id.renderButton($('#googleButton'), { theme: 'outline', size: 'large', text: 'signin_with', locale: 'pt-BR' });
    $('#googleMessage').textContent = portal === 'professor'
      ? 'Entre ou crie seu perfil com Google. Sua solicitação será enviada para aprovação do ADM.'
      : 'Entre com Google para acessar ou criar seu perfil de aluno automaticamente.';
  } catch {
    $('#googleMessage').textContent = 'Não foi possível carregar o Google. Use login e senha ou tente novamente.';
  }
}

function restoreAccess() {
  try { pendingAccess = JSON.parse(sessionStorage.getItem('wm_pending') || 'null'); } catch { sessionStorage.removeItem('wm_pending'); }
  if (pendingAccess?.token) showPendingAccess();
  else boot();
}
