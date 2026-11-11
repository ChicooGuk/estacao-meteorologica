// API publica encaminhada pelo Cloudflare Tunnel.
// Em localhost, o dashboard utiliza a API da mesma origem.
(() => {
  const hostsFirebase = ['estacao-metedologica.web.app', 'estacao-metedologica.firebaseapp.com'];
  if (hostsFirebase.includes(window.location.hostname)) {
    window.ESTACAO_API_BASE = "https://portrait-out-boring-tablets.trycloudflare.com";
  }
})();