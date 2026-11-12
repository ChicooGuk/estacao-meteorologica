(() => {
  const $ = id => document.getElementById(id);
  const base = window.ESTACAO_API_BASE || '';
  let run = null, stopped = true;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  function refresh() {
    const records = run?.records || [];
    const fails = records.filter(x => !x.ok).length;
    const elapsed = run ? Math.floor((performance.now() - run.started_monotonic) / 1000) : 0;
    $('status').textContent = `${stopped ? 'Teste encerrado' : 'Teste em andamento'}\nTempo: ${elapsed} s / ${(run?.duration_s || 0)} s\nConsultas: ${records.length}\nFalhas: ${fails}\nPágina: ${document.visibilityState}\n${run?.clock ? 'Relógio comparado com a API.' : 'Aguardando comparação de relógio.'}`;
  }
  async function probe(kind) {
    const id = `diag-pc-${crypto.randomUUID()}`;
    const route = kind === 'saude' ? '/api/saude' : '/api/leituras/ultimas-24h?id_estacao=1';
    const url = `${base}${route}${route.includes('?') ? '&' : '?'}diag_id=${id}`;
    const controller = new AbortController();
    const start = performance.now(), wall = Date.now();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const record = {kind, diag_id:id, inicio_ms:wall, visibility:document.visibilityState};
    try {
      const response = await fetch(url, {signal:controller.signal, cache:'no-store'});
      record.cabecalhos_ms = performance.now() - start;
      record.status = response.status;
      record.request_id = response.headers.get('X-Request-ID');
      record.server_timing = response.headers.get('Server-Timing');
      const data = await response.json();
      record.corpo_ms = performance.now() - start;
      record.ok = response.ok;
      if (kind === 'saude' && data.status === 'ok') {
        const offset = data.servidor_utc * 1000 - (wall + record.corpo_ms/2);
        record.offset_servidor_menos_cliente_ms = offset;
        if (!run.clock) run.clock = {offset_ms:offset,incerteza_rede_ms:record.corpo_ms/2};
      } else if (kind === 'telemetria') {
        record.id_leitura = data.historico?.[0]?.id_leitura;
        record.estacao_ativa = data.esp32_ativo;
      }
    } catch (error) {record.ok=false;record.erro=error.name;record.duracao_ms=performance.now()-start;}
    finally {clearTimeout(timeout);record.fim_ms=Date.now();run.records.push(record);refresh();}
  }
  document.addEventListener('visibilitychange',()=>{if(run&&!stopped)run.visibility.push({t:Date.now(),state:document.visibilityState});});
  $('stop').onclick=()=>{stopped=true;};
  $('start').onclick=async()=>{
    if(!stopped)return;
    stopped=false;
    run={version:1,client:'PC externo informado pelo operador',api:base,duration_s:Number($('minutes').value)*60,started:Date.now(),started_monotonic:performance.now(),records:[],visibility:[],clock:null};
    $('start').disabled=true;$('minutes').disabled=true;$('stop').disabled=false;$('download').disabled=true;
    const deadline=performance.now()+run.duration_s*1000;
    try {
      while(!stopped&&performance.now()<deadline){
        const next=performance.now()+5000;
        await Promise.all([probe('saude'),probe('telemetria')]);
        await pause(Math.max(0,Math.min(next-performance.now(),deadline-performance.now())));
      }
    } finally {
      run.finished=Date.now();run.completed=performance.now()>=deadline;stopped=true;
      $('start').disabled=false;$('minutes').disabled=false;$('stop').disabled=true;$('download').disabled=false;refresh();
    }
  };
  $('download').onclick=()=>{
    if(!run)return;
    const a=document.createElement('a');const url=URL.createObjectURL(new Blob([JSON.stringify(run,null,2)],{type:'application/json'}));
    a.href=url;a.download=`diagnostico-pc-${new Date(run.started).toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
})();
