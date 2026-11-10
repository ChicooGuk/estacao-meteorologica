// ==============================================================================
// PROJETO: Estação Meteorológica Inteligente com ESP32
// ARQUIVO: app.js (Lógica Frontend do Dashboard com Mapa, Gráficos e Alertas)
// ==============================================================================

// Operação independente, rápida e resiliente
console.log("[SISTEMA] Dashboard da Estação Meteorológica Inicializado.");

// ------------------------------------------------------------------------------
// 2. CONFIGURAÇÕES DE REDE E ENDPOINT DO ESP32
// ------------------------------------------------------------------------------
// Padrao: dashboard servido pela FastAPI em http://<computador>:8000/.
// Hospedagem separada pode definir window.ESTACAO_API_BASE antes deste script.
const API_URL = `${window.ESTACAO_API_BASE || ''}/api/leituras/ultimas-24h?id_estacao=1`;
let consultaEmAndamento = false;
let estacaoAtual = false;
let ultimaRespostaApi = 0;
const formatarNumero = (v, casas = 1) => Number.isFinite(v) ? v.toFixed(casas) : '--';

// ------------------------------------------------------------------------------
// 3. RELÓGIO EM TEMPO REAL
// ------------------------------------------------------------------------------
setInterval(() => {
  const clockEl = document.getElementById('clock');
  if (clockEl) {
    clockEl.innerText = new Date().toLocaleTimeString('pt-BR');
  }
}, 1000);

// ------------------------------------------------------------------------------
// 4. MAPA INTERATIVO (LEAFLET.JS) E SINCRONIZAÇÃO DE LOCALIZAÇÃO REAL
// ------------------------------------------------------------------------------
const DEFAULT_LAT = -23.630317684911716;
const DEFAULT_LNG = -46.694328195767014;

let map = null;
let stationMarker = null;
let gpsAccuracyCircle = null;
let userGpsActive = false;
let melhorPrecisaoGps = Infinity;
let currentCoords = { lat: DEFAULT_LAT, lng: DEFAULT_LNG, source: 'Padrão (SP)', bairro: '', accuracy: null };
let modoComparativo = 'local';
let coordenadasComparadas = '';

function salvarCoordenadasLocais(lat, lng, fonte) {
  try {
    localStorage.setItem('estacao_lat', lat.toString());
    localStorage.setItem('estacao_lng', lng.toString());
    localStorage.setItem('estacao_source', fonte);
  } catch (e) {}
}

function inicializarMapa() {
  try {
    if (typeof L === 'undefined') return;

    const initialLat = DEFAULT_LAT;
    const initialLng = DEFAULT_LNG;
    const savedSource = 'Localização aproximada';

    map = L.map('map', {
      zoomControl: true,
      attributionControl: true
    }).setView([initialLat, initialLng], 16);

    // --------------------------------------------------------------------------
    // Camadas de Mapa de Alta Definição com Nomes de Ruas, Avenidas e Bairros
    // --------------------------------------------------------------------------
    
    // 1. Google Streets: Exibe 100% dos nomes de ruas, avenidas, bairros e praças
    const googleStreets = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '&copy; Google Maps'
    });

    // 2. Google Hybrid: Foto de satélite com nomes de ruas e bairros sobrepostos
    const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '&copy; Google Satélite / Ruas'
    });

    // 3. Esri World Street Map: Detalhamento completo de vias e bairros
    const esriStreets = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: '&copy; Esri World Street Map'
    });

    // 4. OpenStreetMap Standard
    const osmStandard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    });

    // ADICIONA O MAPA DE RUAS E BAIRROS COMO PADRÃO (Sem telas escuras ou vazias)
    googleStreets.addTo(map);

    // Controle interativo para alternar visualizações
    L.control.layers({
      "Ruas e Bairros (Google)": googleStreets,
      "Satélite com Ruas (Híbrido)": googleHybrid,
      "Mapa Esri Streets": esriStreets,
      "OpenStreetMap": osmStandard
    }, null, { position: 'topright' }).addTo(map);

    // Marcador da Estação — Arrastável para ajuste fino
    stationMarker = L.marker([initialLat, initialLng], {
      draggable: false,
      title: "Posição cadastrada da estação"
    }).addTo(map);

    stationMarker.on('drag', mostrarCoordenadasAjuste);
    map.on('click', event => { if (!editandoLocalizacao) mostrarDistanciaMapa(event.latlng); });
    document.getElementById('btnEditLocation').addEventListener('click', iniciarAjusteLocalizacao);
    document.getElementById('btnCancelLocation').addEventListener('click', cancelarAjusteLocalizacao);
    document.getElementById('locationForm').addEventListener('submit', salvarAjusteLocalizacao);

    stationMarker.bindPopup(`
      <div style="font-size:0.85rem; line-height:1.45; font-family:'Plus Jakarta Sans', sans-serif;">
        <strong style="color:var(--accent-forest); font-weight:700;">Localização da Estação</strong><br>
        <span id="popupLocationTitle" style="color:#141712; font-weight:600;">${savedSource}</span><br>
        <span id="popupData" style="color:#586152;">Aguardando telemetria...</span><br>
        <small style="color:#828B7C;">(Coordenadas do cadastro da estação)</small>
      </div>
    `);

    // Atualiza barra de coordenadas inicial
    if (stationMarker) stationMarker.setOpacity(0); // Exibir somente apos cadastro da API.

  } catch (err) {
    console.warn("[MAPA] Erro ao carregar Leaflet:", err);
  }
}

// Coordenadas esfericas para distancia e vetor cartesiano local (leste/norte).
function geometriaEntrePontos(origem, destino) {
  const valores = [origem.lat, origem.lng, destino.lat, destino.lng];
  if (!valores.every(Number.isFinite) || Math.abs(origem.lat)>90 || Math.abs(destino.lat)>90 || Math.abs(origem.lng)>180 || Math.abs(destino.lng)>180) return null;
  const rad = Math.PI / 180, raio = 6371008.8;
  const lat1=origem.lat*rad, lat2=destino.lat*rad;
  const dlat=lat2-lat1, dlon=((destino.lng-origem.lng+540)%360-180)*rad;
  const a=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;
  const distancia=2*raio*Math.atan2(Math.sqrt(Math.min(1,a)),Math.sqrt(Math.max(0,1-a)));
  return {distancia, leste:raio*dlon*Math.cos((lat1+lat2)/2), norte:raio*dlat};
}
let pontoMedicao = null;
let linhaMedicao = null;
function mostrarDistanciaMapa(destino) {
  if (!ultimaLocalizacaoSalva) return;
  pontoMedicao=destino;
  const g=geometriaEntrePontos(ultimaLocalizacaoSalva,destino);
  if (!g) return;
  escreverTexto('mapDistance', `Distância em linha geodésica: ${g.distancia.toLocaleString('pt-BR',{maximumFractionDigits:1})} m. Vetor local aproximado (leste, norte): (${g.leste.toFixed(1)}, ${g.norte.toFixed(1)}) m. Origem: estação cadastrada. Não representa trajeto por ruas.`);
  if (linhaMedicao) linhaMedicao.remove();
  if (map && typeof L.polyline === 'function') linhaMedicao=L.polyline([[ultimaLocalizacaoSalva.lat,ultimaLocalizacaoSalva.lng],[destino.lat,destino.lng]],{color:'#c07813',dashArray:'6 6'}).addTo(map);
}

let editandoLocalizacao = false;
let salvandoLocalizacao = false;
let ultimaLocalizacaoSalva = null;

