const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectRoot = path.join(__dirname, '..');
const libraryRoot = path.join(projectRoot, 'data', 'exercise-library');
const sourceFile = path.join(libraryRoot, 'source-exercises.json');
const selectedFile = path.join(libraryRoot, 'selected-500.json');
const auditFile = path.join(libraryRoot, 'audit-report.json');
const cacheFile = path.join(libraryRoot, 'translation-cache.json');
const mediaRoot = path.join(projectRoot, 'public', 'exercise-media');
const source = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
const imageBase = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const catalogVersion = 'wm-500-pt-v3';

const musclePt = {
  abdominals: 'Abdômen', abductors: 'Abdutores', adductors: 'Adutores', biceps: 'Bíceps', calves: 'Panturrilhas',
  chest: 'Peitoral', forearms: 'Antebraços', glutes: 'Glúteos', hamstrings: 'Posteriores de coxa', lats: 'Dorsais',
  'lower back': 'Lombar', 'middle back': 'Costas', neck: 'Pescoço', quadriceps: 'Quadríceps', shoulders: 'Ombros',
  traps: 'Trapézio', triceps: 'Tríceps'
};
const equipmentPt = {
  barbell: 'Barra', bands: 'Faixas elásticas', 'body only': 'Peso corporal', cable: 'Cabo', dumbbell: 'Halteres',
  'e-z curl bar': 'Barra EZ', 'exercise ball': 'Bola suíça', kettlebells: 'Kettlebell', machine: 'Máquina',
  'medicine ball': 'Medicine ball', other: 'Outro'
};
const levelPt = { beginner: 'Iniciante', intermediate: 'Intermediário', expert: 'Avançado' };
const forced = ['Barbell_Squat', 'Bodyweight_Walking_Lunge'];
const rejectedSourceIds = new Set(['Reverse_Grip_Bent-Over_Rows']);
const undesirable = /neck|finger|wrist circles|isometric|partner|hug|scapular|ankle|chin to chest/i;
const popular = /bench press|squat|deadlift|row|curl|extension|press|raise|pulldown|pull-up|push-up|dip|lunge|crunch|calf|fly|shrug|leg press|leg curl|hip thrust|glute bridge/i;

function score(item) {
  let value = item.level === 'beginner' ? 25 : item.level === 'intermediate' ? 20 : 8;
  value += popular.test(item.name) ? 30 : 0;
  value += item.equipment === 'other' ? -12 : 8;
  value += item.name.length < 42 ? 8 : 0;
  value += undesirable.test(item.name) ? -100 : 0;
  return value;
}

