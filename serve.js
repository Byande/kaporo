// Serveur local de test (port 3000 = URL de site par défaut de Supabase Auth, pour les liens magiques)
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, 'docs');
const GO = process.env.KAPORO_GO_FILE; // test local : fichier contenant l'URL de session vers laquelle rediriger une seule fois
http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  if (p === '/go' && GO && fs.existsSync(GO)) { const u = fs.readFileSync(GO, 'utf8').trim(); fs.unlinkSync(GO); r.writeHead(302, { Location: u }); r.end(); return; }
  fs.readFile(path.join(root, p), (e, d) => {
    if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(d);
  });
}).listen(3000, () => console.log('Kaporo sur http://localhost:3000'));
