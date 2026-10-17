import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const errors = [];
const fail = message => errors.push(message);
const tasks = new Map();
for (const match of read('ROADMAP.md').matchAll(/^- \[([ x])\] ([A-Z][A-Z0-9]*(?:\.\d+)?) (.+)$/gm)) {
  if (tasks.has(match[2])) fail(`Duplicate ROADMAP ID: ${match[2]}`);
  tasks.set(match[2], { checked: match[1], description: match[3] });
}
const sequence = (prefix, start, end) => Array.from({ length: end - start + 1 }, (_, i) => `${prefix}.${start + i}`);
const groups = [
  { title: 'Techninis preview', text: 'TP0 yra pristatymo kontrolė; offline vertikalė gali būti kuriama lygiagrečiai observer ir Library. Emuliuotas modelis aiškiai pažymimas. Šis etapas neuždaro MVP.', ids: ['TP0', 'TP1', 'TP2'] },
  { title: 'Profilis, kontraktai ir G0', text: 'Rakazo jau pasirinktas. Lieka kvalifikuoti švarų Linux x86_64 profilį, tikrą model/auth, resursus ir iš anksto užfiksuotus fixtures. 2 GB bazės bei kiti G0 kriterijai nemažinami.', ids: ['P0.0', 'P0.1', 'P0.2', 'P0.3', 'P0.5', 'P0.6', 'P0.7', 'P0.8', 'P0.9', 'P0.10', 'P0.12', 'P0.13', 'P0.14', 'P0.23', 'P0.25', 'P0.26', 'P0.27', 'P0.28', 'P0.29'] },
  { title: 'Vienas patvarus vykdymas ir G1', text: 'Esami primityvai turi veikti vienoje worker grandinėje. G1 išlaiko 50 fault vykdymų, backup/reconnect/cancel ir resursų matavimą. OBS3 būtinas tik jei leidžiami fallback/paid child; iki tol tie keliai išjungti.', ids: ['OBS1', 'OBS2', 'OBS3', ...sequence('P1', 1, 17), 'NEED1', 'PREP1', 'TRACE1'] },
  { title: 'Pasirinktas Jev profilis ir atskiras matavimas', text: 'J0–J2 reikalingi naudotojo pasirinktai gyvai integracijai. J3 yra atskiras naudos tyrimas; jo atlikimas gali parodyti ir neigiamą rezultatą. Baseline ar visų užduočių abstain neuždaro J2.', ids: ['J0', 'J1', 'J2', 'J3', 'P1D.7'] },
  { title: 'Savarankiška žmogaus Library', text: 'MVP reikalauja L1–L5. Paieška veikia be AI užduoties ir mokamų LLM; Compare, Trending ir Collections nėra šio etapo priklausomybė. L5 priklauso nuo P2.14.', ids: ['L1', 'L2', 'L3', 'L4', 'L5'] },
  { title: 'Trys gebėjimai, UI kalbos ir naujas naudotojas', text: 'Browser/research, PDF lentelės ir coding su mažu naujo projekto reuse keliu. Išlieka G2: 24/30 ir ≥7/10 kiekvienoje srityje, visos nesėkmės bei privalomi permissions/budget/cancel/restart atvejai. Tai dev acceptance, ne nepriklausomas pranašumo benchmark. 8 locale foundation kode savaime neuždaro visų srautų vertimo.', ids: [...sequence('P2', 1, 9), 'P2.14', ...sequence('P1L', 1, 4), 'MVP1'] },
];

