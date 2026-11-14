import fs from 'fs'; import vm from 'vm';
const geo = JSON.parse(fs.readFileSync('static/geo.json','utf8'));
const src = fs.readFileSync('static/fleet.js','utf8') + '\n' + fs.readFileSync('static/scoring.js','utf8');
const ctx = { console, geo };
vm.createContext(ctx);
vm.runInContext(src, ctx);
vm.runInContext('selfCheck(geo)', ctx);
