const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id,{value:'',innerText:'',hidden:false,style:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){}});
  return elements.get(id);
};
const requests=[];
let marker=[0,0], view, preview=0;
const ctx=vm.createContext({console,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,setInterval(){},
  window:{location:{href:'http://localhost/'}},
  document:{readyState:'loading',addEventListener(){},getElementById:element,querySelectorAll:()=>[]},
  localStorage:{setItem(){},getItem(){return null;}},
  testMap:{setView(p){view=p;}},
  testMarker:{setLatLng(p){marker=p;return this;},getLatLng(){return {lat:marker[0],lng:marker[1]};},setOpacity(){return this;}},
  L:{circleMarker(){preview++;return {addTo(){return this;},bindTooltip(){return this;},remove(){}};}},
  fetch:async url=>{requests.push(url);return {ok:true,json:async()=>({current:{time:'2026-10-21T12:00',temperature_2m:23}})};}
});
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../dashboard/app.js'),'utf8'),ctx);
const run=s=>vm.runInContext(s,ctx);
const flush=()=>new Promise(setImmediate);
(async()=>{
  run('map=testMap; stationMarker=testMarker;');
  await run('obterDadosComparativos()');
  assert.equal(requests.length,0,'aguarda cadastro antes da consulta local');
  run("ultimaLocalizacaoSalva={lat:-23.63,lng:-46.69}; atualizarCoordenadasMapa(-23.63,-46.69,'Cadastro da estação');");
  await flush();
  assert.equal(requests.length,2);
  assert.ok(requests.every(u=>u.includes('latitude=-23.63&longitude=-46.69')));
  assert.match(element('compMetaStation').innerText,/Região da estação/);
  run("atualizarCoordenadasMapa(-23.63,-46.69,'Cadastro da estação');");
  assert.equal(requests.length,2,'polling nao repete consulta sem mudanca');
  run("ultimaLocalizacaoSalva={lat:-23.64,lng:-46.70}; atualizarCoordenadasMapa(-23.64,-46.70,'Cadastro da estação');");
  await flush();
  assert.ok(requests.at(-1).includes('latitude=-23.64&longitude=-46.7'));
  await run("obterDadosComparativos('sp')");
  assert.ok(requests.at(-1).includes('latitude=-23.55052&longitude=-46.6333'));
  let cepRequests=0;
  ctx.fetch=async url=>{cepRequests++;return {ok:true,json:async()=>url.includes('viacep') ? {logradouro:'Rua de teste',localidade:'São Paulo',uf:'SP'} : [{lat:'-23.62',lon:'-46.68'}]};};
  element('inputAddressSearch').value='123';
  await run('buscarLocalizacaoPorTexto()');
  assert.equal(cepRequests,0);
  element('inputAddressSearch').value='04713-000';
  const before=marker;
  await run('buscarLocalizacaoPorTexto()');
  assert.deepEqual(marker,before,'consulta publica nao muda estacao');
  assert.equal(preview,1);
  assert.equal(view[0],-23.62);
  run('editandoLocalizacao=true;');
  await run('buscarLocalizacaoPorTexto()');
  assert.equal(marker[0],-23.62,'modo de ajuste recebe sugestao de CEP');
  assert.equal(run('currentCoords.lat'),-23.64,'rascunho nao muda coordenada salva nem comparativo');
  ctx.fetch=async url=>({ok:true,json:async()=>url.includes('viacep') ? {logradouro:'Sem coordenadas'} : []});
  await run('buscarLocalizacaoPorTexto()');
  assert.match(element('cepStatus').innerText,/Não foi possível localizar/);
  const fallbackRequests=[];
  ctx.fetch=async url=>{
    fallbackRequests.push(url);
    return {ok:true,json:async()=>url.includes('viacep')
      ? {logradouro:'Rua de teste',localidade:'São Paulo',uf:'SP'}
      : url.includes('street=') ? [{lat:'-23.61',lon:'-46.67'}] : []};
  };
  await run('buscarLocalizacaoPorTexto()');
  assert.equal(fallbackRequests.length,3,'tenta rua somente após CEP sem coordenadas');
  assert.ok(fallbackRequests[2].includes('city=S%C3%A3o+Paulo'));
  assert.equal(marker[0],-23.61);
  assert.match(element('cepStatus').innerText,/Rua: ponto aproximado, sem número/);
  ctx.fetch=async()=>({ok:false,status:404});
  await run('buscarLocalizacaoPorTexto()');
  assert.equal(element('cepStatus').innerText,'CEP não encontrado.');
  ctx.testMarker.dragging={enable(){},disable(){}};
  element('locationAdminKey').value='chave-apenas-do-teste';
  run('editandoLocalizacao=true;');
  ctx.fetch=async(url,options)=>{
    assert.equal(url,'/api/estacoes/1/localizacao');
    assert.equal(options.method,'PUT');
    assert.equal(options.headers.Authorization,'Bearer chave-apenas-do-teste');
    const body=JSON.parse(options.body);
    assert.equal(body.latitude,marker[0]);
    assert.equal(body.longitude,marker[1]);
    return {ok:true,json:async()=>body};
  };
  await run('salvarAjusteLocalizacao({preventDefault(){}})');
  assert.match(element('locationStatus').innerText,/Localização salva no banco/);
  assert.equal(element('locationAdminKey').value,'');
  console.log('Localizacao: referencia por coordenadas, atualizacao automatica, CEP, rascunho e falhas OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
