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
const DEFAULT_LAT = -23.55052;
const DEFAULT_LNG = -46.63330;

let map = null;
let stationMarker = null;
let gpsAccuracyCircle = null;
let userGpsActive = false;
let melhorPrecisaoGps = Infinity;
let currentCoords = { lat: DEFAULT_LAT, lng: DEFAULT_LNG, source: 'Padrão (SP)', bairro: '', accuracy: null };
let modoComparativo = 'sp'; // 'sp' (São Paulo Capital) ou 'local' (Sua Região / GPS)

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

    // Recupera posição salva pelo usuário ou adota o padrão
    let savedLat = NaN;
    let savedLng = NaN;
    let savedSource = localStorage.getItem('estacao_source') || 'Detectando GPS...';

    // Se estiver gravado o centro antigo de SP/República (-23.55052), limpa o cache para forçar a localização real
    if (!isNaN(savedLat) && Math.abs(savedLat - DEFAULT_LAT) < 0.001) {
      localStorage.removeItem('estacao_lat');
      localStorage.removeItem('estacao_lng');
      localStorage.removeItem('estacao_source');
      savedLat = null;
      savedLng = null;
      savedSource = 'Detectando GPS...';
    }

    const initialLat = (!isNaN(savedLat) && savedLat !== 0) ? savedLat : DEFAULT_LAT;
    const initialLng = (!isNaN(savedLng) && savedLng !== 0) ? savedLng : DEFAULT_LNG;
    
    map = L.map('map', {
      zoomControl: true,
      attributionControl: false
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
      title: "Arraste o pino para refinar a localização"
    }).addTo(map);

    stationMarker.bindPopup(`
      <div style="font-size:0.85rem; line-height:1.45; font-family:'Plus Jakarta Sans', sans-serif;">
        <strong style="color:var(--accent-forest); font-weight:700;">Localização da Estação</strong><br>
        <span id="popupLocationTitle" style="color:#141712; font-weight:600;">${savedSource}</span><br>
        <span id="popupData" style="color:#586152;">Aguardando telemetria...</span><br>
        <small style="color:#828B7C;">(Coordenadas do cadastro da estacao)</small>
      </div>
    `);

    // Atualiza barra de coordenadas inicial
    if (stationMarker) stationMarker.setOpacity(0); // Exibir somente apos cadastro da API.

  } catch (err) {
    console.warn("[MAPA] Erro ao carregar Leaflet:", err);
  }
}