function mostrarCoordenadasAjuste() {
  const ponto = stationMarker.getLatLng();
  document.getElementById('geoLat').innerText = ponto.lat.toFixed(6);
  document.getElementById('geoLng').innerText = ponto.lng.toFixed(6);
}
function iniciarAjusteLocalizacao() {
  if (!stationMarker || salvandoLocalizacao) return;
  editandoLocalizacao = true;
  document.getElementById('locationForm').hidden = false;
  document.getElementById('btnEditLocation').hidden = true;
  document.getElementById('locationStatus').innerText = 'Arraste o marcador. A alteração só será aplicada ao salvar.';
  const ponto = ultimaLocalizacaoSalva || {lat: DEFAULT_LAT, lng: DEFAULT_LNG};
  stationMarker.setLatLng([ponto.lat, ponto.lng]).setOpacity(1);
  stationMarker.dragging.enable();
  map.setView([ponto.lat, ponto.lng], 18);
  mostrarCoordenadasAjuste();
}
function cancelarAjusteLocalizacao() {
  if (salvandoLocalizacao) return;
  editandoLocalizacao = false;
  stationMarker.dragging.disable();
  document.getElementById('locationForm').hidden = true;
  document.getElementById('btnEditLocation').hidden = false;
  document.getElementById('locationAdminKey').value = '';
  if (ultimaLocalizacaoSalva) {
    atualizarCoordenadasMapa(ultimaLocalizacaoSalva.lat, ultimaLocalizacaoSalva.lng, 'Cadastro da estação');
  } else {
    stationMarker.setOpacity(0);
    document.getElementById('geoLat').innerText = '--';
    document.getElementById('geoLng').innerText = '--';
  }
  document.getElementById('locationStatus').innerText = '';
}
async function salvarAjusteLocalizacao(event) {
  event.preventDefault();
  if (!editandoLocalizacao || salvandoLocalizacao) return;
  const chave = document.getElementById('locationAdminKey').value;
  if (!chave) return;
  const ponto = stationMarker.getLatLng();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const status = document.getElementById('locationStatus');
  salvandoLocalizacao = true;
  stationMarker.dragging.disable();
  document.getElementById('btnSaveLocation').disabled = true;
  try {
    const resposta = await fetch(`${window.ESTACAO_API_BASE || ''}/api/estacoes/1/localizacao`, {
      method: 'PUT', signal: controller.signal,
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${chave}`,
        ...(window.ESTACAO_API_BASE ? {'ngrok-skip-browser-warning': '1'} : {})},
      body: JSON.stringify({latitude: ponto.lat, longitude: ponto.lng})
    });
    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({}));
      throw new Error(typeof erro.detail === 'string' ? erro.detail : 'Falha ao salvar. Verifique o backend e a permissão UPDATE no MySQL.');
    }
    const salva = await resposta.json();
    ultimaLocalizacaoSalva = {lat: salva.latitude, lng: salva.longitude};
    salvandoLocalizacao = false;
    cancelarAjusteLocalizacao();
    status.innerText = 'Localização salva no banco. Aproximada, definida manualmente.';
  } catch (erro) {
    status.innerText = erro.name === 'AbortError' ? 'Tempo esgotado. Confira a conexão e tente novamente.' : erro.message;
    stationMarker.dragging.enable();
  } finally {
    clearTimeout(timer);
    salvandoLocalizacao = false;
    document.getElementById('btnSaveLocation').disabled = false;
    document.getElementById('locationAdminKey').value = '';
  }
}

function atualizarCoordenadasMapa(lat, lng, fonte = 'GPS Dispositivo', precisao = null) {
  if (fonte !== 'Cadastro da estação' || editandoLocalizacao) return;
  const mudou = currentCoords.lat !== lat || currentCoords.lng !== lng;
  currentCoords = { lat, lng, source: fonte };
  if (pontoMedicao) mostrarDistanciaMapa(pontoMedicao);
  if (stationMarker) stationMarker.setLatLng([lat, lng]);
  if (map && mudou) map.setView([lat, lng], 16, { animate: false });

  const geoLatEl = document.getElementById('geoLat');
  const geoLngEl = document.getElementById('geoLng');
  const geoSourceEl = document.getElementById('geoSource');
  const geoAccuracyEl = document.getElementById('geoAccuracy');
  const popupTitleEl = document.getElementById('popupLocationTitle');

  if (geoLatEl) geoLatEl.innerText = lat.toFixed(5);
  if (geoLngEl) geoLngEl.innerText = lng.toFixed(5);
  if (geoSourceEl) geoSourceEl.innerText = 'Definida manualmente';
  if (geoAccuracyEl) geoAccuracyEl.innerText = 'Aproximada';
  if (popupTitleEl) popupTitleEl.innerText = `${fonte} (Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)})`;
  if (modoComparativo === 'local' && ultimaLocalizacaoSalva && coordenadasComparadas !== `${lat},${lng}`) {
    obterDadosComparativos('local');
  }
}

// Geocodificação reversa para descobrir o nome da rua, bairro e cidade pela latitude/longitude
async function identificarBairroReverso(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const resp = await fetch(url);
    if (!resp.ok) return;
    const data = await resp.json();
    const end = data.address || {};
    
    const rua = end.road || end.pedestrian || end.street || end.residential || '';
    const bairro = end.suburb || end.neighbourhood || end.city_district || end.quarter || '';
    const cidade = end.city || end.town || end.municipality || end.village || 'São Paulo';

    let localFormatado = '';
    if (rua && bairro) {
      localFormatado = `${rua}, ${bairro}`;
    } else if (rua) {
      localFormatado = `${rua}${cidade ? ', ' + cidade : ''}`;
    } else if (bairro && cidade) {
      localFormatado = `${bairro}, ${cidade}`;
    } else {
      localFormatado = bairro || cidade || 'Localização Detectada';
    }
    
    currentCoords.bairro = localFormatado;

    const geoSourceEl = document.getElementById('geoSource');
    if (geoSourceEl) geoSourceEl.innerText = localFormatado;

    const popupTitleEl = document.getElementById('popupLocationTitle');
    if (popupTitleEl) popupTitleEl.innerText = localFormatado;

    salvarCoordenadasLocais(lat, lng, localFormatado);

    // Se estiver no modo de comparação local, atualiza imediatamente os rótulos
    if (modoComparativo === 'local') {
      const compMetaStation = document.getElementById('compMetaStation');
      const compOfficialBadgeTexts = document.querySelectorAll('.comp-official-badge-text');
      if (compMetaStation) {
        compMetaStation.innerText = `Sua Região: ${localFormatado} (GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      }
      compOfficialBadgeTexts.forEach(el => {
        el.innerText = `${localFormatado.split('—')[0].split(',')[0].trim()} (Oficial)`;
      });
    }
  } catch (e) {
    console.warn("[GEOCODING] Falha ao obter endereço reverso:", e);
  }
}

// A posicao da estação vem exclusivamente da API.
function sincronizarLocalizacaoDispositivo() {}
let buscandoCep = false;
let marcadorCep = null;
async function buscarLocalizacaoPorTexto() {
  const input = document.getElementById('inputAddressSearch');
  const status = document.getElementById('cepStatus');
  const cep = (input?.value || '').replace(/\D/g, '');
  if (cep.length !== 8) { status.innerText = 'Digite um CEP com 8 dígitos.'; return; }
  if (buscandoCep) return;
  if (!map) { status.innerText = 'O mapa não está disponível. Recarregue a página.'; return; }
  buscandoCep = true;
  const botao = document.getElementById('btnSearchAddress');
  botao.disabled = true;
  status.innerText = 'Buscando endereço…';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {signal: controller.signal});
    if (!resposta.ok) throw new Error(resposta.status === 404 ? 'CEP não encontrado.' : 'Serviço de CEP indisponível. Tente novamente.');
    const endereco = await resposta.json();
    if (endereco.erro) throw new Error('CEP não encontrado.');
    const descricao = [endereco.logradouro, endereco.bairro, endereco.localidade, endereco.uf].filter(Boolean).join(', ');
    const pontoResposta = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&postalcode=${cep.slice(0,5)}-${cep.slice(5)}&limit=1`, {signal: controller.signal});
    if (!pontoResposta.ok) throw new Error(`${descricao}. Serviço do mapa indisponível. Tente novamente.`);
    let pontos = await pontoResposta.json();
    let origemPonto = 'CEP';
    if (!pontos.length && endereco.logradouro && endereco.localidade) {
      status.innerText = `${descricao}. Localizando a rua…`;
      const parametros = new URLSearchParams({format:'jsonv2', countrycodes:'br', limit:'1',
        street:endereco.logradouro, city:endereco.localidade, state:endereco.estado || endereco.uf});
      const ruaResposta = await fetch(`https://nominatim.openstreetmap.org/search?${parametros}`, {signal:controller.signal});
      if (!ruaResposta.ok) throw new Error(`${descricao}. Serviço do mapa indisponível. Tente novamente.`);
      pontos = await ruaResposta.json();
      origemPonto = 'Rua';
    }
    const coords = pontos[0];
    const lat = coords?.lat == null || coords.lat === '' ? NaN : Number(coords.lat);
    const lng = coords?.lon == null || coords.lon === '' ? NaN : Number(coords.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) {
      status.innerText = `${descricao}. Não foi possível localizar o CEP ou a rua; ajuste o ponto manualmente no mapa.`;
      return;
    }
    map.setView([lat, lng], 17);
    if (marcadorCep) { marcadorCep.remove(); marcadorCep = null; }
    if (editandoLocalizacao && !salvandoLocalizacao) {
      stationMarker.setLatLng([lat, lng]);
      mostrarCoordenadasAjuste();
      status.innerText = `${descricao}. ${origemPonto}: ponto aproximado, sem número. Confira e ajuste o marcador antes de clicar em Salvar localização.`;
    } else {
      marcadorCep = L.circleMarker([lat,lng], {radius:8,color:'#2563eb',fillOpacity:0.4}).addTo(map).bindTooltip(`${origemPonto}: ponto aproximado, sem número`);
      status.innerText = `${descricao}. ${origemPonto}: consulta aproximada, sem número. Para cadastrar a estação aqui, clique em Ajustar localização e busque o CEP novamente.`;
    }
  } catch (erro) {
    status.innerText = erro.name === 'AbortError' ? 'A busca demorou demais. Tente novamente.' : erro.message;
  } finally {
    clearTimeout(timeout);
    buscandoCep = false;
    botao.disabled = false;
  }
}

let sensorChart = null;
let assinaturaGrafico = '';
const movimentoReduzido = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
const MAX_DATA_POINTS = 25; // Mantém as últimas 25 leituras na tela