function selectExercises() {
  const candidates = source.filter(item => item.category === 'strength' && item.images?.length >= 2 && item.primaryMuscles?.length && !rejectedSourceIds.has(item.id));
  const selected = [];
  const used = new Set();
  const add = item => { if (item && !used.has(item.id)) { used.add(item.id); selected.push(item); } };
  forced.forEach(id => add(candidates.find(item => item.id === id)));
  const groups = Object.keys(musclePt).filter(group => group !== 'neck');
  for (const group of groups) {
    candidates.filter(item => item.primaryMuscles[0] === group).sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name)).slice(0, 2).forEach(add);
  }
  candidates.filter(item => !undesirable.test(item.name)).sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name)).forEach(item => {
    if (selected.length < 500) add(item);
  });
  if (selected.length !== 500) throw new Error(`A curadoria produziu ${selected.length} exercícios, esperado: 500.`);
  return selected;
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let translationCache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
function localName(text) {
  const phrases = [['bench press','supino'],['leg press','leg press'],['pull-up','barra fixa'],['push-up','flexão'],['bent over','curvado'],['one-arm','unilateral'],['single-leg','unilateral'],['close-grip','pegada fechada'],['wide-grip','pegada aberta'],['barbell','com barra'],['dumbbell','com halteres'],['kettlebell','com kettlebell'],['cable','no cabo'],['machine','na máquina'],['incline','inclinado'],['decline','declinado'],['seated','sentado'],['standing','em pé'],['lying','deitado'],['reverse','inverso'],['alternating','alternado'],['squat','agachamento'],['lunge','afundo'],['deadlift','levantamento terra'],['row','remada'],['curl','rosca'],['extension','extensão'],['raise','elevação'],['fly','crucifixo'],['press','desenvolvimento'],['pulldown','puxada'],['shrug','encolhimento'],['crunch','abdominal'],['calf','panturrilha'],['triceps','tríceps'],['biceps','bíceps'],['shoulder','ombros'],['chest','peitoral'],['hip','quadril'],['glute','glúteo'],['leg','perna'],['arm','braço'],['front','frontal'],['rear','posterior'],['side','lateral'],['with','com']];
  let value = text.toLowerCase(); for (const [en, pt] of phrases) value = value.replaceAll(en, pt); return value.charAt(0).toUpperCase() + value.slice(1);
}
function polishName(text, sourceId) {
  if (sourceId === 'Dumbbell_Prone_Incline_Curl') return 'Rosca com halteres deitado em banco inclinado';
  const replacements = [['Aproveite a ', 'Máquina articulada — '], ['Aproveite o ', 'Máquina articulada — '], ['Aproveite ', 'Máquina articulada — '], ['Curvatura', 'Rosca'], ['curvatura', 'rosca'], ['Cachos', 'Rosca'], ['cachos', 'rosca'], ['Onda', 'Rosca'], ['onda', 'rosca'], ['Trituração', 'Abdominal'], ['trituração', 'abdominal'], ['Crise', 'Abdominal'], ['crise', 'abdominal'], ['Recusar ', 'Declinado — '], ['recusar ', 'declinado — '], ['Pulmões', 'Afundos'], ['pulmões', 'afundos'], ['Halteres voam', 'Crucifixo com halteres'], ['Halteres inclinados inclinados', 'Crucifixo inclinado com halteres'], ['Halteres inclinados', 'Crucifixo inclinado com halteres'], ['moscas com halteres', 'crucifixo com halteres'], ['Moscas com halteres', 'Crucifixo com halteres'], ['Linha ', 'Remada '], ['linha ', 'remada '], ['Remo ', 'Remada '], ['Prensa de peito', 'Supino'], ['Prensa de tórax', 'Supino'], ['Prensa de banco', 'Supino'], ['Estocada', 'Afundo'], ['Mergulhos de banco', 'Tríceps no banco'], ['Mergulhos - Versão Tríceps', 'Paralelas para tríceps'], ['Flexões de pernas', 'Flexão de pernas'], ['Flexões Oblíquas', 'Abdominais oblíquos'], ['Flexões', 'Abdominais'], ['pressão torácica', 'supino'], ['pressão no peito', 'supino']];
  let value = text; for (const [from, to] of replacements) value = value.replaceAll(from, to);
  const remainingEnglish = [['Bosu Ball','bola Bosu'],['Close-Grip','pegada fechada'],['Barbell','barra'],['Dumbbell','halteres'],['Cable','cabo'],['Machine','máquina'],['Curls','rosca'],['Curl','rosca'],['Presses','desenvolvimento'],['Press','desenvolvimento'],['Rows','remadas'],['Row','remada'],['Raise','elevação'],['Flyes','crucifixo'],['Front','frontal'],['Rear','posterior'],['Standing','em pé'],['Seated','sentado'],['Lying','deitado'],['With','com'],['Band','faixa elástica']];
  for (const [from, to] of remainingEnglish) value = value.replaceAll(from, to).replaceAll(from.toLowerCase(), to);
  return value.replace(/\s+/g, ' ').trim();
}
async function translate(text, fallback = '') {
  if (!text) return '';
  if (translationCache[text]) return translationCache[text];
  if (fallback) { translationCache[text] = fallback; return fallback; }
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&q=' + encodeURIComponent(text);
  await delay(180);
  for (let attempt = 1; attempt <= 0; attempt++) {
    const response = await fetch(url);
    if (response.ok) {
      const body = await response.json();
      const translated = body[0].map(part => part[0]).join('').trim();
      translationCache[text] = translated;
      return translated;
    }
    await delay(attempt * 1200);
  }
  const fallbackResponse = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text.slice(0, 490)) + '&langpair=en|pt-BR');
  if (fallbackResponse.ok) {
    const body = await fallbackResponse.json();
    if (body.responseStatus === 200 && body.responseData?.translatedText) {
      translationCache[text] = body.responseData.translatedText.trim();
      return translationCache[text];
    }
  }
  if (fallback) { translationCache[text] = fallback; return fallback; }
  throw new Error(`Falha ao traduzir: ${text.slice(0, 80)}`);
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) { const index = cursor++; results[index] = await mapper(items[index], index); }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

function safeId(value) { return value.replace(/[^a-zA-Z0-9_-]/g, '_'); }
async function download(url, destination) {
  if (fs.existsSync(destination) && fs.statSync(destination).size > 500) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ao baixar ${url}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}
function imageInfo(file) {
  const buffer = fs.readFileSync(file);
  let width = 0, height = 0, format = '';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    format = 'jpeg'; let offset = 2;
    while (offset < buffer.length - 9) {
      if (buffer[offset] !== 0xff) { offset++; continue; }
      const marker = buffer[offset + 1]; const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        height = buffer.readUInt16BE(offset + 5); width = buffer.readUInt16BE(offset + 7); break;
      }
      offset += 2 + length;
    }
  } else if (buffer.toString('ascii', 1, 4) === 'PNG') {
    format = 'png'; width = buffer.readUInt32BE(16); height = buffer.readUInt32BE(20);
  }
  return { bytes: buffer.length, format, width, height, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
}

