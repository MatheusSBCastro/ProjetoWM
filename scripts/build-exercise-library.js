const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'data', 'exercise-library');
const source = JSON.parse(fs.readFileSync(path.join(root, 'source-exercises.json'), 'utf8'));
const imageBase = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

const slug = value => String(value || 'outros').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const groupName = name => String(name).toLowerCase()
  .replace(/\b(alternate|alternating|barbell|cable|dumbbell|ez-bar|incline|decline|lying|machine|one arm|one-arm|reverse|seated|single|smith|standing|weighted|wide grip)\b/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

const catalog = source.map((item, index) => ({
  catalogId: index + 1,
  id: item.id,
  name: item.name,
  variationGroup: groupName(item.name),
  category: item.category,
  level: item.level,
  equipment: item.equipment || 'body only',
  force: item.force,
  mechanic: item.mechanic,
  primaryMuscles: item.primaryMuscles || [],
  secondaryMuscles: item.secondaryMuscles || [],
  instructions: item.instructions || [],
  images: (item.images || []).map(image => imageBase + image),
  prescription: { sets: 3, reps: '8–12', restSeconds: 60 }
}));

fs.writeFileSync(path.join(root, 'catalog.json'), JSON.stringify(catalog, null, 2));
const groupDir = path.join(root, 'by-muscle');
fs.mkdirSync(groupDir, { recursive: true });
const groups = {};
for (const exercise of catalog) {
  const key = slug(exercise.primaryMuscles[0]);
  (groups[key] ||= []).push(exercise);
}
for (const [key, exercises] of Object.entries(groups)) fs.writeFileSync(path.join(groupDir, `${key}.json`), JSON.stringify(exercises, null, 2));

const summary = {
  generatedAt: new Date().toISOString(),
  totalExercises: catalog.length,
  totalVariationGroups: new Set(catalog.map(item => item.variationGroup)).size,
  totalImages: catalog.reduce((sum, item) => sum + item.images.length, 0),
  muscleGroups: Object.fromEntries(Object.entries(groups).map(([key, items]) => [key, items.length]).sort((a, b) => b[1] - a[1]))
};
fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(summary);