function inicializarGrafico() {
  try {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('sensorChart').getContext('2d');
    
    sensorChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Temperatura (°C)',
            borderColor: '#C84A38',
            backgroundColor: 'rgba(200, 74, 56, 0.08)',
            data: [],
            yAxisID: 'y',
            tension: 0.35,
            borderWidth: 2.2,
            pointRadius: 2.5,
            pointBackgroundColor: '#C84A38'
          },
          {
            label: 'Umidade (%)',
            borderColor: '#2B6C85',
            backgroundColor: 'rgba(43, 108, 133, 0.08)',
            data: [],
            yAxisID: 'y',
            tension: 0.35,
            borderWidth: 2.2,
            pointRadius: 2.5,
            pointBackgroundColor: '#2B6C85'
          },
          {
            label: 'Qualidade do Ar (PPM)',
            borderColor: '#385E32',
            backgroundColor: 'rgba(56, 94, 50, 0.08)',
            data: [],
            yAxisID: 'y1',
            tension: 0.35,
            borderWidth: 2.2,
            pointRadius: 2.5,
            pointBackgroundColor: '#385E32'
          }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#586152',
              font: { family: "'Plus Jakarta Sans', sans-serif", size: 11, weight: 600 },
              boxWidth: 10,
              usePointStyle: true
            }
          },
          tooltip: {
            backgroundColor: '#1E251B',
            titleColor: '#FFFFFF',
            bodyColor: '#DFE7D6',
            borderColor: 'rgba(255, 255, 255, 0.12)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 10,
            titleFont: { family: "'Plus Jakarta Sans', sans-serif", weight: 600 },
            bodyFont: { family: "'Space Grotesk', monospace" }
          }
        },
        scales: {
          x: {
            grid: { color: '#EEF0EA' },
            ticks: { color: '#828B7C', font: { family: "'Space Grotesk', monospace", size: 10 } }
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: { 
              display: true, 
              text: 'Temp (°C) / Umid (%)', 
              color: '#586152', 
              font: { family: "'Plus Jakarta Sans', sans-serif", size: 10, weight: 600 } 
            },
            grid: { color: '#EEF0EA' },
            ticks: { color: '#828B7C', font: { family: "'Space Grotesk', monospace", size: 10 } },
            suggestedMin: 0,
            suggestedMax: 100
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: { 
              display: true, 
              text: 'Ar (PPM)', 
              color: '#385E32', 
              font: { family: "'Plus Jakarta Sans', sans-serif", size: 10, weight: 600 } 
            },
            grid: { drawOnChartArea: false },
            ticks: { color: '#385E32', font: { family: "'Space Grotesk', monospace", size: 10 } },
            suggestedMin: 300,
            suggestedMax: 2000
          }
        }
      }
    });
  } catch (err) {
    console.warn("[CHART] Erro ao inicializar Chart.js:", err);
  }
}

// ------------------------------------------------------------------------------
// 6. BUFFER HISTÓRICO E CÁLCULO DE ESTATÍSTICAS
// ------------------------------------------------------------------------------
const historicoLeituras = [];

function atualizarEstatisticas(leitura, renderizar = true) {
  historicoLeituras.push(leitura);
  if (historicoLeituras.length > 50) {
    historicoLeituras.shift();
  }
  if (!renderizar) {
    adicionarAoHistorico(leitura, leitura.data_hora ? new Date(leitura.data_hora) : null, false);
    return;
  }

  const sampleCountEl = document.getElementById('sampleCount');
  if (sampleCountEl) sampleCountEl.innerText = `Amostras: ${historicoLeituras.length}`;

  const temps = historicoLeituras.map(l => l.temperatura).filter(v => typeof v === 'number');
  const umids = historicoLeituras.map(l => l.umidade).filter(v => typeof v === 'number');
  const airs = historicoLeituras.map(l => l.qualidade_ar).filter(v => typeof v === 'number');
  const press = historicoLeituras.map(l => l.pressao).filter(v => typeof v === 'number');

  if (temps.length > 0) {
    const maxT = Math.max(...temps);
    const minT = Math.min(...temps);
    document.getElementById('statTemp').innerText = `${maxT.toFixed(1)}°C / ${minT.toFixed(1)}°C`;
  }

  if (umids.length > 0) {
    const avgU = umids.reduce((a, b) => a + b, 0) / umids.length;
    document.getElementById('statUmid').innerText = `${avgU.toFixed(1)}%`;
  }

  if (airs.length > 0) {
    const maxAir = Math.max(...airs);
    document.getElementById('statAir').innerText = `${maxAir} PPM`;
  }

  if (press.length > 0) {
    const avgP = press.reduce((a, b) => a + b, 0) / press.length;
    document.getElementById('statPress').innerText = `${avgP.toFixed(1)} hPa`;
  }

  // Atualiza dados no Gráfico
  if (sensorChart) {
    const timeLabel = new Date(leitura.data_hora || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    if (sensorChart.data.labels.length >= MAX_DATA_POINTS) {
      sensorChart.data.labels.shift();
      sensorChart.data.datasets[0].data.shift();
      sensorChart.data.datasets[1].data.shift();
      sensorChart.data.datasets[2].data.shift();
    }

    sensorChart.data.labels.push(timeLabel);
    sensorChart.data.datasets[0].data.push(leitura.temperatura);
    sensorChart.data.datasets[1].data.push(leitura.umidade);
    sensorChart.data.datasets[2].data.push(leitura.qualidade_ar);
    sensorChart.stop?.();
    sensorChart.update('none');
  }

  // Atualiza Popup do Mapa
  const popupData = document.getElementById('popupData');
  if (popupData) {
    popupData.innerHTML = `
      Temp: <strong>${leitura.temperatura}°C</strong> | Umid: <strong>${leitura.umidade}%</strong><br>
      Pressão: <strong>${leitura.pressao} hPa</strong> | Ar: <strong>${leitura.qualidade_ar} PPM</strong>
    `;
  }

  // Adiciona registro à Tabela de Histórico
  adicionarAoHistorico(leitura, leitura.data_hora ? new Date(leitura.data_hora) : null);
}

// ------------------------------------------------------------------------------
// 6.1 TABELA DE HISTÓRICO DETALHADO E EXPORTAÇÃO CSV
// ------------------------------------------------------------------------------
const historicoTabela = [];
const REGISTROS_POR_PAGINA = 8;
let paginaHistorico = 0;
let ocultarAteId = 0;
try { ocultarAteId = Math.max(0, Number(localStorage.getItem('estacao_historico_ocultar_ate_1')) || 0); } catch (_) {}

function adicionarAoHistorico(leitura, customTime = null, renderizar = true) {
  if (Number.isFinite(leitura.id_leitura) && leitura.id_leitura <= ocultarAteId) return;
  const agora = customTime || new Date();
  const horaStr = agora.toLocaleTimeString('pt-BR');
  const dataStr = agora.toLocaleDateString('pt-BR');
  const fullTimestamp = `${dataStr} ${horaStr}`;

  let diagTexto = Object.values(leitura.qualidade || {}).includes('outlier_temporal') ? 'Leitura filtrada' : (['temperatura','umidade','pressao','qualidade_ar','luminosidade'].some(k => !Number.isFinite(leitura[k])) ? 'Dados parciais' : 'Normal');
  let diagClasse = 'tag-ok';

  if (leitura.temperatura > 34) {
    diagTexto = 'Calor';
    diagClasse = 'tag-alert';
  } else if (Number.isFinite(leitura.umidade) && leitura.umidade < 30) {
    diagTexto = 'Ar Seco';
    diagClasse = 'tag-warn';

  }

  const registro = {
    timestamp: fullTimestamp,
    temperatura: Number.isFinite(leitura.temperatura) ? leitura.temperatura : null,
    umidade: Number.isFinite(leitura.umidade) ? leitura.umidade : null,
    pressao: Number.isFinite(leitura.pressao) ? leitura.pressao : null,
    qualidade_ar: Number.isFinite(leitura.qualidade_ar) ? leitura.qualidade_ar : null,
    luminosidade: Number.isFinite(leitura.luminosidade) ? leitura.luminosidade : null,
    diagnostico: diagTexto,
    classe: diagClasse
  };

  historicoTabela.unshift(registro);
  if (historicoTabela.length > 60) {
    historicoTabela.pop();
  }

  if (renderizar) renderizarTabelaHistorico();
}

function atualizarSerieGrafico(serie) {
  if (!sensorChart) return;
  const assinatura = JSON.stringify(serie.map(r => [r.data_hora,r.temperatura,r.umidade,r.qualidade_ar]));
  if (assinatura === assinaturaGrafico) return;
  assinaturaGrafico = assinatura;
  sensorChart.stop?.();
  const labels = serie.map(r => new Date(r.data_hora).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}));
  sensorChart.data.labels.splice(0, sensorChart.data.labels.length, ...labels);
  ['temperatura','umidade','qualidade_ar'].forEach((campo, i) => {
    const dados = sensorChart.data.datasets[i].data;
    dados.splice(0, dados.length, ...serie.map(r => r[campo]));
  });
  sensorChart.update('none');
}