function atualizarCoordenadasMapa(lat, lng, fonte = 'GPS Dispositivo', precisao = null) {
  if (fonte !== 'Cadastro da estacao') return;
  const mudou = currentCoords.lat !== lat || currentCoords.lng !== lng;
  currentCoords = { lat, lng, source: fonte };
  if (stationMarker) stationMarker.setLatLng([lat, lng]);
  if (map && mudou) map.setView([lat, lng], 16, { animate: false });

  const geoLatEl = document.getElementById('geoLat');
  const geoLngEl = document.getElementById('geoLng');
  const geoSourceEl = document.getElementById('geoSource');
  const geoAccuracyEl = document.getElementById('geoAccuracy');
  const popupTitleEl = document.getElementById('popupLocationTitle');

  if (geoLatEl) geoLatEl.innerText = lat.toFixed(5);
  if (geoLngEl) geoLngEl.innerText = lng.toFixed(5);
  if (geoSourceEl) geoSourceEl.innerText = fonte;
  if (geoAccuracyEl) geoAccuracyEl.innerText = precisao ? `±${precisao} m` : 'Definido';
  if (popupTitleEl) popupTitleEl.innerText = `${fonte} (Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)})`;
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

// A posicao da estacao vem exclusivamente da API.
function sincronizarLocalizacaoDispositivo() {}
function buscarLocalizacaoPorTexto() {}

let sensorChart = null;
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

function atualizarEstatisticas(leitura) {
  historicoLeituras.push(leitura);
  if (historicoLeituras.length > 50) {
    historicoLeituras.shift();
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
    sensorChart.update();
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

function adicionarAoHistorico(leitura, customTime = null) {
  const agora = customTime || new Date();
  const horaStr = agora.toLocaleTimeString('pt-BR');
  const dataStr = agora.toLocaleDateString('pt-BR');
  const fullTimestamp = `${dataStr} ${horaStr}`;

  let diagTexto = Object.values(leitura.qualidade || {}).includes('outlier_temporal') ? 'Leitura filtrada' : (['temperatura','umidade','pressao','qualidade_ar','luminosidade'].some(k => !Number.isFinite(leitura[k])) ? 'Dados parciais' : 'Normal');
  let diagClasse = 'tag-ok';

  if (leitura.qualidade_ar > 1800) {
    diagTexto = 'Ar Crítico';
    diagClasse = 'tag-alert';
  } else if (leitura.temperatura > 34) {
    diagTexto = 'Calor';
    diagClasse = 'tag-alert';
  } else if (Number.isFinite(leitura.umidade) && leitura.umidade < 30) {
    diagTexto = 'Ar Seco';
    diagClasse = 'tag-warn';
  } else if (leitura.qualidade_ar > 1200) {
    diagTexto = 'Atenção Ar';
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

  renderizarTabelaHistorico();
}

function renderizarTabelaHistorico() {
  const tbody = document.getElementById('historyTableBody');
  const counter = document.getElementById('historyCounter');
  if (!tbody) return;

  if (counter) counter.innerText = `${historicoTabela.length} registros`;

  if (historicoTabela.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">Nenhum registro armazenado nesta sessão.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = historicoTabela.map(item => `
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
  historicoTabela.length = 0;
  renderizarTabelaHistorico();
}

// ------------------------------------------------------------------------------
// 7. SISTEMA DE ALERTAS AMBIENTAIS (RF04)
// ------------------------------------------------------------------------------
let alertDismissed = false;

function verificarAlertas(data) {
  const banner = document.getElementById('alertBanner');
  const title = document.getElementById('alertTitle');
  const desc = document.getElementById('alertDesc');
  if (!banner || !title || !desc) return;

  const tempCritica = data.temperatura > 35.0;
  const arCritico = data.qualidade_ar > 1800;
  const umidCritica = Number.isFinite(data.umidade) && (data.umidade < 20.0 || data.umidade > 85.0);

  if (tempCritica || arCritico || umidCritica) {
    if (!alertDismissed) {
      banner.classList.remove('hidden');
      if (arCritico) {
        title.innerText = 'Alerta: Concentração Crítica de Gases Poluentes';
        desc.innerText = `Sensor MQ-135 detectou ${data.qualidade_ar} PPM de compostos químicos no ar.`;
      } else if (tempCritica) {
        title.innerText = 'Alerta: Temperatura Excessiva';
        desc.innerText = `Ambiente registrando ${data.temperatura}°C, acima da faixa de conforto térmico.`;
      } else if (umidCritica) {
        title.innerText = 'Alerta: Umidade Fora dos Limites Ideais';
        desc.innerText = `Índice de umidade relativa aferido em ${data.umidade}%.`;
      }
    }
  } else {
    banner.classList.add('hidden');
    alertDismissed = false; // Restaura quando as condições normalizarem
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


    const response = await fetch(API_URL, { signal: controller.signal });


    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (isDemoMode) return;
    historicoLeituras.length = 0;
    historicoTabela.length = 0;
    if (sensorChart) {
      sensorChart.data.labels.length = 0;
      sensorChart.data.datasets.forEach(d => { d.data.length = 0; });
    }
    for (const leitura of [...data.historico].reverse()) atualizarEstatisticas(leitura);
    renderizarTabelaHistorico();
    const estacao = data.estacao;
    if (estacao && Number.isFinite(estacao.latitude) && Number.isFinite(estacao.longitude)) {
      atualizarCoordenadasMapa(estacao.latitude, estacao.longitude, 'Cadastro da estacao');
      if (stationMarker) stationMarker.setOpacity(1);
    }
    if (sensorChart && !data.historico.length) sensorChart.update('none');
    const ultima = data.historico[0];
    renderizarDados(ultima || {}, false);
    if (!data.esp32_ativo) {
      if (statusBadge) statusBadge.classList.remove('online');
      if (statusText) statusText.innerText = ultima ? 'Estacao sem dados recentes' : 'Aguardando primeira leitura';
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
    if (apiStatus) apiStatus.innerText = 'API indisponivel';
    
    // Alerta o usuário no console e mantém cards informativos
    console.warn(`[TELEMETRIA] Falha ao consultar ${API_URL}:`, error.message);
  } finally {
    clearTimeout(timeoutId);
    consultaEmAndamento = false;
  }
}

function animarValorSeMudou(el, novoValor) {
  if (!el) return;
  const str = String(novoValor);
  if (el.innerText !== str && el.innerText !== '--') {
    el.classList.remove('value-updated');
    void el.offsetWidth; // Força recálculo para reiniciar a animação
    el.classList.add('value-updated');
  }
  el.innerText = str;
}

function renderizarDados(data, isMock) {
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const apiStatus = document.getElementById('apiStatus');
  const lastSync = document.getElementById('lastSync');

  // 1. Status Geral de Conexão
  if (statusBadge) statusBadge.classList.add('online');
  if (statusText) statusText.innerText = isMock ? 'Modo Demonstração' : `Online (${data.status || 'OK'})`;
  if (apiStatus) apiStatus.innerText = isMock ? 'Simulada (Local)' : 'Respondendo (200 OK)';
  if (lastSync) lastSync.innerText = data.data_hora ? new Date(data.data_hora).toLocaleString('pt-BR') : (isMock ? new Date().toLocaleTimeString('pt-BR') : '--');

  // 2. Preenchimento dos Cards com Micro-Animação de Pulso & Textos Editoriais
  // Temperatura
  const elTemp = document.getElementById('valTemp');
  const stTemp = document.getElementById('stTemp');
  if (elTemp) animarValorSeMudou(elTemp, Number.isFinite(data.temperatura) ? data.temperatura.toFixed(1) : '--');
  if (stTemp) {
    if (data.temperatura > 32) stTemp.innerText = 'Temperatura elevada. Ambiente com acúmulo térmico acima da faixa de conforto.';
    else if (data.temperatura < 18) stTemp.innerText = 'Temperatura amena. Condição térmica sob arrefecimento em relação à média.';
    else stTemp.innerText = 'Conforto térmico equilibrado. Medição com calibração contínua DHT22 e BMP280.';
  }

  // Pressão Atmosférica
  const elPress = document.getElementById('valPress');
  const stPress = document.getElementById('stPress');
  if (elPress) animarValorSeMudou(elPress, Number.isFinite(data.pressao) ? data.pressao.toFixed(1) : '--');
  if (stPress) {
    if (data.pressao > 1020) stPress.innerText = 'Alta pressão barométrica. Condição indicativa de atmosfera firme e tempo estável.';
    else if (data.pressao < 1005) stPress.innerText = 'Queda barométrica detectada. Gradiente de pressão favorável à instabilidade.';
    else stPress.innerText = 'Pressão atmosférica estável na cota altimétrica do relevo local.';
  }

  // Umidade Relativa
  const elUmid = document.getElementById('valUmid');
  const stUmid = document.getElementById('stUmid');
  if (elUmid) animarValorSeMudou(elUmid, Number.isFinite(data.umidade) ? data.umidade.toFixed(1) : '--');
  if (stUmid) {
    if (data.umidade < 30) stUmid.innerText = 'Ar excessivamente seco. Saturação abaixo dos padrões ideais de conforto respiratório.';
    else if (data.umidade > 70) stUmid.innerText = 'Umidade relativa alta. Ponto de orvalho próximo da condensação no ambiente.';
    else stUmid.innerText = 'Taxa de vapor d\'água equilibrada na faixa de conforto e conservação ambiental.';
  }

  // Qualidade do Ar
  const elAir = document.getElementById('valAir');
  const stAir = document.getElementById('stAir');
  if (elAir) animarValorSeMudou(elAir, Number.isFinite(data.qualidade_ar) ? data.qualidade_ar : '--');
  if (stAir) {
    if (data.qualidade_ar < 800) stAir.innerText = 'Ambiente purificado. Baixa concentração de gases voláteis e compostos redutores.';
    else if (data.qualidade_ar < 1600) stAir.innerText = 'Qualidade regular. Presença moderada de particulados suspensos ou CO₂ no ar.';
    else stAir.innerText = 'Atenção ambiental: saturação gasosa elevada detectada pelo sensor MQ-135.';
  }

  // Luminosidade
  const elLight = document.getElementById('valLight');
  const stLight = document.getElementById('stLight');
  if (elLight) animarValorSeMudou(elLight, Number.isFinite(data.luminosidade) ? data.luminosidade : '--');
  if (stLight) {
    if (data.luminosidade > 500) stLight.innerText = 'Luminosidade intensa. Plena incidência de radiação visível sobre o fotossensor.';
    else if (data.luminosidade > 150) stLight.innerText = 'Iluminação moderada típica de ambientes internos bem iluminados ou luz difusa.';
    else stLight.innerText = 'Baixa intensidade luminosa. Ambiente na penumbra ou iluminação noturna.';
  }

  // 3. Atualiza Estatísticas e Gráfico
  const sensoresUI = {temperatura: ['stTemp', 'compLocalTemp'], pressao: ['stPress', 'compLocalPress'],
    umidade: ['stUmid', 'compLocalHumid'], qualidade_ar: ['stAir', 'compLocalAir'], luminosidade: ['stLight']};
  Object.entries(sensoresUI).forEach(([campo, ids]) => {
    if (!Number.isFinite(data[campo])) ids.forEach(id => {
      const el = document.getElementById(id); if (el) el.innerText = 'Indisponivel';
    });
  });
  const deltas = {temperatura: 'deltaTempVal', umidade: 'deltaHumidVal', pressao: 'deltaPressVal'};
  Object.entries(deltas).forEach(([campo, id]) => {
    if (!Number.isFinite(data[campo])) {
      const el = document.getElementById(id); if (el) el.innerText = '--';
    }
  });
  if (!Number.isFinite(data.qualidade_ar)) {
    const el = document.getElementById('stAir');
    if (el && data.estado_sensores && data.estado_sensores.qualidade_ar === 'aquecendo') el.innerText = 'Sensor em aquecimento';
    if (el && data.estado_sensores && data.estado_sensores.qualidade_ar === 'calibracao_pendente') el.innerText = 'Calibracao pendente';
  }
  ['qualidade_ar', 'luminosidade'].forEach(campo => {
    if (Number.isFinite(data[campo])) {
      const el = document.getElementById(sensoresUI[campo][0]);
      if (el) el.innerText = 'Estimativa do sensor; depende de calibracao e do circuito.';
    }
  });

  if (isMock) atualizarEstatisticas(data);



  // 5. Verifica Alertas
  verificarAlertas(data);

  // 6. Atualiza o Módulo Comparativo com São Paulo
  atualizarComparativoLadoALado(data);
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
let dadosOficiaisSP = {
  temp: 14.2,
  tempMin: 14.1,
  tempMax: 22.1,
  apparentTemp: 13.3,
  humid: 85,
  pressMsl: 1019.5,
  pressSurface: 932.4,
  weatherCode: 3,
  precipitation: 0.0,
  aqi: 56,
  pm25: 16.7,
  pm10: 19.8,
  co: 165.0,
  no2: 28.0,
  o3: 29.0,
  airPpm: 543,
  coPpm: 0.144,
  no2Ppm: 0.015,
  lastUpdate: '--:--:--'
};

/**
 * Calcula a qualidade do ar de São Paulo expressa em PPM (Partes Por Milhão)
 * para viabilizar comparação direta com as leituras do sensor MQ-135 da estação ESP32.
 * 
 * Modelo Científico / Correlação Atmosférica:
 * - Linha de base da troposfera: ~415 PPM de CO2 atmosférico global
 * - Conversão de CO de µg/m³ para PPM (Massa molar CO = 28.01 g/mol, Vm = 24.45 L a 25°C e 1 atm):
 *     1 PPM CO = 1145 µg/m³
 * - Conversão de NO2 de µg/m³ para PPM (Massa molar NO2 = 46.01 g/mol):
 *     1 PPM NO2 = 1880 µg/m³
 * - Resposta proporcional do semicondutor SnO2 (MQ-135) à dispersão urbana de gases e particulados:
 *     Incremento por AQI (Cetesb/EPA): 1.8 PPM por ponto de AQI
 *     Incremento por material particulado (PM2.5): 1.2 PPM por cada 1 µg/m³
 */
function calcularQualidadeArSpEmPpm(aqi, coUgM3, pm25, no2UgM3) {
  const baseAtmosphericCo2Ppm = 415;
  const coPpm = (coUgM3 || 0) / 1145;
  const no2Ppm = (no2UgM3 || 0) / 1880;
  
  const incrementoAqi = (aqi || 0) * 1.8;
  const incrementoCo = coPpm * 40;
  const incrementoPm = ((pm25 || 0) / 10) * 12;
  const incrementoNo2 = no2Ppm * 80;

  const totalPpm = Math.round(baseAtmosphericCo2Ppm + incrementoAqi + incrementoCo + incrementoPm + incrementoNo2);
  return {
    totalPpm,
    coPpm: Number(coPpm.toFixed(3)),
    no2Ppm: Number(no2Ppm.toFixed(3)),
    baseAtmosphericCo2Ppm
  };
}

async function obterDadosComparativos(modo = modoComparativo) {
  modoComparativo = modo;

  const btnRefresh = document.getElementById('btnRefreshSP');
  if (btnRefresh) {
    btnRefresh.innerHTML = '<span class="material-symbols-rounded icon-sm spin-icon">sync</span> Atualizando...';
  }

  // Atualiza botões visuais do seletor
  const btnSP = document.getElementById('btnCompSP');
  const btnLocal = document.getElementById('btnCompLocal');
  if (btnSP && btnLocal) {
    if (modo === 'sp') {
      btnSP.classList.add('active');
      btnLocal.classList.remove('active');
    } else {
      btnLocal.classList.add('active');
      btnSP.classList.remove('active');
    }
  }

  let targetLat = -23.5505;
  let targetLng = -46.6333;
  let nomeEstacao = 'São Paulo Capital (Mirante de Santana • 758m altitude • WMO 83781)';
  let rotuloBadge = 'São Paulo Oficial';
  let prefixoSinc = 'Oficial SP';
  let tituloPanorama = 'Panorama Climático de São Paulo';
  let subtituloPanorama = 'Condições atmosféricas gerais aferidas para a metrópole';

  if (modo === 'local') {
    targetLat = currentCoords.lat || -23.5505;
    targetLng = currentCoords.lng || -46.6333;
    const localNome = currentCoords.bairro || currentCoords.source || 'Sua Região';
    nomeEstacao = `Sua Região: ${localNome} (GPS: ${targetLat.toFixed(4)}, ${targetLng.toFixed(4)})`;
    rotuloBadge = `${localNome.split('—')[0].split(',')[0].trim()} (Oficial)`;
    prefixoSinc = 'Oficial Região';
    tituloPanorama = `Panorama Climático da Sua Região`;
    subtituloPanorama = `Condições atmosféricas oficiais aferidas para suas coordenadas geográficas`;
  }

  const compMetaStation = document.getElementById('compMetaStation');
  const compMetaIcon = document.getElementById('compMetaIcon');
  const syncLabelPrefix = document.getElementById('syncLabelPrefix');
  const spOverviewTitle = document.getElementById('spOverviewTitle');
  const spOverviewSubtitle = document.getElementById('spOverviewSubtitle');
  const compOfficialBadgeTexts = document.querySelectorAll('.comp-official-badge-text');

  if (compMetaStation) compMetaStation.innerText = nomeEstacao;
  if (compMetaIcon) compMetaIcon.innerText = modo === 'local' ? 'my_location' : 'location_city';
  if (syncLabelPrefix) syncLabelPrefix.innerText = prefixoSinc;
  if (spOverviewTitle) spOverviewTitle.innerText = tituloPanorama;
  if (spOverviewSubtitle) spOverviewSubtitle.innerText = subtituloPanorama;
  compOfficialBadgeTexts.forEach(el => { el.innerText = rotuloBadge; });

  try {
    // 1. Clima, extremos diários e pressão para a coordenada alvo (SP Capital ou Coordenada GPS do usuário)
    const urlClima = `https://api.open-meteo.com/v1/forecast?latitude=${targetLat}&longitude=${targetLng}&current=temperature_2m,relative_humidity_2m,surface_pressure,pressure_msl,apparent_temperature,precipitation,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=America%2FSao_Paulo`;
    
    // 2. Qualidade do ar para a coordenada alvo
    const urlAr = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${targetLat}&longitude=${targetLng}&current=us_aqi,european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone&timezone=America%2FSao_Paulo`;

    const [respClima, respAr] = await Promise.all([
      fetch(urlClima),
      fetch(urlAr)
    ]);

    if (respClima.ok) {
      const dataClima = await respClima.json();
      const curr = dataClima.current || {};
      const daily = dataClima.daily || {};

      dadosOficiaisSP.temp = curr.temperature_2m ?? dadosOficiaisSP.temp;
      dadosOficiaisSP.humid = curr.relative_humidity_2m ?? dadosOficiaisSP.humid;
      dadosOficiaisSP.pressMsl = curr.pressure_msl ?? dadosOficiaisSP.pressMsl;
      dadosOficiaisSP.pressSurface = curr.surface_pressure ?? dadosOficiaisSP.pressSurface;
      dadosOficiaisSP.apparentTemp = curr.apparent_temperature ?? dadosOficiaisSP.apparentTemp;
      dadosOficiaisSP.precipitation = curr.precipitation ?? dadosOficiaisSP.precipitation;
      dadosOficiaisSP.weatherCode = curr.weather_code ?? dadosOficiaisSP.weatherCode;

      if (daily.temperature_2m_min && daily.temperature_2m_min.length > 0) {
        dadosOficiaisSP.tempMin = daily.temperature_2m_min[0];
      }
      if (daily.temperature_2m_max && daily.temperature_2m_max.length > 0) {
        dadosOficiaisSP.tempMax = daily.temperature_2m_max[0];
      }
    }

    if (respAr.ok) {
      const dataAr = await respAr.json();
      const currAr = dataAr.current || {};
      dadosOficiaisSP.aqi = currAr.us_aqi ?? dadosOficiaisSP.aqi;
      dadosOficiaisSP.pm25 = currAr.pm2_5 ?? dadosOficiaisSP.pm25;
      dadosOficiaisSP.pm10 = currAr.pm10 ?? dadosOficiaisSP.pm10;
      dadosOficiaisSP.co = currAr.carbon_monoxide ?? dadosOficiaisSP.co;
      dadosOficiaisSP.no2 = currAr.nitrogen_dioxide ?? dadosOficiaisSP.no2;
      dadosOficiaisSP.o3 = currAr.ozone ?? dadosOficiaisSP.o3;

      // Executa cálculo do PPM equivalente
      const calcPpm = calcularQualidadeArSpEmPpm(
        dadosOficiaisSP.aqi,
        dadosOficiaisSP.co,
        dadosOficiaisSP.pm25,
        dadosOficiaisSP.no2
      );
      dadosOficiaisSP.airPpm = calcPpm.totalPpm;
      dadosOficiaisSP.coPpm = calcPpm.coPpm;
      dadosOficiaisSP.no2Ppm = calcPpm.no2Ppm;
    }

    dadosOficiaisSP.lastUpdate = new Date().toLocaleTimeString('pt-BR');
    renderizarDadosOficiaisSP();

    if (ultimaLeituraLocal) {
      atualizarComparativoLadoALado(ultimaLeituraLocal);
    }
    console.log(`[OPEN-METEO] Dados comparativos (${modo.toUpperCase()}: Lat ${targetLat}, Lng ${targetLng}) sincronizados com sucesso.`);
  } catch (err) {
    console.warn("[OPEN-METEO] Falha ao sincronizar dados comparativos:", err);
  } finally {
    if (btnRefresh) {
      const label = modo === 'local' ? 'Atualizar Região' : 'Atualizar SP';
      btnRefresh.innerHTML = `<span class="material-symbols-rounded icon-sm">refresh</span> <span id="btnRefreshSPLabel">${label}</span>`;
    }
  }
}

// Alias de retrocompatibilidade
const obterDadosOficiaisSaoPaulo = () => obterDadosComparativos(modoComparativo);

function renderizarDadosOficiaisSP() {
  const spLastUpdate = document.getElementById('spLastUpdate');
  const compSpTemp = document.getElementById('compSpTemp');
  const spTempMin = document.getElementById('spTempMin');
  const spTempMax = document.getElementById('spTempMax');
  const spApparentTemp = document.getElementById('spApparentTemp');
  const compSpHumid = document.getElementById('compSpHumid');
  const compSpPress = document.getElementById('compSpPress');
  const spPressMsl = document.getElementById('spPressMsl');
  const spPressSurface = document.getElementById('spPressSurface');
  const compSpAirPpm = document.getElementById('compSpAirPpm');
  const compSpAqi = document.getElementById('compSpAqi');
  const spPm25 = document.getElementById('spPm25');
  const spPm10 = document.getElementById('spPm10');
  const spCo = document.getElementById('spCo');
  const spNo2 = document.getElementById('spNo2');
  const compSpAirFormulaHint = document.getElementById('compSpAirFormulaHint');
  const spWeatherIcon = document.getElementById('spWeatherIcon');
  const spWeatherDesc = document.getElementById('spWeatherDesc');
  const spPrecipitation = document.getElementById('spPrecipitation');
  const spThermalRange = document.getElementById('spThermalRange');

  if (spLastUpdate) spLastUpdate.innerText = dadosOficiaisSP.lastUpdate;
  if (compSpTemp) compSpTemp.innerText = dadosOficiaisSP.temp.toFixed(1);
  if (spTempMin) spTempMin.innerText = `${dadosOficiaisSP.tempMin.toFixed(1)}°C`;
  if (spTempMax) spTempMax.innerText = `${dadosOficiaisSP.tempMax.toFixed(1)}°C`;
  if (spApparentTemp) spApparentTemp.innerText = `${dadosOficiaisSP.apparentTemp.toFixed(1)}°C`;
  if (compSpHumid) compSpHumid.innerText = Math.round(dadosOficiaisSP.humid);
  if (compSpPress) compSpPress.innerText = dadosOficiaisSP.pressMsl.toFixed(1);
  if (spPressMsl) spPressMsl.innerText = `${dadosOficiaisSP.pressMsl.toFixed(1)} hPa`;
  if (spPressSurface) spPressSurface.innerText = `${dadosOficiaisSP.pressSurface.toFixed(1)} hPa`;
  
  if (compSpAirPpm) compSpAirPpm.innerText = Math.round(dadosOficiaisSP.airPpm);
  if (compSpAqi) compSpAqi.innerText = Math.round(dadosOficiaisSP.aqi);
  if (spPm25) spPm25.innerText = `${dadosOficiaisSP.pm25.toFixed(1)} µg/m³`;
  if (spPm10) spPm10.innerText = `${dadosOficiaisSP.pm10.toFixed(1)} µg/m³`;
  if (spCo) spCo.innerText = `${Math.round(dadosOficiaisSP.co)} µg/m³ (${dadosOficiaisSP.coPpm} ppm)`;
  if (spNo2) spNo2.innerText = `${dadosOficiaisSP.no2.toFixed(1)} µg/m³`;
  if (compSpAirFormulaHint) {
    compSpAirFormulaHint.innerText = `Cálculo: Base 415 + AQI(${Math.round(dadosOficiaisSP.aqi)}) + Gases/Particulados`;
  }
  if (spPrecipitation) spPrecipitation.innerText = `${dadosOficiaisSP.precipitation.toFixed(1)} mm`;

  const amplitude = dadosOficiaisSP.tempMax - dadosOficiaisSP.tempMin;
  if (spThermalRange) spThermalRange.innerText = `${amplitude.toFixed(1)} °C`;

  // Tradução do WMO Weather Code
  const condicao = traduzirCondicaoTempo(dadosOficiaisSP.weatherCode);
  if (spWeatherIcon) spWeatherIcon.innerText = condicao.icon;
  if (spWeatherDesc) spWeatherDesc.innerText = condicao.desc;
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
  if (!data) return;
  ultimaLeituraLocal = data;

  const compLocalTemp = document.getElementById('compLocalTemp');
  const compLocalHumid = document.getElementById('compLocalHumid');
  const compLocalPress = document.getElementById('compLocalPress');
  const compLocalAir = document.getElementById('compLocalAir');

  if (compLocalTemp && Number.isFinite(data.temperatura)) compLocalTemp.innerText = data.temperatura.toFixed(1);
  if (compLocalHumid && Number.isFinite(data.umidade)) compLocalHumid.innerText = data.umidade.toFixed(1);
  if (compLocalPress && Number.isFinite(data.pressao)) compLocalPress.innerText = data.pressao.toFixed(1);
  if (compLocalAir && Number.isFinite(data.qualidade_ar)) compLocalAir.innerText = Math.round(data.qualidade_ar);

  const regiaoNome = modoComparativo === 'local' ? (currentCoords.bairro || 'sua região') : 'São Paulo';
  const regiaoRef = modoComparativo === 'local' ? 'da sua região geográfica' : 'de São Paulo (Mirante de Santana)';

  // 1. Delta Temperatura
  if (Number.isFinite(data.temperatura)) {
    const deltaT = data.temperatura - dadosOficiaisSP.temp;
    const badge = document.getElementById('deltaTempBadge');
    const val = document.getElementById('deltaTempVal');
    const analysis = document.getElementById('analysisTemp');

    if (badge && val) {
      badge.classList.remove('delta-hot', 'delta-cold', 'delta-equal');
      const sinal = deltaT > 0 ? '+' : '';
      val.innerText = `${sinal}${deltaT.toFixed(1)} °C`;

      if (deltaT > 0.5) {
        badge.classList.add('delta-hot');
        if (analysis) analysis.innerText = `Microclima local está ${deltaT.toFixed(1)}°C acima da temperatura oficial ${regiaoRef}. Típico de ambientes internos, proximidade de equipamentos eletrônicos ou retenção térmica de alvenaria.`;
      } else if (deltaT < -0.5) {
        badge.classList.add('delta-cold');
        if (analysis) analysis.innerText = `Ambiente local está ${Math.abs(deltaT).toFixed(1)}°C mais fresco que a referência oficial ${regiaoRef}, evidenciando boa ventilação, sombra ou atuação de climatização.`;
      } else {
        badge.classList.add('delta-equal');
        if (analysis) analysis.innerText = `Temperatura local em perfeito equilíbrio térmico com a medição registrada para ${regiaoNome}.`;
      }
    }
  }

  // 2. Delta Umidade
  if (Number.isFinite(data.umidade)) {
    const deltaH = data.umidade - dadosOficiaisSP.humid;
    const badge = document.getElementById('deltaHumidBadge');
    const val = document.getElementById('deltaHumidVal');
    const analysis = document.getElementById('analysisHumid');

    if (badge && val) {
      badge.classList.remove('delta-hot', 'delta-cold', 'delta-equal');
      const sinal = deltaH > 0 ? '+' : '';
      val.innerText = `${sinal}${deltaH.toFixed(1)} %`;

      if (deltaH > 3) {
        badge.classList.add('delta-cold');
        if (analysis) analysis.innerText = `Ar do ambiente local apresenta saturação de vapor ${deltaH.toFixed(1)}% maior que a média aberta ${regiaoRef}.`;
      } else if (deltaH < -3) {
        badge.classList.add('delta-hot');
        if (analysis) analysis.innerText = `Ar local está ${Math.abs(deltaH).toFixed(1)}% mais seco que o ar livre ${regiaoRef}. Comum sob uso de ar-condicionado ou aquecimento por componentes.`;
      } else {
        badge.classList.add('delta-equal');
        if (analysis) analysis.innerText = `Taxa de umidade relativa alinhada à média higrométrica oficial registrada para ${regiaoNome}.`;
      }
    }
  }

  // 3. Delta Pressão Atmosférica
  if (Number.isFinite(data.pressao)) {
    const deltaP = data.pressao - dadosOficiaisSP.pressMsl;
    const badge = document.getElementById('deltaPressBadge');
    const val = document.getElementById('deltaPressVal');
    const analysis = document.getElementById('analysisPress');

    if (badge && val) {
      badge.classList.remove('delta-hot', 'delta-cold', 'delta-equal');
      const sinal = deltaP > 0 ? '+' : '';
      val.innerText = `${sinal}${deltaP.toFixed(1)} hPa`;
      badge.classList.add('delta-equal');

      if (analysis) {
        analysis.innerText = `Pressão aferida pelo BMP280 (${data.pressao.toFixed(1)} hPa) reflete a cota altimétrica onde o sensor opera, em harmonia com o gradiente barométrico calculado para ${regiaoNome}.`;
      }
    }
  }

  const deltaAr = document.getElementById('deltaAirVal');
  const analiseAr = document.getElementById('analysisAir');
  if (deltaAr) deltaAr.innerText = '--';
  if (analiseAr) analiseAr.innerText = 'MQ-135 estimado e indices oficiais nao sao diretamente comparaveis.';

}

// ------------------------------------------------------------------------------
// CONFIGURAÇÃO CENTRALIZADA DE EVENTOS E TOUCH PARA DESKTOP E MOBILE
// ------------------------------------------------------------------------------
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
    if (melhorPrecisaoGps > 100 || Math.abs(currentCoords.lat - DEFAULT_LAT) < 0.001) {
      sincronizarLocalizacaoDispositivo(false);
    }
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
  document.querySelectorAll('#btnGetLocation, #btnSearchAddress, #inputAddressSearch, #btnClearSearch').forEach(el => {
    el.disabled = true; el.title = 'Posicao definida pelo cadastro da estacao';
  });

  // Sincroniza os dados meteorológicos oficiais de São Paulo
  obterDadosOficiaisSaoPaulo();

  // Sincroniza automaticamente e de imediato com o GPS real do dispositivo
  sincronizarLocalizacaoDispositivo(true);

  atualizarDashboard();

  // Ciclo periódico de telemetria a cada 2.5 segundos
  setInterval(atualizarDashboard, 2500);

  // Ciclo periódico para dados de São Paulo a cada 5 minutos (300.000 ms)
  setInterval(obterDadosOficiaisSaoPaulo, 300000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  // Caso o script carregue após a montagem do DOM
  boot();
}
