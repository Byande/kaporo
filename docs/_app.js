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
const prenom = n => (n || '').trim().split(/\s+/)[0] || '';
const echapRegex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  membres: [], projets: [], canaux: [], participants: {}, messages: [], lectures: {}, documents: [], decisions: [], phases: [], taches: [],
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

/* ============================================================
   Connexion : lien magique ou mot de passe ; liste blanche côté base
   ============================================================ */
let modePass = false;
function msgLogin(type, html) { $('#l-msg').innerHTML = html ? `<div class="msg ${type}">${html}</div>` : ''; }
function expliquerErreur(e) {
  const m = (e && e.message) || String(e);
  if (/KAPORO_NOT_INVITED|Database error saving new user|Signups not allowed/i.test(m)) return 'Cette adresse n’est pas encore invitée. Demandez à Paul de vous ajouter dans l’onglet Équipe.';
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
  if (/rate limit|security purposes/i.test(m)) return 'Trop de demandes en peu de temps. Patientez une minute puis réessayez.';
  if (/Email not confirmed/i.test(m)) return 'Adresse non confirmée : cliquez d’abord sur le lien reçu par e-mail.';
  return 'Connexion impossible : ' + esc(m);
}
function initLogin() {
  $('#l-toggle').addEventListener('click', () => {
    modePass = !modePass;
    $('#l-pass-wrap').hidden = !modePass;
    $('#l-btn').textContent = modePass ? 'Se connecter' : 'Recevoir mon lien de connexion';
    $('#l-toggle').textContent = modePass ? 'Recevoir plutôt un lien par e-mail' : 'J’ai déjà un mot de passe';
    msgLogin('', '');
  });
  $('#f-login').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#l-email').value.trim().toLowerCase();
    const btn = $('#l-btn'); btn.disabled = true; msgLogin('info', 'Un instant…');
    try {
      if (modePass) {
        const { error } = await state.client.auth.signInWithPassword({ email, password: $('#l-pass').value });
        if (error) throw error;
        msgLogin('', '');
      } else {
        const redirect = location.origin + location.pathname;
        const { error } = await state.client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: true } });
        if (error) throw error;
        msgLogin('ok', `<b>Lien envoyé à ${esc(email)}.</b><br>Ouvrez l’e-mail sur cet appareil et touchez le lien pour entrer. Pensez à vérifier les courriers indésirables.`);
      }
    } catch (err) { msgLogin('err', expliquerErreur(err)); }
    btn.disabled = false;
  });
}
async function definirMotDePasse(pw) {
  const { error } = await state.client.auth.updateUser({ password: pw });
  if (error) throw error;
}
async function deconnecter() { await state.client.auth.signOut(); location.reload(); }

/* ============================================================
   Discussions : canaux, fil de messages, composer, temps réel
   ============================================================ */
const msgsCanal = id => state.messages.filter(m => m.channel_id === id);
const estPrive = c => !!c && c.kind === 'prive';
const participants = id => state.participants[id] || [];
const autresParticipants = id => participants(id).filter(u => u !== state.moi.user_id).map(membre);
const meMentionne = m => !!(m.mentions && m.mentions.includes(state.moi.user_id)) && m.author !== state.moi.user_id;
/* Nom affiché d'un canal : les canaux d'équipe gardent leur nom, une conversation privée porte le nom des autres participants */
function nomCanal(c) {
  if (!c) return '';
  if (!estPrive(c)) return c.name;
  const a = autresParticipants(c.id);
  if (!a.length) return 'Moi';
  return a.length === 1 ? a[0].name : a.map(m => prenom(m.name)).join(', ');
}
function iconeCanal(c) {
  if (c.kind === 'general') return { txt: '✦', style: '' };
  if (estPrive(c)) {
    const a = autresParticipants(c.id);
    return a.length === 1 ? { txt: initiales(a[0].name), style: `background:${a[0].color};color:#fff;font-family:inherit;font-size:.85em` } : { txt: '👥', style: 'background:var(--or-fond);font-size:1.1em' };
  }
  return { txt: c.name.replace(/\D/g, '') || c.name[0], style: '' };
}
function nonLus(id) {
  const lu = state.lectures[id] ? new Date(state.lectures[id]).getTime() : 0;
  return msgsCanal(id).filter(m => m.author !== state.moi.user_id && new Date(m.created_at).getTime() > lu).length;
}
function mentionsNonLues(id) {
  const lu = state.lectures[id] ? new Date(state.lectures[id]).getTime() : 0;
  return msgsCanal(id).filter(m => meMentionne(m) && new Date(m.created_at).getTime() > lu).length;
}
const totalNonLus = () => state.canaux.reduce((s, c) => s + nonLus(c.id), 0);
function resumeMessage(m) {
  if (!m) return 'Aucun message';
  if (m.deleted) return 'Message supprimé';
  const a = m.attachment;
  const pj = a ? (a.mime?.startsWith('image/') ? '📷 Photo' : '📎 ' + a.name) : '';
  return (m.body || pj || '').slice(0, 80);
}

function vueDiscussions() {
  const main = $('#main'); main.className = 'chat';
  main.innerHTML = `<div class="chat-wrap ${state.salonOuvert ? 'ouvert' : ''}" id="chat">
    <aside class="canaux"><h2>Discussions</h2><div id="liste-canaux"></div></aside>
    <section class="salon" id="salon"></section></div>`;
  renderCanaux();
  if (!state.canal || !state.canaux.find(c => c.id === state.canal)) state.canal = state.canaux[0]?.id;
  renderSalon();
}
function canauxTries() {
  const dernier = id => { const ms = msgsCanal(id); return ms.length ? ms[ms.length - 1].created_at : ''; };
  return {
    equipe: state.canaux.filter(c => !estPrive(c)).sort((a, b) => a.sort - b.sort),
    prives: state.canaux.filter(estPrive).sort((a, b) => dernier(b.id).localeCompare(dernier(a.id))),
  };
}
function boutonCanal(c) {
  const ms = msgsCanal(c.id); const dernier = ms[ms.length - 1]; const nl = nonLus(c.id); const at = mentionsNonLues(c.id); const ic = iconeCanal(c);
  const qui = dernier ? (dernier.author === state.moi.user_id ? 'Vous' : prenom(membre(dernier.author).name)) + ' : ' : '';
  return `<button class="canal ${c.kind === 'general' ? 'gen' : ''} ${c.id === state.canal ? 'on' : ''}" data-id="${c.id}">
      <span class="ic" style="${ic.style}">${ic.txt}</span>
      <span><b>${esc(nomCanal(c))}</b><small>${esc(qui + resumeMessage(dernier))}</small></span>
      <span class="meta"><span>${dernier ? (jourRelatif(dernier.created_at) === 'Aujourd’hui' ? hhmm(new Date(dernier.created_at)) : dateFr(dernier.created_at, { annee: false })) : ''}</span>${nl ? `<span class="bd ${at ? 'at' : ''}">${at ? '@ ' : ''}${nl}</span>` : ''}</span></button>`;
}
function renderCanaux() {
  const el = $('#liste-canaux'); if (!el) return;
  const { equipe, prives } = canauxTries();
  el.innerHTML = `<div class="grp">Équipe</div>${equipe.map(boutonCanal).join('')}
    <div class="grp">Conversations privées<button class="btn sm or" id="nouv-conv" title="Écrire à une ou plusieurs personnes">+ Nouvelle</button></div>
    ${prives.length ? prives.map(boutonCanal).join('') : '<div class="vide-sm">Aucune conversation privée. Cliquez sur « Nouvelle » pour écrire à une ou plusieurs personnes.</div>'}`;
  $$('.canal', el).forEach(b => b.addEventListener('click', () => ouvrirCanal(b.dataset.id)));
  $('#nouv-conv', el).addEventListener('click', nouvelleConversation);
}
/* Création d'une conversation privée : on coche une ou plusieurs personnes */
function nouvelleConversation() {
  const autres = state.membres.filter(m => m.user_id !== state.moi.user_id);
  if (!autres.length) { toast('Aucun autre membre pour le moment.'); return; }
  modal(`<h3>Nouvelle conversation</h3><p class="sous sm">Seules les personnes cochées verront les messages. Une personne : message direct. Plusieurs : petit groupe.</p>
    <div id="choix-membres">${autres.map(m => `<label class="choix"><input type="checkbox" value="${m.user_id}"><span class="avatar" style="background:${m.color}">${initiales(m.name)}</span><span><b>${esc(m.name)}</b><small>${esc(m.role)}</small></span></label>`).join('')}</div>
    <div class="actions"><button class="btn prim" id="conv-ok" disabled>Ouvrir la conversation</button><button class="btn" onclick="fermerModal()">Annuler</button></div>`, mo => {
    const ok = $('#conv-ok', mo); const cases = $$('input[type=checkbox]', mo);
    const maj = () => { const n = cases.filter(c => c.checked).length; ok.disabled = !n; ok.textContent = n > 1 ? `Ouvrir le groupe (${n} personnes)` : 'Ouvrir la conversation'; };
    cases.forEach(c => c.addEventListener('change', maj));
    ok.addEventListener('click', async () => {
      const ids = cases.filter(c => c.checked).map(c => c.value); if (!ids.length) return;
      ok.disabled = true;
      const { data, error } = await state.client.rpc('kp_create_private_channel', { others: ids });
      if (error) { console.error(error); toast('<b>Création impossible.</b> Vérifiez la connexion.'); ok.disabled = false; return; }
      fermerModal(); await rechargerCanaux(); ouvrirCanal(data);
    });
  });
}
function ouvrirCanal(id) {
  state.canal = id; state.salonOuvert = true; state.reponseA = null; state.selection = null;
  localStorage.setItem('kp.canal', id);
  $('#chat')?.classList.add('ouvert');
  renderCanaux(); renderSalon();
}
function fermerSalon() { state.salonOuvert = false; $('#chat')?.classList.remove('ouvert'); renderCanaux(); }

function renderSalon() {
  const s = $('#salon'); if (!s) return;
  const c = state.canaux.find(x => x.id === state.canal);
  if (!c) { s.innerHTML = '<div class="vide">Choisissez une discussion.</div>'; return; }
  const ic = iconeCanal(c);
  const qui = estPrive(c) ? (autresParticipants(c.id).length > 1 ? 'Vous, ' + autresParticipants(c.id).map(m => prenom(m.name)).join(', ') : 'Conversation privée') : state.membres.map(m => prenom(m.name)).join(', ');
  s.innerHTML = `<div class="tete"><button class="retour" id="retour" aria-label="Retour">‹</button>
      <span class="avatar" style="background:${c.kind === 'general' ? 'var(--or)' : 'var(--encre)'};color:${c.kind === 'general' ? 'var(--encre)' : 'var(--or)'};${ic.style}">${ic.txt}</span>
      <div><b>${esc(nomCanal(c))}</b><small>${esc(qui)}</small></div></div>
    <div class="fil" id="fil"></div>
    <div class="composer" id="composer"></div>`;
  $('#retour').addEventListener('click', fermerSalon);
  renderFil(); renderComposer(); marquerLu(c.id);
}
function renderFil(garderScroll) {
  const fil = $('#fil'); if (!fil) return;
  const ms = msgsCanal(state.canal);
  const enBas = !garderScroll || fil.scrollHeight - fil.scrollTop - fil.clientHeight < 120;
  let jour = ''; const out = [];
  if (!ms.length) out.push('<div class="systeme">Début de la discussion. Écrivez le premier message.</div>');
  for (const m of ms) {
    const j = jourRelatif(m.created_at);
    if (j !== jour) { out.push(`<div class="jour">${j}</div>`); jour = j; }
    out.push(bulle(m));
    if (state.selection === m.id) out.push(actionsBulle(m));
  }
  fil.innerHTML = out.join('');
  $$('.bulle', fil).forEach(b => b.addEventListener('click', e => {
    if (e.target.closest('a,img')) return;
    state.selection = state.selection === b.dataset.id ? null : b.dataset.id; renderFil(true);
  }));
  $$('img.pj', fil).forEach(img => { chargerImage(img); img.addEventListener('click', () => img.src && img.dataset.ok && lightbox(img.src)); });
  $$('a.fichier', fil).forEach(a => a.addEventListener('click', async e => { e.preventDefault(); try { window.open(await urlFichier(a.dataset.path), '_blank'); } catch (err) { toast('Fichier indisponible'); } }));
  $$('.bulle-actions button', fil).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); actionMessage(b.dataset.act, b.dataset.id); }));
  if (enBas) fil.scrollTop = fil.scrollHeight;
}
function bulle(m) {
  const moi = m.author === state.moi.user_id; const a = membre(m.author);
  let corps = '';
  if (m.deleted) corps = '<div class="txt">Message supprimé</div>';
  else {
    if (m.reply_to) { const r = state.messages.find(x => x.id === m.reply_to); corps += `<div class="rep"><b>${esc(r ? membre(r.author).name : 'Message')}</b>${esc(resumeMessage(r))}</div>`; }
    if (m.attachment) {
      const p = m.attachment;
      corps += p.mime?.startsWith('image/') ? `<img class="pj" data-path="${esc(p.path)}" alt="${esc(p.name)}">`
        : `<a class="fichier" href="#" data-path="${esc(p.path)}"><span class="ic">${esc((p.name.split('.').pop() || 'DOC').slice(0, 4).toUpperCase())}</span><span><b>${esc(p.name)}</b><small>${octets(p.size)}</small></span></a>`;
    }
    if (m.body) corps += `<div class="txt">${formaterCorps(m)}</div>`;
  }
  return `<div class="bulle ${moi ? 'moi' : ''} ${m.deleted ? 'supprime' : ''} ${state.selection === m.id ? 'sel' : ''} ${meMentionne(m) ? 'mention-moi' : ''}" data-id="${m.id}">
    ${moi ? '' : `<div class="qui" style="color:${a.color}">${esc(a.name)}</div>`}${corps}
    <div class="quand">${m.edited_at ? '<span>modifié</span>' : ''}<span>${hhmm(new Date(m.created_at))}</span></div></div>`;
}
/* Mentions : @Prénom, @Prénom Nom ou @tous. Les noms mentionnés sont surlignés dans la bulle. */
const MOTS_TOUS = ['tous', 'toutes', 'équipe', 'equipe', 'all'];
function nomsMention(u) { return [u.name, prenom(u.name)].filter(Boolean); }
function regexMentions(membres, flags) {
  const noms = [...MOTS_TOUS];
  for (const u of membres) noms.push(...nomsMention(u));
  const alt = [...new Set(noms)].sort((a, b) => b.length - a.length).map(echapRegex).join('|');
  return new RegExp('(^|[^\\p{L}\\p{N}_@])@(' + alt + ')(?![\\p{L}\\p{N}_])', flags);
}
function formaterCorps(m) {
  const html = linkify(m.body);
  const ids = m.mentions || []; if (!ids.length) return html;
  const membres = ids.map(membre);
  return html.replace(regexMentions(membres, 'giu'), (tout, avant, nom) => {
    const bas = nom.toLowerCase();
    const u = MOTS_TOUS.includes(bas) ? null : membres.find(x => nomsMention(x).some(n => n.toLowerCase() === bas));
    const moi = (u && u.user_id === state.moi.user_id) || (!u && ids.includes(state.moi.user_id));
    return `${avant}<span class="mention ${moi ? 'moi' : ''}">@${nom}</span>`;
  });
}
function extraireMentions(body) {
  if (!body || !body.includes('@')) return [];
  const autres = state.membres.filter(u => u.user_id !== state.moi.user_id);
  const ids = new Set();
  const re = regexMentions(autres, 'giu'); let r;
  while ((r = re.exec(body))) {
    const bas = r[2].toLowerCase();
    if (MOTS_TOUS.includes(bas)) autres.forEach(u => ids.add(u.user_id));
    else { const u = autres.find(x => nomsMention(x).some(n => n.toLowerCase() === bas)); if (u) ids.add(u.user_id); }
  }
  return [...ids];
}
function actionsBulle(m) {
  const moi = m.author === state.moi.user_id;
  return `<div class="bulle-actions">
    <button data-act="repondre" data-id="${m.id}">↩ Répondre</button>
    ${m.body ? `<button data-act="copier" data-id="${m.id}">Copier</button>` : ''}
    ${m.attachment && !m.deleted ? `<button data-act="coffre" data-id="${m.id}">Classer dans Documents</button>` : ''}
    ${moi && !m.deleted ? `<button data-act="supprimer" data-id="${m.id}">Supprimer</button>` : ''}</div>`;
}
async function chargerImage(img) {
  try { img.src = await urlFichier(img.dataset.path); img.dataset.ok = '1'; } catch (e) { img.alt = 'Image indisponible'; }
}
async function actionMessage(act, id) {
  const m = state.messages.find(x => x.id === id); if (!m) return;
  state.selection = null;
  if (act === 'repondre') { state.reponseA = m; renderFil(true); renderComposer(); $('#txt')?.focus(); return; }
  if (act === 'copier') { try { await navigator.clipboard.writeText(m.body); toast('Texte copié'); } catch (e) { } renderFil(true); return; }
  if (act === 'supprimer') {
    const { error } = await state.client.from('kp_messages').update({ deleted: true, body: '', attachment: null }).eq('id', id);
    if (error) toast('Suppression impossible'); else { m.deleted = true; m.body = ''; m.attachment = null; }
    renderFil(true); renderCanaux(); return;
  }
  if (act === 'coffre') { renderFil(true); classerPieceJointe(m); }
}
function classerPieceJointe(m) {
  const p = m.attachment; const c = state.canaux.find(x => x.id === m.channel_id);
  modal(`<h3>Classer dans Documents</h3>
    <label class="champ"><span>Titre</span><input id="d-titre" value="${esc(p.name.replace(/\.[^.]+$/, ''))}"></label>
    <label class="champ"><span>Projet</span><select id="d-projet">${optionsProjets(c?.project_id)}</select></label>
    <label class="champ"><span>Catégorie</span><select id="d-cat">${CATEGORIES.map(x => `<option>${x}</option>`).join('')}</select></label>
    <div class="actions"><button class="btn prim" id="d-ok">Classer</button><button class="btn" onclick="fermerModal()">Annuler</button></div>`, mo => {
    $('#d-ok', mo).addEventListener('click', async () => {
      const { data, error } = await state.client.from('kp_documents').insert({ project_id: $('#d-projet').value || null, title: $('#d-titre').value.trim() || p.name, category: $('#d-cat').value, path: p.path, size: p.size, mime: p.mime, uploaded_by: state.moi.user_id, note: 'Depuis la discussion ' + nomCanal(c) }).select().single();
      if (error) { toast('Classement impossible'); return; }
      state.documents.unshift(data); fermerModal(); toast('<b>Document classé</b> dans ' + esc(nomProjet(data.project_id)));
    });
  });
}

