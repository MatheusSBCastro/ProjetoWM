const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const baseUrl = 'http://localhost:3000';
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const output = path.join(__dirname, '..', '.visual-audit');
const profileDir = path.join(output, 'edge-profile');
fs.mkdirSync(output, { recursive: true });

const browser = spawn(edge, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9333', `--user-data-dir=${profileDir}`, 'about:blank'], { stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function connect() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const pages = await fetch('http://127.0.0.1:9333/json/list').then(response => response.json());
      if (pages[0]) return pages[0].webSocketDebuggerUrl;
    } catch {}
    await delay(200);
  }
  throw new Error('Não foi possível conectar ao Edge.');
}

async function login(email, portal) {
  const response = await fetch(`${baseUrl}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: '123456', portal }) });
  if (!response.ok) throw new Error(`${email}: ${await response.text()}`);
  return response.json();
}

async function run() {
  const ws = new WebSocket(await connect());
  if (ws.readyState !== WebSocket.OPEN) await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = event => { const message = JSON.parse(event.data); if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } };
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const commandId = ++id;
    pending.set(commandId, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result));
    ws.send(JSON.stringify({ id: commandId, method, params }));
  });
  const evaluate = expression => command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  await command('Page.enable');
  await command('Runtime.enable');

  const profiles = [
    { name: 'admin', email: 'master@wm.com', portal: 'admin', tabs: ['inicio', 'equipe', 'cadastros', 'vinculos', 'treinos', 'avaliacoes'] },
    { name: 'professor', email: 'professor@wm.com', portal: 'professor', tabs: ['inicio', 'alunos', 'avaliacoes', 'treinos'] },
    { name: 'aluno', email: 'aluno@wm.com', portal: 'aluno', tabs: ['inicio', 'treinos'] },
    { name: 'consulting', email: 'aluno@wm.com', portal: 'consulting', tabs: ['consulting'] }
  ];
  const viewports = [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }];
  const report = [];

  await command('Page.navigate', { url: baseUrl });
  await delay(500);
  for (const profile of profiles) {
    const session = await login(profile.email, profile.portal);
    await evaluate(`localStorage.setItem('wm_token',${JSON.stringify(session.token)});localStorage.setItem('wm_user',${JSON.stringify(JSON.stringify(session.user))});localStorage.setItem('wm_portal',${JSON.stringify(profile.portal)});location.reload()`);
    await delay(700);
    for (const viewport of viewports) {
      await command('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.name === 'mobile' });
      for (const tab of profile.tabs) {
        await evaluate(`show(${JSON.stringify(tab)})`);
        await delay(150);
        const audit = await evaluate(`(()=>{const bad=[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.right>innerWidth+1||r.left<-1});return {bodyWidth:document.body.scrollWidth,viewport:innerWidth,overflow:bad.slice(0,8).map(el=>({tag:el.tagName,className:el.className,right:Math.round(el.getBoundingClientRect().right)}))}})()`);
        const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        const filename = `${profile.name}-${tab}-${viewport.name}.png`;
        fs.writeFileSync(path.join(output, filename), Buffer.from(image.data, 'base64'));
        report.push({ screen: `${profile.name}/${tab}/${viewport.name}`, ...audit.result.value });
      }
    }
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  ws.close();
}

run().finally(() => browser.kill()).catch(error => { console.error(error); process.exitCode = 1; });
