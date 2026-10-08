/* ============================================================
   Rédaction : documents co-édités en temps réel (Yjs + Quill), présence, versions, import/export Word
   ============================================================ */
const CDN = {
  quill: 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js', quillCss: 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css',
  cursors: 'https://cdn.jsdelivr.net/npm/quill-cursors@4.0.4/dist/quill-cursors.js',
  mammoth: 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js', docx: 'https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.js',
  yjs: 'https://esm.sh/yjs@13.6.20', yquill: 'https://esm.sh/y-quill@1.0.0?deps=yjs@13.6.20,y-protocols@1.0.6', aw: 'https://esm.sh/y-protocols@1.0.6/awareness?deps=yjs@13.6.20',
};
const CATEGORIES_DOC = ['Note', 'Compte rendu', 'Courrier', 'Rapport', 'Contrat', 'Cahier des charges', 'Procès-verbal', 'Autre'];
const KP = {};
state.docs = []; state.redac = { ouvert: null, session: null, aside: window.innerWidth > 820 };
const u8ToB64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const b64ToU8 = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
const scriptsCharges = {};
function chargerScript(url, css) {
  if (scriptsCharges[url]) return scriptsCharges[url];
  scriptsCharges[url] = new Promise((res, rej) => {
    const el = css ? Object.assign(document.createElement('link'), { rel: 'stylesheet', href: url }) : Object.assign(document.createElement('script'), { src: url, crossOrigin: 'anonymous' });
    el.onload = res; el.onerror = () => { delete scriptsCharges[url]; rej(new Error('Chargement impossible : ' + url)); }; document.head.appendChild(el);
  });
  return scriptsCharges[url];
}
let editeurPret = null;
function chargerEditeur() {
  if (editeurPret) return editeurPret;
  editeurPret = (async () => {
    await Promise.all([chargerScript(CDN.quillCss, true), chargerScript(CDN.quill)]);
    await chargerScript(CDN.cursors);
    const [Y, YQ, AW] = await Promise.all([import(CDN.yjs), import(CDN.yquill), import(CDN.aw)]);
    window.Quill.register('modules/cursors', window.QuillCursors);
    Object.assign(KP, { Y, QuillBinding: YQ.QuillBinding, Awareness: AW.Awareness, encodeAw: AW.encodeAwarenessUpdate, applyAw: AW.applyAwarenessUpdate, removeAw: AW.removeAwarenessStates });
  })().catch(e => { editeurPret = null; throw e; });
  return editeurPret;
}