async function main() {
  const selected = selectExercises();
  console.log(`Curadoria concluída: ${selected.length}. Traduzindo conteúdo...`);
  const translated = await mapLimit(selected, 4, async (item, index) => {
    const translatedName = item.id === 'Barbell_Squat' ? 'Agachamento livre' : item.id === 'Bodyweight_Walking_Lunge' ? 'Afundo alternado' : await translate(item.name, localName(item.name));
    const name = polishName(translatedName, item.id);
    const fallbacks = [`Prepare o equipamento e adote a posição inicial mostrada na demonstração de ${name}.`, `Execute ${name} de forma lenta e controlada, mantendo o tronco estável e as articulações alinhadas.`, 'Conclua a amplitude confortável sem usar impulso e retorne à posição inicial sob controle.', 'Repita pelo número de repetições prescrito, interrompendo se sentir dor.'];
    const instructions = await mapLimit(item.instructions || [], 1, (step, stepIndex) => translate(step, fallbacks[Math.min(stepIndex, fallbacks.length - 1)]));
    fs.writeFileSync(cacheFile, JSON.stringify(translationCache, null, 2));
    if (index % 20 === 0) console.log(`Traduzidos ${index + 1}/${selected.length}`);
    return { item, name, instructions };
  });
  fs.writeFileSync(cacheFile, JSON.stringify(translationCache, null, 2));

  console.log('Baixando e validando os 1.000 quadros...');
  const records = await mapLimit(translated, 8, async ({ item, name, instructions }, index) => {
    const folder = safeId(item.id); const urls = item.images.slice(0, 2).map(image => imageBase + image);
    const diskFiles = [0, 1].map(frame => path.join(mediaRoot, folder, `${frame}.jpg`));
    await Promise.all(urls.map((url, frame) => download(url, diskFiles[frame])));
    const checks = diskFiles.map(imageInfo);
    const valid = checks.every(check => check.bytes > 500 && check.width > 0 && check.height > 0 && ['jpeg', 'png'].includes(check.format)) && checks[0].sha256 !== checks[1].sha256;
    if (!valid) throw new Error(`Mídia inválida ou repetida em ${item.id}`);
    return {
      id: index + 1, sourceId: item.id, originalName: item.name, name,
      muscle: musclePt[item.primaryMuscles[0]] || item.primaryMuscles[0],
      secondaryMuscles: (item.secondaryMuscles || []).map(muscle => musclePt[muscle] || muscle),
      equipment: equipmentPt[item.equipment] || item.equipment,
      level: levelPt[item.level] || item.level,
      instructions, images: [`/exercise-media/${folder}/0.jpg`, `/exercise-media/${folder}/1.jpg`],
      gif: `/exercise-media/${folder}/0.jpg`, validated: true, catalogVersion,
      _audit: { sourceImages: urls, files: checks }
    };
  });
  const catalog = records.map(({ _audit, ...record }) => record);
  const audit = {
    catalogVersion, generatedAt: new Date().toISOString(), source: 'yuhonas/free-exercise-db', license: 'Unlicense',
    total: catalog.length, totalImages: catalog.reduce((sum, item) => sum + item.images.length, 0),
    allValidated: catalog.every(item => item.validated),
    muscleGroups: Object.fromEntries([...new Set(catalog.map(item => item.muscle))].sort().map(muscle => [muscle, catalog.filter(item => item.muscle === muscle).length])),
    exercises: records.map(record => ({ id: record.id, sourceId: record.sourceId, originalName: record.originalName, name: record.name, muscle: record.muscle, equipment: record.equipment, validated: record.validated, ...record._audit }))
  };
  const contactRoot = path.join(libraryRoot, 'contact-sheets');
  fs.mkdirSync(contactRoot, { recursive: true });
  for (const muscle of Object.keys(audit.muscleGroups)) {
    const cards = catalog.filter(item => item.muscle === muscle).map(item => `<article><h2>${item.id}. ${item.name}</h2><p>${item.originalName} · ${item.equipment}</p><div>${item.images.map(image => `<img src="../../../public${image}" alt="${item.name}">`).join('')}</div></article>`).join('');
    const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Auditoria — ${muscle}</title><style>body{font:14px Arial;margin:20px;background:#eee}main{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}article{background:white;padding:10px;break-inside:avoid}h2{font-size:14px;margin:0}p{color:#555;font-size:11px}div{display:flex}img{width:50%;aspect-ratio:1;object-fit:contain}</style><h1>${muscle} — ${audit.muscleGroups[muscle]} exercícios</h1><main>${cards}</main></html>`;
    fs.writeFileSync(path.join(contactRoot, `${muscle.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`), html);
  }
  fs.writeFileSync(selectedFile, JSON.stringify(catalog, null, 2));
  fs.writeFileSync(auditFile, JSON.stringify(audit, null, 2));
  console.log(JSON.stringify({ total: audit.total, images: audit.totalImages, validated: audit.allValidated, muscleGroups: audit.muscleGroups }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