let mvp = '# RepositoryZero MVP roadmapas\n\n**Atnaujinta 2026-10-17.** Generuojama iš [ROADMAP](ROADMAP.md) tų pačių ID ir checkbox būsenų. Keisti pilną roadmapą ir paleisti `npm run docs:sync`; `npm run check:docs` aptinka neatitikimą. [Dabartinė būsena](docs/IMPLEMENTATION.md), [priimta architektūra](docs/DECISIONS.md).\n\nTechninis preview = vienas tikras mažas worker pjūvis, leidžiant pažymėtą modelio emuliaciją. **Techninis MVP = vienas kvalifikuotas vietinis profilis su tikru modeliu ir pasirinktu Jev ToolSelector, savarankiška Library bei browser/research, PDF ir coding.** CSV demonstracija nepakeičia šių trijų gebėjimų.\n\n';
for (const group of groups) {
  mvp += `## ${group.title}\n\n${group.text}\n\n`;
  for (const id of group.ids) {
    const task = tasks.get(id);
    if (!task) { fail(`MVP refers to missing task: ${id}`); continue; }
    const description = task.description;
    mvp += `- [${task.checked}] ${id} ${description}\n`;
  }
  mvp += '\n';
}
mvp += '## Po techninio MVP\n\nVieša beta turi platesnius vartus: likusį taikomą G2, REA static G3B, Treg P2.11–P2.13, shared improvement G3A, siaurą auto acceptance G3C, signed managed-local update G3D ir G4. Kelių desktop OS platinimas P4D atskiras. Svetainė, portalas, Video Hub, cloud/Drive ir platesnės sritys išlieka [pilname roadmape](ROADMAP.md); šis mažas kelias jų neatšaukia.\n\nZero Lab atlikti pjūviai yra ROADMAP P1E ir [istorinėse ataskaitose](docs/experiments/README.md). Jie neuždaro šio MVP vartų. Nebelieka fiksuoto 50% ar bendro pranašumo pažado; nauda skelbiama tik pagal atitinkamo profilio faktinius palyginimus.\n';
if (process.argv.includes('--write') && errors.length === 0) fs.writeFileSync(path.join(root, 'MVP-ROADMAP.md'), mvp);
else if (read('MVP-ROADMAP.md') !== mvp) fail('MVP-ROADMAP.md is stale: run npm run docs:sync');

const manifest = JSON.parse(read('docs/quarantine/2026-10-17/MANIFEST.json'));
for (const entry of manifest.files) {
  const absolute = path.resolve(root, entry.path);
  if (!absolute.startsWith(root + path.sep) || !/^docs[\/]quarantine[\/]/.test(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256)) { fail('Invalid quarantine manifest entry'); continue; }
  const actual = fs.readFileSync(absolute);
  if (actual.length !== entry.bytes || crypto.createHash('sha256').update(actual).digest('hex') !== entry.sha256) fail(`Quarantine original changed: ${entry.path}`);
}
const historicRoadmap = read('docs/quarantine/2026-10-17/previous/ROADMAP.md.snapshot.txt');
for (const match of historicRoadmap.matchAll(/^- \[[ x]\] ([A-Z][A-Z0-9]*(?:\.\d+)?) /gm)) {
  if (!tasks.has(match[1])) fail(`Original task ID lost: ${match[1]}`);
}

function walk(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
}
const documents = ['README.md', 'AGENTS.md', 'PLAN.md', 'ROADMAP.md', 'MVP-ROADMAP.md', ...walk('docs').filter(name => name.endsWith('.md'))];
const publishable = fs.existsSync(path.join(root, '.git'))
  ? new Set(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\0'))
  : null;
let links = 0;
for (const document of documents) {
  const content = read(document);
  // Fenced examples do not define navigation. Snapshot text and inherited upstream
  // docs are intentionally not treated as current RepositoryZero instructions.
  const prose = content.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '');
  for (const match of prose.matchAll(/!?\[[^\]\n]*\]\(([^\n)]+)\)/g)) {
    const target = match[1].replace(/^<([^>]+)>$/, '$1').replace(/\s+"[^"]*"$/, '');
    if (/^(?:[a-z][\w+.-]*:|#|\/)/i.test(target)) continue;
    links++;
    let file;
    try { file = decodeURIComponent(target.split('#')[0]); } catch { fail(`${document}: invalid URL ${target}`); continue; }
    const resolved = path.resolve(root, path.dirname(document), file);
    if (publishable && fs.existsSync(resolved) && fs.statSync(resolved).isFile() && !publishable.has(path.relative(root, resolved).split(path.sep).join('/'))) fail(`${document}: ignored local target ${target}`);
    if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved)) fail(`${document}: missing local target ${target}`);
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log(`Documentation OK: ${documents.length} Markdown files, ${links} local links, ${tasks.size} unique roadmap IDs, ${groups.reduce((n, g) => n + g.ids.length, 0)} synchronized MVP tasks, ${manifest.files.length} byte-identical quarantine originals.`);
