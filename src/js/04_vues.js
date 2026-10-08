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
}
function carteProjet(p) {
  const phases = state.phases.filter(x => x.project_id === p.id).sort((a, b) => a.num - b.num);
  const faites = phases.filter(x => x.status === 'terminée').length;
  const docs = state.documents.filter(d => d.project_id === p.id).length;
  const taches = state.taches.filter(t => t.project_id === p.id && t.status !== 'fait').length;
  return `<div class="carte"><h3>${esc(p.name)} <span class="etat ${classeStatut(p.status)}">${esc(p.status)}</span></h3>
    <p class="muted sm" style="margin-bottom:.6em">${esc(p.subtitle || '')}${p.surface_m2 ? ` · <b class="num">${p.surface_m2.toLocaleString('fr-FR')} m²</b>` : ''}</p>
    <p class="sm" style="margin-bottom:.6em">${phases.length ? `${faites}/${phases.length} phases terminées` : 'Aucune phase définie'} · ${docs} document${docs > 1 ? 's' : ''} · ${taches} tâche${taches > 1 ? 's' : ''} ouverte${taches > 1 ? 's' : ''}</p>
    ${phases.length ? phases.map(ph => `<div class="phase ${ph.status === 'en cours' ? 'encours' : ph.status === 'terminée' ? 'fait' : ''}"><span class="n">${ph.num}</span>
        <div><b>${esc(ph.title)}</b><small>${ph.start_on ? dateFr(ph.start_on) : '—'} → ${ph.end_on ? dateFr(ph.end_on) : 'en continu'}</small><small>${esc(ph.deliverable || '')}</small></div>
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

/* ---- Tâches ---- */
function vueTaches() {
  const main = $('#main'); main.className = '';
  const auj = new Date().toISOString().slice(0, 10);
  let ts = state.taches.filter(t => passeFiltre('filtreProjet', t.project_id));
  if (state.filtreTache === 'ouvertes') ts = ts.filter(t => t.status !== 'fait');
  ts.sort((a, b) => (a.status === 'fait') - (b.status === 'fait') || (a.due_on || '9') .localeCompare(b.due_on || '9'));
  main.innerHTML = `<div class="vue"><h1>Tâches</h1><p class="sous">Qui fait quoi, pour quand. Cochez une tâche terminée ; les retards apparaissent en rouge.</p>
    <div class="actions" style="margin-bottom:1em"><button class="btn prim" id="t-ajout">＋ Nouvelle tâche</button>
      <button class="btn ${state.filtreTache === 'ouvertes' ? 'prim' : ''}" id="t-ouv">Ouvertes</button><button class="btn ${state.filtreTache === 'toutes' ? 'prim' : ''}" id="t-tout">Toutes</button></div>
    ${filtresProjet('filtreProjet')}
    <div class="carte">${ts.length ? ts.map(t => `<div class="tache ${t.status === 'fait' ? 'fait' : ''} ${t.status !== 'fait' && t.due_on && t.due_on < auj ? 'retard' : ''}"><input type="checkbox" data-t="${t.id}" ${t.status === 'fait' ? 'checked' : ''}>
        <div><b>${esc(t.title)}</b><small>${t.assignee ? esc(membre(t.assignee).name) : 'Non attribuée'} · ${esc(nomProjet(t.project_id))}${t.due_on ? ' · pour le ' + dateFr(t.due_on) : ''}</small></div>
        ${t.created_by === state.moi.user_id || state.moi.is_admin || !t.created_by ? `<button class="btn sm" data-suppr="${t.id}">✕</button>` : '<span></span>'}</div>`).join('') : '<div class="vide">Aucune tâche.</div>'}</div></div>`;
  brancherFiltres('filtreProjet', vueTaches);
  $('#t-ouv').addEventListener('click', () => { state.filtreTache = 'ouvertes'; vueTaches(); });
  $('#t-tout').addEventListener('click', () => { state.filtreTache = 'toutes'; vueTaches(); });
  $$('input[data-t]').forEach(c => c.addEventListener('change', async () => {
    const t = state.taches.find(x => x.id === c.dataset.t); const fait = c.checked;
    const { error } = await state.client.from('kp_tasks').update({ status: fait ? 'fait' : 'à faire', done_at: fait ? new Date().toISOString() : null }).eq('id', t.id);
    if (error) { toast('Modification impossible'); c.checked = !fait; return; }
    t.status = fait ? 'fait' : 'à faire'; vueTaches();
  }));
  $$('[data-suppr]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Supprimer cette tâche ?')) return;
    const { error } = await state.client.from('kp_tasks').delete().eq('id', b.dataset.suppr);
    if (error) { toast('Suppression impossible'); return; }
    state.taches = state.taches.filter(t => t.id !== b.dataset.suppr); vueTaches();
  }));
  $('#t-ajout').addEventListener('click', () => modal(`<h3>Nouvelle tâche</h3>
    <label class="champ"><span>Tâche</span><input id="t-titre" placeholder="Ex. Demander le certificat de non-litige"></label>
    <label class="champ"><span>Projet</span><select id="t-projet">${optionsProjets(state.filtreProjet === 'tous' ? 'kaporo1' : state.filtreProjet)}</select></label>
    <label class="champ"><span>Responsable</span><select id="t-qui"><option value="">Non attribuée</option>${state.membres.map(m => `<option value="${m.user_id}">${esc(m.name)}</option>`).join('')}</select></label>
    <label class="champ"><span>Échéance</span><input id="t-date" type="date"></label>
    <div class="actions"><button class="btn prim" id="t-ok">Créer</button><button class="btn" onclick="fermerModal()">Annuler</button></div>`, mo => {
    $('#t-ok', mo).addEventListener('click', async () => {
      const title = $('#t-titre').value.trim(); if (!title) return;
      const { data, error } = await state.client.from('kp_tasks').insert({ title, project_id: $('#t-projet').value || null, assignee: $('#t-qui').value || null, due_on: $('#t-date').value || null, created_by: state.moi.user_id }).select().single();
      if (error) { toast('Création impossible'); return; }
      if (!state.taches.find(t => t.id === data.id)) state.taches.push(data); fermerModal(); vueTaches(); toast('Tâche créée');
    });
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

/* ---- Développement (administrateur) : demandes transmises à l'agent Claude ---- */
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
  main.innerHTML = `<div class="vue"><h1>Développement</h1><p class="sous">Décrivez une modification ou un ajustement de l’application. La demande part automatiquement vers l’agent Claude, qui la réalise, publie la nouvelle version et vous répond ici. Comptez quelques minutes.</p>
    <div class="g g2">
      <div class="carte accent"><h3>Nouvelle demande</h3>
        <label class="champ"><span>En une ligne</span><input id="dv-titre" placeholder="Ex. Ajouter un filtre par membre dans Tâches"></label>
        <label class="champ"><span>Détail (ce que vous voulez voir, où, pourquoi)</span><textarea id="dv-detail" rows="5" placeholder="Plus c’est précis, plus le résultat sera juste du premier coup."></textarea></label>
        <label class="champ"><span>Capture d’écran (facultatif)</span><input type="file" id="dv-file" accept="image/*"></label>
        <button class="btn prim" id="dv-ok">Envoyer à Claude</button>
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
  const fil = (d.thread || []).map(t => `<div class="evt ${t.who === 'claude' ? 'bleu' : ''}" style="grid-template-columns:auto 1fr"><span class="s">${t.who === 'claude' ? 'Claude' : 'Vous'}</span><span style="white-space:pre-wrap">${esc(t.text)}<small class="d">${dateFr(t.at)} ${hhmm(new Date(t.at))}</small></span></div>`).join('');
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
    const thread = [{ who: 'paul', text: detail || title, at: new Date().toISOString() }];
    const { error } = await state.client.from('kp_dev_requests').insert({ title, detail: detail || null, attachment, thread, created_by: state.moi.user_id });
    if (error) throw error;
    await chargerDev(); vueDev(); toast('<b>Demande transmise à Claude.</b> Vous serez prévenu ici.');
  } catch (e) { console.error(e); toast('Envoi impossible : ' + esc(e.message || '')); btn.disabled = false; }
}
function repondreDev(id) {
  const d = state.dev.find(x => x.id === id); if (!d) return;
  modal(`<h3>${d.status === 'question' ? 'Répondre à Claude' : 'Demander un ajustement'}</h3>
    <p class="sm muted" style="margin-bottom:.6em">${esc(d.title)}</p>
    <label class="champ"><span>Votre message</span><textarea id="dv-msg" rows="5"></textarea></label>
    <div class="actions"><button class="btn prim" id="dv-msg-ok">Envoyer</button><button class="btn" onclick="fermerModal()">Annuler</button></div>`, mo => {
    $('#dv-msg-ok', mo).addEventListener('click', async () => {
      const text = $('#dv-msg').value.trim(); if (!text) return;
      const thread = (d.thread || []).concat([{ who: 'paul', text, at: new Date().toISOString() }]);
      const { error } = await state.client.from('kp_dev_requests').update({ thread, status: 'envoyée' }).eq('id', id);
      if (error) { toast('Envoi impossible'); return; }
      fermerModal(); await chargerDev(); vueDev(); toast('Message transmis à Claude');
    });
  });
}

/* Réglages du module Développement : secret partagé et URL du déclencheur (saisis par l'administrateur, jamais relus) */
async function carteReglagesDev() {
  let etat = {};
  try { const { data } = await state.client.rpc('kp_dev_settings_state'); etat = data || {}; } catch (e) { }
  const ok = k => etat[k] ? '<span class="etat">renseigné</span>' : '<span class="etat rouge">manquant</span>';
  return `<div class="carte" style="margin-top:1em"><h3>Liaison avec l’agent Claude</h3>
    <p class="sm muted" style="margin-bottom:.8em">Deux valeurs relient ce module à la routine Claude sur claude.ai. Elles sont stockées côté serveur et ne sont jamais réaffichées. Laissez un champ vide pour ne pas le modifier.</p>
    <label class="champ"><span>Secret partagé ${ok('dev_secret')}</span><input id="dvs-secret" type="password" autocomplete="off" placeholder="Phrase longue, identique dans la routine claude.ai"></label>
    <label class="champ"><span>URL du déclencheur ${ok('dev_webhook_url')}</span><input id="dvs-url" type="password" autocomplete="off" placeholder="https://… (fournie par la routine claude.ai)"></label>
    <button class="btn sm" id="dvs-ok">Enregistrer</button></div>`;
}
async function enregistrerReglagesDev() {
  const s = $('#dvs-secret').value; const u = $('#dvs-url').value.trim();
  try {
    if (s) { const { error } = await state.client.rpc('kp_dev_set_setting', { k: 'dev_secret', v: s }); if (error) throw error; }
    if (u) { const { error } = await state.client.rpc('kp_dev_set_setting', { k: 'dev_webhook_url', v: u }); if (error) throw error; }
    toast('Réglages enregistrés'); vueDev();
  } catch (e) { toast('Enregistrement impossible : ' + esc(e.message || '')); }
}
