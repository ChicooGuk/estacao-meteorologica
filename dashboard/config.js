// Dominio de desenvolvimento atribuido a conta ngrok do projeto.
// Localmente, a API continua sendo acessada na mesma origem do dashboard.
(() => {
  const hostsFirebase = [
    'estacao-metedologica.web.app',
    'estacao-metedologica.firebaseapp.com'
  ];
  if (hostsFirebase.includes(window.location.hostname)) {
    window.ESTACAO_API_BASE = 'https://hangup-oblivion-second.ngrok-free.dev';
  }
})();
