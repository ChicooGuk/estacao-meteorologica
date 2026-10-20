const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {innerText:'--', innerHTML:'', style:{}, classList:{add(){}, remove(){}, toggle(){}}, addEventListener(){}});
  return elements.get(id);
};
const ctx = vm.createContext({console, AbortController, Date, Math, Number, JSON,
  setTimeout, clearTimeout, setInterval(){}, window:{location:{protocol:'http:',hostname:'localhost'}},
  document:{readyState:'loading', addEventListener(){}, getElementById:element, querySelectorAll:()=>[]},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}}, navigator:{},
});
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../dashboard/app.js'),'utf8'),ctx);
vm.runInContext(`
  map = {setView: (...args) => { globalThis.mapView = args; }};
  stationMarker = {setLatLng: coords => { globalThis.markerCoords = coords; },setOpacity(){}};
  atualizarCoordenadasMapa(1,2,'GPS Dispositivo');
`,ctx);
assert.equal(ctx.markerCoords,undefined,'GPS nao substitui a estacao');
vm.runInContext("atualizarCoordenadasMapa(0,0,'Cadastro da estacao');",ctx);
assert.equal(ctx.markerCoords[0],0);
assert.equal(ctx.mapView[0][1],0);
const payload = {estacao:{latitude:0,longitude:0},esp32_ativo:false,estatisticas_24h:{},historico:[
  {id_leitura:2,data_hora:'2026-10-20T12:00:02Z',temperatura:null,umidade:null,pressao:null,qualidade_ar:null,luminosidade:null},
  {id_leitura:1,data_hora:'2026-10-20T12:00:00Z',temperatura:24,umidade:50,pressao:930,qualidade_ar:null,luminosidade:60}
]};
ctx.fetch=async()=>({ok:true,json:async()=>payload});
vm.runInContext("atualizarCoordenadasMapa = (lat,lng,source) => { globalThis.coords = [lat,lng,source]; };",ctx);
(async()=>{
  await vm.runInContext('atualizarDashboard()',ctx);
  assert.equal(element('valTemp').innerText,'--');
  assert.equal(element('stAir').innerText,'Indisponivel');
  assert.equal(vm.runInContext('historicoLeituras.length',ctx),2);
  assert.equal(ctx.coords[0],0);
  assert.equal(ctx.coords[2],'Cadastro da estacao');
  assert.equal(element('historyCounter').innerText,'2 registros');
  assert.equal(element('alertBanner').classList !== undefined,true);
  await vm.runInContext('atualizarDashboard()',ctx);
  assert.equal(vm.runInContext('historicoLeituras.length',ctx),2,'polling nao duplica historico');
  assert.ok(element('historyTableBody').innerHTML.includes('--'));
  assert.equal(vm.runInContext('API_URL',ctx),'/api/leituras/ultimas-24h?id_estacao=1');
  console.log('Dashboard: null, historico persistido, deduplicacao, coordenadas zero e endpoint OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
