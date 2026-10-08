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
