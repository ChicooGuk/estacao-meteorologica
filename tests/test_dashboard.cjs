const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {dataset:{},innerText:'--', innerHTML:'', style:{}, classList:{values:new Set(),add(...items){items.forEach(x=>this.values.add(x));},remove(...items){items.forEach(x=>this.values.delete(x));},toggle(x,on){if(on)this.values.add(x);else this.values.delete(x);}}, addEventListener(){}});
  return elements.get(id);
};
const ctx = vm.createContext({console, AbortController, URL, Date, Math, Number, JSON,
  setTimeout, clearTimeout, setInterval(){}, window:{location:{protocol:'http:',hostname:'localhost',href:'http://localhost/'}},
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
vm.runInContext("atualizarCoordenadasMapa(0,0,'Cadastro da estação');",ctx);
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
  assert.equal(element('stAir').innerText,'Sem medição atual; consulte o horário da última leitura');
  assert.equal(vm.runInContext('historicoLeituras.length',ctx),2);
  assert.equal(ctx.coords[0],0);
  assert.equal(ctx.coords[2],'Cadastro da estação');
  assert.equal(element('historyCounter').innerText,'2 registros');
  payload.historico[0].adc_bruto = {qualidade_ar:0};
  await vm.runInContext('atualizarDashboard()',ctx);
  assert.match(element('mqRaw').innerText,/0 \/ 4095 ADC/);
  assert.equal(element('valAir').innerText,'--','ADC zero nao vira ppm');
  payload.historico[0].adc_bruto.qualidade_ar=1234;
  await vm.runInContext('atualizarDashboard()',ctx);
  assert.match(element('mqRaw').innerText,/1234 \/ 4095 ADC/);
  payload.historico[0].adc_bruto.qualidade_ar=0.125;
  await vm.runInContext('atualizarDashboard()',ctx);
  assert.match(element('mqRaw').innerText,/0,125 \/ 4095 ADC/,'preserva sinal fracionário');
  assert.match(element('mqRaw').innerText,/Sem atualização/,'sinal antigo identificado');
  assert.equal(element('alertBanner').classList !== undefined,true);
  await vm.runInContext('atualizarDashboard()',ctx);
  assert.equal(vm.runInContext('historicoLeituras.length',ctx),2,'polling nao duplica historico');
  payload.historico_24h=[{data_hora:'2026-10-20T10:00:00Z',temperatura:26,umidade:55,qualidade_ar:null}];
  ctx.chartUpdates=[];
  vm.runInContext('sensorChart = {data:{labels:[],datasets:[{data:[]},{data:[]},{data:[]}]},update(mode){chartUpdates.push(mode);}};',ctx);
  const originalData=vm.runInContext('sensorChart.data.datasets[0].data',ctx);
  await vm.runInContext('atualizarDashboard()',ctx);
  assert.equal(vm.runInContext('sensorChart.data.datasets[0].data[0]',ctx),26,'grafico usa agregacao de 24h');
  assert.equal(vm.runInContext('sensorChart.data.labels.length',ctx),1);
  assert.equal(ctx.chartUpdates.length,1,'uma atualizacao por resposta, sem animar cada registro');
  assert.equal(ctx.chartUpdates[0],'none','primeira carga sem transicao da linha vazia');
  assert.equal(vm.runInContext('sensorChart.data.datasets[0].data',ctx),originalData,'preserva dados do Chart.js');
  await vm.runInContext('atualizarDashboard()',ctx);
  assert.equal(ctx.chartUpdates.length,1,'resposta identica nao redesenha o grafico');
  payload.historico_24h[0].temperatura=27;
  await vm.runInContext('atualizarDashboard()',ctx);
  assert.equal(ctx.chartUpdates.length,2);
  assert.equal(ctx.chartUpdates[1],'none','telemetria atualiza sem interpolar toda a serie');
  ctx.window.matchMedia=()=>({matches:true});
  payload.historico_24h[0].temperatura=28;
  await vm.runInContext('atualizarDashboard()',ctx);
  assert.equal(ctx.chartUpdates.at(-1),'none','respeita preferencia de movimento reduzido');
  vm.runInContext("ultimaRespostaApi = 1; verificarAtualidade();",ctx);
  assert.match(element('stTemp').innerText,/Sem medição atual/);
  assert.ok(element('historyTableBody').innerHTML.includes('--'));
  assert.equal(vm.runInContext('API_URL',ctx),'/api/leituras/ultimas-24h?id_estacao=1');
  payload.historico=Array.from({length:50},(_,i)=>({...payload.historico[1],id_leitura:150-i}));
  await vm.runInContext('atualizarDashboard()',ctx);
  assert.equal((element('historyTableBody').innerHTML.match(/<tr>/g)||[]).length,8,'pagina compacta com oito linhas');
  vm.runInContext('limparHistorico()',ctx);
  await vm.runInContext('atualizarDashboard()',ctx);
  assert.equal(vm.runInContext('historicoTabela.length',ctx),0,'polling nao restaura registros limpos');
  payload.historico.unshift({...payload.historico[0],id_leitura:151});
  payload.historico.pop();
  await vm.runInContext('atualizarDashboard()',ctx);
  assert.equal(vm.runInContext('historicoTabela.length',ctx),1,'novas leituras aparecem apos limpar');
  vm.runInContext('ocultarAteId=0;',ctx);
  await vm.runInContext('atualizarDashboard()',ctx);
  assert.equal(vm.runInContext('historicoTabela.length',ctx),50,'historico pode ser restaurado');
  vm.runInContext('alertDismissed=false; verificarAlertas({temperatura:24,umidade:50,qualidade_ar:2000})',ctx);
  assert.ok(!element('alertBanner').classList.values.has('hidden'),'limiar de acompanhamento gera aviso');
  vm.runInContext('verificarAlertas({temperatura:24,umidade:50,qualidade_ar:null},{qualidade_ar:"outlier_temporal"})',ctx);
  assert.ok(!element('alertBanner').classList.values.has('hidden'),'variacao filtrada gera aviso');
  assert.match(element('alertTitle').innerText,/ALERTA/);
  assert.match(element('alertDesc').innerText,/sensor/);
  vm.runInContext('estacaoAtual=true; renderizarDados({qualidade_ar:null,adc_bruto:{qualidade_ar:250},estado_sensores:{qualidade_ar:"aquecendo"}},false)',ctx);
  assert.equal(element('valAir').innerText,'Aquecendo');
  assert.match(element('stAir').innerText,/Cálculo de PPM aguardando/);
  assert.match(element('stAir').innerText,/3 minutos/);
  assert.match(element('mqRaw').innerText,/250 \/ 4095 ADC/);
  assert.equal(element('airUnit').hidden,true);
  vm.runInContext('renderizarDados({qualidade_ar:20,estado_sensores:{qualidade_ar:"estimativa"}},false)',ctx);
  assert.equal(element('valAir').innerText,'20');
  assert.equal(element('airUnit').hidden,false);
  assert.ok(!element('valAir').classList.values.has('is-warming'));
  vm.runInContext('estacaoAtual=true; renderizarDados({qualidade_ar:null,adc_bruto:{qualidade_ar:0},estado_sensores:{qualidade_ar:"sinal_baixo"}},false)',ctx);
  assert.match(element('stAir').innerText,/limite inferior/);
  vm.runInContext('renderizarDados({qualidade_ar:null,estado_sensores:{qualidade_ar:"abaixo_faixa"}},false)',ctx);
  assert.equal(element('valAir').innerText,'<10');
  vm.runInContext('renderizarDados({qualidade_ar:null,estado_sensores:{qualidade_ar:"acima_faixa"}},false)',ctx);
  assert.equal(element('valAir').innerText,'>300');
  vm.runInContext('renderizarDados({qualidade_ar:null,adc_bruto:{qualidade_ar:0}},false)',ctx);
  // Replay do pico observado, incluindo transicao de texto para numero.
  payload.historico=[{id_leitura:500,data_hora:new Date().toISOString(),qualidade_ar:null,
    adc_bruto:{qualidade_ar:712.5},estado_sensores:{qualidade_ar:'abaixo_faixa'}}];
  payload.esp32_ativo=true;
  await vm.runInContext('atualizarDashboard()',ctx);
  assert.equal(element('valAir').innerText,'<10');
  for (const ppm of [16.86,114.53,54.08,24.47]) {
    payload.historico.unshift({...payload.historico[0],id_leitura:payload.historico[0].id_leitura+1,
      qualidade_ar:ppm,adc_bruto:{qualidade_ar:1824.875},estado_sensores:{qualidade_ar:'estimativa'}});
    await vm.runInContext('atualizarDashboard()',ctx);
    assert.equal(element('valAir').innerText,String(ppm),'PPM numerico substitui <10');
  }
  assert.match(element('mqPeak').innerText,/114,53 ppm/,'pico breve permanece identificado no historico recente');
  vm.runInContext('renderizarDados({qualidade_ar:114.53,estado_sensores:{qualidade_ar:"abaixo_faixa"}},false)',ctx);
  assert.equal(element('valAir').innerText,'114.53','valor numerico prevalece sobre metadado de faixa');
  payload.historico.unshift({...payload.historico[0],id_leitura:600,qualidade_ar:null,estado_sensores:{qualidade_ar:'abaixo_faixa'}});
  await vm.runInContext('atualizarDashboard()',ctx);
  assert.equal(element('valAir').innerText,'<10','retorno a faixa baixa nao fica preso no pico');
  assert.match(element('mqPeak').innerText,/114,53 ppm/);
  vm.runInContext('atualizarPicoMq135([{data_hora:"2026-11-02T18:03:00Z",qualidade_ar:null},{data_hora:"2026-11-02T18:00:00Z",qualidade_ar:114.53}])',ctx);
  assert.match(element('mqPeak').innerText,/sem PPM numérico/,'pico expirado nao parece recente');
  // Uma unica escrita por descricao; respostas iguais nao reiniciam animacao.
  vm.runInContext('estacaoAtual=true; renderizarDados({qualidade_ar:null,mq135_modo_teste:true,mq135_ppm_simulado:164.32,estado_sensores:{qualidade_ar:"simulacao"}},false)',ctx);
  assert.equal(element('valAir').innerText,'164.32');
  assert.equal(element('airUnit').innerText,'PPM simulado');
  assert.match(element('stAir').innerText,/referência virtual de 0,050 V/);
  assert.equal(element('compLocalAirUnit').innerText,'PPM simulado');
  vm.runInContext('renderizarDados({qualidade_ar:null,mq135_modo_teste:true,mq135_ppm_simulado:1200,estado_sensores:{qualidade_ar:"simulacao"}},false)',ctx);
  assert.equal(element('valAir').innerText,'1200');
  assert.match(element('stAir').innerText,/extrapolação/);
  vm.runInContext('renderizarDados({qualidade_ar:null,mq135_modo_teste:true,estado_sensores:{qualidade_ar:"acima_faixa"}},false)',ctx);
  assert.equal(element('valAir').innerText,'>1000');
  vm.runInContext('renderizarDados({qualidade_ar:null,mq135_modo_teste:true,mq135_ppm_simulado:null,adc_bruto:{qualidade_ar:2377.5},mq135_tensao_adc_v:0.623625,estado_sensores:{qualidade_ar:"acima_faixa"}},false)',ctx);
  assert.equal(element('valAir').innerText,'>1000','replay do pico recebido da placa usa limite de 1000 da simulacao');


  vm.runInContext('renderizarDados({qualidade_ar:24.47,estado_sensores:{qualidade_ar:"estimativa"}},false)',ctx);
  assert.equal(element('airUnit').innerText,'PPM estimado');
  vm.runInContext('renderizarDados({qualidade_ar:null,estado_sensores:{qualidade_ar:"erro_leitura"}},false)',ctx);
  const statusEl=element('stAir'); let text=statusEl.innerText, writes=0;
  Object.defineProperty(statusEl,'innerText',{configurable:true,get(){return text;},set(v){text=v;writes++;}});
  vm.runInContext('estacaoAtual=true; renderizarDados({qualidade_ar:42,estado_sensores:{qualidade_ar:"estimativa"}},false)',ctx);
  assert.equal(writes,1,'descricao final escrita uma unica vez');
  vm.runInContext('renderizarDados({qualidade_ar:42,estado_sensores:{qualidade_ar:"estimativa"}},false)',ctx);
  assert.equal(writes,1,'descricao identica nao altera DOM');
  const numberEl=element('valAir'); let animations=0;
  numberEl.animate=()=>{animations++;}; numberEl.getAnimations=()=>[];
  vm.runInContext('animarValorSeMudou(document.getElementById("valAir"),42)',ctx);
  assert.equal(animations,0,'numero identico nao anima');
  ctx.window.matchMedia=()=>({matches:false});
  vm.runInContext('animarValorSeMudou(document.getElementById("valAir"),43)',ctx);
  assert.equal(animations,1,'mudanca anima uma unica vez');
  const NativeDate=ctx.Date; let timerNow=NativeDate.now();
  ctx.Date=class extends NativeDate {static now(){return timerNow;}};
  vm.runInContext('estacaoAtual=true; ultimaRespostaApi=Date.now(); configurarContadorMq({mq135_aquecimento_restante_ms:65000,estado_sensores:{qualidade_ar:"aquecendo"}},false)',ctx);
  assert.match(element('mqWarmup').innerText,/01:05/);
  timerNow+=1000;
  vm.runInContext('atualizarContadorMq()',ctx);
  assert.match(element('mqWarmup').innerText,/01:04/,'contador avanca sem nova resposta');
  timerNow+=11000;
  vm.runInContext('atualizarContadorMq()',ctx);
  assert.match(element('mqWarmup').innerText,/Contagem pausada/);
  vm.runInContext('ultimaRespostaApi=Date.now(); configurarContadorMq({mq135_aquecimento_restante_ms:12000,estado_sensores:{qualidade_ar:"aquecendo"}},false)',ctx);
  assert.match(element('mqWarmup').innerText,/00:12/,'nova resposta usa tempo da placa, nao reinicia 3 min');
  vm.runInContext('configurarContadorMq({mq135_aquecimento_restante_ms:0,estado_sensores:{qualidade_ar:"aquecendo"}},false)',ctx);
  assert.equal(element('mqWarmup').hidden,true,'contador oculto quando tempo restante chega a zero');
  vm.runInContext('configurarContadorMq({estado_sensores:{qualidade_ar:"estimativa"}},false)',ctx);
  assert.equal(element('mqWarmup').hidden,true);
  ctx.Date=NativeDate;
  // Restaura a amostra de telemetria usada no teste de desconexao.
  await vm.runInContext('atualizarDashboard()',ctx);
  payload.esp32_ativo=false;
  payload.historico=[{...payload.historico[0],data_hora:new Date(Date.now()-60000).toISOString()}];
  await vm.runInContext('atualizarDashboard()',ctx);
  const rawEl=element('mqRaw'); let rawText=rawEl.innerText, rawWrites=0;
  Object.defineProperty(rawEl,'innerText',{configurable:true,get(){return rawText;},set(v){rawText=v;rawWrites++;}});
  const staleText=rawEl.innerText;
  vm.runInContext('verificarAtualidade(); verificarAtualidade();',ctx);
  assert.equal(rawEl.innerText,staleText,'temporizador e polling usam a mesma mensagem de sinal antigo');
  assert.equal(rawWrites,0,'temporizador nao reescreve diagnostico identico');
  await vm.runInContext('atualizarDashboard()',ctx);
  assert.equal(rawWrites,0,'polling nao alterna o texto do sinal antigo');
  ctx.fetch=async()=>{throw new Error('queda de conexão simulada');};
  await vm.runInContext('atualizarDashboard()',ctx);
  assert.match(element('mqRaw').innerText,/Sem atualização/);
  assert.match(element('mqRaw').innerText,/1824,875 \/ 4095 ADC/,'queda preserva último sinal');
  console.log('Dashboard: null, historico persistido, deduplicacao, coordenadas zero e endpoint OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
