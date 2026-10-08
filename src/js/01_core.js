/* ============================================================
   Kaporo — noyau : configuration, état, utilitaires
   ============================================================ */
const SUPA = { url: 'https://opbxmnrtbzsxgwtfeemv.supabase.co', key: 'sb_publishable_UhCNYCizOEoofZ7_BiVs9g_7Z0wElT8', bucket: 'kp-files' };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const hhmm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
function dateFr(x, opts = {}) {
  if (!x) return '—';
  const d = x instanceof Date ? x : new Date(x.length === 10 ? x + 'T12:00:00' : x);
  if (isNaN(d)) return '—';
  const s = d.getDate() + ' ' + MOIS[d.getMonth()] + (opts.annee === false ? '' : ' ' + d.getFullYear());
  return opts.jour ? JOURS[d.getDay()] + ' ' + s : s;
}
function jourRelatif(d) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  const diff = Math.round((a - b) / 86400000);
  if (diff === 0) return 'Aujourd’hui';
  if (diff === 1) return 'Hier';
  if (diff < 7) return JOURS[b.getDay()].replace(/^./, c => c.toUpperCase());
  return dateFr(b, { jour: true });
}
const octets = n => !n ? '' : n < 1024 ? n + ' o' : n < 1048576 ? (n / 1024).toFixed(0) + ' Ko' : (n / 1048576).toFixed(1) + ' Mo';
const initiales = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
function linkify(t) {
  return esc(t).replace(/(https?:\/\/[^\s<]+)/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}
let toastT;
function toast(html, ms = 2600) { const t = $('#toast'); t.innerHTML = html; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }

/* État applicatif */
const state = {
  client: null, session: null, moi: null,
  vue: localStorage.getItem('kp.vue') || 'discussions',
  canal: localStorage.getItem('kp.canal') || null, salonOuvert: false,
  membres: [], projets: [], canaux: [], messages: [], lectures: {}, documents: [], decisions: [], phases: [], taches: [],
  reponseA: null, pj: null, selection: null, urls: {}, filtreProjet: 'tous', filtreDoc: 'tous', filtreTache: 'ouvertes',
};
const membre = id => state.membres.find(m => m.user_id === id) || { name: 'Membre', color: '#6B6B6B', user_id: id };
const projet = id => state.projets.find(p => p.id === id);
const nomProjet = id => id ? (projet(id)?.name || id) : 'Général';

/* Modale générique */
function modal(html, onMount) {
  const o = $('#overlay');
  o.innerHTML = `<div class="modal" id="modal"><div class="boite">${html}</div></div>`;
  const m = $('#modal');
  m.addEventListener('click', e => { if (e.target === m) fermerModal(); });
  if (onMount) onMount(m);
  return m;
}
function fermerModal() { $('#overlay').innerHTML = ''; }
function lightbox(src) {
  const o = $('#overlay');
  o.innerHTML = `<div class="lightbox" id="lb"><button aria-label="Fermer">✕</button><img src="${src}" alt=""></div>`;
  $('#lb').addEventListener('click', fermerModal);
}

/* Fichiers du coffre : URLs signées (1 h), mises en cache */
async function urlFichier(path) {
  const c = state.urls[path];
  if (c && c.exp > Date.now()) return c.url;
  const { data, error } = await state.client.storage.from(SUPA.bucket).createSignedUrl(path, 3600);
  if (error) throw error;
  state.urls[path] = { url: data.signedUrl, exp: Date.now() + 3300000 };
  return data.signedUrl;
}
async function televerser(file, dossier) {
  const nom = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
  const path = `${dossier}/${Date.now()}_${nom}`;
  const { error } = await state.client.storage.from(SUPA.bucket).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw error;
  return { path, name: file.name, mime: file.type, size: file.size };
}