function renderizarTabelaHistorico() {
  const tbody = document.getElementById('historyTableBody');
  const counter = document.getElementById('historyCounter');
  if (!tbody) return;

  if (counter) counter.innerText = `${historicoTabela.length} registros`;
  const paginas = Math.max(1, Math.ceil(historicoTabela.length / REGISTROS_POR_PAGINA));
  paginaHistorico = Math.min(paginaHistorico, paginas - 1);
  const resumo = document.getElementById('historyPageStatus');
  if (resumo) resumo.innerText = `Página ${paginaHistorico + 1} de ${paginas}`;
  const anterior = document.getElementById('btnHistoryPrevious');
  const proximo = document.getElementById('btnHistoryNext');
  if (anterior) anterior.disabled = paginaHistorico === 0;
  if (proximo) proximo.disabled = paginaHistorico >= paginas - 1;
  const restaurar = document.getElementById('btnRestoreHistory');
  if (restaurar) restaurar.hidden = ocultarAteId === 0;

  if (historicoTabela.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">Nenhum registro nesta exibição. Novas leituras aparecerão automaticamente.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = historicoTabela.slice(paginaHistorico * REGISTROS_POR_PAGINA, (paginaHistorico + 1) * REGISTROS_POR_PAGINA).map(item => `
    <tr>
      <td><code>${item.timestamp}</code></td>
      <td><strong>${formatarNumero(item.temperatura)}</strong> °C</td>
      <td><strong>${formatarNumero(item.umidade)}</strong> %</td>
      <td><strong>${formatarNumero(item.pressao)}</strong> hPa</td>
      <td><strong>${item.qualidade_ar ?? "--"}</strong> PPM</td>
      <td><strong>${item.luminosidade ?? "--"}</strong> Lux</td>
      <td><span class="tag-status ${item.classe}">${item.diagnostico}</span></td>
    </tr>
  `).join('');
}

function exportarCSV() {
  if (historicoTabela.length === 0) {
    alert("Nenhum registro no histórico para exportar.");
    return;
  }

  let csv = "Timestamp;Temperatura (C);Umidade (%);Pressao (hPa);Qualidade do Ar (PPM);Luminosidade (Lux);Diagnostico\r\n";
  historicoTabela.forEach(item => {
    csv += `"${item.timestamp}";"${formatarNumero(item.temperatura)}";"${formatarNumero(item.umidade)}";"${formatarNumero(item.pressao)}";"${item.qualidade_ar ?? "--"}";"${item.luminosidade ?? "--"}";"${item.diagnostico}"\r\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `estacao_meteorologica_historico_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function limparHistorico() {
  ocultarAteId = Math.max(ocultarAteId, ...historicoLeituras.map(r => Number(r.id_leitura) || 0));
  try { localStorage.setItem('estacao_historico_ocultar_ate_1', String(ocultarAteId)); } catch (_) {}
  paginaHistorico = 0;
  historicoTabela.length = 0;
  renderizarTabelaHistorico();
}

// ------------------------------------------------------------------------------
// 7. SISTEMA DE ALERTAS AMBIENTAIS (RF04)
// ------------------------------------------------------------------------------
let alertDismissed = false;
let historicoPressaoAlertas = [];

function suspenderAlertas() {
  const banner = document.getElementById('alertBanner');
  if (banner) banner.classList.add('hidden');
  alertDismissed = false;
}

const AVISO_SINAL_MQ_ANTIGO = ' · Sem atualização: estação sem dados recentes.';

function textoSinalMqDesatualizado(texto) {
  return texto.replace(/ · Sem atualização.*$/, '') + AVISO_SINAL_MQ_ANTIGO;
}

function marcarSinalMqDesatualizado() {
  const el = document.getElementById('mqRaw');
  if (el) escreverTexto('mqRaw', textoSinalMqDesatualizado(el.innerText));
}

// Se o navegador perder contato ou a coleta parar, nao manter alerta como atual.
function verificarAtualidade() {
  atualizarContadorMq();
  if (isDemoMode || document.getElementById('apiStatus')?.innerText === 'API indisponível') return;
  const amostra = historicoLeituras[historicoLeituras.length - 1];
  const timestamp = amostra ? Date.parse(amostra.data_hora) : NaN;
  if (!ultimaRespostaApi || Date.now() - ultimaRespostaApi > 10000 ||
      !Number.isFinite(timestamp) || Date.now() - timestamp > 10000) {
    estacaoAtual = false;
    marcarSinalMqDesatualizado();
    atualizarContadorMq();
    suspenderAlertas();
    atualizarComparativoLadoALado(ultimaLeituraLocal);
    const status = document.getElementById('statusText');
    const badge = document.getElementById('statusBadge');
    if (badge) badge.classList.remove('online');
    if (status && amostra) escreverTexto('statusText', 'Estação sem dados recentes');
    for (const id of ['stTemp', 'stPress', 'stUmid', 'stAir', 'stLight']) {
      const el = document.getElementById(id);
      if (el) escreverTexto(id, 'Sem medição atual; consulte o horário da última leitura');
    }
  }
}


function verificarAlertas(data, qualidade = {}, estados = {}, modoTeste = false) {
  const banner = document.getElementById('alertBanner');
  const title = document.getElementById('alertTitle');
  const desc = document.getElementById('alertDesc');
  if (!banner || !title || !desc) return;

  const avisos = [];
  const numero = v => Number.isFinite(v) ? v.toLocaleString('pt-BR', {maximumFractionDigits: 2}) : '--';
  if (estados.qualidade_ar === 'acima_faixa') {
    const limite = modoTeste ? '1.000' : '300';
    avisos.push(['ALERTA: sinal do ar acima da faixa de estimativa', `O MQ-135 ultrapassou a faixa de ${limite} PPM do modelo. O valor exato está indisponível. Confira o sensor e o ambiente; isso não confirma a concentração de um gás.`]);
  } else if (estados.qualidade_ar === 'adc_saturado') {
    avisos.push(['AVISO: sinal do MQ-135 saturado', 'O sinal atingiu o limite do ADC. O PPM está indisponível; confira as conexões, a tensão de entrada e o sensor.']);
  } else if (qualidade.qualidade_ar === 'outlier_temporal') {
    avisos.push(['ALERTA: variação na qualidade do ar', 'Variação abrupta no MQ-135 detectada pelo filtro. Confira o sensor e o ambiente; o sinal não identifica a substância.']);
  } else if (Number.isFinite(data.qualidade_ar) && data.qualidade_ar >= 150) {
    avisos.push(['ALERTA: elevação no sinal de qualidade do ar', `Leitura de ${numero(data.qualidade_ar)} PPM estimado, acima do limiar de acompanhamento de 150 PPM. Confira o sensor e o ambiente. Este limiar não representa um limite de segurança.`]);
  }
  if (Number.isFinite(data.temperatura) && data.temperatura > 35 && !qualidade.temperatura) {
    avisos.push(['AVISO: temperatura do ambiente alta', `Temperatura de ${numero(data.temperatura)} °C, acima do limiar de 35 °C. Verifique a exposição ao calor e a posição do sensor.`]);
  }
  if (Number.isFinite(data.umidade) && !qualidade.umidade && (data.umidade < 20 || data.umidade > 85)) {
    avisos.push([data.umidade < 20 ? 'AVISO: umidade do ambiente baixa' : 'AVISO: umidade do ambiente elevada', `Umidade relativa de ${numero(data.umidade)}%, fora do intervalo de acompanhamento de 20% a 85%.`]);
  }
  if (Number.isFinite(data.luminosidade) && data.luminosidade < 10 && !qualidade.luminosidade) {
    avisos.push(['AVISO: luminosidade do ambiente baixa', `Luminosidade estimada em ${numero(data.luminosidade)} lux, abaixo de 10 lux. Confira a iluminação e se há objetos cobrindo o LDR.`]);
  }
  const agora = Date.now();
  const anteriores = [...historicoPressaoAlertas, ...historicoLeituras].filter(l => Number.isFinite(l.pressao) && !l.qualidade?.pressao && agora - Date.parse(l.data_hora) >= 5 * 60000 && agora - Date.parse(l.data_hora) <= 30 * 60000);
  const referencia = anteriores.sort((a,b) => Date.parse(a.data_hora) - Date.parse(b.data_hora))[0];
  if (Number.isFinite(data.pressao) && !qualidade.pressao && referencia && referencia.pressao - data.pressao >= 6) {
    avisos.push(['AVISO: queda na pressão atmosférica', `Pressão passou de ${numero(referencia.pressao)} para ${numero(data.pressao)} hPa nos últimos 30 minutos. Acompanhe a tendência; a variação isolada não prevê tempestades.`]);
  }
  const chave = avisos.map(a => a[0]).join('|');
  if (chave !== banner.dataset.alertKey) alertDismissed = false;
  banner.dataset.alertKey = chave;
  banner.classList.toggle('hidden', !avisos.length || alertDismissed);
  if (avisos.length) {
    title.innerText = avisos[0][0];
    desc.innerText = avisos.map((a,i) => i ? `${a[0]}. ${a[1]}` : a[1]).join('\n\n');
    escreverTexto('realAlertLabel', isDemoMode ? 'MODO DEMONSTRAÇÃO · DADOS SIMULADOS' : 'ESTAÇÃO · LEITURA RECEBIDA');
  }

}

// ------------------------------------------------------------------------------
// 8. MODO DEMONSTRAÇÃO / SIMULAÇÃO (PARA TESTE SEM O ESP32 LIGADO)
// ------------------------------------------------------------------------------
let isDemoMode = false;
let demoBaseTemp = 24.5;
let demoBaseUmid = 56.0;
let demoBasePress = 1013.25;
let demoBaseAir = 430;
let demoBaseLight = 620;

function gerarLeituraSimulada() {
  // Gera oscilações realistas
  demoBaseTemp += (Math.random() - 0.49) * 0.4;
  demoBaseUmid += (Math.random() - 0.5) * 0.6;
  demoBasePress += (Math.random() - 0.5) * 0.15;
  demoBaseAir += Math.round((Math.random() - 0.5) * 15);
  demoBaseLight += Math.round((Math.random() - 0.5) * 20);

  return {
    temperatura: Math.round(demoBaseTemp * 10) / 10,
    pressao: Math.round(demoBasePress * 100) / 100,
    umidade: Math.round(demoBaseUmid * 10) / 10,
    qualidade_ar: Math.max(300, demoBaseAir),
    luminosidade: Math.max(10, demoBaseLight),
    status: "Demo (Simulado)"
  };
}

// ------------------------------------------------------------------------------
// 9. CICLO DE ATUALIZAÇÃO DA TELEMETRIA
// ------------------------------------------------------------------------------
async function atualizarDashboard() {
  if (consultaEmAndamento) return;
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const apiStatus = document.getElementById('apiStatus');
  const lastSync = document.getElementById('lastSync');

  // Caso Modo Simulação esteja ativo
  if (isDemoMode) {
    const mockData = gerarLeituraSimulada();
    renderizarDados(mockData, true);
    return;
  }

  consultaEmAndamento = true;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);
  try {


    const destino = new URL(API_URL, window.location.href);
    const headers = /\.(ngrok-free\.dev|ngrok-free\.app)$/.test(destino.hostname)
      ? { 'ngrok-skip-browser-warning': '1' } : {};
    const response = await fetch(API_URL, { signal: controller.signal, headers, cache: 'no-store' });


    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (isDemoMode) return;
    historicoLeituras.length = 0;
    historicoTabela.length = 0;
    for (const leitura of [...data.historico].reverse()) atualizarEstatisticas(leitura, false);
    atualizarSerieGrafico(Array.isArray(data.historico_24h) ? data.historico_24h : [...data.historico].reverse().slice(-MAX_DATA_POINTS));
    const contador = document.getElementById('sampleCount');
    if (contador) contador.innerText = `Últimos ${data.historico.length} registros; gráfico: médias de 5 min / 24h`;
    renderizarTabelaHistorico();
    const estacao = data.estacao;
    if (estacao && Number.isFinite(estacao.latitude) && Number.isFinite(estacao.longitude)) {
      ultimaLocalizacaoSalva = {lat: estacao.latitude, lng: estacao.longitude};
      atualizarCoordenadasMapa(estacao.latitude, estacao.longitude, 'Cadastro da estação');
      if (stationMarker) stationMarker.setOpacity(1);
    }
    estacaoAtual = data.esp32_ativo === true;
    ultimaRespostaApi = Date.now();
    const ultima = data.historico[0];
    historicoPressaoAlertas = Array.isArray(data.historico_24h) ? data.historico_24h : [];
    renderizarDados(ultima || {}, false);
    const coleta = Number.isFinite(ultima?.coletado_em) ? ultima.coletado_em * 1000 : NaN;
    const atraso = Date.now() - coleta;
    escreverTexto('telemetryDelay', Number.isFinite(atraso) && atraso >= 0 ? `Idade da coleta ao exibir: ${(atraso/1000).toFixed(1)} s. Meta de atualização: até 5 s após envio; inclui coleta, rede, fila e consulta e depende dos relógios sincronizados.` : 'Tempo de coleta indisponível: não é possível medir a idade ponta a ponta.');
    atualizarPicoMq135(data.historico);
    if (!data.esp32_ativo) {
      if (statusBadge) statusBadge.classList.remove('online');
      if (statusText) statusText.innerText = ultima ? 'Estação sem dados recentes' : 'Aguardando primeira leitura';
    }
    const stats = data.estatisticas_24h || {};
    const estatisticas = {
      statTemp: `${formatarNumero(stats.temp_max)}\u00b0C / ${formatarNumero(stats.temp_min)}\u00b0C`,
      statUmid: `${formatarNumero(stats.umid_media)}%`,
      statAir: `${formatarNumero(stats.air_max, 0)} (estimativa)`,
      statPress: `${formatarNumero(stats.press_media)} hPa`
    };
    Object.entries(estatisticas).forEach(([id, valor]) => {
      const el = document.getElementById(id); if (el) el.innerText = valor;
    });

  } catch (error) {
    if (statusBadge) statusBadge.classList.remove('online');
    if (statusText) statusText.innerText = 'Desconectado';
    if (apiStatus) apiStatus.innerText = 'API indisponível';
    estacaoAtual = false;
    marcarSinalMqDesatualizado();
    atualizarContadorMq();
    suspenderAlertas();
    atualizarComparativoLadoALado(ultimaLeituraLocal);

    
    // Alerta o usuário no console e mantém cards informativos
    console.warn(`[TELEMETRIA] Falha ao consultar ${API_URL}:`, error.message);
    for (const id of ['stTemp','stPress','stUmid','stAir','stLight']) {
      const el = document.getElementById(id);
      if (el) el.innerText = 'API indisponível; valores exibidos são da última consulta';
    }
  } finally {
    clearTimeout(timeoutId);
    consultaEmAndamento = false;
  }
}

function valorPpmMq135(data) {
  return data?.mq135_modo_teste === true ? data.mq135_ppm_simulado : data?.qualidade_ar;
}

let aquecimentoMq = null;

function configurarContadorMq(data, isMock) {
  const restante = data.mq135_aquecimento_restante_ms;
  aquecimentoMq = !isMock && Number.isFinite(restante) && restante > 0
    ? {restanteMs: restante, recebidoEm: Date.now()} : null;
  atualizarContadorMq();
}

function atualizarContadorMq() {
  const el = document.getElementById('mqWarmup');
  if (!el) return;
  el.hidden = !aquecimentoMq;
  if (!aquecimentoMq) return;
  if (!estacaoAtual || Date.now() - ultimaRespostaApi > 10000 || document.getElementById('apiStatus')?.innerText === 'API indisponível') {
    escreverTexto('mqWarmup', 'Contagem pausada: aguardando dados recentes da ESP32.');
    return;
  }
  const segundos = Math.ceil(Math.max(0, aquecimentoMq.restanteMs - (Date.now() - aquecimentoMq.recebidoEm)) / 1000);
  const minutos = String(Math.floor(segundos / 60)).padStart(2, '0');
  const resto = String(segundos % 60).padStart(2, '0');
  escreverTexto('mqWarmup', segundos > 0
    ? `PPM estimado durante o aquecimento; recomenda-se aguardar 3 minutos para medidas mais estáveis. Faltam ${minutos}:${resto}.`
    : 'Aquecimento concluído; aguardando a próxima leitura da ESP32.');
}

function textoPpmMq135(data) {
  const ppm = valorPpmMq135(data);
  if (Number.isFinite(ppm)) return String(ppm);
  const estado = data?.estado_sensores?.qualidade_ar;
  if (estado === 'aquecendo') return 'Aquecendo';
  if (estado === 'abaixo_faixa') return '<10';
  if (estado === 'acima_faixa') return data?.mq135_modo_teste === true ? '>1000' : '>300';
  return '--';
}

function atualizarPicoMq135(leituras) {
  const el = document.getElementById('mqPeak');
  if (!el) return;
  const ultimaData = Date.parse(leituras[0]?.data_hora);
  const teste = leituras[0]?.mq135_modo_teste === true;
  const validas = leituras.filter(l => (l.mq135_modo_teste === true) === teste && Number.isFinite(valorPpmMq135(l)) &&
    Number.isFinite(Date.parse(l.data_hora)) &&
    Date.parse(l.data_hora) <= ultimaData && ultimaData - Date.parse(l.data_hora) <= 120000);
  const pico = validas.reduce((max, l) => !max || valorPpmMq135(l) > valorPpmMq135(max) ? l : max, null);
  el.innerText = pico
    ? `Pico ${teste ? "simulado" : "recente"}: ${valorPpmMq135(pico).toLocaleString('pt-BR', {maximumFractionDigits:2})} ppm às ${new Date(pico.data_hora).toLocaleTimeString('pt-BR')} (até 2 min).`
    : 'Pico recente: sem PPM numérico nos registros recebidos.';
}

function animarValorSeMudou(el, novoValor) {
  if (!el) return;
  const str = String(novoValor);
  if (el.innerText === str) return;
  // Somente opacidade: nao deslocar texto ou alterar a largura durante a coleta.
  el.getAnimations?.().forEach(animacao => animacao.cancel());
  const anterior = el.innerText;
  el.innerText = str;
  if (anterior !== '--' && !movimentoReduzido() && typeof el.animate === 'function') {
    el.animate([{opacity:0.7},{opacity:1}], {duration:140,easing:'ease-out'});
  }
}

function escreverTexto(id, valor) {
  const el = document.getElementById(id);
  const texto = String(valor);
  if (el && el.innerText !== texto) el.innerText = texto;
}

function renderizarDados(data, isMock) {
  if (isMock) estacaoAtual = true;
  const atual = isMock || estacaoAtual;
  const antigo = !atual && Boolean(data.data_hora);
  const estados = data.estado_sensores || {};
  const formatar = (valor, casas = 1) => Number.isFinite(valor) ? valor.toFixed(casas) : '--';
  const numeros = {
    valTemp: formatar(data.temperatura), valPress: formatar(data.pressao),
    valUmid: formatar(data.umidade), valAir: textoPpmMq135(data),
    valLight: Number.isFinite(data.luminosidade) ? data.luminosidade : '--'
  };
  Object.entries(numeros).forEach(([id, texto]) => animarValorSeMudou(document.getElementById(id), texto));
  const aquecendoAr = !Number.isFinite(valorPpmMq135(data)) && estados.qualidade_ar === 'aquecendo';
  document.getElementById('valAir')?.classList.toggle('is-warming', aquecendoAr);
  const unidadeAr = document.getElementById('airUnit');
  if (unidadeAr) unidadeAr.hidden = aquecendoAr;
  escreverTexto('airUnit', data.mq135_modo_teste === true ? 'PPM simulado' : 'PPM estimado');


  const descricoes = {
    stTemp: Number.isFinite(data.temperatura) ? 'Temperatura estimada do ar.' : 'Indisponível',
    stPress: Number.isFinite(data.pressao) ? 'Pressão estimada na altitude da estação.' : 'Indisponível',
    stUmid: Number.isFinite(data.umidade)
      ? data.umidade < 30 ? 'Umidade relativa baixa.' : data.umidade > 70 ? 'Umidade relativa alta.' : 'Umidade relativa estimada.'
      : 'Indisponível',
    stAir: Number.isFinite(data.qualidade_ar)
      ? 'Estimativa equivalente de álcool; resposta também influenciada por outros gases.'
      : ({
        aquecendo: 'Cálculo de PPM aguardando o aquecimento inicial: cerca de 3 minutos após ligar ou reiniciar. O sinal ADC continua sendo acompanhado.',
        calibracao_pendente: 'Estimativa de PPM indisponível',
        abaixo_faixa: 'Abaixo da faixa de 10–300 ppm do modelo de álcool.',
        acima_faixa: 'Acima da faixa de 10–300 ppm do modelo de álcool.',
        fora_da_faixa: 'Estimativa fora da faixa do modelo; confira o sinal ADC.',
        sinal_baixo: 'Sinal no limite inferior do ADC; confira alimentação, AO e divisor.',
        adc_saturado: 'ADC saturado; confira a tensão e o divisor.',
        configuracao_invalida: 'Parâmetros do circuito ou curva incompletos/inválidos.',
        adc_nao_suportado: 'Conversão de tensão indisponível neste firmware.',
        erro_leitura: 'Falha ao ler o ADC do MQ-135.'
      }[estados.qualidade_ar] || 'Indisponível'),
    stLight: estados.luminosidade === 'saturado'
      ? 'Leitura no limite do ADC; estimativa indisponível'
      : estados.luminosidade === 'escuro_referencia'
        ? 'Referência de escuro atingida: luminosidade estimada em zero relativo.'
        : Number.isFinite(data.luminosidade) ? 'Luminosidade estimada pelo sensor.' : 'Indisponível'
  };
  if (data.mq135_modo_teste === true) {
    descricoes.stAir = Number.isFinite(valorPpmMq135(data))
      ? valorPpmMq135(data) > 300
        ? 'PPM simulado: extrapolação acima da curva de 300 ppm. Referência virtual de 0,050 V.'
        : 'Modo de teste: referência virtual de 0,050 V.'
      : estados.qualidade_ar === 'acima_faixa'
        ? 'Acima do limite de 1.000 ppm da simulação. Referência virtual de 0,050 V.'
        : estados.qualidade_ar === 'abaixo_faixa'
          ? 'Abaixo de 10 ppm simulados. Referência virtual de 0,050 V.'
          : descricoes.stAir + ' Modo de teste: referência virtual de 0,050 V.';
  }
  if (Number.isFinite(data.mq135_aquecimento_restante_ms) && data.mq135_aquecimento_restante_ms > 0) {
    descricoes.stAir += ' Estimativa preliminar durante o aquecimento; recomenda-se aguardar 3 minutos após ligar para medidas mais estáveis.';
  }
  Object.entries(descricoes).forEach(([id, texto]) => escreverTexto(id,
    antigo ? 'Sem medição atual; consulte o horário da última leitura' : texto));

  const raw = data.adc_bruto?.qualidade_ar;
  let diagnostico = Number.isFinite(raw)
    ? `Último sinal MQ-135: ${raw.toLocaleString('pt-BR', {maximumFractionDigits:3,useGrouping:false})} / 4095 ADC${raw === 0 ? ' — sinal no limite inferior; confira as conexões' : ''}. Leitura bruta do sensor.`
    : 'Sinal MQ-135: sem leitura bruta disponível.';
  if (!atual) diagnostico = textoSinalMqDesatualizado(diagnostico);
  escreverTexto('mqRaw', diagnostico);
  const badge = document.getElementById('statusBadge');
  if (badge) badge.classList.toggle('online', atual);
  escreverTexto('statusText', isMock ? 'Modo Demonstração' : atual ? 'Online (OK)' : data.data_hora ? 'Estação sem dados recentes' : 'Aguardando primeira leitura');
  escreverTexto('apiStatus', isMock ? 'Simulada (Local)' : 'Respondendo (200 OK)');
  escreverTexto('lastSync', data.data_hora ? new Date(data.data_hora).toLocaleString('pt-BR') : isMock ? new Date().toLocaleTimeString('pt-BR') : '--');
  escreverTexto('popupData', `Temperatura: ${formatar(data.temperatura)} °C | Umidade: ${formatar(data.umidade)}%\nPressão: ${formatar(data.pressao)} hPa | Gases: ${textoPpmMq135(data)} ppm (estimativa)`);
  if (isMock) {
    atualizarEstatisticas(data);
    atualizarPicoMq135([data]);
  }
  if (atual) verificarAlertas(data.valores_alerta || data, data.qualidade || {}, estados, data.mq135_modo_teste === true);
  else suspenderAlertas();
  atualizarComparativoLadoALado(data);
  configurarContadorMq(data, isMock);
}

// ------------------------------------------------------------------------------
// CONTROLE DE TEMA: MODO CLARO / MODO ESCURO
// ------------------------------------------------------------------------------
function inicializarTema() {
  // Padrão editorial: SEMPRE inicia em 'light' (modo claro de alto padrão do Figma),
  // a menos que o usuário tenha clicado e salvo explicitamente 'dark'
  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem('estacao_theme');
  } catch (e) {}

  const currentTheme = savedTheme === 'dark' ? 'dark' : 'light';
  aplicarTema(currentTheme);
}

function aplicarTema(theme) {
  const themeIcon = document.getElementById('themeIcon');
  const themeText = document.getElementById('themeText');

  document.documentElement.setAttribute('data-theme', theme);

  if (theme === 'dark') {
    if (themeIcon) themeIcon.innerText = 'light_mode';
    if (themeText) themeText.innerText = 'Modo Claro';
  } else {
    if (themeIcon) themeIcon.innerText = 'dark_mode';
    if (themeText) themeText.innerText = 'Modo Escuro';
  }

  // Atualiza cores do gráfico Chart.js para harmonizar perfeitamente
  if (sensorChart) {
    const isDark = theme === 'dark';
    sensorChart.options.scales.x.grid.color = isDark ? 'rgba(255, 255, 255, 0.06)' : '#EEF0EA';
    sensorChart.options.scales.x.ticks.color = isDark ? '#A0ABA0' : '#828B7C';
    sensorChart.options.scales.y.grid.color = isDark ? 'rgba(255, 255, 255, 0.06)' : '#EEF0EA';
    sensorChart.options.scales.y.ticks.color = isDark ? '#A0ABA0' : '#828B7C';
    sensorChart.options.scales.y.title.color = isDark ? '#DFE7D6' : '#525B4C';
    sensorChart.options.plugins.legend.labels.color = isDark ? '#F3F5F1' : '#525B4C';

    sensorChart.data.datasets[0].borderColor = isDark ? '#FB7185' : '#C34432';
    sensorChart.data.datasets[0].pointBackgroundColor = isDark ? '#FB7185' : '#C34432';
    sensorChart.data.datasets[1].borderColor = isDark ? '#38BDF8' : '#26647B';
    sensorChart.data.datasets[1].pointBackgroundColor = isDark ? '#38BDF8' : '#26647B';
    sensorChart.data.datasets[2].borderColor = isDark ? '#4ADE80' : '#32582D';
    sensorChart.data.datasets[2].pointBackgroundColor = isDark ? '#4ADE80' : '#32582D';

    sensorChart.update('none');
  }
}

// ------------------------------------------------------------------------------
// CONTROLE DE NAVEGAÇÃO ENTRE ABAS
// ------------------------------------------------------------------------------
function inicializarNavegacaoAbas() {
  const tabBtnTelemetry = document.getElementById('tabBtnTelemetry');
  const tabBtnComparison = document.getElementById('tabBtnComparison');
  const viewTelemetry = document.getElementById('viewTelemetry');
  const viewComparison = document.getElementById('viewComparison');

  const alternarAba = (abaAtiva) => {
    if (abaAtiva === 'telemetry') {
      tabBtnTelemetry?.classList.add('active');
      tabBtnComparison?.classList.remove('active');
      viewTelemetry?.classList.remove('hidden');
      viewComparison?.classList.add('hidden');

      // Redesenha o mapa Leaflet e o gráfico para manter integridade visual
      setTimeout(() => {
        if (map) map.invalidateSize();
        if (sensorChart) sensorChart.resize();
      }, 50);
    } else {
      tabBtnComparison?.classList.add('active');
      tabBtnTelemetry?.classList.remove('active');
      viewComparison?.classList.remove('hidden');
      viewTelemetry?.classList.add('hidden');

      // Garante que o comparativo esteja atualizado com a última leitura
      if (ultimaLeituraLocal) {
        atualizarComparativoLadoALado(ultimaLeituraLocal);
      }
    }
  };

  tabBtnTelemetry?.addEventListener('click', (e) => {
    e.preventDefault();
    alternarAba('telemetry');
  });

  tabBtnComparison?.addEventListener('click', (e) => {
    e.preventDefault();
    alternarAba('comparison');
  });
}

// ------------------------------------------------------------------------------
// INTEGRAÇÃO METEOROLÓGICA OFICIAL: SÃO PAULO (OPEN-METEO WMO & AIR QUALITY)
// ------------------------------------------------------------------------------
let ultimaLeituraLocal = null;
function referenciaVazia() {
  return {temp:null, tempMin:null, tempMax:null, apparentTemp:null, humid:null,
    pressMsl:null, pressSurface:null, weatherCode:null, precipitation:null,
    aqi:null, pm25:null, pm10:null, co:null, no2:null, o3:null, altitude:null,
    climaStatus:'Aguardando consulta', arStatus:'Aguardando consulta', lastUpdate:'Aguardando dados'};
}
let dadosOficiaisSP = referenciaVazia();
let pedidoComparativo = 0;

async function obterDadosComparativos(modo = modoComparativo) {
  modoComparativo = modo;
  if (modo === 'local' && !ultimaLocalizacaoSalva) {
    document.getElementById('compMetaStation').innerText = 'Aguardando as coordenadas cadastradas da estação';
    return;
  }
  const pedido = ++pedidoComparativo;
  dadosOficiaisSP = referenciaVazia();
  renderizarDadosOficiaisSP();
  if (ultimaLeituraLocal) atualizarComparativoLadoALado(ultimaLeituraLocal);
  const local = modo === 'local';
  const lat = local ? currentCoords.lat : -23.55052;
  const lng = local ? currentCoords.lng : -46.63330;
  coordenadasComparadas = local ? `${lat},${lng}` : '';
  const nome = local ? 'Região da estação' : 'São Paulo (centro)';
  const escrever = (id, texto) => { const el = document.getElementById(id); if (el) el.innerText = texto; };
  escrever('compMetaStation', `${nome}: ${lat.toFixed(4)}, ${lng.toFixed(4)} - Open-Meteo`);
  escrever('syncLabelPrefix','Referência Open-Meteo');
  escrever('spOverviewTitle',`Referência ambiental: ${nome}`);
  escrever('spOverviewSubtitle','Dados externos para as coordenadas consultadas; não são leituras do ESP32.');
  document.querySelectorAll('.comp-official-badge-text').forEach(el => { el.innerText = 'Referência Open-Meteo'; });
  for (const [id, ativo] of [['btnCompSP',!local],['btnCompLocal',local]]) {
    const el = document.getElementById(id); if (el) el.classList.toggle('active',ativo);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const base = `latitude=${lat}&longitude=${lng}&timezone=America%2FSao_Paulo`;
  const leitura = async url => {
    const response = await fetch(url,{signal:controller.signal});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };
  try {
    const [clima, ar] = await Promise.allSettled([
      leitura(`https://api.open-meteo.com/v1/forecast?${base}&current=temperature_2m,relative_humidity_2m,surface_pressure,pressure_msl,apparent_temperature,precipitation,weather_code&daily=temperature_2m_max,temperature_2m_min`),
      leitura(`https://air-quality-api.open-meteo.com/v1/air-quality?${base}&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone`)
    ]);
    if (pedido !== pedidoComparativo) return;
    const referencia = referenciaVazia();
    const numero = v => Number.isFinite(v) ? v : null;
    if (clima.status === 'fulfilled' && clima.value.current) {
      const c = clima.value.current;
      const d = clima.value.daily || {};
      Object.assign(referencia, {temp:numero(c.temperature_2m), humid:numero(c.relative_humidity_2m),
        pressMsl:numero(c.pressure_msl), pressSurface:numero(c.surface_pressure),
        apparentTemp:numero(c.apparent_temperature), precipitation:numero(c.precipitation),
        weatherCode:numero(c.weather_code), altitude:numero(clima.value.elevation), tempMin:numero(d.temperature_2m_min?.[0]),
        tempMax:numero(d.temperature_2m_max?.[0]), climaStatus:c.time ? `Clima: ${c.time.replace('T',' ')}` : 'Clima: horário não informado'});
    } else referencia.climaStatus = 'Clima indisponível';
    if (ar.status === 'fulfilled' && ar.value.current) {
      const c = ar.value.current;
      Object.assign(referencia,{aqi:numero(c.us_aqi), pm25:numero(c.pm2_5), pm10:numero(c.pm10),
        co:numero(c.carbon_monoxide), no2:numero(c.nitrogen_dioxide), o3:numero(c.ozone),
        arStatus:c.time ? `Ar: ${c.time.replace('T',' ')}` : 'Ar: horário não informado'});
    } else referencia.arStatus = 'Qualidade do ar indisponível';
    referencia.lastUpdate = `${referencia.climaStatus} | ${referencia.arStatus}`;
    dadosOficiaisSP = referencia;
    renderizarDadosOficiaisSP();
    if (ultimaLeituraLocal) atualizarComparativoLadoALado(ultimaLeituraLocal);
  } finally { clearTimeout(timeout); }
}