/* ---- Liste des documents ---- */
function vueRedaction() {
  const main = $('#main'); main.className = '';
  if (state.redac.session) fermerDoc();
  const docs = state.docs.filter(d => !d.archived && passeFiltre('filtreDoc', d.project_id)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  main.innerHTML = `<div class="vue"><h1>Rédaction</h1><p class="sous">Documents rédigés à plusieurs, en même temps : chacun voit ce que les autres écrivent, chaque version est conservée. Importez un fichier Word pour le reprendre ici, exportez en Word quand c’est prêt.</p>
    <div class="actions" style="margin-bottom:1em"><button class="btn prim" id="r-nouveau">＋ Nouveau document</button><button class="btn" id="r-import">⬆ Importer un Word (.docx)</button><input type="file" id="r-file" accept=".docx" hidden></div>
    ${filtresProjet('filtreDoc')}
    <div class="g g2">${docs.length ? docs.map(carteDoc).join('') : '<div class="vide">Aucun document. Créez-en un ou importez un fichier Word.</div>'}</div></div>`;
  brancherFiltres('filtreDoc', vueRedaction);
  $('#r-nouveau').addEventListener('click', () => formDoc());
  $('#r-import').addEventListener('click', () => $('#r-file').click());
  $('#r-file').addEventListener('change', e => { const f = e.target.files[0]; if (f) importerWord(f); });
  $$('[data-doc-ouvrir]').forEach(b => b.addEventListener('click', () => ouvrirDoc(b.dataset.docOuvrir)));
  $$('[data-doc-suppr]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Supprimer ce document et tout son historique ?')) return;
    const { error } = await state.client.from('kp_docs').delete().eq('id', b.dataset.docSuppr);
    if (error) { toast('Suppression impossible'); return; }
    state.docs = state.docs.filter(d => d.id !== b.dataset.docSuppr); vueRedaction();
  }));
}
function carteDoc(d) {
  const m = membre(d.updated_by || d.created_by); const mien = d.created_by === state.moi.user_id || state.moi.is_admin;
  return `<div class="carte rdoc"><div class="ic">📝</div><div style="min-width:0"><h3 style="margin:0;font-size:1.1em">${esc(d.title)}</h3><small class="muted">${esc(d.category)} · ${esc(nomProjet(d.project_id))}<br>Modifié ${jourRelatif(d.updated_at).toLowerCase()} à ${hhmm(new Date(d.updated_at))} par ${esc(m.name)}</small></div>
    <div class="actions"><button class="btn sm prim" data-doc-ouvrir="${d.id}">Ouvrir</button>${mien ? `<button class="btn sm" data-doc-suppr="${d.id}" title="Supprimer">✕</button>` : ''}</div></div>`;
}
function formDoc() {
  const pid = state.filtreDoc === 'tous' ? 'kaporo1' : state.filtreDoc;
  modal(`<h3>Nouveau document</h3>
    <label class="champ"><span>Titre</span><input id="nd-titre" placeholder="Ex. Compte rendu de la visite du 10 octobre"></label>
    <div class="ligne2"><label class="champ"><span>Projet</span><select id="nd-projet">${optionsProjets(pid)}</select></label>
      <label class="champ"><span>Type</span><select id="nd-cat">${CATEGORIES_DOC.map(c => `<option>${c}</option>`).join('')}</select></label></div>
    <div class="actions"><button class="btn prim" id="nd-ok">Créer et ouvrir</button><button class="btn" onclick="fermerModal()">Annuler</button></div>`, mo => {
    $('#nd-titre', mo).focus();
    $('#nd-titre', mo).addEventListener('keydown', e => { if (e.key === 'Enter') $('#nd-ok', mo).click(); });
    $('#nd-ok', mo).addEventListener('click', async () => {
      const title = $('#nd-titre').value.trim(); if (!title) { toast('Donnez un titre'); return; }
      const d = await creerDoc({ title, project_id: $('#nd-projet').value || null, category: $('#nd-cat').value });
      if (d) { fermerModal(); ouvrirDoc(d.id); }
    });
  });
}
async function creerDoc(champs) {
  const { data, error } = await state.client.from('kp_docs').insert({ ...champs, created_by: state.moi.user_id, updated_by: state.moi.user_id }).select('id,project_id,title,category,created_by,created_at,updated_by,updated_at,archived').single();
  if (error) { toast('Création impossible : ' + esc(error.message)); return null; }
  if (!state.docs.find(d => d.id === data.id)) state.docs.unshift(data);
  return data;
}
async function importerWord(f) {
  toast('Conversion du fichier Word…', 8000);
  try {
    await chargerScript(CDN.mammoth);
    const r = await window.mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() });
    const pid = state.filtreDoc === 'tous' ? 'kaporo1' : state.filtreDoc;
    const d = await creerDoc({ title: f.name.replace(/\.docx$/i, ''), project_id: pid || null, category: 'Autre', content_html: r.value });
    if (d) { toast(`<b>Document importé.</b>${r.messages.length ? ' Certains éléments de mise en page n’ont pas été repris.' : ''}`); ouvrirDoc(d.id); }
  } catch (e) { console.error(e); toast('Import impossible : ' + esc(e.message || '')); }
}