function renderComposer() {
  const c = $('#composer'); if (!c) return;
  const r = state.reponseA; const pj = state.pj;
  c.innerHTML = `${r ? `<div class="repondre"><div><b>${esc(membre(r.author).name)}</b><span>${esc(resumeMessage(r))}</span></div><button id="rep-x" aria-label="Annuler">✕</button></div>` : ''}
    ${pj ? `<div class="pj-apercu">${pj.type.startsWith('image/') ? `<img src="${pj.url}" alt="">` : '📎'}<span>${esc(pj.file.name)} · ${octets(pj.file.size)}</span><button id="pj-x" aria-label="Retirer">✕</button></div>` : ''}
    <div class="barre"><input type="file" id="pj-input" hidden accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.dwg,.dxf,.zip,.txt">
      <button class="rond pj" id="pj-btn" title="Joindre une photo ou un fichier">📎</button>
      <textarea id="txt" rows="1" placeholder="Écrire un message… (@ pour mentionner)" enterkeyhint="send"></textarea>
      <button class="rond env" id="env" title="Envoyer">➤</button></div>
    <div class="mention-pop" id="mention-pop" hidden></div>`;
  const txt = $('#txt', c);
  txt.addEventListener('input', () => { txt.style.height = 'auto'; txt.style.height = Math.min(txt.scrollHeight, 150) + 'px'; majPopupMentions(txt); });
  txt.addEventListener('click', () => majPopupMentions(txt));
  txt.addEventListener('blur', () => setTimeout(() => $('#mention-pop') && ($('#mention-pop').hidden = true), 150));
  txt.addEventListener('keydown', e => {
    const pop = $('#mention-pop');
    if (pop && !pop.hidden) {
      const items = $$('button', pop); let i = items.findIndex(b => b.classList.contains('on'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); i = (i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; items.forEach((b, k) => b.classList.toggle('on', k === i)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); (items[i] || items[0])?.click(); return; }
      if (e.key === 'Escape') { pop.hidden = true; return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width:821px)').matches) { e.preventDefault(); envoyer(); }
  });
  $('#env', c).addEventListener('click', envoyer);
  $('#pj-btn', c).addEventListener('click', () => $('#pj-input').click());
  $('#pj-input', c).addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 50 * 1048576) { toast('Fichier trop lourd (50 Mo maximum)'); return; }
    state.pj = { file: f, type: f.type || '', url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null };
    const v = txt.value; renderComposer(); $('#txt').value = v; $('#txt').focus();
  });
  $('#rep-x', c)?.addEventListener('click', () => { state.reponseA = null; const v = txt.value; renderComposer(); $('#txt').value = v; });
  $('#pj-x', c)?.addEventListener('click', () => { state.pj = null; const v = txt.value; renderComposer(); $('#txt').value = v; });
}
/* Popup « @ » : propose les membres (ou les participants d'une conversation privée) pendant la saisie */
const sansAccents = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function requeteMention(txt) {
  const avant = txt.value.slice(0, txt.selectionStart);
  const r = avant.match(/(^|\s)@([\p{L}\p{N}_'’-]*)$/u);
  return r ? { debut: avant.length - r[2].length - 1, q: r[2] } : null;
}
function majPopupMentions(txt) {
  const pop = $('#mention-pop'); if (!pop) return;
  const rq = requeteMention(txt);
  if (!rq) { pop.hidden = true; return; }
  const c = state.canaux.find(x => x.id === state.canal);
  let base = state.membres.filter(m => m.user_id !== state.moi.user_id);
  if (estPrive(c)) base = base.filter(m => participants(c.id).includes(m.user_id));
  const q = sansAccents(rq.q);
  const choix = base.filter(m => !q || sansAccents(m.name).split(/\s+/).some(w => w.startsWith(q)) || sansAccents(m.name).startsWith(q));
  const tous = !q || 'tous'.startsWith(q) || 'equipe'.startsWith(q);
  if (!choix.length && !tous) { pop.hidden = true; return; }
  pop.innerHTML = choix.map((m, i) => `<button type="button" class="${i === 0 ? 'on' : ''}" data-nom="${esc(libelleMention(m))}"><span class="avatar" style="background:${m.color}">${initiales(m.name)}</span><span><b>${esc(m.name)}</b><small>${esc(m.role)}</small></span></button>`).join('')
    + (tous && !estPrive(c) ? `<button type="button" class="${choix.length ? '' : 'on'}" data-nom="tous"><span class="avatar" style="background:var(--or);color:var(--encre)">@</span><span><b>@tous</b><small>Prévenir toute l’équipe</small></span></button>` : '');
  pop.hidden = false;
  $$('button', pop).forEach(b => b.addEventListener('mousedown', e => e.preventDefault()));
  $$('button', pop).forEach(b => b.addEventListener('click', () => insererMention(txt, rq, b.dataset.nom)));
}
/* Prénom seul si unique dans l'équipe, sinon prénom + nom */
function libelleMention(m) {
  const p = prenom(m.name);
  return state.membres.filter(x => prenom(x.name).toLowerCase() === p.toLowerCase()).length > 1 ? m.name : p;
}
function insererMention(txt, rq, nom) {
  const fin = txt.selectionStart;
  txt.value = txt.value.slice(0, rq.debut) + '@' + nom + ' ' + txt.value.slice(fin);
  const pos = rq.debut + nom.length + 2; txt.setSelectionRange(pos, pos); txt.focus();
  $('#mention-pop').hidden = true;
}
let envoiEnCours = false;
async function envoyer() {
  if (envoiEnCours) return;
  const txt = $('#txt'); const body = txt.value.trim();
  if (!body && !state.pj) return;
  envoiEnCours = true; $('#env').disabled = true;
  try {
    let attachment = null;
    if (state.pj) { toast('Envoi du fichier…', 8000); attachment = await televerser(state.pj.file, 'chat/' + state.canal); }
    const row = { channel_id: state.canal, author: state.moi.user_id, body, attachment, reply_to: state.reponseA?.id || null, mentions: extraireMentions(body) };
    const { data, error } = await state.client.from('kp_messages').insert(row).select().single();
    if (error) throw error;
    if (!state.messages.find(m => m.id === data.id)) state.messages.push(data);
    state.reponseA = null; state.pj = null; txt.value = ''; txt.style.height = 'auto';
    renderComposer(); renderFil(); renderCanaux(); marquerLu(state.canal); $('#txt').focus();
    $('#toast').classList.remove('on');
  } catch (e) { console.error(e); toast('<b>Envoi impossible.</b> Vérifiez la connexion.'); }
  envoiEnCours = false; const b = $('#env'); if (b) b.disabled = false;
}
async function marquerLu(id) {
  const now = new Date().toISOString(); state.lectures[id] = now; renderNav();
  await state.client.from('kp_reads').upsert({ user_id: state.moi.user_id, channel_id: id, last_read: now });
}
function messageRecu(m) {
  if (!state.canaux.find(c => c.id === m.channel_id)) { rechargerCanaux(); return; }
  const i = state.messages.findIndex(x => x.id === m.id);
  if (i >= 0) state.messages[i] = m; else state.messages.push(m);
  state.messages.sort((a, b) => a.created_at < b.created_at ? -1 : 1);
  const visible = state.vue === 'discussions' && state.canal === m.channel_id && (state.salonOuvert || window.matchMedia('(min-width:821px)').matches) && document.visibilityState === 'visible';
  if (visible) { renderFil(true); marquerLu(m.channel_id); }
  if (state.vue === 'discussions') renderCanaux();
  renderNav();
  if (i < 0 && m.author !== state.moi.user_id) {
    const a = membre(m.author); const c = state.canaux.find(x => x.id === m.channel_id); const nc = nomCanal(c) || 'Kaporo';
    const mention = meMentionne(m);
    if (!visible) toast(`<b>${esc(a.name)}</b> · ${esc(nc)}${mention ? ' · <b>vous mentionne</b>' : ''}<br>${esc(resumeMessage(m))}`, mention ? 5000 : 2600);
    if ((document.visibilityState !== 'visible' || mention && !visible) && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification(a.name + ' · ' + nc + (mention ? ' · vous mentionne' : ''), { body: resumeMessage(m), tag: m.id }); } catch (e) { }
    }
  }
}

/* ============================================================
   Vues : projets et phases, documents, décisions, tâches, équipe
   ============================================================ */
const CATEGORIES = ['Foncier', 'Plans et relevés', 'Études techniques', 'Esquisses', 'Financier', 'Juridique', 'Administratif', 'Marché et concurrence', 'Photos de site', 'Comptes rendus', 'Autre'];
const STATUTS_PHASE = ['à venir', 'en cours', 'terminée', 'en attente'];
const optionsProjets = (sel, avecGeneral = true) => (avecGeneral ? `<option value="" ${!sel ? 'selected' : ''}>Général (les deux projets)</option>` : '') + state.projets.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
const classeStatut = s => ({ 'en cours': 'ambre', 'terminée': '', 'à venir': 'gris', 'en attente': 'bleu', 'étude': 'ambre', 'validée': '', 'à confirmer': 'ambre', 'annulée': 'rouge' }[s] ?? 'gris');
function filtresProjet(cle) {
  const v = state[cle];
  return `<div class="filtres">${[['tous', 'Tout'], ['', 'Général'], ...state.projets.map(p => [p.id, p.name])].map(([k, l]) => `<button class="${v === k ? 'on' : ''}" data-f="${k}">${esc(l)}</button>`).join('')}</div>`;
}
function brancherFiltres(cle, rerender) { $$('.filtres button').forEach(b => b.addEventListener('click', () => { state[cle] = b.dataset.f; rerender(); })); }
const passeFiltre = (cle, pid) => state[cle] === 'tous' || (state[cle] === '' ? !pid : pid === state[cle]);

/* ---- Projets ---- */
function vueProjets() {
  const main = $('#main'); main.className = '';
  main.innerHTML = `<div class="vue"><h1>Projets</h1><p class="sous">Les phases vont du cadrage du 6 octobre 2026 jusqu’à l’exploitation et aux scénarios de sortie des acquéreurs. Changez l’état d’une phase directement dans la liste.</p>
    <div class="g g2">${state.projets.map(carteProjet).join('')}</div></div>`;
  $$('select[data-phase]').forEach(s => s.addEventListener('change', async () => {
    const { error } = await state.client.from('kp_phases').update({ status: s.value }).eq('id', s.dataset.phase);
    if (error) { toast('Modification impossible'); return; }
    const ph = state.phases.find(p => p.id === s.dataset.phase); if (ph) ph.status = s.value; vueProjets(); toast('Phase mise à jour');
  }));
  $$('[data-planning],[data-kanban-p]').forEach(b => b.addEventListener('click', () => { state.filtreProjet = b.dataset.planning || b.dataset.kanbanP; state.suivi.onglet = b.dataset.planning ? 'gantt' : 'kanban'; memoSuivi(); go('taches'); }));
  $$('[data-phase-ouvrir]').forEach(el => el.addEventListener('click', () => formPhase(el.dataset.phaseOuvrir)));
}
function carteProjet(p) {
  const phases = state.phases.filter(x => x.project_id === p.id).sort((a, b) => a.num - b.num);
  const faites = phases.filter(x => x.status === 'terminée').length;
  const docs = state.documents.filter(d => d.project_id === p.id).length;
  const taches = state.taches.filter(t => t.project_id === p.id && t.status !== 'fait').length;
  const pct = phases.length ? Math.round(phases.reduce((s, x) => s + progPhase(x), 0) / phases.length) : 0;
  return `<div class="carte"><h3>${esc(p.name)} <span class="etat ${classeStatut(p.status)}">${esc(p.status)}</span></h3>
    <p class="muted sm" style="margin-bottom:.6em">${esc(p.subtitle || '')}${p.surface_m2 ? ` · <b class="num">${p.surface_m2.toLocaleString('fr-FR')} m²</b>` : ''}</p>
    <p class="sm" style="margin-bottom:.4em">${phases.length ? `${faites}/${phases.length} phases terminées · avancement <b class="num">${pct} %</b>` : 'Aucune phase définie'} · ${docs} document${docs > 1 ? 's' : ''} · ${taches} tâche${taches > 1 ? 's' : ''} ouverte${taches > 1 ? 's' : ''}</p>
    ${phases.length ? jauge(pct, 'or') : ''}
    <div class="actions" style="margin:.7em 0 .3em"><button class="btn sm" data-planning="${p.id}">Gantt</button><button class="btn sm" data-kanban-p="${p.id}">Kanban</button></div>
    ${phases.length ? phases.map(ph => `<div class="phase ${ph.status === 'en cours' ? 'encours' : ph.status === 'terminée' ? 'fait' : ''}"><span class="n">${ph.num}</span>
        <div><b data-phase-ouvrir="${ph.id}" style="cursor:pointer">${esc(ph.title)}</b><small>${ph.start_on ? dateFr(ph.start_on) : '—'} → ${ph.end_on ? dateFr(ph.end_on) : 'en continu'} · ${progPhase(ph)} %${ph.owner ? ' · ' + esc(membre(ph.owner).name) : ''}</small><small>${esc(ph.deliverable || '')}</small></div>
        <select class="inline" data-phase="${ph.id}">${STATUTS_PHASE.map(s => `<option ${s === ph.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>`).join('')
      : '<div class="vide">Les phases seront définies après la visite du second terrain.</div>'}</div>`;
}

/* ---- Documents ---- */
function vueDocuments() {
  const main = $('#main'); main.className = '';
  const docs = state.documents.filter(d => passeFiltre('filtreDoc', d.project_id));
  main.innerHTML = `<div class="vue"><h1>Documents</h1><p class="sous">Le coffre du projet : plans, titres, études, esquisses, comptes rendus. Chaque fichier est privé et réservé aux membres.</p>
    <div class="actions" style="margin-bottom:1em"><button class="btn prim" id="d-ajout">＋ Ajouter un document</button></div>
    ${filtresProjet('filtreDoc')}
    <div class="carte" id="d-liste">${docs.length ? docs.map(ligneDoc).join('') : '<div class="vide">Aucun document pour ce filtre.</div>'}</div></div>`;
  brancherFiltres('filtreDoc', vueDocuments);
  $('#d-ajout').addEventListener('click', formDocument);
  $$('.doc [data-ouvrir]').forEach(b => b.addEventListener('click', async () => { try { window.open(await urlFichier(b.dataset.ouvrir), '_blank'); } catch (e) { toast('Fichier indisponible'); } }));
  $$('.doc [data-suppr]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Retirer ce document du coffre ?')) return;
    const { error } = await state.client.from('kp_documents').delete().eq('id', b.dataset.suppr);
    if (error) { toast('Suppression impossible'); return; }
    state.documents = state.documents.filter(d => d.id !== b.dataset.suppr); vueDocuments();
  }));
}
function ligneDoc(d) {
  const ext = (d.title.includes('.') ? d.title.split('.').pop() : (d.mime || '').split('/').pop() || 'doc').slice(0, 4).toUpperCase();
  const mien = d.uploaded_by === state.moi.user_id || state.moi.is_admin;
  return `<div class="doc"><span class="ic">${esc(ext)}</span><div><b>${esc(d.title)}</b><small>${esc(d.category)} · ${esc(nomProjet(d.project_id))} · ${dateFr(d.created_at)} · ${esc(membre(d.uploaded_by).name)}${d.size ? ' · ' + octets(d.size) : ''}</small>${d.note ? `<small>${esc(d.note)}</small>` : ''}</div>
    <span class="actions"><button class="btn sm" data-ouvrir="${esc(d.path)}">Ouvrir</button>${mien ? `<button class="btn sm" data-suppr="${d.id}" title="Retirer">✕</button>` : ''}</span></div>`;
}
function formDocument() {
  modal(`<h3>Ajouter un document</h3>
    <label class="champ"><span>Fichier (50 Mo max.)</span><input type="file" id="d-file" required></label>
    <label class="champ"><span>Titre</span><input id="d-titre" placeholder="Ex. Plan de bornage parcelles 2 et 3"></label>
    <label class="champ"><span>Projet</span><select id="d-projet">${optionsProjets(state.filtreDoc === 'tous' ? 'kaporo1' : state.filtreDoc)}</select></label>
    <label class="champ"><span>Catégorie</span><select id="d-cat">${CATEGORIES.map(x => `<option>${x}</option>`).join('')}</select></label>
    <label class="champ"><span>Note (facultatif)</span><input id="d-note" placeholder="Source, version, remarque"></label>
    <div class="actions"><button class="btn prim" id="d-ok">Enregistrer</button><button class="btn" onclick="fermerModal()">Annuler</button></div>`, mo => {
    $('#d-file', mo).addEventListener('change', e => { const f = e.target.files[0]; if (f && !$('#d-titre').value) $('#d-titre').value = f.name.replace(/\.[^.]+$/, ''); });
    $('#d-ok', mo).addEventListener('click', async () => {
      const f = $('#d-file').files[0]; if (!f) { toast('Choisissez un fichier'); return; }
      if (f.size > 50 * 1048576) { toast('Fichier trop lourd (50 Mo maximum)'); return; }
      $('#d-ok').disabled = true; toast('Envoi en cours…', 10000);
      try {
        const pid = $('#d-projet').value || null;
        const p = await televerser(f, 'docs/' + (pid || 'general'));
        const { data, error } = await state.client.from('kp_documents').insert({ project_id: pid, title: $('#d-titre').value.trim() || f.name, category: $('#d-cat').value, note: $('#d-note').value.trim() || null, path: p.path, size: p.size, mime: p.mime, uploaded_by: state.moi.user_id }).select().single();
        if (error) throw error;
        if (!state.documents.find(d => d.id === data.id)) state.documents.unshift(data);
        fermerModal(); vueDocuments(); toast('<b>Document ajouté</b>');
      } catch (e) { console.error(e); toast('<b>Envoi impossible.</b> ' + esc(e.message || '')); $('#d-ok').disabled = false; }
    });
  });
}

/* ---- Décisions ---- */
function vueDecisions() {
  const main = $('#main'); main.className = '';
  const ds = state.decisions.filter(d => passeFiltre('filtreProjet', d.project_id));
  main.innerHTML = `<div class="vue"><h1>Décisions</h1><p class="sous">Le journal des décisions : ce qui a été tranché, quand, par qui. C’est la mémoire du projet et la trace que demandera une banque.</p>
    <div class="actions" style="margin-bottom:1em"><button class="btn prim" id="dc-ajout">＋ Consigner une décision</button></div>
    ${filtresProjet('filtreProjet')}
    <div class="carte">${ds.length ? ds.map(d => `<div class="ligne"><div><b>${esc(d.title)}</b><small>${dateFr(d.decided_on)} · ${esc(nomProjet(d.project_id))} · ${esc(membre(d.decided_by).name)}</small>${d.detail ? `<small style="white-space:pre-wrap;margin-top:.2em">${esc(d.detail)}</small>` : ''}</div>
        <span class="actions"><span class="etat ${classeStatut(d.status)}">${esc(d.status)}</span>${d.decided_by === state.moi.user_id || state.moi.is_admin ? `<button class="btn sm" data-suppr="${d.id}">✕</button>` : ''}</span></div>`).join('') : '<div class="vide">Aucune décision consignée.</div>'}</div></div>`;
  brancherFiltres('filtreProjet', vueDecisions);
  $('#dc-ajout').addEventListener('click', () => modal(`<h3>Consigner une décision</h3>
    <label class="champ"><span>Décision</span><input id="dc-titre" placeholder="Ex. Variante B retenue pour l’esquisse"></label>
    <label class="champ"><span>Détail, motifs</span><textarea id="dc-detail" rows="3"></textarea></label>
    <label class="champ"><span>Projet</span><select id="dc-projet">${optionsProjets(state.filtreProjet === 'tous' ? 'kaporo1' : state.filtreProjet)}</select></label>
    <label class="champ"><span>Date</span><input id="dc-date" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
    <label class="champ"><span>Statut</span><select id="dc-statut"><option>validée</option><option>à confirmer</option><option>annulée</option></select></label>
    <div class="actions"><button class="btn prim" id="dc-ok">Enregistrer</button><button class="btn" onclick="fermerModal()">Annuler</button></div>`, mo => {
    $('#dc-ok', mo).addEventListener('click', async () => {
      const title = $('#dc-titre').value.trim(); if (!title) return;
      const { data, error } = await state.client.from('kp_decisions').insert({ title, detail: $('#dc-detail').value.trim() || null, project_id: $('#dc-projet').value || null, decided_on: $('#dc-date').value, status: $('#dc-statut').value, decided_by: state.moi.user_id }).select().single();
      if (error) { toast('Enregistrement impossible'); return; }
      if (!state.decisions.find(d => d.id === data.id)) state.decisions.unshift(data); fermerModal(); vueDecisions(); toast('Décision consignée');
    });
  }));
  $$('[data-suppr]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Supprimer cette décision ?')) return;
    const { error } = await state.client.from('kp_decisions').delete().eq('id', b.dataset.suppr);
    if (error) { toast('Suppression impossible'); return; }
    state.decisions = state.decisions.filter(d => d.id !== b.dataset.suppr); vueDecisions();
  }));
}

/* ---- Équipe ---- */
async function vueEquipe() {
  const main = $('#main'); main.className = '';
  let invites = [];
  if (state.moi.is_admin) { const { data } = await state.client.from('kp_allowed').select('*').order('created_at'); invites = data || []; }
  const enAttente = invites.filter(i => !state.membres.find(m => m.email === i.email.toLowerCase()));
  main.innerHTML = `<div class="vue"><h1>Équipe</h1><p class="sous">Les membres de l’espace. Seules les adresses invitées peuvent se connecter.</p>
    <div class="g g2">
      <div class="carte"><h3>Membres <small>${state.membres.length}</small></h3>
        ${state.membres.map(m => `<div class="ligne"><div style="display:flex;gap:.7em;align-items:center"><span class="avatar" style="background:${m.color}">${initiales(m.name)}</span><div><b>${esc(m.name)}</b>${m.is_admin ? ' <span class="etat bleu">admin</span>' : ''}<small>${esc(m.role)} · ${esc(m.email)}</small></div></div></div>`).join('')}
        ${enAttente.length ? `<p class="sm muted" style="margin:1em 0 .3em">Invités, pas encore connectés</p>${enAttente.map(i => `<div class="ligne"><div><b>${esc(i.name)}</b><small>${esc(i.role)} · ${esc(i.email)}</small></div><button class="btn sm" data-retirer="${esc(i.email)}">✕</button></div>`).join('')}` : ''}
        ${state.moi.is_admin ? `<h3 style="margin-top:1.2em">Inviter une personne</h3>
          <label class="champ"><span>Nom</span><input id="i-nom" placeholder="Prénom Nom"></label>
          <label class="champ"><span>E-mail</span><input id="i-email" type="email" placeholder="prenom@exemple.com"></label>
          <label class="champ"><span>Rôle</span><select id="i-role"><option value="promoteur">Promoteur</option><option value="architecte">Architecte</option><option value="pilotage">Pilotage de programme</option><option value="relations institutionnelles">Relations institutionnelles</option><option value="bureau d'études">Bureau d’études</option><option value="banque">Banque (lecture)</option><option value="admin">Administrateur</option></select></label>
          <button class="btn prim" id="i-ok">Inviter</button>
          <p class="sm muted" style="margin-top:.6em">La personne reçoit ensuite son lien de connexion en saisissant son adresse sur l’écran d’accueil. Transmettez-lui l’adresse de l’application.</p>` : ''}
      </div>
      <div class="carte"><h3>Mon compte</h3>
        <p class="sm">Connecté en tant que <b>${esc(state.moi.name)}</b> (${esc(state.moi.email)}).</p>
        <label class="champ" style="margin-top:.8em"><span>Mon nom affiché</span><input id="c-nom" value="${esc(state.moi.name)}"></label>
        <button class="btn sm" id="c-nom-ok">Enregistrer le nom</button>
        <h3 style="margin-top:1.2em">Mot de passe <small>facultatif</small></h3>
        <p class="sm muted" style="margin-bottom:.6em">Définissez un mot de passe pour vous connecter sans attendre l’e-mail, utile quand le réseau est faible.</p>
        <label class="champ"><span>Nouveau mot de passe (8 caractères min.)</span><input id="c-pw" type="password" autocomplete="new-password"></label>
        <button class="btn sm" id="c-pw-ok">Définir le mot de passe</button>
        <h3 style="margin-top:1.2em">Notifications</h3>
        <p class="sm muted" style="margin-bottom:.6em">Sur ordinateur, recevez une alerte quand un message arrive pendant que l’onglet est en arrière-plan. Sur téléphone, ajoutez Kaporo à l’écran d’accueil pour l’ouvrir comme une application.</p>
        <button class="btn sm" id="c-notif">Activer les notifications</button>
        <div style="margin-top:1.5em"><button class="btn rouge" id="c-out">Se déconnecter</button></div>
      </div></div></div>`;
  $('#c-nom-ok').addEventListener('click', async () => {
    const name = $('#c-nom').value.trim(); if (!name) return;
    const { error } = await state.client.from('kp_members').update({ name }).eq('user_id', state.moi.user_id);
    if (error) { toast('Modification impossible'); return; } state.moi.name = name; toast('Nom enregistré'); renderNav();
  });
  $('#c-pw-ok').addEventListener('click', async () => {
    const pw = $('#c-pw').value; if (pw.length < 8) { toast('8 caractères minimum'); return; }
    try { await definirMotDePasse(pw); $('#c-pw').value = ''; toast('<b>Mot de passe défini.</b> Vous pouvez l’utiliser dès la prochaine connexion.'); } catch (e) { toast('Impossible : ' + esc(e.message)); }
  });
  $('#c-notif').addEventListener('click', async () => {
    if (!('Notification' in window)) { toast('Non pris en charge sur cet appareil'); return; }
    const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Notifications activées' : 'Notifications refusées');
  });
  $('#c-out').addEventListener('click', deconnecter);
  $('#i-ok')?.addEventListener('click', async () => {
    const email = $('#i-email').value.trim().toLowerCase(); const name = $('#i-nom').value.trim();
    if (!email || !name) { toast('Nom et e-mail requis'); return; }
    const { error } = await state.client.from('kp_allowed').insert({ email, name, role: $('#i-role').value, invited_by: state.moi.user_id });
    if (error) { toast(/duplicate/i.test(error.message) ? 'Cette adresse est déjà invitée' : 'Invitation impossible'); return; }
    toast(`<b>${esc(name)} invité(e).</b> Transmettez-lui l’adresse de l’application.`); vueEquipe();
  });
  $$('[data-retirer]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Retirer cette invitation ?')) return;
    await state.client.from('kp_allowed').delete().eq('email', b.dataset.retirer); vueEquipe();
  }));
}

/* ---- Développement (administrateur) : demandes transmises à l'agent de développement ---- */
const STATUTS_DEV = { 'envoyée': ['bleu', 'Transmise'], 'en cours': ['ambre', 'En cours'], 'question': ['ambre', 'Question'], 'livrée': ['', 'Livrée'], 'abandonnée': ['gris', 'Abandonnée'], 'erreur': ['rouge', 'Erreur'] };
async function chargerDev() {
  const { data, error } = await state.client.from('kp_dev_requests').select('*').order('created_at', { ascending: false });
  if (!error) state.dev = data || [];
}
async function vueDev() {
  const main = $('#main'); main.className = '';
  if (!state.moi.is_admin) { main.innerHTML = '<div class="vide">Module réservé à l’administrateur.</div>'; return; }
  if (!state.dev) await chargerDev();
  const ouvertes = state.dev.filter(d => !['livrée', 'abandonnée'].includes(d.status));
  const closes = state.dev.filter(d => ['livrée', 'abandonnée'].includes(d.status));
  main.innerHTML = `<div class="vue"><h1>Développement</h1><p class="sous">Décrivez une modification ou un ajustement de l’application. La demande est transmise à l’agent de développement, qui la réalise, publie la nouvelle version et vous répond ici. Comptez quelques minutes.</p>
    <div class="g g2">
      <div class="carte accent"><h3>Nouvelle demande</h3>
        <label class="champ"><span>En une ligne</span><input id="dv-titre" placeholder="Ex. Ajouter un filtre par membre dans Tâches"></label>
        <label class="champ"><span>Détail (ce que vous voulez voir, où, pourquoi)</span><textarea id="dv-detail" rows="5" placeholder="Plus c’est précis, plus le résultat sera juste du premier coup."></textarea></label>
        <label class="champ"><span>Capture d’écran (facultatif)</span><input type="file" id="dv-file" accept="image/*"></label>
        <button class="btn prim" id="dv-ok">Envoyer la demande</button>
        <p class="sm muted" style="margin-top:.8em">Après « Livrée », rechargez l’application pour voir le résultat (sur téléphone : fermer et rouvrir).</p></div>
      <div class="carte"><h3>En cours <small>${ouvertes.length}</small></h3>${ouvertes.length ? ouvertes.map(carteDev).join('') : '<div class="vide">Aucune demande en cours.</div>'}</div>
    </div>
    <div class="carte" style="margin-top:1em"><h3>Historique <small>${closes.length}</small></h3>${closes.length ? closes.map(carteDev).join('') : '<div class="vide">Rien encore.</div>'}</div>
    ${await carteReglagesDev()}</div>`;
  $('#dv-ok').addEventListener('click', envoyerDev);
  $('#dvs-ok').addEventListener('click', enregistrerReglagesDev);
  $$('[data-dv-rep]').forEach(b => b.addEventListener('click', () => repondreDev(b.dataset.dvRep)));
  $$('[data-dv-stop]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Abandonner cette demande ?')) return;
    await state.client.from('kp_dev_requests').update({ status: 'abandonnée' }).eq('id', b.dataset.dvStop); await chargerDev(); vueDev();
  }));
  $$('[data-dv-reload]').forEach(b => b.addEventListener('click', () => location.reload()));
}
function carteDev(d) {
  const [cls, lib] = STATUTS_DEV[d.status] || ['gris', d.status];
  const fil = (d.thread || []).map(t => `<div class="evt ${t.who === 'claude' ? 'bleu' : ''}" style="grid-template-columns:auto 1fr;gap:.7em"><span class="s" style="min-width:3.2em">${t.who === 'claude' ? 'Agent' : 'Vous'}</span><span style="white-space:pre-wrap">${esc(t.text)}<small class="d">${dateFr(t.at)} ${hhmm(new Date(t.at))}</small></span></div>`).join('');
  return `<div class="ligne" style="display:block"><div style="display:flex;justify-content:space-between;gap:.8em;align-items:center"><b>${esc(d.title)}</b><span class="etat ${cls}">${lib}</span></div>
    <small>${dateFr(d.created_at)} ${hhmm(new Date(d.created_at))}${d.commit_sha ? ' · version ' + esc(d.commit_sha.slice(0, 7)) : ''}</small>
    ${d.detail ? `<p class="sm" style="white-space:pre-wrap;margin:.4em 0">${esc(d.detail)}</p>` : ''}
    ${fil ? `<div style="margin:.5em 0">${fil}</div>` : ''}
    <div class="actions" style="margin-top:.5em">
      ${d.status === 'livrée' ? '<button class="btn sm or" data-dv-reload>Recharger l’application</button>' : ''}
      ${['question', 'livrée', 'erreur'].includes(d.status) ? `<button class="btn sm" data-dv-rep="${d.id}">${d.status === 'question' ? 'Répondre' : 'Demander un ajustement'}</button>` : ''}
      ${!['livrée', 'abandonnée'].includes(d.status) ? `<button class="btn sm" data-dv-stop="${d.id}">Abandonner</button>` : ''}
    </div></div>`;
}
async function envoyerDev() {
  const title = $('#dv-titre').value.trim(); const detail = $('#dv-detail').value.trim();
  if (!title) { toast('Décrivez la demande en une ligne'); return; }
  const btn = $('#dv-ok'); btn.disabled = true;
  try {
    let attachment = null; const f = $('#dv-file').files[0];
    if (f) { toast('Envoi de la capture…', 8000); attachment = await televerser(f, 'dev'); }
    const { error } = await state.client.from('kp_dev_requests').insert({ title, detail: detail || null, attachment, thread: [], created_by: state.moi.user_id });
    if (error) throw error;
    await chargerDev(); vueDev(); toast('<b>Demande transmise.</b> Vous serez prévenu ici.');
  } catch (e) { console.error(e); toast('Envoi impossible : ' + esc(e.message || '')); btn.disabled = false; }
}
function repondreDev(id) {
  const d = state.dev.find(x => x.id === id); if (!d) return;
  modal(`<h3>${d.status === 'question' ? 'Répondre à l’agent' : 'Demander un ajustement'}</h3>
    <p class="sm muted" style="margin-bottom:.6em">${esc(d.title)}</p>
    <label class="champ"><span>Votre message</span><textarea id="dv-msg" rows="5"></textarea></label>
    <div class="actions"><button class="btn prim" id="dv-msg-ok">Envoyer</button><button class="btn" onclick="fermerModal()">Annuler</button></div>`, mo => {
    $('#dv-msg-ok', mo).addEventListener('click', async () => {
      const text = $('#dv-msg').value.trim(); if (!text) return;
      const thread = (d.thread || []).concat([{ who: 'paul', text, at: new Date().toISOString() }]);
      const { error } = await state.client.from('kp_dev_requests').update({ thread, status: 'envoyée' }).eq('id', id);
      if (error) { toast('Envoi impossible'); return; }
      fermerModal(); await chargerDev(); vueDev(); toast('Message transmis');
    });
  });
}

/* Réglages du module Développement : secret partagé et jeton GitHub (saisis par l'administrateur, jamais relus) */
async function carteReglagesDev() {
  let etat = {}; let journal = [];
  try { const { data } = await state.client.rpc('kp_dev_settings_state'); etat = data || {}; } catch (e) { }
  try { const { data } = await state.client.rpc('kp_dev_dispatch_log'); journal = data || []; } catch (e) { }
  const ok = k => etat[k] ? '<span class="etat">renseigné</span>' : '<span class="etat rouge">manquant</span>';
  const j = journal.length ? `<p class="sm muted" style="margin-top:.8em">Derniers signaux envoyés à GitHub : ${journal.map(x => `<span class="etat ${x.status >= 200 && x.status < 300 ? '' : 'rouge'}">${x.status || 'erreur'}</span>`).join(' ')}</p>` : '';
  return `<div class="carte" style="margin-top:1em"><h3>Liaison avec l’agent de développement</h3>
    <p class="sm muted" style="margin-bottom:.8em">Deux valeurs relient ce module à la routine de développement. Elles sont stockées côté serveur, jamais réaffichées. Laissez un champ vide pour ne pas le modifier.</p>
    <label class="champ"><span>Secret partagé ${ok('dev_secret')}</span><input id="dvs-secret" type="password" autocomplete="off" placeholder="Phrase longue, la même que KP_DEV_SECRET côté routine"></label>
    <label class="champ"><span>Jeton GitHub ${ok('github_token')}</span><input id="dvs-token" type="password" autocomplete="off" placeholder="Jeton à granularité fine, dépôt Byande/kaporo, Contents : lecture et écriture"></label>
    <button class="btn sm" id="dvs-ok">Enregistrer</button>${j}</div>`;
}
async function enregistrerReglagesDev() {
  const s = $('#dvs-secret').value; const g = $('#dvs-token').value.trim();
  try {
    if (s) { const { error } = await state.client.rpc('kp_dev_set_setting', { k: 'dev_secret', v: s }); if (error) throw error; }
    if (g) { const { error } = await state.client.rpc('kp_dev_set_setting', { k: 'github_token', v: g }); if (error) throw error; }
    toast('Réglages enregistrés'); vueDev();
  } catch (e) { toast('Enregistrement impossible : ' + esc(e.message || '')); }
}

/* ============================================================
   Suivi : tableau de bord, liste, kanban, Gantt, calendrier, fiche tâche, phases
   ============================================================ */
const STATUTS_T = [['à faire', 'À faire', 'gris'], ['en cours', 'En cours', 'ambre'], ['en attente', 'En attente', 'bleu'], ['fait', 'Fait', '']];
const PRIOS = [['urgente', 'Urgente', 'rouge'], ['haute', 'Haute', 'ambre'], ['normale', 'Normale', ''], ['basse', 'Basse', 'gris']];
const MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const infoStatut = s => STATUTS_T.find(x => x[0] === s) || [s, s, 'gris'];
const infoPrio = p => PRIOS.find(x => x[0] === p) || PRIOS[2];
const rangPrio = p => { const i = PRIOS.findIndex(x => x[0] === p); return i < 0 ? 2 : i; };
const ISO = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const dateDe = iso => new Date(iso + 'T12:00:00');
const auj = () => ISO(new Date());
const plusJours = (iso, n) => { const d = dateDe(iso); d.setDate(d.getDate() + n); return ISO(d); };
const diffJours = (a, b) => Math.round((dateDe(b) - dateDe(a)) / 86400000);
const enRetard = t => t.status !== 'fait' && !!t.due_on && t.due_on < auj();
const phaseDe = id => state.phases.find(p => p.id === id);
const tachesDePhase = id => state.taches.filter(t => t.phase_id === id);
const peutSupprimer = t => t.created_by === state.moi.user_id || state.moi.is_admin || !t.created_by;
function progPhase(ph) {
  if (ph.status === 'terminée') return 100;
  const ts = tachesDePhase(ph.id);
  if (ts.length) return Math.round(ts.reduce((s, t) => s + (t.status === 'fait' ? 100 : t.progress || 0), 0) / ts.length);
  return ph.progress || 0;
}

/* Préférences du module (mémorisées sur l'appareil) */
const SUIVI_DEF = { onglet: 'tableau', q: '', qui: '', prio: '', finies: false, groupe: 'statut', colonnes: 'statut', echelle: 'mois', mois: auj().slice(0, 7), plies: {} };
state.suivi = Object.assign({}, SUIVI_DEF, (() => { try { return JSON.parse(localStorage.getItem('kp.suivi') || '{}'); } catch (e) { return {}; } })());
const memoSuivi = () => { const { onglet, finies, groupe, colonnes, echelle } = state.suivi; localStorage.setItem('kp.suivi', JSON.stringify({ onglet, finies, groupe, colonnes, echelle })); };

/* Sélection et tri */
function tachesVisibles(avecFinies = false) {
  const s = state.suivi, q = s.q.trim().toLowerCase();
  return state.taches.filter(t => passeFiltre('filtreProjet', t.project_id)
    && (!s.qui || (s.qui === 'moi' ? t.assignee === state.moi.user_id : s.qui === 'aucun' ? !t.assignee : t.assignee === s.qui))
    && (!s.prio || t.priority === s.prio)
    && (avecFinies || s.finies || t.status !== 'fait')
    && (!q || `${t.title} ${t.description || ''} ${(t.tags || []).join(' ')}`.toLowerCase().includes(q)));
}
const triTaches = (a, b) => (a.status === 'fait') - (b.status === 'fait') || (a.due_on || '9').localeCompare(b.due_on || '9') || rangPrio(a.priority) - rangPrio(b.priority) || (a.sort || 0) - (b.sort || 0);

/* Persistance */
async function sauverTache(id, patch, { silencieux } = {}) {
  const t = state.taches.find(x => x.id === id); if (!t) return false;
  const avant = { ...t };
  if (patch.status === 'fait') { patch.done_at = patch.done_at || new Date().toISOString(); patch.progress = 100; }
  else if (patch.status && avant.status === 'fait') { patch.done_at = null; if (patch.progress === undefined && avant.progress === 100) patch.progress = 0; }
  Object.assign(t, patch);
  const { error } = await state.client.from('kp_tasks').update(patch).eq('id', id);
  if (error) { Object.assign(t, avant); toast('Modification impossible : ' + esc(error.message)); return false; }
  if (!silencieux) toast('Enregistré', 1200);
  renderNav();
  return true;
}
async function creerTache(c) {
  const row = { title: c.title, description: c.description || null, project_id: c.project_id || null, phase_id: c.phase_id || null, assignee: c.assignee || null, priority: c.priority || 'normale', status: c.status || 'à faire', start_on: c.start_on || null, due_on: c.due_on || null, created_by: state.moi.user_id, sort: Date.now() / 1000 };
  if (row.status === 'fait') { row.progress = 100; row.done_at = new Date().toISOString(); }
  const { data, error } = await state.client.from('kp_tasks').insert(row).select().single();
  if (error) { toast('Création impossible : ' + esc(error.message)); return null; }
  if (!state.taches.find(t => t.id === data.id)) state.taches.push(data);
  return data;
}
async function supprimerTache(id) {
  if (!confirm('Supprimer cette tâche ?')) return false;
  const { error } = await state.client.from('kp_tasks').delete().eq('id', id);
  if (error) { toast('Suppression impossible'); return false; }
  state.taches = state.taches.filter(t => t.id !== id); return true;
}
async function sauverPhase(id, patch) {
  const ph = phaseDe(id); if (!ph) return false;
  const avant = { ...ph }; Object.assign(ph, patch);
  const { error } = await state.client.from('kp_phases').update(patch).eq('id', id);
  if (error) { Object.assign(ph, avant); toast('Modification impossible : ' + esc(error.message)); return false; }
  toast('Phase enregistrée', 1200); return true;
}

/* Petits composants partagés */
const avatarDe = (id, cls = 'xs') => {
  if (!id) return `<span class="avatar ${cls}" style="background:var(--trait);color:var(--pierre)" title="Non attribuée">?</span>`;
  const m = membre(id); return `<span class="avatar ${cls}" style="background:${m.color}" title="${esc(m.name)}">${initiales(m.name)}</span>`;
};
const jauge = (p, cls = '') => `<span class="jauge ${cls}"><i style="width:${Math.max(0, Math.min(100, p || 0))}%"></i></span>`;
const dateCourte = iso => dateFr(iso, { annee: dateDe(iso).getFullYear() !== new Date().getFullYear() });
function echeanceLib(t) {
  if (!t.due_on) return '';
  if (t.status === 'fait') return dateCourte(t.due_on);
  const d = diffJours(auj(), t.due_on);
  if (d < 0) return `Retard de ${-d} j`; if (d === 0) return 'Aujourd’hui'; if (d === 1) return 'Demain'; if (d < 7) return `Dans ${d} j`;
  return dateCourte(t.due_on);
}
const libPhase = t => { const p = t.phase_id && phaseDe(t.phase_id); return p ? `Ph. ${p.num} · ${p.title}` : null; };
const sousTitreTache = t => [libPhase(t), nomProjet(t.project_id), ...(t.tags || []).map(x => '#' + x)].filter(Boolean).join(' · ');
const nbCl = t => { const c = t.checklist || []; return c.length ? `☑ ${c.filter(x => x.done).length}/${c.length}` : ''; };
const optionsPhases = (pid, sel) => `<option value="">Sans phase</option>` + state.phases.filter(p => p.project_id === pid).sort((a, b) => a.num - b.num).map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${p.num}. ${esc(p.title)}</option>`).join('');
const optionsMembres = sel => `<option value="">Non attribuée</option>` + state.membres.map(m => `<option value="${m.user_id}" ${m.user_id === sel ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
function ligneTache(t) {
  const [, sl, sc] = infoStatut(t.status), [, pl, pc] = infoPrio(t.priority);
  return `<div class="trow ${t.status === 'fait' ? 'fait' : ''} ${enRetard(t) ? 'retard' : ''}" data-ouvrir="${t.id}">
    <input type="checkbox" data-fait="${t.id}" ${t.status === 'fait' ? 'checked' : ''} title="Marquer terminée">
    <span class="prio ${pc}" title="Priorité ${pl}"></span>
    <div class="ttitre"><b>${esc(t.title)}</b><small>${esc(sousTitreTache(t))}${nbCl(t) ? ' · ' + nbCl(t) : ''}${(t.comments || []).length ? ' · 💬 ' + t.comments.length : ''}</small></div>
    ${avatarDe(t.assignee)}
    <span class="date">${echeanceLib(t)}</span>
    ${jauge(t.status === 'fait' ? 100 : t.progress)}
    <span class="etat ${sc}">${sl}</span></div>`;
}

/* ---- Vue principale ---- */
const ONGLETS_SUIVI = [['tableau', '📊', 'Tableau de bord'], ['liste', '☰', 'Liste'], ['kanban', '▦', 'Kanban'], ['gantt', '▬', 'Gantt'], ['calendrier', '📅', 'Calendrier']];
function vueTaches() {
  const main = $('#main'); main.className = '';
  const s = state.suivi;
  main.innerHTML = `<div class="vue">
    <div class="suivi-tete"><div><h1>Suivi</h1><p class="sous">Tâches, phases et échéances des programmes. Cliquez une tâche pour ouvrir sa fiche ; glissez les cartes du kanban et les barres du Gantt pour replanifier.</p></div>
      <div class="actions"><button class="btn prim" id="t-ajout">＋ Tâche</button><button class="btn" id="t-phase">＋ Phase</button><button class="btn" id="t-csv" title="Exporter les tâches affichées (Excel)">⬇ CSV</button></div></div>
    <div class="onglets">${ONGLETS_SUIVI.map(([k, ic, l]) => `<button class="${s.onglet === k ? 'on' : ''}" data-o="${k}"><span>${ic}</span> ${l}</button>`).join('')}</div>
    <div class="barre-filtres">${filtresProjet('filtreProjet')}
      <input id="t-q" type="search" placeholder="Rechercher…" value="${esc(s.q)}">
      <select id="t-qui"><option value="">Tous les responsables</option><option value="moi" ${s.qui === 'moi' ? 'selected' : ''}>Mes tâches</option><option value="aucun" ${s.qui === 'aucun' ? 'selected' : ''}>Non attribuées</option>${state.membres.map(m => `<option value="${m.user_id}" ${s.qui === m.user_id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      <select id="t-prio"><option value="">Toutes priorités</option>${PRIOS.map(([k, l]) => `<option value="${k}" ${s.prio === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label class="coche"><input type="checkbox" id="t-finies" ${s.finies ? 'checked' : ''}> Terminées</label>
    </div>
    <div id="suivi-corps"></div></div>`;
  brancherFiltres('filtreProjet', vueTaches);
  $$('.onglets button').forEach(b => b.addEventListener('click', () => { s.onglet = b.dataset.o; memoSuivi(); vueTaches(); }));
  $('#t-q').addEventListener('input', e => { s.q = e.target.value; rendreSuivi(); });
  $('#t-qui').addEventListener('change', e => { s.qui = e.target.value; rendreSuivi(); });
  $('#t-prio').addEventListener('change', e => { s.prio = e.target.value; rendreSuivi(); });
  $('#t-finies').addEventListener('change', e => { s.finies = e.target.checked; memoSuivi(); rendreSuivi(); });
  $('#t-ajout').addEventListener('click', () => formTache());
  $('#t-phase').addEventListener('click', () => formPhase());
  $('#t-csv').addEventListener('click', exporterCSV);
  rendreSuivi();
}
function rendreSuivi() {
  const corps = $('#suivi-corps'); if (!corps) { renderNav(); return; }
  ({ tableau: rendreTableau, liste: rendreListe, kanban: rendreKanban, gantt: rendreGantt, calendrier: rendreCalendrier }[state.suivi.onglet] || rendreTableau)(corps);
  brancherCommun(corps);
}
function brancherCommun(racine) {
  $$('[data-ouvrir]', racine).forEach(el => el.addEventListener('click', e => { if (e.target.closest('input,button,select,.gh,[data-stop]')) return; ouvrirTache(el.dataset.ouvrir); }));
  $$('[data-phase-ouvrir]', racine).forEach(el => el.addEventListener('click', e => { if (e.target.closest('input,button,select,.gh')) return; e.stopPropagation(); formPhase(el.dataset.phaseOuvrir); }));
  $$('input[data-fait]', racine).forEach(c => c.addEventListener('change', async () => { await sauverTache(c.dataset.fait, { status: c.checked ? 'fait' : 'à faire' }); rendreSuivi(); }));
}

/* ---- Tableau de bord ---- */
function rendreTableau(corps) {
  const a = auj(), dans7 = plusJours(a, 7), il30 = plusJours(a, -30);
  const all = state.taches.filter(t => passeFiltre('filtreProjet', t.project_id));
  const ouv = all.filter(t => t.status !== 'fait');
  const retards = ouv.filter(enRetard).sort(triTaches);
  const semaine = ouv.filter(t => t.due_on && t.due_on >= a && t.due_on <= dans7);
  const faites30 = all.filter(t => t.status === 'fait' && (t.done_at || '').slice(0, 10) >= il30);
  const prochaines = ouv.filter(t => t.due_on && t.due_on >= a).sort(triTaches).slice(0, 8);
  const recentes = all.slice().sort((x, y) => (y.updated_at || y.created_at).localeCompare(x.updated_at || x.created_at)).slice(0, 6);
  const charge = [...state.membres.map(m => [m.user_id, m.name, m.color]), [null, 'Non attribuées', 'var(--trait)']]
    .map(([id, n, c]) => { const x = ouv.filter(t => (t.assignee || null) === id); return { id, n, c, n1: x.length, r: x.filter(enRetard).length }; }).filter(x => x.n1 || x.id);
  const max = Math.max(1, ...charge.map(x => x.n1));
  const projets = state.projets.filter(p => state.filtreProjet === 'tous' || state.filtreProjet === p.id);
  corps.innerHTML = `<div class="kpis">
      <div class="kpi"><b>${ouv.length}</b><small>Tâches ouvertes</small></div>
      <div class="kpi ambre"><b>${ouv.filter(t => t.status === 'en cours').length}</b><small>En cours</small></div>
      <div class="kpi ${retards.length ? 'rouge' : ''}"><b>${retards.length}</b><small>En retard</small></div>
      <div class="kpi"><b>${semaine.length}</b><small>Échéance sous 7 jours</small></div>
      <div class="kpi vert"><b>${faites30.length}</b><small>Terminées (30 j)</small></div></div>
    <div class="g g2">
      ${projets.map(p => {
        const phs = state.phases.filter(x => x.project_id === p.id).sort((x, y) => x.num - y.num); const enc = phs.find(x => x.status === 'en cours');
        const tp = all.filter(t => t.project_id === p.id); const pf = tp.filter(t => t.status === 'fait').length;
        const pct = phs.length ? Math.round(phs.reduce((s, x) => s + progPhase(x), 0) / phs.length) : 0;
        return `<div class="carte"><h3>${esc(p.name)} <small>${phs.length} phases · ${tp.length} tâches</small></h3>
          <p class="sm" style="margin-bottom:.3em">Avancement global <b class="num">${pct} %</b></p>${jauge(pct, 'or')}
          <p class="sm" style="margin:.6em 0 .3em">Tâches terminées <b class="num">${pf}/${tp.length}</b></p>${jauge(tp.length ? Math.round(pf * 100 / tp.length) : 0)}
          ${enc ? `<p class="sm" style="margin-top:.8em"><span class="etat ambre">en cours</span> Phase ${enc.num} · ${esc(enc.title)}<br><small class="muted">${enc.start_on ? dateFr(enc.start_on) : '—'} → ${enc.end_on ? dateFr(enc.end_on) : 'en continu'} · ${progPhase(enc)} %</small></p>` : '<p class="sm muted" style="margin-top:.8em">Aucune phase en cours.</p>'}
          <div class="actions" style="margin-top:.8em"><button class="btn sm" data-gantt="${p.id}">Voir le Gantt</button><button class="btn sm" data-kanban="${p.id}">Kanban</button></div></div>`; }).join('')}
      <div class="carte"><h3>Charge par responsable</h3>${charge.length ? charge.map(x => `<div class="ligne" style="display:grid;grid-template-columns:auto 1fr auto;gap:.6em;align-items:center"><span class="avatar xs" style="background:${x.c}">${x.id ? initiales(x.n) : '?'}</span><div><b class="sm">${esc(x.n)}</b>${jauge(Math.round(x.n1 * 100 / max), 'bleu')}</div><span class="sm num">${x.n1}${x.r ? ` <span class="etat rouge">${x.r} en retard</span>` : ''}</span></div>`).join('') : '<div class="vide">Aucune tâche ouverte.</div>'}</div>
      <div class="carte compact"><h3>En retard <small>${retards.length}</small></h3>${retards.length ? retards.slice(0, 8).map(ligneTache).join('') : '<div class="vide">Rien en retard.</div>'}</div>
      <div class="carte compact"><h3>Prochaines échéances</h3>${prochaines.length ? prochaines.map(ligneTache).join('') : '<div class="vide">Aucune échéance planifiée.</div>'}</div>
      <div class="carte"><h3>Activité récente</h3>${recentes.length ? recentes.map(t => `<div class="ligne" data-ouvrir="${t.id}" style="cursor:pointer"><div><b class="sm">${esc(t.title)}</b><small>${t.assignee ? esc(membre(t.assignee).name) : 'non attribuée'} · ${jourRelatif(t.updated_at || t.created_at)}</small></div><span class="etat ${infoStatut(t.status)[2]}">${infoStatut(t.status)[1]}</span></div>`).join('') : '<div class="vide">Rien encore.</div>'}</div>
    </div>`;
  $$('[data-gantt],[data-kanban]', corps).forEach(b => b.addEventListener('click', () => { state.filtreProjet = b.dataset.gantt || b.dataset.kanban; state.suivi.onglet = b.dataset.gantt ? 'gantt' : 'kanban'; memoSuivi(); vueTaches(); }));
}

/* ---- Liste groupée ---- */
function rendreListe(corps) {
  const s = state.suivi; const ts = tachesVisibles().sort(triTaches);
  const phasesVisibles = () => state.phases.filter(p => state.filtreProjet === 'tous' || p.project_id === state.filtreProjet).sort((a, b) => a.project_id.localeCompare(b.project_id) || a.num - b.num);
  const groupes = {
    aucun: () => [['', 'Toutes les tâches']], statut: () => STATUTS_T.map(([k, l]) => [k, l]), prio: () => PRIOS.map(([k, l]) => [k, l]),
    qui: () => [...state.membres.map(m => [m.user_id, m.name]), ['', 'Non attribuées']],
    phase: () => [...phasesVisibles().map(p => [p.id, `${nomProjet(p.project_id)} · Phase ${p.num} · ${p.title}`]), ['', 'Sans phase']],
    projet: () => [...state.projets.map(p => [p.id, p.name]), ['', 'Général']],
  };
  const cle = { aucun: () => '', statut: t => t.status, prio: t => t.priority, qui: t => t.assignee || '', phase: t => (t.phase_id && phaseDe(t.phase_id)) ? t.phase_id : '', projet: t => t.project_id || '' }[s.groupe] || (() => '');
  const blocs = (groupes[s.groupe] || groupes.statut)().map(([k, l]) => [l, ts.filter(t => cle(t) === k)]).filter(([, x]) => x.length);
  corps.innerHTML = `<div class="actions" style="margin-bottom:.6em;font-size:.9em"><span class="muted">Grouper par</span><select class="inline" id="t-groupe">${[['statut', 'Statut'], ['phase', 'Phase'], ['qui', 'Responsable'], ['prio', 'Priorité'], ['projet', 'Projet'], ['aucun', 'Aucun']].map(([k, l]) => `<option value="${k}" ${s.groupe === k ? 'selected' : ''}>${l}</option>`).join('')}</select><span class="muted">${ts.length} tâche${ts.length > 1 ? 's' : ''}</span></div>
    <div class="carte">${blocs.length ? blocs.map(([l, x]) => `<div class="grp-titre">${esc(l)} <span class="n">${x.length}</span></div>${x.map(ligneTache).join('')}`).join('') : '<div class="vide">Aucune tâche pour ces filtres.</div>'}</div>`;
  $('#t-groupe').addEventListener('change', e => { s.groupe = e.target.value; memoSuivi(); rendreSuivi(); });
}

/* ---- Kanban ---- */
function colonnesKanban() {
  const s = state.suivi;
  if (s.colonnes === 'qui') return { champ: 'assignee', cols: [...state.membres.map(m => ({ k: m.user_id, l: m.name })), { k: null, l: 'Non attribuée' }] };
  if (s.colonnes === 'prio') return { champ: 'priority', cols: PRIOS.map(([k, l]) => ({ k, l })) };
  if (s.colonnes === 'phase') return { champ: 'phase_id', cols: [...state.phases.filter(p => state.filtreProjet === 'tous' || p.project_id === state.filtreProjet).sort((a, b) => a.project_id.localeCompare(b.project_id) || a.num - b.num).map(p => ({ k: p.id, l: `${p.num}. ${p.title}`, pid: p.project_id })), { k: null, l: 'Sans phase' }] };
  return { champ: 'status', cols: STATUTS_T.map(([k, l]) => ({ k, l })) };
}
function rendreKanban(corps) {
  const s = state.suivi; const { champ, cols } = colonnesKanban();
  const ts = tachesVisibles(s.colonnes === 'statut').sort(triTaches);
  corps.innerHTML = `<div class="actions" style="margin-bottom:.6em;font-size:.9em"><span class="muted">Colonnes</span><select class="inline" id="t-cols">${[['statut', 'Statut'], ['phase', 'Phase'], ['qui', 'Responsable'], ['prio', 'Priorité']].map(([k, l]) => `<option value="${k}" ${s.colonnes === k ? 'selected' : ''}>${l}</option>`).join('')}</select><span class="muted sm">Glissez une carte pour la déplacer.</span></div>
    <div class="kanban">${cols.map((c, i) => { const x = ts.filter(t => (t[champ] || null) === c.k); return `<div class="kcol" data-col="${c.k ?? ''}"><div class="ktete"><b>${esc(c.l)}</b><span class="n">${x.length}</span></div><div class="kcards">${x.map(t => carteKanban(t, i, cols.length)).join('')}</div><button class="kadd" data-add="${c.k ?? ''}">＋ Ajouter</button></div>`; }).join('')}</div>`;
  $('#t-cols').addEventListener('change', e => { s.colonnes = e.target.value; memoSuivi(); rendreSuivi(); });
  const valeur = k => k === '' ? null : k;
  $$('.kadd', corps).forEach(b => b.addEventListener('click', () => { const v = valeur(b.dataset.add); const pre = { [champ]: v }; if (champ === 'phase_id' && v) pre.project_id = phaseDe(v)?.project_id; formTache(pre); }));
  $$('.kcard', corps).forEach(c => {
    c.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', c.dataset.ouvrir); e.dataTransfer.effectAllowed = 'move'; c.classList.add('glisse'); });
    c.addEventListener('dragend', () => c.classList.remove('glisse'));
  });
  $$('.kcol', corps).forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('sur'); });
    col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('sur'); });
    col.addEventListener('drop', async e => {
      e.preventDefault(); col.classList.remove('sur');
      const id = e.dataTransfer.getData('text/plain'); const t = state.taches.find(x => x.id === id); const v = valeur(col.dataset.col);
      if (!t || (t[champ] || null) === v) return;
      const patch = { [champ]: v }; if (champ === 'phase_id' && v) patch.project_id = phaseDe(v)?.project_id || t.project_id;
      await sauverTache(id, patch); rendreSuivi();
    });
  });
  $$('[data-dep]', corps).forEach(b => b.addEventListener('click', async () => {
    const [id, dir] = b.dataset.dep.split(':'); const t = state.taches.find(x => x.id === id); if (!t) return;
    const i = cols.findIndex(c => c.k === (t[champ] || null)); const c = cols[i + (+dir)]; if (!c) return;
    const patch = { [champ]: c.k }; if (champ === 'phase_id' && c.k) patch.project_id = phaseDe(c.k)?.project_id || t.project_id;
    await sauverTache(id, patch); rendreSuivi();
  }));
}
function carteKanban(t, i, n) {
  const [, , pc] = infoPrio(t.priority); const p = t.phase_id && phaseDe(t.phase_id);
  return `<div class="kcard" draggable="true" data-ouvrir="${t.id}">
    <div class="meta"><span class="prio ${pc}"></span><span>${esc(nomProjet(t.project_id))}${p ? ' · Ph. ' + p.num : ''}</span></div>
    <b>${esc(t.title)}</b>
    <div class="meta">${avatarDe(t.assignee)}${t.due_on ? `<span class="${enRetard(t) ? 'retard' : ''}">📅 ${echeanceLib(t)}</span>` : ''}${nbCl(t) ? `<span>${nbCl(t)}</span>` : ''}${(t.comments || []).length ? `<span>💬 ${t.comments.length}</span>` : ''}</div>
    ${(t.progress || t.status === 'fait') ? jauge(t.status === 'fait' ? 100 : t.progress) : ''}
    <div class="dep">${i > 0 ? `<button data-dep="${t.id}:-1" data-stop title="Colonne précédente">◀</button>` : ''}${i < n - 1 ? `<button data-dep="${t.id}:1" data-stop title="Colonne suivante">▶</button>` : ''}</div></div>`;
}

/* ---- Gantt ---- */
function rendreGantt(corps) {
  const s = state.suivi; const a = auj();
  const PX = { semaine: 14, mois: 6, trimestre: 1.8 }[s.echelle] || 6;
  const projets = state.projets.filter(p => state.filtreProjet === 'tous' || state.filtreProjet === p.id);
  const ts = tachesVisibles(true);
  const lignes = [];
  projets.forEach(p => {
    lignes.push({ type: 'projet', l: p.name });
    state.phases.filter(x => x.project_id === p.id).sort((x, y) => x.num - y.num).forEach(ph => {
      const tp = ts.filter(t => t.phase_id === ph.id).sort(triTaches);
      lignes.push({ type: 'phase', ph, n: tp.length });
      if (!s.plies[ph.id]) tp.forEach(t => lignes.push({ type: 'tache', t }));
    });
    const sans = ts.filter(t => t.project_id === p.id && (!t.phase_id || !phaseDe(t.phase_id))).sort(triTaches);
    if (sans.length) { const id = 'sans-' + p.id; lignes.push({ type: 'groupe', l: 'Sans phase', id, n: sans.length }); if (!s.plies[id]) sans.forEach(t => lignes.push({ type: 'tache', t })); }
  });
  if (state.filtreProjet === 'tous' || state.filtreProjet === '') { const gen = ts.filter(t => !t.project_id).sort(triTaches); if (gen.length) { lignes.push({ type: 'groupe', l: 'Général', id: 'gen', n: gen.length }); if (!s.plies.gen) gen.forEach(t => lignes.push({ type: 'tache', t })); } }
  const dates = [a];
  state.phases.forEach(ph => { if (projets.find(p => p.id === ph.project_id)) { if (ph.start_on) dates.push(ph.start_on); if (ph.end_on) dates.push(ph.end_on); } });
  ts.forEach(t => { if (t.start_on) dates.push(t.start_on); if (t.due_on) dates.push(t.due_on); });
  dates.sort();
  const debut = plusJours(dates[0], -7).slice(0, 8) + '01';
  const finD = dateDe(plusJours(dates[dates.length - 1], 45)); const fin = ISO(new Date(finD.getFullYear(), finD.getMonth() + 1, 1));
  const X = iso => diffJours(debut, iso) * PX; const W = X(fin);
  let mois = '', axes = '', d = debut;
  while (d < fin) {
    const dm = dateDe(d); const suivant = ISO(new Date(dm.getFullYear(), dm.getMonth() + 1, 1)); const w = diffJours(d, suivant) * PX;
    mois += `<div class="gmois" style="left:${X(d)}px;width:${w}px">${w > 34 ? MOIS[dm.getMonth()] + (w > 64 ? ' ' + dm.getFullYear() : (dm.getMonth() === 0 ? ' ' + String(dm.getFullYear()).slice(2) : '')) : ''}</div>`;
    axes += `<div class="gaxe" style="left:${X(d)}px"></div>`; d = suivant;
  }
  let sem = '';
  if (s.echelle === 'semaine') { const dw = dateDe(debut); dw.setDate(dw.getDate() - ((dw.getDay() + 6) % 7)); let w = ISO(dw); while (w < fin) { if (w >= debut) sem += `<div class="gsem" style="left:${X(w)}px">${dateDe(w).getDate()}</div>`; w = plusJours(w, 7); } }
  corps.innerHTML = `<div class="actions" style="margin-bottom:.6em;font-size:.9em"><span class="muted">Échelle</span><select class="inline" id="t-ech">${[['semaine', 'Semaine'], ['mois', 'Mois'], ['trimestre', 'Trimestre']].map(([k, l]) => `<option value="${k}" ${s.echelle === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn sm" id="t-auj">Aujourd’hui</button><span class="muted sm">Glissez une barre pour la décaler, tirez son bord droit pour l’allonger, cliquez pour ouvrir.</span></div>
    <div class="gantt" id="gantt"><div class="gbody" style="width:calc(16em + ${W}px)">
      <div class="glignes" style="width:${W}px">${axes}<div class="gauj" style="left:${X(a)}px" title="Aujourd’hui"></div></div>
      <div class="gtete grow"><div class="glab">Phases et tâches</div><div class="gbars" style="width:${W}px;height:2.6em">${mois}${sem}</div></div>
      ${lignes.map(li => ligneGantt(li, X, PX, W)).join('')}</div></div>`;
  $('#t-ech').addEventListener('change', e => { s.echelle = e.target.value; memoSuivi(); rendreSuivi(); });
  const g = $('#gantt'); const centrer = () => { g.scrollLeft = Math.max(0, X(a) - g.clientWidth / 3 + 16 * 12); };
  centrer(); $('#t-auj').addEventListener('click', centrer);
  brancherGantt(corps, PX);
}
function ligneGantt(li, X, PX, W) {
  const s = state.suivi;
  if (li.type === 'projet') return `<div class="grow gpr"><div class="glab">${esc(li.l)}</div><div class="gbars" style="width:${W}px"></div></div>`;
  if (li.type === 'groupe') return `<div class="grow gph"><div class="glab"><button class="tog" data-plie="${li.id}">${s.plies[li.id] ? '▸' : '▾'}</button><span class="lib">${esc(li.l)}</span><span class="n muted">${li.n}</span></div><div class="gbars" style="width:${W}px"></div></div>`;
  if (li.type === 'phase') {
    const ph = li.ph; const deb = ph.start_on || auj(); const finP = ph.end_on || plusJours(deb, 120); const pr = progPhase(ph);
    return `<div class="grow gph"><div class="glab"><button class="tog" data-plie="${ph.id}">${s.plies[ph.id] ? '▸' : '▾'}</button><span class="lib" data-phase-ouvrir="${ph.id}" title="${esc(ph.title)}">${ph.num}. ${esc(ph.title)}</span><span class="n muted">${li.n || ''}</span></div>
      <div class="gbars" style="width:${W}px">${barreGantt({ cls: `phase ${ph.end_on ? '' : 'ouvert'} ${ph.status === 'terminée' ? 'fait' : ''}`, attr: `data-gph="${ph.id}"`, deb, fin: finP, X, PX, pct: pr, lib: `${ph.title} · ${pr} %` })}</div></div>`;
  }
  const t = li.t; const cls = t.status === 'fait' ? 'fait' : enRetard(t) ? 'retard' : t.status === 'en cours' ? 'encours' : '';
  let bar = '';
  const qui = t.assignee ? membre(t.assignee).name.split(' ')[0] : null;
  if (t.due_on && t.start_on && t.start_on < t.due_on) bar = barreGantt({ cls, attr: `data-gt="${t.id}"`, deb: t.start_on, fin: t.due_on, X, PX, pct: t.status === 'fait' ? 100 : t.progress || 0, lib: t.title + (qui ? ' · ' + qui : ''), titre: `${t.title} · ${dateFr(t.start_on)} → ${dateFr(t.due_on)}` });
  else if (t.due_on) bar = `<div class="gjalon ${cls}" data-gt="${t.id}" data-deb="${t.due_on}" data-fin="${t.due_on}" style="left:${X(t.due_on) + PX / 2}px" title="${esc(t.title)} · ${dateFr(t.due_on)}"></div><span class="glib" style="left:${X(t.due_on) + PX / 2 + 14}px">${esc(t.title)}${qui ? ' · ' + esc(qui) : ''} · ${dateFr(t.due_on, { annee: false })}</span>`;
  return `<div class="grow"><div class="glab"><span class="pl lib" data-ouvrir="${t.id}" title="${esc(t.title)}">${avatarDe(t.assignee)} ${esc(t.title)}</span></div><div class="gbars" style="width:${W}px">${bar || `<button class="btn sm gplan" data-planifier="${t.id}" style="left:${X(auj()) + 6}px">Planifier</button>`}</div></div>`;
}
function barreGantt({ cls, attr, deb, fin, X, PX, pct, lib, titre }) {
  const left = X(deb), w = Math.max(8, (diffJours(deb, fin) + 1) * PX); const dedans = w > Math.min(220, lib.length * 6.2 + 16);
  return `<div class="gbar ${cls}" ${attr} data-deb="${deb}" data-fin="${fin}" style="left:${left}px;width:${w}px" title="${esc(titre || lib)}"><i style="width:${pct}%"></i>${dedans ? `<span>${esc(lib)}</span>` : ''}<div class="gh"></div></div>${dedans ? '' : `<span class="glib" style="left:${left + w + 6}px">${esc(lib)}</span>`}`;
}
function brancherGantt(corps, PX) {
  $$('[data-plie]', corps).forEach(b => b.addEventListener('click', () => { const s = state.suivi; s.plies[b.dataset.plie] = !s.plies[b.dataset.plie]; rendreSuivi(); }));
  $$('[data-planifier]', corps).forEach(b => b.addEventListener('click', async () => { await sauverTache(b.dataset.planifier, { start_on: auj(), due_on: plusJours(auj(), 7) }); rendreSuivi(); }));
  $$('.gbar,.gjalon', corps).forEach(el => {
    el.addEventListener('pointerdown', e => {
      if (e.button) return;
      const resize = e.target.classList.contains('gh');
      const x0 = e.clientX, deb = el.dataset.deb, fin = el.dataset.fin, left0 = parseFloat(el.style.left), w0 = parseFloat(el.style.width) || 0;
      let delta = 0, bouge = false;
      try { el.setPointerCapture(e.pointerId); } catch (x) { }
      const move = ev => {
        const dx = ev.clientX - x0; if (Math.abs(dx) > 4) bouge = true; delta = Math.round(dx / PX);
        if (resize) { delta = Math.max(delta, -diffJours(deb, fin)); el.style.width = Math.max(PX, w0 + delta * PX) + 'px'; el.title = 'Fin : ' + dateFr(plusJours(fin, delta)); }
        else { el.style.left = (left0 + delta * PX) + 'px'; el.title = deb === fin ? dateFr(plusJours(fin, delta)) : dateFr(plusJours(deb, delta)) + ' → ' + dateFr(plusJours(fin, delta)); }
      };
      const up = async () => {
        el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
        if (!bouge) { if (el.dataset.gt) ouvrirTache(el.dataset.gt); else formPhase(el.dataset.gph); return; }
        if (!delta) { rendreSuivi(); return; }
        if (el.dataset.gt) {
          const t = state.taches.find(x => x.id === el.dataset.gt); if (!t) return;
          const patch = resize ? { due_on: plusJours(fin, delta) } : { due_on: plusJours(fin, delta), ...(t.start_on ? { start_on: plusJours(deb, delta) } : {}) };
          await sauverTache(t.id, patch);
        } else {
          const ph = phaseDe(el.dataset.gph); if (!ph) return;
          const patch = resize ? { end_on: plusJours(fin, delta) } : { start_on: plusJours(deb, delta), ...(ph.end_on ? { end_on: plusJours(fin, delta) } : {}) };
          await sauverPhase(ph.id, patch);
        }
        rendreSuivi();
      };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      e.preventDefault();
    });
  });
}

/* ---- Calendrier ---- */
function rendreCalendrier(corps) {
  const s = state.suivi; const [Y, M] = s.mois.split('-').map(Number); const a = auj();
  const premier = new Date(Y, M - 1, 1); const start = new Date(Y, M - 1, 1 - ((premier.getDay() + 6) % 7));
  const ts = tachesVisibles(true); const phs = state.phases.filter(p => state.filtreProjet === 'tous' || p.project_id === state.filtreProjet);
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i); const iso = ISO(d); const hors = d.getMonth() !== M - 1;
    const x = ts.filter(t => t.due_on === iso).sort(triTaches);
    const pd = phs.filter(p => p.start_on === iso).map(p => ({ p, l: '▶ Ph. ' + p.num })).concat(phs.filter(p => p.end_on === iso).map(p => ({ p, l: '■ Fin ph. ' + p.num })));
    const chips = pd.map(({ p, l }) => `<span class="chip ph" data-phase-ouvrir="${p.id}" title="${esc(p.title)}">${l}</span>`)
      .concat(x.slice(0, 3).map(t => `<span class="chip ${t.status === 'fait' ? 'fait' : enRetard(t) ? 'retard' : ''}" data-ouvrir="${t.id}" title="${esc(t.title)}${t.assignee ? ' · ' + esc(membre(t.assignee).name) : ''}">${esc(t.title)}</span>`));
    cells += `<div class="cc ${hors ? 'hors' : ''} ${iso === a ? 'auj' : ''} ${d.getDay() === 0 || d.getDay() === 6 ? 'we' : ''}" data-jour="${iso}"><span class="jn">${d.getDate()}</span>${chips.join('')}${x.length > 3 ? `<button class="plus" data-jour-liste="${iso}">+${x.length - 3} autres</button>` : ''}</div>`;
  }
  corps.innerHTML = `<div class="cal-nav"><button class="btn sm" id="c-prev" title="Mois précédent">◀</button><button class="btn sm" id="c-auj">Aujourd’hui</button><button class="btn sm" id="c-next" title="Mois suivant">▶</button><h2>${MOIS_LONG[M - 1]} ${Y}</h2><span class="muted sm">Cliquez un jour pour créer une tâche à cette date.</span></div>
    <div class="cal">${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(j => `<div class="cj">${j}</div>`).join('')}${cells}</div>`;
  const nav = n => { const d = new Date(Y, M - 1 + n, 1); s.mois = ISO(d).slice(0, 7); rendreSuivi(); };
  $('#c-prev').addEventListener('click', () => nav(-1)); $('#c-next').addEventListener('click', () => nav(1));
  $('#c-auj').addEventListener('click', () => { s.mois = a.slice(0, 7); rendreSuivi(); });
  $$('.cc', corps).forEach(c => c.addEventListener('click', e => { if (e.target.closest('.chip,.plus')) return; formTache({ due_on: c.dataset.jour }); }));
  $$('[data-jour-liste]', corps).forEach(b => b.addEventListener('click', () => listeJour(b.dataset.jourListe)));
}
function listeJour(iso) {
  const x = tachesVisibles(true).filter(t => t.due_on === iso).sort(triTaches);
  modal(`<h3>${dateFr(iso, { jour: true })}</h3><div>${x.map(ligneTache).join('') || '<div class="vide">Aucune tâche.</div>'}</div>
    <div class="actions" style="margin-top:.8em"><button class="btn prim" id="j-add">＋ Tâche ce jour</button><button class="btn" onclick="fermerModal()">Fermer</button></div>`, mo => {
    brancherCommun(mo); $('#j-add', mo).addEventListener('click', () => formTache({ due_on: iso }));
  });
}

/* ---- Création rapide ---- */
function formTache(pre = {}) {
  let pid = pre.project_id !== undefined ? (pre.project_id || '') : (state.filtreProjet === 'tous' ? 'kaporo1' : state.filtreProjet);
  if (pre.phase_id && phaseDe(pre.phase_id)) pid = phaseDe(pre.phase_id).project_id;
  modal(`<h3>Nouvelle tâche</h3>
    <label class="champ"><span>Tâche</span><input id="n-titre" placeholder="Ex. Demander le certificat de non-litige"></label>
    <label class="champ"><span>Détail (facultatif)</span><textarea id="n-desc" rows="2"></textarea></label>
    <div class="ligne2"><label class="champ"><span>Projet</span><select id="n-projet">${optionsProjets(pid)}</select></label>
      <label class="champ"><span>Phase</span><select id="n-phase">${optionsPhases(pid, pre.phase_id)}</select></label></div>
    <div class="ligne2"><label class="champ"><span>Responsable</span><select id="n-qui">${optionsMembres(pre.assignee)}</select></label>
      <label class="champ"><span>Priorité</span><select id="n-prio">${PRIOS.map(([k, l]) => `<option value="${k}" ${(pre.priority || 'normale') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="ligne2"><label class="champ"><span>Début</span><input id="n-deb" type="date" value="${pre.start_on || ''}"></label>
      <label class="champ"><span>Échéance</span><input id="n-fin" type="date" value="${pre.due_on || ''}"></label></div>
    <div class="actions"><button class="btn prim" id="n-ok">Créer</button><button class="btn" onclick="fermerModal()">Annuler</button></div>`, mo => {
    $('#n-projet', mo).addEventListener('change', e => { $('#n-phase', mo).innerHTML = optionsPhases(e.target.value); });
    $('#n-titre', mo).focus();
    $('#n-titre', mo).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#n-ok', mo).click(); } });
    $('#n-ok', mo).addEventListener('click', async () => {
      const title = $('#n-titre').value.trim(); if (!title) { toast('Donnez un titre à la tâche'); return; }
      $('#n-ok').disabled = true;
      const t = await creerTache({ title, description: $('#n-desc').value.trim(), project_id: $('#n-projet').value, phase_id: $('#n-phase').value, assignee: $('#n-qui').value, priority: $('#n-prio').value, status: pre.status || 'à faire', start_on: $('#n-deb').value, due_on: $('#n-fin').value });
      if (t) { fermerModal(); toast('Tâche créée'); rendreSuivi(); renderNav(); } else $('#n-ok').disabled = false;
    });
  });
}

/* ---- Fiche tâche (enregistrement automatique) ---- */
function ouvrirTache(id) {
  const t = state.taches.find(x => x.id === id); if (!t) return;
  const rendu = () => {
    const cl = t.checklist || [], co = t.comments || [];
    return `<div class="fiche">
    <input class="titre" id="f-titre" value="${esc(t.title)}" placeholder="Titre de la tâche">
    <div class="ligne4">
      <label class="champ"><span>Statut</span><select id="f-statut">${STATUTS_T.map(([k, l]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="champ"><span>Priorité</span><select id="f-prio">${PRIOS.map(([k, l]) => `<option value="${k}" ${t.priority === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="champ"><span>Début</span><input id="f-deb" type="date" value="${t.start_on || ''}"></label>
      <label class="champ"><span>Échéance</span><input id="f-fin" type="date" value="${t.due_on || ''}"></label></div>
    <div class="ligne2"><label class="champ"><span>Projet</span><select id="f-projet">${optionsProjets(t.project_id || '')}</select></label>
      <label class="champ"><span>Phase</span><select id="f-phase">${optionsPhases(t.project_id, t.phase_id)}</select></label></div>
    <div class="ligne2"><label class="champ"><span>Responsable</span><select id="f-qui">${optionsMembres(t.assignee)}</select></label>
      <label class="champ"><span>Étiquettes (séparées par des virgules)</span><input id="f-tags" value="${esc((t.tags || []).join(', '))}" placeholder="foncier, urgent, banque"></label></div>
    <label class="champ"><span>Avancement <b id="f-pct">${t.status === 'fait' ? 100 : t.progress || 0}</b> %${cl.length ? ' (calculé sur les sous-tâches)' : ''}</span><input id="f-prog" type="range" min="0" max="100" step="5" value="${t.status === 'fait' ? 100 : t.progress || 0}" ${cl.length ? 'disabled' : ''}></label>
    <label class="champ"><span>Description</span><textarea id="f-desc" rows="3" placeholder="Contexte, attendus, liens…">${esc(t.description || '')}</textarea></label>
    <h4>Sous-tâches ${cl.length ? `<small>${cl.filter(x => x.done).length}/${cl.length}</small>` : ''}</h4>
    <div id="f-cl">${cl.map((x, i) => `<div class="cl-item ${x.done ? 'fait' : ''}"><input type="checkbox" data-cl="${i}" ${x.done ? 'checked' : ''}><span>${esc(x.text)}</span><button data-cl-suppr="${i}" title="Retirer">✕</button></div>`).join('')}</div>
    <div class="cl-add"><input id="f-cl-txt" placeholder="Ajouter une sous-tâche, puis Entrée"><button class="btn sm" id="f-cl-ok">＋</button></div>
    <h4>Commentaires ${co.length ? `<small>${co.length}</small>` : ''}</h4>
    <div id="f-com">${co.map(c => `<div class="com">${avatarDe(c.by)}<div class="corps"><b>${esc(membre(c.by).name)}</b><small>${jourRelatif(c.at)} ${hhmm(new Date(c.at))}</small><p>${linkify(c.text)}</p></div></div>`).join('')}</div>
    <div class="cl-add" style="margin-top:.4em"><input id="f-com-txt" placeholder="Écrire un commentaire…"><button class="btn sm prim" id="f-com-ok">Envoyer</button></div>
    <p class="sm muted" style="margin-top:1em">Créée ${t.created_by ? 'par ' + esc(membre(t.created_by).name) + ' ' : ''}le ${dateFr(t.created_at)}${t.updated_at ? ' · modifiée ' + jourRelatif(t.updated_at).toLowerCase() : ''}${t.done_at ? ' · terminée le ' + dateFr(t.done_at) : ''}. Les modifications sont enregistrées automatiquement.</p>
    <div class="actions" style="margin-top:.8em"><button class="btn prim" id="f-fermer">Fermer</button>${peutSupprimer(t) ? `<button class="btn" id="f-suppr">Supprimer</button>` : ''}</div></div>`;
  };
  const fermer = () => { fermerModal(); rendreSuivi(); };
  const brancher = mo => {
    const boite = $('.boite', mo);
    const maj = patch => sauverTache(t.id, patch, { silencieux: true });
    const rafraichir = () => { const sc = boite.scrollTop; boite.innerHTML = rendu(); brancher(mo); boite.scrollTop = sc; };
    const champ = (sel, cle, conv = v => v || null) => $(sel, mo).addEventListener('change', e => maj({ [cle]: conv(e.target.value) }));
    champ('#f-titre', 'title', v => v.trim() || t.title);
    champ('#f-prio', 'priority', v => v); champ('#f-deb', 'start_on'); champ('#f-fin', 'due_on');
    champ('#f-qui', 'assignee'); champ('#f-desc', 'description', v => v.trim() || null); champ('#f-phase', 'phase_id');
    champ('#f-tags', 'tags', v => v.split(',').map(x => x.trim()).filter(Boolean));
    $('#f-projet', mo).addEventListener('change', e => { const pid = e.target.value || null; $('#f-phase', mo).innerHTML = optionsPhases(pid); maj({ project_id: pid, phase_id: null }); });
    $('#f-statut', mo).addEventListener('change', async e => { await maj({ status: e.target.value }); rafraichir(); });
    $('#f-prog', mo).addEventListener('input', e => { $('#f-pct', mo).textContent = e.target.value; });
    $('#f-prog', mo).addEventListener('change', async e => {
      const p = +e.target.value;
      await maj(p === 100 ? { progress: 100, status: 'fait' } : { progress: p, ...(t.status === 'fait' ? { status: 'en cours' } : t.status === 'à faire' && p > 0 ? { status: 'en cours' } : {}) });
      rafraichir();
    });
    const cl = () => t.checklist || [];
    const sauverCl = async liste => {
      const patch = { checklist: liste };
      if (liste.length) { const p = Math.round(liste.filter(x => x.done).length * 100 / liste.length); patch.progress = p; if (t.status === 'fait' && p < 100) patch.status = 'en cours'; else if (t.status === 'à faire' && p > 0) patch.status = 'en cours'; }
      await maj(patch); rafraichir();
    };
    $('#f-cl-ok', mo).addEventListener('click', () => { const v = $('#f-cl-txt', mo).value.trim(); if (!v) return; sauverCl([...cl(), { text: v, done: false }]); });
    $('#f-cl-txt', mo).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#f-cl-ok', mo).click(); } });
    $$('[data-cl]', mo).forEach(c => c.addEventListener('change', () => sauverCl(cl().map((x, i) => i === +c.dataset.cl ? { ...x, done: c.checked } : x))));
    $$('[data-cl-suppr]', mo).forEach(b => b.addEventListener('click', () => sauverCl(cl().filter((x, i) => i !== +b.dataset.clSuppr))));
    const commenter = async () => { const v = $('#f-com-txt', mo).value.trim(); if (!v) return; await maj({ comments: [...(t.comments || []), { by: state.moi.user_id, at: new Date().toISOString(), text: v }] }); rafraichir(); };
    $('#f-com-ok', mo).addEventListener('click', commenter);
    $('#f-com-txt', mo).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commenter(); } });
    $('#f-fermer', mo).addEventListener('click', fermer);
    $('#f-suppr', mo)?.addEventListener('click', async () => { if (await supprimerTache(t.id)) { fermer(); renderNav(); } });
  };
  const mo = modal(rendu(), m => { $('.boite', m).classList.add('large'); brancher(m); });
  mo.addEventListener('click', e => { if (e.target === mo) rendreSuivi(); });
}

/* ---- Phases ---- */
function formPhase(id) {
  const ph = id ? phaseDe(id) : null; if (id && !ph) return;
  const pid = ph ? ph.project_id : (state.filtreProjet === 'tous' || !state.filtreProjet ? 'kaporo1' : state.filtreProjet);
  const num = ph ? ph.num : Math.max(0, ...state.phases.filter(p => p.project_id === pid).map(p => p.num)) + 1;
  const ts = ph ? tachesDePhase(ph.id) : [];
  modal(`<h3>${ph ? `Phase ${ph.num} · ${esc(nomProjet(ph.project_id))}` : 'Nouvelle phase'}</h3>
    <label class="champ"><span>Titre</span><input id="p-titre" value="${esc(ph?.title || '')}" placeholder="Ex. Études préalables"></label>
    <div class="ligne2"><label class="champ"><span>Projet</span><select id="p-projet" ${ph ? 'disabled' : ''}>${optionsProjets(pid, false)}</select></label><label class="champ"><span>Numéro</span><input id="p-num" type="number" min="1" value="${num}"></label></div>
    <div class="ligne2"><label class="champ"><span>Début</span><input id="p-deb" type="date" value="${ph?.start_on || ''}"></label><label class="champ"><span>Fin (vide = en continu)</span><input id="p-fin" type="date" value="${ph?.end_on || ''}"></label></div>
    <div class="ligne2"><label class="champ"><span>Statut</span><select id="p-statut">${STATUTS_PHASE.map(s => `<option ${s === (ph?.status || 'à venir') ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="champ"><span>Responsable</span><select id="p-qui">${optionsMembres(ph?.owner)}</select></label></div>
    <label class="champ"><span>Livrable attendu</span><input id="p-liv" value="${esc(ph?.deliverable || '')}"></label>
    <label class="champ"><span>Notes</span><textarea id="p-notes" rows="2">${esc(ph?.notes || '')}</textarea></label>
    ${ts.length ? `<p class="sm muted" style="margin-bottom:.8em">Avancement calculé sur ${ts.length} tâche${ts.length > 1 ? 's' : ''} : <b>${progPhase(ph)} %</b></p>` : `<label class="champ"><span>Avancement manuel <b id="p-pct">${ph?.progress || 0}</b> % (tant qu’aucune tâche n’est rattachée)</span><input id="p-prog" type="range" min="0" max="100" step="5" value="${ph?.progress || 0}"></label>`}
    <div class="actions"><button class="btn prim" id="p-ok">${ph ? 'Enregistrer' : 'Créer la phase'}</button>${ph ? `<button class="btn" id="p-tache">＋ Tâche dans cette phase</button>` : ''}<button class="btn" onclick="fermerModal()">Annuler</button></div>`, mo => {
    $('#p-prog', mo)?.addEventListener('input', e => { $('#p-pct', mo).textContent = e.target.value; });
    $('#p-tache', mo)?.addEventListener('click', () => formTache({ phase_id: ph.id, project_id: ph.project_id }));
    $('#p-ok', mo).addEventListener('click', async () => {
      const row = { title: $('#p-titre').value.trim(), num: +$('#p-num').value || num, start_on: $('#p-deb').value || null, end_on: $('#p-fin').value || null, status: $('#p-statut').value, owner: $('#p-qui').value || null, deliverable: $('#p-liv').value.trim() || null, notes: $('#p-notes').value.trim() || null };
      if (!row.title) { toast('Donnez un titre à la phase'); return; }
      if ($('#p-prog')) row.progress = +$('#p-prog').value;
      if (ph) { if (await sauverPhase(ph.id, row)) { fermerModal(); state.phases.sort((a, b) => a.num - b.num); rendreSuivi(); } return; }
      row.project_id = $('#p-projet').value;
      const { data, error } = await state.client.from('kp_phases').insert(row).select().single();
      if (error) { toast('Création impossible : ' + esc(error.message)); return; }
      if (!state.phases.find(p => p.id === data.id)) { state.phases.push(data); state.phases.sort((a, b) => a.num - b.num); }
      fermerModal(); toast('Phase créée'); rendreSuivi();
    });
  });
}

/* ---- Export CSV (Excel) ---- */
function exporterCSV() {
  const ts = tachesVisibles(true).sort(triTaches);
  const col = ['Titre', 'Projet', 'Phase', 'Responsable', 'Statut', 'Priorité', 'Début', 'Échéance', 'Avancement', 'Étiquettes', 'Sous-tâches', 'Description'];
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lignes = ts.map(t => { const p = t.phase_id && phaseDe(t.phase_id); return [t.title, nomProjet(t.project_id), p ? `${p.num}. ${p.title}` : '', t.assignee ? membre(t.assignee).name : '', t.status, t.priority, t.start_on || '', t.due_on || '', (t.status === 'fait' ? 100 : t.progress || 0) + ' %', (t.tags || []).join(' '), (t.checklist || []).map(x => (x.done ? '[x] ' : '[ ] ') + x.text).join(' | '), t.description || ''].map(q).join(';'); });
  const blob = new Blob(['﻿' + [col.map(q).join(';'), ...lignes].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `kaporo-taches-${auj()}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast(`${ts.length} tâche${ts.length > 1 ? 's' : ''} exportée${ts.length > 1 ? 's' : ''}`);
}

/* ============================================================
   Navigation, chargement des données, temps réel, démarrage
   ============================================================ */
const VUES = [
  ['discussions', '💬', 'Discussions', vueDiscussions], ['projets', '🏗️', 'Projets', vueProjets], ['documents', '📁', 'Documents', vueDocuments],
  ['decisions', '✅', 'Décisions', vueDecisions], ['taches', '📊', 'Suivi', vueTaches], ['equipe', '👥', 'Équipe', vueEquipe],
  ['dev', '🛠️', 'Développement', vueDev, 'admin'],
];
const vuesVisibles = () => VUES.filter(v => !v[4] || (state.moi && state.moi.is_admin));
function renderNav() {
  const nl = totalNonLus(); const auj = new Date().toISOString().slice(0, 10);
  const retard = state.taches.filter(t => t.status !== 'fait' && t.due_on && t.due_on < auj).length;
  const badge = k => k === 'discussions' && nl ? `<span class="bd">${nl}</span>` : k === 'taches' && retard ? `<span class="bd">${retard}</span>` : '';
  const devOuv = (state.dev || []).filter(d => ['question', 'livrée'].includes(d.status) && !d.vu).length;
  const btn = (k, court) => `<button class="${state.vue === k[0] ? 'on' : ''}" data-v="${k[0]}"><span class="ic">${k[1]}</span><span>${court && k[2] === 'Développement' ? 'Dév.' : k[2]}</span>${badge(k[0])}</button>`;
  const vs = vuesVisibles();
  $('#nav').innerHTML = `<div class="grp">Espace de travail</div>${vs.map(k => btn(k, false)).join('')}`;
  $('#tabs').innerHTML = vs.map(k => btn(k, true)).join('');
  $('#tabs').style.gridTemplateColumns = `repeat(${vs.length},1fr)`;
  $$('#nav button,#tabs button').forEach(b => b.addEventListener('click', () => go(b.dataset.v)));
  const a = $('#moi-avatar'); if (state.moi) { a.textContent = initiales(state.moi.name); a.style.background = state.moi.color; a.title = state.moi.name; }
  document.title = (nl ? `(${nl}) ` : '') + 'Kaporo';
}
function go(v) {
  state.vue = v; localStorage.setItem('kp.vue', v); fermerModal();
  const def = VUES.find(x => x[0] === v) || VUES[0];
  renderNav(); def[3]();
}
function setConn(ok, lib) { const c = $('#conn'); c.className = 'pill ' + (ok ? 'on' : 'off'); c.innerHTML = '<i></i><span>' + (lib || (ok ? 'En direct' : 'Hors ligne')) + '</span>'; }

async function chargerTout() {
  const c = state.client;
  const [me, mb, pr, ch, ms, rd, dc, de, ph, ta, cm] = await Promise.all([
    c.from('kp_members').select('*').eq('user_id', state.session.user.id).maybeSingle(),
    c.from('kp_members').select('*').order('created_at'),
    c.from('kp_projects').select('*').order('sort'),
    c.from('kp_channels').select('*').order('sort'),
    c.from('kp_messages').select('*').order('created_at', { ascending: true }).limit(2000),
    c.from('kp_reads').select('*').eq('user_id', state.session.user.id),
    c.from('kp_documents').select('*').order('created_at', { ascending: false }),
    c.from('kp_decisions').select('*').order('decided_on', { ascending: false }),
    c.from('kp_phases').select('*').order('num'),
    c.from('kp_tasks').select('*').order('created_at'),
    c.from('kp_channel_members').select('*'),
  ]);
  const err = [me, mb, pr, ch, ms, rd, dc, de, ph, ta, cm].find(r => r.error); if (err) throw err.error;
  if (!me.data) throw new Error('PROFIL_ABSENT');
  state.moi = me.data; state.membres = mb.data; state.projets = pr.data; state.canaux = ch.data; state.messages = ms.data;
  state.participants = grouperParticipants(cm.data);
  state.lectures = Object.fromEntries((rd.data || []).map(r => [r.channel_id, r.last_read]));
  state.documents = dc.data; state.decisions = de.data; state.phases = ph.data; state.taches = ta.data;
}
const grouperParticipants = rows => (rows || []).reduce((o, r) => { (o[r.channel_id] = o[r.channel_id] || []).push(r.user_id); return o; }, {});
/* Canaux et participants : rechargés quand une conversation privée est créée (temps réel) */
let rechargementCanaux = null;
function rechargerCanaux() {
  if (rechargementCanaux) return rechargementCanaux;
  rechargementCanaux = (async () => {
    const [ch, cm, ms] = await Promise.all([
      state.client.from('kp_channels').select('*').order('sort'),
      state.client.from('kp_channel_members').select('*'),
      state.client.from('kp_messages').select('*').order('created_at', { ascending: true }).limit(2000),
    ]);
    if (ch.data) state.canaux = ch.data;
    if (cm.data) state.participants = grouperParticipants(cm.data);
    if (ms.data) { for (const m of ms.data) if (!state.messages.find(x => x.id === m.id)) state.messages.push(m); state.messages.sort((a, b) => a.created_at < b.created_at ? -1 : 1); }
    if (state.vue === 'discussions') { renderCanaux(); if (state.canal && !state.canaux.find(c => c.id === state.canal)) { state.canal = state.canaux[0]?.id; renderSalon(); } }
    renderNav();
  })().finally(() => { rechargementCanaux = null; });
  return rechargementCanaux;
}
function brancherTempsReel() {
  const c = state.client;
  const maj = (table, cle, tri) => async payload => {
    const row = payload.new?.id ? payload.new : null;
    if (payload.eventType === 'DELETE') { state[cle] = state[cle].filter(x => x.id !== payload.old.id); }
    else if (row) { const i = state[cle].findIndex(x => x.id === row.id); if (i >= 0) state[cle][i] = row; else state[cle].push(row); if (tri) state[cle].sort(tri); }
    if (!document.activeElement?.matches('input,select,textarea') && !$('#modal') && state.vue !== 'discussions') { if (state.vue === 'taches' && $('#suivi-corps')) rendreSuivi(); else go(state.vue); } else renderNav();
  };
  c.channel('kaporo-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kp_messages' }, p => { if (p.new?.id) messageRecu(p.new); })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kp_channel_members' }, p => { if (p.new?.user_id === state.moi?.user_id) rechargerCanaux(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kp_tasks' }, maj('kp_tasks', 'taches'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kp_decisions' }, maj('kp_decisions', 'decisions', (a, b) => b.decided_on.localeCompare(a.decided_on)))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kp_documents' }, maj('kp_documents', 'documents', (a, b) => b.created_at.localeCompare(a.created_at)))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kp_phases' }, maj('kp_phases', 'phases', (a, b) => a.num - b.num))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kp_dev_requests' }, async p => {
      if (!state.moi?.is_admin) return; await chargerDev();
      if (p.new && ['question', 'livrée', 'erreur'].includes(p.new.status) && p.old?.status !== p.new.status) toast(`<b>Développement · ${esc(p.new.title)}</b><br>${p.new.status === 'livrée' ? 'Livrée : rechargez l’application pour voir le résultat.' : p.new.status === 'question' ? 'L’agent a une question.' : 'Erreur pendant la réalisation.'}`, 6000);
      if (state.vue === 'dev' && !document.activeElement?.matches('input,select,textarea')) vueDev(); else renderNav();
    })
    .subscribe(st => { setConn(st === 'SUBSCRIBED', st === 'SUBSCRIBED' ? 'En direct' : st === 'CHANNEL_ERROR' ? 'Reconnexion…' : 'Connexion…'); });
  // Nouveaux membres : rafraîchir la liste (pas de temps réel sur la table, on recharge à la demande)
  c.from('kp_members').select('*').order('created_at').then(r => { if (r.data) state.membres = r.data; });
}

async function demarrerSession(session) {
  state.session = session;
  try {
    await chargerTout();
  } catch (e) {
    console.error(e);
    if (String(e.message).includes('PROFIL_ABSENT')) { msgLogin('err', 'Votre compte existe mais n’est pas (ou plus) membre de cet espace. Contactez Paul.'); await state.client.auth.signOut(); return; }
    msgLogin('err', 'Chargement impossible : ' + esc(e.message)); return;
  }
  $('#login').hidden = true; $('#app').hidden = false;
  if (state.moi.is_admin) await chargerDev();
  go(vuesVisibles().find(v => v[0] === state.vue) ? state.vue : 'discussions');
  brancherTempsReel();
  if (state.vue === 'discussions' && window.matchMedia('(max-width:820px)').matches && totalNonLus() === 0 && state.canal) { /* on reste sur la liste des canaux */ }
}
(function boot() {
  state.client = supabase.createClient(SUPA.url, SUPA.key, { auth: { flowType: 'implicit', persistSession: true, detectSessionInUrl: true }, realtime: { params: { eventsPerSecond: 10 } } });
  initLogin();
  let demarre = false;
  state.client.auth.onAuthStateChange((evt, session) => {
    if (session && !demarre) { demarre = true; demarrerSession(session); }
    if (evt === 'SIGNED_OUT') { demarre = false; $('#app').hidden = true; $('#login').hidden = false; }
  });
  state.client.auth.getSession().then(({ data }) => { if (data.session && !demarre) { demarre = true; demarrerSession(data.session); } else if (!data.session) { $('#l-email').focus(); } });
  if (location.hash.includes('error=')) { const p = new URLSearchParams(location.hash.slice(1)); msgLogin('err', 'Lien invalide ou expiré : ' + esc(p.get('error_description') || p.get('error'))); history.replaceState(null, '', location.pathname); }
  window.addEventListener('offline', () => setConn(false, 'Hors ligne'));
  window.addEventListener('online', () => setConn(true, 'En direct'));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.vue === 'discussions' && state.canal && state.moi) { renderFil(true); marquerLu(state.canal); } });
})();