const obterDadosOficiaisSaoPaulo = () => obterDadosComparativos(modoComparativo);

function renderizarDadosOficiaisSP() {
  const r = dadosOficiaisSP;
  const textos = {spLastUpdate:r.lastUpdate,
    compSpTemp:formatarNumero(r.temp), spTempMin:`${formatarNumero(r.tempMin)}°C`,
    spTempMax:`${formatarNumero(r.tempMax)}°C`, spApparentTemp:`${formatarNumero(r.apparentTemp)}°C`,
    compSpHumid:formatarNumero(r.humid,0), compSpPress:formatarNumero(r.pressSurface),
    spPressMsl:`${formatarNumero(r.pressMsl)} hPa`, spPressSurface:`${formatarNumero(r.pressSurface)} hPa`,
    compSpAqi:formatarNumero(r.aqi,0), compSpAirIndex:formatarNumero(r.aqi,0), spPm25:`${formatarNumero(r.pm25)} µg/m³`,
    spPm10:`${formatarNumero(r.pm10)} µg/m³`, spCo:`${formatarNumero(r.co)} µg/m³`,
    spNo2:`${formatarNumero(r.no2)} µg/m³`, spPrecipitation:`${formatarNumero(r.precipitation)} mm`,
    spThermalRange:Number.isFinite(r.tempMax)&&Number.isFinite(r.tempMin) ? `${formatarNumero(r.tempMax-r.tempMin)}°C` : '--',
    spElevation:`${formatarNumero(r.altitude,0)} m`,
    compSpAirFormulaHint:'AQI: índice de qualidade do ar na escala dos EUA, sem unidade. Poluentes abaixo em µg/m³.'};
  for (const [id,texto] of Object.entries(textos)) {
    const el = document.getElementById(id); if (el) el.innerText = texto;
  }
  const condicao = Number.isFinite(r.weatherCode) ? traduzirCondicaoTempo(r.weatherCode) : {icon:'cloud_off',desc:'Referência indisponível'};
  const icon = document.getElementById('spWeatherIcon'); if (icon) icon.innerText = condicao.icon;
  const desc = document.getElementById('spWeatherDesc'); if (desc) desc.innerText = condicao.desc;
}

