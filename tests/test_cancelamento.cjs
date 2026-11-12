const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements=new Map();function el(id){if(!elements.has(id))elements.set(id,{innerText:'',dataset:{},classList:{add(){},remove(){},toggle(){}},style:{}});return elements.get(id)}
let now=0,next=0,timers=new Map(),calls=0;
const ctx=vm.createContext({console:{log(){},warn(){}},URL,AbortController,Date,Math,Number,JSON,window:{location:{href:'http://localhost/',hostname:'localhost'}},document:{readyState:'loading',addEventListener(){},getElementById:el,querySelectorAll(){return[]}},localStorage:{getItem(){return null}},setInterval(){},setTimeout(fn,delay){const id=++next;timers.set(id,{fn,at:now+delay});return id},clearTimeout(id){timers.delete(id)}});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../dashboard/app.js'),'utf8'),ctx);
vm.runInContext('marcarSinalMqDesatualizado=()=>{}; atualizarContadorMq=()=>{}; suspenderAlertas=()=>{}; atualizarComparativoLadoALado=()=>{};',ctx);
ctx.fetch=async(url,options)=>{calls++;return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('timeout'),{name:'AbortError'}))))};
let finished=false;process.on('beforeExit',()=>{assert.ok(finished,'Teste deve concluir todas as promessas');});
(async()=>{
 const waiting=vm.runInContext('atualizarDashboard()',ctx);await vm.runInContext('atualizarDashboard()',ctx);assert.equal(calls,1,'Uma consulta pendente impede sobreposicao');
 now=3500;for(const[id,timer]of timers)if(timer.at<=now){timers.delete(id);timer.fn()};await waiting;
 assert.equal(vm.runInContext('consultaEmAndamento',ctx),false);assert.equal(el('apiStatus').innerText,'API indispon\u00edvel');assert.equal(el('statusText').innerText,'Desconectado');assert.ok(!timers.size,'Timeout e removido apos falha');
 ctx.fetch=async(url,options)=>{calls++;return{ok:true,json:()=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('body timeout'),{name:'AbortError'}))))}};
 const bodyWaiting=vm.runInContext('atualizarDashboard()',ctx);await new Promise(setImmediate);now=7000;for(const[id,timer]of timers)if(timer.at<=now){timers.delete(id);timer.fn()};await bodyWaiting;assert.equal(calls,2);assert.equal(vm.runInContext('consultaEmAndamento',ctx),false,'Corpo interrompido tambem libera proxima tentativa');
 ctx.fetch=async()=>{calls++;return{ok:false,status:503}};await vm.runInContext('atualizarDashboard()',ctx);assert.equal(calls,3,'A falha anterior libera nova tentativa');assert.equal(vm.runInContext('consultaEmAndamento',ctx),false);assert.ok(!timers.size);vm.runInContext('atualizarEstatisticas=()=>{}; atualizarSerieGrafico=()=>{}; renderizarTabelaHistorico=()=>{}; atualizarPicoMq135=()=>{}; renderizarDados=(data)=>{globalThis.recuperado=data.id_leitura};',ctx);
 ctx.fetch=async()=>{calls++;return{ok:true,json:async()=>({historico:[{id_leitura:42}],esp32_ativo:true,estatisticas_24h:{}})}};await vm.runInContext('atualizarDashboard()',ctx);assert.equal(ctx.recuperado,42,'Nova resposta e exibida apos as falhas');assert.ok(vm.runInContext('ultimaRespostaApi',ctx)>0);assert.equal(calls,4);assert.ok(!timers.size);
 finished=true;console.log('Cancelamento: 3,5 s, sem sobreposicao, sinalizacao de falha e liberacao da recuperacao verificados.');
})().catch(e=>{console.error(e);process.exitCode=1});