/* ---- Éditeur ---- */
async function ouvrirDoc(id) {
  const main = $('#main'); main.className = '';
  main.innerHTML = '<div class="vide">Ouverture du document…</div>';
  state.vue = 'redaction'; renderNav();
  try {
    const [, { data: doc, error }, { data: versions }] = await Promise.all([chargerEditeur(),
      state.client.from('kp_docs').select('*').eq('id', id).single(),
      state.client.from('kp_doc_versions').select('id,num,label,author,created_at').eq('doc_id', id).order('num', { ascending: false })]);
    if (error || !doc) throw error || new Error('Document introuvable');
    const i = state.docs.findIndex(d => d.id === id); const meta = { ...doc }; delete meta.content_html; delete meta.ystate; if (i >= 0) state.docs[i] = meta; else state.docs.unshift(meta);
    state.redac.ouvert = id;
    rendreEditeur(doc, versions || []);
  } catch (e) { console.error(e); main.innerHTML = `<div class="vue"><div class="vide">Impossible d’ouvrir le document : ${esc(e.message || '')}<br><br><button class="btn" onclick="vueRedaction()">← Retour</button></div></div>`; }
}
function rendreEditeur(doc, versions) {
  const main = $('#main'); const r = state.redac;
  main.innerHTML = `<div class="redac">
    <div class="redac-tete">
      <button class="btn sm" id="r-retour" title="Retour à la liste">←</button>
      <input class="rtitre" id="r-titre" value="${esc(doc.title)}" placeholder="Titre du document">
      <select class="inline" id="r-projet">${optionsProjets(doc.project_id || '')}</select>
      <select class="inline" id="r-cat">${CATEGORIES_DOC.map(c => `<option ${c === doc.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <span class="presence" id="r-presence" title="Personnes sur ce document"></span>
      <span class="etat gris" id="r-etat">Chargé</span>
      <div class="actions"><button class="btn sm" id="r-version" title="Figer une version nommée">💾 Version</button><button class="btn sm" id="r-word" title="Télécharger en Word">⬇ Word</button><button class="btn sm ${r.aside ? 'prim' : ''}" id="r-hist">🕘 Historique</button></div>
    </div>
    <div class="redac-corps ${r.aside ? '' : 'sans-aside'}">
      <div class="redac-page"><div id="qeditor"></div></div>
      <aside class="redac-aside" id="r-aside"><h3>Historique <small id="r-nbv"></small></h3><p class="sm muted">Une version est enregistrée automatiquement toutes les dix minutes d’écriture, ou à la demande avec le bouton Version.</p><div id="r-versions"></div></aside>
    </div></div>`;
  const s = demarrerSessionDoc(doc, versions);
  $('#r-retour').addEventListener('click', () => go('redaction'));
  $('#r-hist').addEventListener('click', () => { r.aside = !r.aside; $('.redac-corps').classList.toggle('sans-aside', !r.aside); $('#r-hist').classList.toggle('prim', r.aside); });
  $('#r-titre').addEventListener('change', e => majMetaDoc(s, { title: e.target.value.trim() || doc.title }));
  $('#r-projet').addEventListener('change', e => majMetaDoc(s, { project_id: e.target.value || null }));
  $('#r-cat').addEventListener('change', e => majMetaDoc(s, { category: e.target.value }));
  $('#r-version').addEventListener('click', () => modal(`<h3>Figer une version</h3><label class="champ"><span>Nom de la version (facultatif)</span><input id="v-label" placeholder="Ex. Envoyée à la banque"></label><div class="actions"><button class="btn prim" id="v-ok">Enregistrer</button><button class="btn" onclick="fermerModal()">Annuler</button></div>`, mo => { $('#v-label', mo).focus(); $('#v-ok', mo).addEventListener('click', async () => { await creerVersion(s, $('#v-label').value.trim() || null); fermerModal(); toast('Version enregistrée'); }); }));
  $('#r-word').addEventListener('click', () => exporterWord(s.quill.getSemanticHTML(), $('#r-titre').value));
  rendreVersions(s);
}
function demarrerSessionDoc(doc, versions) {
  const Y = KP.Y; const ydoc = new Y.Doc();
  if (doc.ystate) Y.applyUpdate(ydoc, b64ToU8(doc.ystate), 'db');
  const ytext = ydoc.getText('quill');
  const awareness = new KP.Awareness(ydoc);
  awareness.setLocalStateField('user', { name: state.moi.name, color: state.moi.color });
  const quill = new window.Quill('#qeditor', { theme: 'snow', placeholder: 'Écrivez ici…', modules: { cursors: { transformOnTextChange: true }, history: { userOnly: true },
    toolbar: [[{ header: [1, 2, 3, false] }], ['bold', 'italic', 'underline', 'strike'], [{ color: [] }, { background: [] }], [{ list: 'ordered' }, { list: 'bullet' }], [{ indent: '-1' }, { indent: '+1' }], [{ align: [] }], ['blockquote', 'link', 'image'], ['clean']] } });
  const binding = new KP.QuillBinding(ytext, quill, awareness);
  const s = { id: doc.id, ydoc, ytext, awareness, quill, binding, versions, dirty: false, timer: null, derniereVersionAt: versions[0] ? new Date(versions[0].created_at).getTime() : 0, monId: ydoc.clientID, presence: [] };
  state.redac.session = s;
  if (!doc.ystate && doc.content_html) { quill.clipboard.dangerouslyPasteHTML(doc.content_html, 'user'); s.dirty = true; sauverDoc(s); }
  ydoc.on('update', (u, origin) => { if (origin !== 'remote' && origin !== 'db') { s.chan?.send({ type: 'broadcast', event: 'u', payload: { u: u8ToB64(u) } }); planifierSauvegarde(s); } });
  awareness.on('update', ({ added, updated, removed }, origin) => { if (origin === 'remote') return; const ids = added.concat(updated, removed); s.chan?.send({ type: 'broadcast', event: 'a', payload: { a: u8ToB64(KP.encodeAw(awareness, ids)) } }); });
  const chan = state.client.channel('kp-doc-' + doc.id, { config: { broadcast: { self: false }, presence: { key: String(s.monId) } } });
  s.chan = chan;
  chan.on('broadcast', { event: 'u' }, ({ payload }) => { try { Y.applyUpdate(ydoc, b64ToU8(payload.u), 'remote'); } catch (e) { console.error(e); } })
    .on('broadcast', { event: 'a' }, ({ payload }) => { try { KP.applyAw(awareness, b64ToU8(payload.a), 'remote'); } catch (e) { } })
    .on('broadcast', { event: 'sync-req' }, ({ payload }) => { chan.send({ type: 'broadcast', event: 'sync-res', payload: { to: payload.from, s: u8ToB64(Y.encodeStateAsUpdate(ydoc)) } }); if (awareness.getLocalState()) chan.send({ type: 'broadcast', event: 'a', payload: { a: u8ToB64(KP.encodeAw(awareness, [ydoc.clientID])) } }); })
    .on('broadcast', { event: 'sync-res' }, ({ payload }) => { if (payload.to === s.monId) { try { Y.applyUpdate(ydoc, b64ToU8(payload.s), 'remote'); } catch (e) { } } })
    .on('presence', { event: 'sync' }, () => { s.presence = Object.values(chan.presenceState()).flat(); rendrePresence(s); })
    .subscribe(st => {
      if (st === 'SUBSCRIBED') { chan.send({ type: 'broadcast', event: 'sync-req', payload: { from: s.monId } }); chan.track({ user_id: state.moi.user_id, name: state.moi.name, color: state.moi.color }); majEtatDoc('En direct'); }
      else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') majEtatDoc('Hors ligne : vos modifications seront enregistrées à la reconnexion', true);
    });
  return s;
}
function majEtatDoc(txt, err) { const e = $('#r-etat'); if (!e) return; e.textContent = txt; e.className = 'etat ' + (err ? 'rouge' : txt === 'Enregistré' || txt === 'En direct' ? '' : 'ambre'); }
function planifierSauvegarde(s) { s.dirty = true; majEtatDoc('Modifications…'); clearTimeout(s.timer); s.timer = setTimeout(() => sauverDoc(s), 2000); }
async function sauverDoc(s) {
  if (!s.dirty) return; s.dirty = false;
  const html = s.quill.getSemanticHTML(); const ystate = u8ToB64(KP.Y.encodeStateAsUpdate(s.ydoc));
  const { error } = await state.client.from('kp_docs').update({ content_html: html, ystate, updated_by: state.moi.user_id, updated_at: new Date().toISOString() }).eq('id', s.id);
  if (error) { s.dirty = true; majEtatDoc('Non enregistré, nouvel essai…', true); clearTimeout(s.timer); s.timer = setTimeout(() => sauverDoc(s), 8000); return; }
  if (!s.dirty) majEtatDoc('Enregistré');
  const d = state.docs.find(x => x.id === s.id); if (d) { d.updated_at = new Date().toISOString(); d.updated_by = state.moi.user_id; }
  if (Date.now() - s.derniereVersionAt > 10 * 60000) await creerVersion(s, null, html, ystate);
}
async function majMetaDoc(s, patch) {
  const { error } = await state.client.from('kp_docs').update({ ...patch, updated_by: state.moi.user_id }).eq('id', s.id);
  if (error) { toast('Modification impossible'); return; }
  const d = state.docs.find(x => x.id === s.id); if (d) Object.assign(d, patch); toast('Enregistré', 1000);
}
function docModifieAilleurs(row) {
  const i = state.docs.findIndex(d => d.id === row.id); const meta = { ...row }; delete meta.content_html; delete meta.ystate;
  if (i >= 0) state.docs[i] = meta; else state.docs.unshift(meta);
  const s = state.redac.session; if (!s || s.id !== row.id) return;
  const t = $('#r-titre'); if (t && document.activeElement !== t && t.value !== row.title) t.value = row.title;
  const p = $('#r-projet'); if (p && p.value !== (row.project_id || '')) p.value = row.project_id || '';
  const c = $('#r-cat'); if (c && c.value !== row.category) c.value = row.category;
}
function versionRecue(v) { const s = state.redac.session; if (!s || v.doc_id !== s.id || s.versions.find(x => x.id === v.id)) return; s.versions.unshift({ id: v.id, num: v.num, label: v.label, author: v.author, created_at: v.created_at }); s.versions.sort((a, b) => b.num - a.num); rendreVersions(s); }
async function creerVersion(s, label, html, ystate) {
  html = html || s.quill.getSemanticHTML(); ystate = ystate || u8ToB64(KP.Y.encodeStateAsUpdate(s.ydoc));
  const num = (s.versions[0]?.num || 0) + 1;
  const { data, error } = await state.client.from('kp_doc_versions').insert({ doc_id: s.id, num, label, content_html: html, ystate, author: state.moi.user_id }).select('id,num,label,author,created_at').single();
  if (error) { toast('Version non enregistrée'); return; }
  s.derniereVersionAt = Date.now(); if (!s.versions.find(v => v.id === data.id)) s.versions.unshift(data); rendreVersions(s);
}
function rendreVersions(s) {
  const el = $('#r-versions'); if (!el) return; $('#r-nbv').textContent = s.versions.length || '';
  el.innerHTML = s.versions.length ? s.versions.map(v => `<div class="ligne vers" data-v="${v.id}" style="cursor:pointer"><div><b class="sm">v${v.num}${v.label ? ' · ' + esc(v.label) : ''}</b><small>${dateFr(v.created_at)} ${hhmm(new Date(v.created_at))} · ${esc(membre(v.author).name)}</small></div><span class="muted">›</span></div>`).join('') : '<div class="vide">Aucune version figée pour l’instant.</div>';
  $$('.vers', el).forEach(x => x.addEventListener('click', () => apercuVersion(s, s.versions.find(v => v.id === x.dataset.v))));
}
function rendrePresence(s) {
  const el = $('#r-presence'); if (!el) return;
  const vus = {}; s.presence.forEach(p => { vus[p.user_id] = p; });
  el.innerHTML = Object.values(vus).map(p => `<span class="avatar xs" style="background:${p.color}" title="${esc(p.name)}">${initiales(p.name)}</span>`).join('') + (Object.keys(vus).length > 1 ? `<small class="muted">${Object.keys(vus).length} en ligne</small>` : '');
}
async function apercuVersion(s, v) {
  if (!v) return;
  const { data, error } = await state.client.from('kp_doc_versions').select('content_html').eq('id', v.id).single();
  if (error) { toast('Version indisponible'); return; }
  modal(`<h3>Version ${v.num}${v.label ? ' · ' + esc(v.label) : ''} <small style="font-family:var(--sans);font-size:.7em;color:var(--pierre)">${dateFr(v.created_at)} ${hhmm(new Date(v.created_at))} · ${esc(membre(v.author).name)}</small></h3>
    <div class="ql-snow apercu"><div class="ql-editor">${data.content_html}</div></div>
    <div class="actions" style="margin-top:.8em"><button class="btn prim" id="v-rest">Restaurer cette version</button><button class="btn" id="v-word">⬇ Word</button><button class="btn" onclick="fermerModal()">Fermer</button></div>`, mo => {
    $('.boite', mo).classList.add('large');
    $('#v-word', mo).addEventListener('click', () => exporterWord(data.content_html, `${$('#r-titre').value} v${v.num}`));
    $('#v-rest', mo).addEventListener('click', async () => {
      if (!confirm(`Remplacer le texte actuel par la version ${v.num} ? Le texte actuel est d’abord figé en version.`)) return;
      await creerVersion(s, 'Avant restauration de la v' + v.num);
      s.quill.setContents([], 'user'); s.quill.clipboard.dangerouslyPasteHTML(0, data.content_html, 'user');
      fermerModal(); toast(`Version ${v.num} restaurée`);
    });
  });
}
async function exporterWord(html, titre) {
  try {
    await chargerScript(CDN.docx);
    const blob = window.htmlDocx.asBlob(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(titre)}</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt}</style></head><body>${html}</body></html>`, { orientation: 'portrait' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (titre || 'document').replace(/[\\/:*?"<>|]+/g, '-') + '.docx'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) { console.error(e); toast('Export impossible : ' + esc(e.message || '')); }
}
async function fermerDoc() {
  const s = state.redac.session; if (!s) return;
  state.redac.session = null; state.redac.ouvert = null;
  clearTimeout(s.timer);
  try { if (s.dirty) { s.dirty = true; const html = s.quill.getSemanticHTML(); const ystate = u8ToB64(KP.Y.encodeStateAsUpdate(s.ydoc)); await state.client.from('kp_docs').update({ content_html: html, ystate, updated_by: state.moi.user_id, updated_at: new Date().toISOString() }).eq('id', s.id); } } catch (e) { }
  try { KP.removeAw(s.awareness, [s.ydoc.clientID], 'app'); } catch (e) { }
  try { s.binding.destroy(); } catch (e) { }
  try { await s.chan.untrack(); state.client.removeChannel(s.chan); } catch (e) { }
  try { s.ydoc.destroy(); } catch (e) { }
}
window.addEventListener('pagehide', () => { const s = state.redac.session; if (s?.dirty) { s.dirty = false; sauverDoc(Object.assign(s, { dirty: true })); } });