function traduzirCondicaoTempo(wmoCode) {
  const condicoes = {
    0: { desc: 'Céu Limpo', icon: 'wb_sunny' },
    1: { desc: 'Predomínio de Sol', icon: 'wb_sunny' },
    2: { desc: 'Parcialmente Nublado', icon: 'partly_cloudy_day' },
    3: { desc: 'Encoberto / Nublado', icon: 'cloud' },
    45: { desc: 'Névoa Úmida', icon: 'foggy' },
    48: { desc: 'Nevoeiro Denso', icon: 'foggy' },
    51: { desc: 'Garoa Leve', icon: 'rainy' },
    53: { desc: 'Garoa Moderada', icon: 'rainy' },
    55: { desc: 'Garoa Intensa', icon: 'rainy' },
    61: { desc: 'Chuva Fraca', icon: 'rainy' },
    63: { desc: 'Chuva Moderada', icon: 'rainy' },
    65: { desc: 'Chuva Forte', icon: 'rainy' },
    80: { desc: 'Pancadas de Chuva', icon: 'thunderstorm' },
    81: { desc: 'Chuva Rápida', icon: 'thunderstorm' },
    82: { desc: 'Chuva Torrencial', icon: 'thunderstorm' },
    95: { desc: 'Tempestade com Raios', icon: 'thunderstorm' },
    96: { desc: 'Tempestade com Granizo', icon: 'thunderstorm' },
    99: { desc: 'Tempestade Severa', icon: 'thunderstorm' }
  };
  return condicoes[wmoCode] || { desc: 'Tempo Variável', icon: 'cloud' };
}

