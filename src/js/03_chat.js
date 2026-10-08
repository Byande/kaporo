/* ============================================================
   Discussions : canaux, fil de messages, composer, temps réel
   ============================================================ */
const msgsCanal = id => state.messages.filter(m => m.channel_id === id);
function nonLus(id) {
  const lu = state.lectures[id] ? new Date(state.lectures[id]).getTime() : 0;
  return msgsCanal(id).filter(m => m.author !== state.moi.user_id && new Date(m.created_at).getTime() > lu).length;
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
function renderCanaux() {
  const el = $('#liste-canaux'); if (!el) return;
  el.innerHTML = state.canaux.map(c => {
    const ms = msgsCanal(c.id); const dernier = ms[ms.length - 1]; const nl = nonLus(c.id);
    const qui = dernier ? (dernier.author === state.moi.user_id ? 'Vous' : membre(dernier.author).name.split(' ')[0]) + ' : ' : '';
    return `<button class="canal ${c.kind === 'general' ? 'gen' : ''} ${c.id === state.canal ? 'on' : ''}" data-id="${c.id}">
      <span class="ic">${c.kind === 'general' ? '✦' : c.name.replace(/\D/g, '') || c.name[0]}</span>
      <span><b>${esc(c.name)}</b><small>${esc(qui + resumeMessage(dernier))}</small></span>
      <span class="meta"><span>${dernier ? (jourRelatif(dernier.created_at) === 'Aujourd’hui' ? hhmm(new Date(dernier.created_at)) : dateFr(dernier.created_at, { annee: false })) : ''}</span>${nl ? `<span class="bd">${nl}</span>` : ''}</span></button>`;
  }).join('');
  $$('.canal', el).forEach(b => b.addEventListener('click', () => ouvrirCanal(b.dataset.id)));
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
  s.innerHTML = `<div class="tete"><button class="retour" id="retour" aria-label="Retour">‹</button>
      <span class="avatar" style="background:${c.kind === 'general' ? 'var(--or)' : 'var(--encre)'};color:${c.kind === 'general' ? 'var(--encre)' : 'var(--or)'}">${c.kind === 'general' ? '✦' : c.name.replace(/\D/g, '') || c.name[0]}</span>
      <div><b>${esc(c.name)}</b><small>${state.membres.map(m => m.name.split(' ')[0]).join(', ')}</small></div></div>
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
    if (m.body) corps += `<div class="txt">${linkify(m.body)}</div>`;
  }
  return `<div class="bulle ${moi ? 'moi' : ''} ${m.deleted ? 'supprime' : ''} ${state.selection === m.id ? 'sel' : ''}" data-id="${m.id}">
    ${moi ? '' : `<div class="qui" style="color:${a.color}">${esc(a.name)}</div>`}${corps}
    <div class="quand">${m.edited_at ? '<span>modifié</span>' : ''}<span>${hhmm(new Date(m.created_at))}</span></div></div>`;
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
      const { data, error } = await state.client.from('kp_documents').insert({ project_id: $('#d-projet').value || null, title: $('#d-titre').value.trim() || p.name, category: $('#d-cat').value, path: p.path, size: p.size, mime: p.mime, uploaded_by: state.moi.user_id, note: 'Depuis la discussion ' + (c?.name || '') }).select().single();
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
      <textarea id="txt" rows="1" placeholder="Écrire un message…" enterkeyhint="send"></textarea>
      <button class="rond env" id="env" title="Envoyer">➤</button></div>`;
  const txt = $('#txt', c);
  txt.addEventListener('input', () => { txt.style.height = 'auto'; txt.style.height = Math.min(txt.scrollHeight, 150) + 'px'; });
  txt.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width:821px)').matches) { e.preventDefault(); envoyer(); } });
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
let envoiEnCours = false;
async function envoyer() {
  if (envoiEnCours) return;
  const txt = $('#txt'); const body = txt.value.trim();
  if (!body && !state.pj) return;
  envoiEnCours = true; $('#env').disabled = true;
  try {
    let attachment = null;
    if (state.pj) { toast('Envoi du fichier…', 8000); attachment = await televerser(state.pj.file, 'chat/' + state.canal); }
    const row = { channel_id: state.canal, author: state.moi.user_id, body, attachment, reply_to: state.reponseA?.id || null };
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
  const i = state.messages.findIndex(x => x.id === m.id);
  if (i >= 0) state.messages[i] = m; else state.messages.push(m);
  state.messages.sort((a, b) => a.created_at < b.created_at ? -1 : 1);
  const visible = state.vue === 'discussions' && state.canal === m.channel_id && (state.salonOuvert || window.matchMedia('(min-width:821px)').matches) && document.visibilityState === 'visible';
  if (visible) { renderFil(true); marquerLu(m.channel_id); }
  if (state.vue === 'discussions') renderCanaux();
  renderNav();
  if (i < 0 && m.author !== state.moi.user_id) {
    const a = membre(m.author); const c = state.canaux.find(x => x.id === m.channel_id);
    if (!visible) toast(`<b>${esc(a.name)}</b> · ${esc(c?.name || '')}<br>${esc(resumeMessage(m))}`);
    if (document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification(a.name + ' · ' + (c?.name || 'Kaporo'), { body: resumeMessage(m), tag: m.id }); } catch (e) { }
    }
  }
}
