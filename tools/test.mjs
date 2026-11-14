import fs from 'fs'; import vm from 'vm';
const geo = JSON.parse(fs.readFileSync('archive/la-detour-receipt/geo.json','utf8'));
const src = fs.readFileSync('archive/la-detour-receipt/fleet.js','utf8') + '\n' + fs.readFileSync('archive/la-detour-receipt/scoring.js','utf8');
const ctx = { console, geo };
vm.createContext(ctx);
vm.runInContext(src, ctx);
vm.runInContext('selfCheck(geo)', ctx);