// ------------------------------------------------------------------------------
// CÁLCULO DINÂMICO DO COMPARATIVO LADO A LADO E DELTAS
// ------------------------------------------------------------------------------
function atualizarComparativoLadoALado(data) {
  if (data) ultimaLeituraLocal = data;
  const escrever = (id,texto) => { const el = document.getElementById(id); if (el) el.innerText = texto; };
  const medidas = [
    ['temperatura','temp','Temp','compLocalTemp','\u00b0C'],
    ['umidade','humid','Humid','compLocalHumid','%'],
    ['pressao','pressSurface','Press','compLocalPress','hPa']
  ];
  for (const [campo,referencia,sufixo,local,unidade] of medidas) {
    escrever(local,formatarNumero(data?.[campo]));
    const disponivel = estacaoAtual && Number.isFinite(data?.[campo]) && Number.isFinite(dadosOficiaisSP[referencia]);
    const badge = document.getElementById(`delta${sufixo}Badge`);
    if (badge) badge.classList.remove('delta-hot','delta-cold','delta-equal');
    if (!disponivel) {
      escrever(`delta${sufixo}Val`,'--');
      escrever(`analysis${sufixo}`,estacaoAtual ? 'Referência externa indisponível para comparação.' : 'Sem medição atual da estação. Valores anteriores permanecem no histórico.');
      continue;
    }
    const delta = data[campo] - dadosOficiaisSP[referencia];
    escrever(`delta${sufixo}Val`,`${delta>0?'+':''}${formatarNumero(delta)} ${unidade}`);
    if (badge) badge.classList.add(Math.abs(delta)<0.5 ? 'delta-equal' : delta>0 ? 'delta-hot' : 'delta-cold');
    escrever(`analysis${sufixo}`,`Diferença entre a medição local e a referência Open-Meteo: ${formatarNumero(delta)} ${unidade}. Fontes e condições de medição são diferentes.`);
  }
  escrever('compLocalAir',textoPpmMq135(data));
  escrever('compLocalAirUnit', data?.mq135_modo_teste === true ? 'PPM simulado' : 'ppm estimado');
  escrever('deltaAirVal','Indicadores distintos');
  escrever('analysisAir','O MQ-135 fornece PPM estimado pela curva de álcool e também responde a outros gases. A referência externa usa AQI (escala dos EUA), um índice sem unidade calculado a partir de poluentes específicos. Não há conversão direta nem diferença numérica válida entre esses indicadores.');
}

