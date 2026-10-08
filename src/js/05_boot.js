/* ============================================================
   Navigation, chargement des données, temps réel, démarrage
   ============================================================ */
const VUES = [
  ['discussions', '💬', 'Discussions', vueDiscussions], ['projets', '🏗️', 'Projets', vueProjets], ['documents', '📁', 'Documents', vueDocuments],
  ['decisions', '✅', 'Décisions', vueDecisions], ['taches', '☑️', 'Tâches', vueTaches], ['equipe', '👥', 'Équipe', vueEquipe],
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
  const [me, mb, pr, ch, ms, rd, dc, de, ph, ta] = await Promise.all([
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
  ]);
  const err = [me, mb, pr, ch, ms, rd, dc, de, ph, ta].find(r => r.error); if (err) throw err.error;
  if (!me.data) throw new Error('PROFIL_ABSENT');
  state.moi = me.data; state.membres = mb.data; state.projets = pr.data; state.canaux = ch.data; state.messages = ms.data;
  state.lectures = Object.fromEntries((rd.data || []).map(r => [r.channel_id, r.last_read]));
  state.documents = dc.data; state.decisions = de.data; state.phases = ph.data; state.taches = ta.data;
}
function brancherTempsReel() {
  const c = state.client;
  const maj = (table, cle, tri) => async payload => {
    const row = payload.new?.id ? payload.new : null;
    if (payload.eventType === 'DELETE') { state[cle] = state[cle].filter(x => x.id !== payload.old.id); }
    else if (row) { const i = state[cle].findIndex(x => x.id === row.id); if (i >= 0) state[cle][i] = row; else state[cle].push(row); if (tri) state[cle].sort(tri); }
    if (!document.activeElement?.matches('input,select,textarea') && state.vue !== 'discussions') go(state.vue); else renderNav();
  };
  c.channel('kaporo-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kp_messages' }, p => { if (p.new?.id) messageRecu(p.new); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kp_tasks' }, maj('kp_tasks', 'taches'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kp_decisions' }, maj('kp_decisions', 'decisions', (a, b) => b.decided_on.localeCompare(a.decided_on)))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kp_documents' }, maj('kp_documents', 'documents', (a, b) => b.created_at.localeCompare(a.created_at)))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kp_phases' }, maj('kp_phases', 'phases', (a, b) => a.num - b.num))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kp_dev_requests' }, async p => {
      if (!state.moi?.is_admin) return; await chargerDev();
      if (p.new && ['question', 'livrée', 'erreur'].includes(p.new.status) && p.old?.status !== p.new.status) toast(`<b>Claude · ${esc(p.new.title)}</b><br>${p.new.status === 'livrée' ? 'Livrée : rechargez l’application pour voir le résultat.' : p.new.status === 'question' ? 'Claude a une question.' : 'Erreur pendant la réalisation.'}`, 6000);
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
