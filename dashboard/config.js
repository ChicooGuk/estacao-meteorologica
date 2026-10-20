// Endereco temporario do backend no notebook. Atualize se o tunel mudar.
// Localmente, a API continua sendo acessada na mesma origem do dashboard.
(() => {
  const hostsFirebase = [
    'estacao-metedologica.web.app',
    'estacao-metedologica.firebaseapp.com'
  ];
  if (hostsFirebase.includes(window.location.hostname)) {
    window.ESTACAO_API_BASE = 'https://joy-except-methodology-golden.trycloudflare.com';
  }
})();