function configurarEventos() {
  // Helper para clique / toque seguro
  const bindAction = (id, callback) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      callback(e);
    });
  };

  // 1. Botão Alternador de Tema Claro / Escuro
  bindAction('btnThemeToggle', () => {
    const active = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = active === 'dark' ? 'light' : 'dark';
    aplicarTema(nextTheme);
    try {
      localStorage.setItem('estacao_theme', nextTheme);
    } catch (e) {}
  });

  // 2. Botão Modo Simulação / Demo
  bindAction('btnDemo', () => {
    isDemoMode = !isDemoMode;
    assinaturaGrafico = '';
    const btnDemo = document.getElementById('btnDemo');
    const demoState = document.getElementById('demoState');
    if (demoState) demoState.innerText = isDemoMode ? 'ON' : 'OFF';
    if (btnDemo) btnDemo.classList.toggle('active', isDemoMode);
    historicoLeituras.length = 0;
    historicoTabela.length = 0;
    if (sensorChart) {
      sensorChart.data.labels.length = 0;
      sensorChart.data.datasets.forEach(d => { d.data.length = 0; });
    }
    if (isDemoMode) {
      console.log("[SISTEMA] Modo Simulação Ativado.");
    } else {
      estacaoAtual = false;
      ultimaLeituraLocal = null;
      renderizarDados({}, false);
      escreverTexto('statusText', 'Consultando telemetria real');
      atualizarPicoMq135([]);
    }
    atualizarDashboard();
  });

  // 3. Botão GPS / Localizar Minha Rua
  bindAction('btnGetLocation', () => {
    sincronizarLocalizacaoDispositivo(false);
  });

  // 3.1 Busca de Endereço / CEP
  bindAction('btnSearchAddress', () => {
    buscarLocalizacaoPorTexto();
  });

  const inputSearch = document.getElementById('inputAddressSearch');
  const btnClearSearch = document.getElementById('btnClearSearch');

  if (inputSearch) {
    inputSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        buscarLocalizacaoPorTexto();
      }
    });

    inputSearch.addEventListener('input', () => {
      if (btnClearSearch) {
        if (inputSearch.value.trim().length > 0) {
          btnClearSearch.classList.remove('hidden');
        } else {
          btnClearSearch.classList.add('hidden');
        }
      }
    });
  }

  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      if (inputSearch) {
        inputSearch.value = '';
        inputSearch.focus();
      }
      btnClearSearch.classList.add('hidden');
    });
  }

  // 4. Botão Exportar CSV
  bindAction('btnExportCSV', () => {
    exportarCSV();
  });

  // 5. Botão Limpar Histórico
  bindAction('btnClearHistory', () => {
    limparHistorico();
  });
  bindAction('btnRestoreHistory', () => {
    ocultarAteId = 0;
    paginaHistorico = 0;
    try { localStorage.removeItem('estacao_historico_ocultar_ate_1'); } catch (_) {}
    atualizarDashboard();
  });
  bindAction('btnHistoryPrevious', () => { paginaHistorico = Math.max(0, paginaHistorico - 1); renderizarTabelaHistorico(); });
  bindAction('btnHistoryNext', () => { paginaHistorico += 1; renderizarTabelaHistorico(); });

  // Previa independente: nao altera telemetria, alertas reais ou persistencia.
  const exemplosAviso = {
    ar: {icon:'air', label:'MQ-135', title:'ALERTA: variação na qualidade do ar', description:'O sinal do MQ-135 apresentou uma elevação abrupta. Verifique possíveis fontes de vapores e as condições de ventilação. A leitura não identifica a substância nem confirma uma concentração perigosa.'},
    temperatura: {icon:'device_thermostat', label:'TEMPERATURA DO AR', title:'AVISO: temperatura do ambiente alta', description:'Temperatura de exemplo: 37 °C, acima do limite de 35 °C usado neste aviso. Verifique a exposição ao calor e se o sensor recebe luz solar direta.'},
    umidade: {icon:'humidity_percentage', label:'UMIDADE RELATIVA', title:'AVISO: umidade do ambiente elevada', description:'Umidade de exemplo: 89%, acima do limite de 85% usado neste aviso. Observe a ventilação e possíveis sinais de condensação no local.'},
    pressao: {icon:'speed', label:'PRESSÃO ATMOSFÉRICA', title:'AVISO: queda na pressão atmosférica', description:'Exemplo: queda de 925 para 919 hPa em 30 minutos. Acompanhe a tendência e confira o sensor. Uma variação isolada não permite prever chuva ou tempestade.'},
    luminosidade: {icon:'light_mode', label:'LUMINOSIDADE', title:'AVISO: luminosidade do ambiente baixa', description:'Luminosidade de exemplo: 5 lux. Verifique se o local está escuro ou se há algum objeto cobrindo o LDR. A estimativa depende da posição e da resposta do sensor.'}
  };
  let sensorAvisoAtivo = null;
  const botoesAviso = document.querySelectorAll('[data-demo-sensor]');
  const encerrarDemonstracaoAviso = () => {
    document.getElementById('demoAlertBanner')?.classList.add('hidden');
    sensorAvisoAtivo = null;
    botoesAviso.forEach(btn => { btn.setAttribute('aria-expanded', 'false'); btn.classList.remove('active'); });
  };
  botoesAviso.forEach(btn => btn.addEventListener('click', () => {
    const banner = document.getElementById('demoAlertBanner');
    if (!banner) return;
    const sensor = btn.dataset.demoSensor;
    const exemplo = exemplosAviso[sensor];
    if (!exemplo) return;
    if (sensorAvisoAtivo === sensor && !banner.classList.contains('hidden')) {
      encerrarDemonstracaoAviso();
      return;
    }
    sensorAvisoAtivo = sensor;
    escreverTexto('demoAlertIcon', exemplo.icon);
    escreverTexto('demoAlertLabel', `DEMONSTRAÇÃO · ${exemplo.label}`);
    escreverTexto('demoAlertTitle', exemplo.title);
    escreverTexto('demoAlertDescription', exemplo.description);
    escreverTexto('demoAlertTime', `${new Date().toLocaleTimeString('pt-BR')} · Dados de exemplo`);
    banner.classList.remove('hidden');
    botoesAviso.forEach(botao => { const ativo = botao === btn; botao.setAttribute('aria-expanded', String(ativo)); botao.classList.toggle('active', ativo); });
  }));
  bindAction('btnCloseDemoAlert', encerrarDemonstracaoAviso);

  // 6. Botão Fechar Alerta
  bindAction('btnDismissAlert', () => {
    const banner = document.getElementById('alertBanner');
    if (banner) banner.classList.add('hidden');
    alertDismissed = true;
  });

  // 7. Botão Alternar Comparativo: SP Capital
  bindAction('btnCompSP', () => {
    obterDadosComparativos('sp');
  });

  // 8. Botão Alternar Comparativo: Minha Região (GPS)
  bindAction('btnCompLocal', () => {
    obterDadosComparativos('local');
  });

  // 9. Botão Atualizar Dados Oficiais (SP ou Região)
  bindAction('btnRefreshSP', () => {
    obterDadosComparativos(modoComparativo);
  });
}

// ------------------------------------------------------------------------------
// 10. INICIALIZAÇÃO ROBUSTA (EXECUÇÃO IMEDIATA OU DOMCONTENTLOADED)
// ------------------------------------------------------------------------------
function boot() {
  inicializarTema();
  inicializarNavegacaoAbas();
  inicializarMapa();
  inicializarGrafico();

  configurarEventos();
  document.querySelectorAll('#btnGetLocation').forEach(el => {
    el.disabled = true; el.title = 'Posição definida pelo cadastro da estação';
  });

  // Sincroniza os dados meteorológicos oficiais de São Paulo
  obterDadosOficiaisSaoPaulo();

  // Sincroniza automaticamente e de imediato com o GPS real do dispositivo
  sincronizarLocalizacaoDispositivo(true);

  atualizarDashboard();

  // Ciclo periódico de telemetria a cada 2.5 segundos
  setInterval(atualizarDashboard, 2500);
  setInterval(verificarAtualidade, 1000);

  // Ciclo periódico para dados de São Paulo a cada 5 minutos (300.000 ms)
  setInterval(obterDadosOficiaisSaoPaulo, 300000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  // Caso o script carregue após a montagem do DOM
  boot();
}
