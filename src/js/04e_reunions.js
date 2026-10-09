/* ============================================================
   Réunions : cadrage, séance en direct (contributions de tous), compte rendu, envoi, archive
   ============================================================ */
const KINDS_R = { 'présentiel': ['🏛️', 'Présentiel'], 'visio': ['💻', 'Visio'], 'hybride': ['🔀', 'Hybride'] };
const STATUTS_R = { 'planifiée': ['bleu', 'Planifiée'], 'en cours': ['ambre', 'En cours'], 'terminée': ['', 'Terminée'], 'annulée': ['gris', 'Annulée'] };
const KINDS_N = { note: ['📝', 'Note', 'gris'], 'idée': ['💡', 'Idée', 'ambre'], 'décision': ['✅', 'Décision', ''], action: ['🎯', 'Action', 'bleu'], question: ['❓', 'Question', 'rouge'] };
state.reunions = []; state.reunion = { ouverte: null, notes: [], chan: null, presence: [], filtre: 'avenir', kind: 'note', filtreFil: '', timer: null };
const heureFr = d => hhmm(new Date(d));
const dateHeureFr = d => dateFr(d, { jour: true }) + ' à ' + heureFr(d);
const finPrevue = m => new Date(new Date(m.starts_at).getTime() + (m.duration_min || 60) * 60000);
const reunionDe = id => state.reunions.find(m => m.id === id);
const nomM = id => id ? membre(id).name : '—';

/* ---- Liste ---- */
function vueReunions() {
  const main = $('#main'); main.className = ''; if (state.reunion.ouverte) fermerReunion();
  const r = state.reunion; const now = Date.now();
  const all = state.reunions.filter(m => passeFiltre('filtreProjet', m.project_id));
  const avenir = all.filter(m => m.status === 'en cours' || (m.status === 'planifiée' && finPrevue(m).getTime() >= now - 6 * 3600000)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const archive = all.filter(m => !avenir.includes(m)).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const liste = r.filtre === 'avenir' ? avenir : archive;
  main.innerHTML = `<div class="vue"><div class="suivi-tete"><div><h1>Réunions</h1><p class="sous">Cadrez la réunion, tenez-la en direct (chacun note idées, décisions et actions au fil de la séance), puis obtenez le compte rendu à envoyer dès la fin. Tout reste archivé.</p></div>
      <div class="actions"><button class="btn prim" id="m-nouvelle">＋ Planifier une réunion</button></div></div>
    <div class="onglets"><button class="${r.filtre === 'avenir' ? 'on' : ''}" data-f="avenir">À venir et en cours <small>${avenir.length}</small></button><button class="${r.filtre === 'archive' ? 'on' : ''}" data-f="archive">Archive <small>${archive.length}</small></button></div>
    ${filtresProjet('filtreProjet')}
    <div class="g g2">${liste.length ? liste.map(carteReunion).join('') : `<div class="vide">${r.filtre === 'avenir' ? 'Aucune réunion à venir. Planifiez-en une.' : 'Aucune réunion archivée.'}</div>`}</div></div>`;
  brancherFiltres('filtreProjet', vueReunions);
  $$('.onglets button').forEach(b => b.addEventListener('click', () => { r.filtre = b.dataset.f; vueReunions(); }));
  $('#m-nouvelle').addEventListener('click', () => formReunion());
  $$('[data-reunion]').forEach(c => c.addEventListener('click', () => ouvrirReunion(c.dataset.reunion)));
}
function carteReunion(m) {
  const [ic, kl] = KINDS_R[m.kind] || KINDS_R['présentiel']; const [sc, sl] = STATUTS_R[m.status] || ['gris', m.status]; const d = new Date(m.starts_at);
  return `<div class="carte rcard" data-reunion="${m.id}"><div class="rdate"><b>${d.getDate()}</b><small>${MOIS[d.getMonth()]}</small></div>
    <div style="min-width:0"><h3 style="margin:0;font-size:1.1em">${esc(m.title)}</h3><small class="muted">${ic} ${kl} · ${heureFr(m.starts_at)} · ${m.duration_min} min · ${esc(nomProjet(m.project_id))}${m.location ? ' · ' + esc(m.location) : ''}</small>
      <div class="presence" style="margin-top:.45em">${(m.participants || []).slice(0, 7).map(id => avatarDe(id)).join('')}${(m.participants || []).length > 7 ? `<small>+${m.participants.length - 7}</small>` : ''}${m.minutes_html ? ' <span class="etat" style="margin-left:.6em">compte rendu</span>' : ''}</div></div>
    <span class="etat ${sc}">${sl}</span></div>`;
}

/* ---- Cadrage ---- */
function formReunion(id) {
  const m = id ? reunionDe(id) : null;
  const d = m ? new Date(m.starts_at) : (() => { const x = new Date(); x.setDate(x.getDate() + 1); x.setHours(10, 0, 0, 0); return x; })();
  const pid = m ? (m.project_id || '') : (state.filtreProjet === 'tous' ? 'kaporo1' : state.filtreProjet);
  const parts = m ? (m.participants || []) : state.membres.map(x => x.user_id);
  modal(`<h3>${m ? 'Modifier la réunion' : 'Planifier une réunion'}</h3>
    <label class="champ"><span>Objet</span><input id="mr-titre" value="${esc(m?.title || '')}" placeholder="Ex. Point hebdomadaire Kaporo 1"></label>
    <div class="ligne2"><label class="champ"><span>Projet</span><select id="mr-projet">${optionsProjets(pid)}</select></label>
      <label class="champ"><span>Format</span><select id="mr-kind">${Object.entries(KINDS_R).map(([k, [ic, l]]) => `<option value="${k}" ${(m?.kind || 'présentiel') === k ? 'selected' : ''}>${ic} ${l}</option>`).join('')}</select></label></div>
    <div class="ligne4"><label class="champ" style="grid-column:span 2"><span>Date</span><input id="mr-date" type="date" value="${ISO(d)}"></label>
      <label class="champ"><span>Heure</span><input id="mr-heure" type="time" value="${pad(d.getHours())}:${pad(d.getMinutes())}"></label>
      <label class="champ"><span>Durée (min)</span><input id="mr-duree" type="number" min="10" step="5" value="${m?.duration_min || 60}"></label></div>
    <div class="ligne2"><label class="champ"><span>Lieu</span><input id="mr-lieu" value="${esc(m?.location || '')}" placeholder="Ex. Bureau T-Architectes, Kipé"></label>
      <label class="champ"><span>Lien visio</span><input id="mr-lien" value="${esc(m?.link || '')}" placeholder="https://meet.google.com/…"></label></div>
    <label class="champ"><span>Objectifs (ce que la réunion doit produire)</span><textarea id="mr-obj" rows="2">${esc(m?.objectives || '')}</textarea></label>
    <label class="champ"><span>Ordre du jour (un point par ligne)</span><textarea id="mr-odj" rows="4" placeholder="1. Retour sur la visite du terrain\n2. Lettre de mission\n3. Calendrier des études">${esc((m?.agenda || []).map(a => a.text).join('\n'))}</textarea></label>
    <div class="champ"><span>Participants</span><div class="coches">${state.membres.map(x => `<label class="coche"><input type="checkbox" data-part="${x.user_id}" ${parts.includes(x.user_id) ? 'checked' : ''}><span>${esc(x.name)} <small class="muted">· ${esc(x.role)}</small></span></label>`).join('')}</div></div>
    <label class="champ"><span>Invités extérieurs (facultatif)</span><input id="mr-ext" value="${esc(m?.externals || '')}" placeholder="Ex. Me Diallo (notaire), M. Sylla"></label>
    <div class="actions"><button class="btn prim" id="mr-ok">${m ? 'Enregistrer' : 'Planifier'}</button>${m && m.status !== 'annulée' ? '<button class="btn" id="mr-annuler">Annuler la réunion</button>' : ''}<button class="btn" onclick="fermerModal()">Fermer</button></div>`, mo => {
    $('#mr-titre', mo).focus();
    $('#mr-ok', mo).addEventListener('click', async () => {
      const title = $('#mr-titre').value.trim(); if (!title) { toast('Donnez un objet à la réunion'); return; }
      const starts = new Date($('#mr-date').value + 'T' + ($('#mr-heure').value || '10:00') + ':00'); if (isNaN(starts)) { toast('Date invalide'); return; }
      const anciens = m?.agenda || [];
      const row = { title, project_id: $('#mr-projet').value || null, kind: $('#mr-kind').value, starts_at: starts.toISOString(), duration_min: +$('#mr-duree').value || 60, location: $('#mr-lieu').value.trim() || null, link: $('#mr-lien').value.trim() || null, objectives: $('#mr-obj').value.trim() || null,
        agenda: $('#mr-odj').value.split('\n').map(x => x.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean).map(text => ({ text, done: !!anciens.find(a => a.text === text && a.done) })),
        participants: $$('[data-part]:checked', mo).map(c => c.dataset.part), externals: $('#mr-ext').value.trim() || null };
      if (m) { const { error } = await state.client.from('kp_meetings').update(row).eq('id', m.id); if (error) { toast('Enregistrement impossible : ' + esc(error.message)); return; } Object.assign(m, row); fermerModal(); toast('Réunion mise à jour'); if (state.reunion.ouverte === m.id) rendreReunion(); else vueReunions(); }
      else { const { data, error } = await state.client.from('kp_meetings').insert({ ...row, created_by: state.moi.user_id }).select().single(); if (error) { toast('Création impossible : ' + esc(error.message)); return; } if (!reunionDe(data.id)) state.reunions.push(data); fermerModal(); toast('Réunion planifiée'); await annoncerReunion(data, 'planifiée'); ouvrirReunion(data.id); }
    });
    $('#mr-annuler', mo)?.addEventListener('click', async () => { if (!confirm('Annuler cette réunion ?')) return; await majReunion(m, { status: 'annulée' }); fermerModal(); state.reunion.ouverte === m.id ? rendreReunion() : vueReunions(); });
  });
}
async function majReunion(m, patch) {
  const avant = { ...m }; Object.assign(m, patch);
  const { error } = await state.client.from('kp_meetings').update(patch).eq('id', m.id);
  if (error) { Object.assign(m, avant); toast('Modification impossible : ' + esc(error.message)); return false; }
  return true;
}

/* ---- Séance ---- */
async function ouvrirReunion(id) {
  const m = reunionDe(id); if (!m) return;
  if (state.reunion.ouverte && state.reunion.ouverte !== id) fermerReunion();
  state.vue = 'reunions'; renderNav();
  const r = state.reunion; r.ouverte = id; r.filtreFil = '';
  const { data } = await state.client.from('kp_meeting_notes').select('*').eq('meeting_id', id).order('created_at'); r.notes = data || [];
  if (!r.chan) {
    const chan = state.client.channel('kp-reunion-' + id, { config: { presence: { key: state.moi.user_id } } });
    r.chan = chan;
    chan.on('presence', { event: 'sync' }, () => { r.presence = Object.keys(chan.presenceState()); rendrePresenceReunion(); })
      .subscribe(st => { if (st === 'SUBSCRIBED') chan.track({ name: state.moi.name, at: Date.now() }); });
  }
  clearInterval(r.timer); r.timer = setInterval(() => { const e = $('#m-chrono'); const mm = reunionDe(id); if (e && mm?.status === 'en cours' && mm.started_at) e.textContent = chrono(mm); }, 15000);
  rendreReunion();
}
function fermerReunion() {
  const r = state.reunion; if (!r.ouverte) return;
  clearInterval(r.timer); r.timer = null;
  try { if (r.chan) { r.chan.untrack(); state.client.removeChannel(r.chan); } } catch (e) { }
  r.chan = null; r.ouverte = null; r.notes = []; r.presence = [];
}
const chrono = m => { const mn = Math.max(0, Math.round((Date.now() - new Date(m.started_at)) / 60000)); return `⏱ ${mn} min${mn > m.duration_min ? ' · dépassement' : ''}`; };
function rendreReunion() {
  const main = $('#main'); main.className = ''; const r = state.reunion; const m = reunionDe(r.ouverte); if (!m) { vueReunions(); return; }
  const [ic, kl] = KINDS_R[m.kind] || KINDS_R['présentiel']; const [sc, sl] = STATUTS_R[m.status] || ['gris', m.status];
  const peutEditer = m.created_by === state.moi.user_id || state.moi.is_admin;
  const n = r.notes; const nb = k => n.filter(x => x.kind === k).length;
  main.innerHTML = `<div class="vue">
    <div class="suivi-tete"><div style="min-width:0"><div class="actions" style="margin-bottom:.3em"><button class="btn sm" id="m-retour">← Réunions</button><span class="etat ${sc}">${sl}</span>${m.status === 'en cours' && m.started_at ? `<span class="etat ambre" id="m-chrono">${chrono(m)}</span>` : ''}</div>
        <h1 style="font-size:1.5em">${esc(m.title)}</h1><p class="sous" style="margin-bottom:.3em">📅 ${dateHeureFr(m.starts_at)} · ${m.duration_min} min · ${ic} ${kl} · ${esc(nomProjet(m.project_id))}${m.location ? ' · 📍 ' + esc(m.location) : ''}</p></div>
      <div class="actions">${m.link && m.status !== 'terminée' && m.status !== 'annulée' ? `<a class="btn or" href="${esc(m.link)}" target="_blank" rel="noopener">💻 Rejoindre la visio</a>` : ''}
        ${m.status === 'planifiée' ? '<button class="btn prim" id="m-demarrer">▶ Démarrer la réunion</button>' : ''}
        ${m.status === 'planifiée' || m.status === 'en cours' ? '<button class="btn" id="m-ics" title="Fichier calendrier (Google Agenda, Outlook, iPhone)">📅 Agenda</button><button class="btn" id="m-inviter" title="Ouvre votre messagerie avec les participants et les détails">✉️ Inviter</button>' : ''}
        ${m.status === 'en cours' ? '<button class="btn prim" id="m-cloturer">■ Clôturer et rédiger le compte rendu</button>' : ''}
        ${m.status === 'terminée' ? '<button class="btn" id="m-rouvrir" title="Reprendre la séance">↺ Rouvrir</button>' : ''}
        <button class="btn" id="m-modifier">✎ Modifier</button>${peutEditer ? '<button class="btn" id="m-suppr" title="Supprimer">✕</button>' : ''}</div></div>
    <div class="g g2">
      <div class="carte"><h3>Cadrage</h3>
        ${m.objectives ? `<p class="sm" style="white-space:pre-wrap;margin-bottom:.8em"><b>Objectifs.</b> ${esc(m.objectives)}</p>` : ''}
        <p class="sm muted" style="margin-bottom:.3em">Ordre du jour${m.status !== 'planifiée' ? ' · cochez les points traités' : ''}</p>
        ${(m.agenda || []).length ? m.agenda.map((a, i) => `<label class="cl-item ${a.done ? 'fait' : ''}"><input type="checkbox" data-odj="${i}" ${a.done ? 'checked' : ''} ${m.status === 'planifiée' || m.status === 'annulée' ? 'disabled' : ''}><span><b class="muted">${i + 1}.</b> ${esc(a.text)}</span></label>`).join('') : '<div class="vide" style="padding:.6em">Aucun point. Modifiez la réunion pour en ajouter.</div>'}
        <p class="sm muted" style="margin:1em 0 .3em">Participants <small id="m-nbpres"></small></p>
        <div id="m-participants"></div>
        ${m.externals ? `<p class="sm muted" style="margin-top:.5em">Invités : ${esc(m.externals)}</p>` : ''}</div>
      <div class="carte ${m.minutes_html ? 'accent' : ''}"><h3>Compte rendu ${m.minutes_html ? `<small>${m.minutes_ai ? 'rédigé par l’IA' : 'généré'}${m.minutes_sent_at ? ' · envoyé ' + jourRelatif(m.minutes_sent_at).toLowerCase() : ''}</small>` : ''}</h3>
        ${m.minutes_html ? `<div class="cr-apercu ql-snow"><div class="ql-editor">${m.minutes_html}</div></div>
          <div class="actions" style="margin-top:.8em"><button class="btn prim" id="m-envoyer">📨 Envoyer</button><button class="btn" id="m-ia">✨ ${m.minutes_ai ? 'Réécrire avec l’IA' : 'Reformuler avec l’IA'}</button><button class="btn" id="m-doc">📝 Ouvrir dans Rédaction</button><button class="btn" id="m-word">⬇ Word</button><button class="btn sm" id="m-regen" title="Régénérer à partir du fil">↻</button></div>`
        : m.status === 'terminée' ? '<p class="sm muted">Aucun compte rendu. </p><div class="actions" style="margin-top:.6em"><button class="btn prim" id="m-regen">Générer le compte rendu</button><button class="btn" id="m-ia">✨ Rédiger avec l’IA</button></div>'
        : `<p class="sm muted">Le compte rendu est produit à la clôture : il reprend le cadrage et tout ce que les participants ont écrit dans le fil (points abordés, idées, décisions, actions, questions). Vous pouvez ensuite le faire reformuler par l’IA, le retoucher à plusieurs dans Rédaction, l’exporter en Word et l’envoyer.</p>
           <p class="sm" style="margin-top:.6em"><b>${n.length}</b> contribution${n.length > 1 ? 's' : ''} · ${nb('décision')} décision${nb('décision') > 1 ? 's' : ''} · ${nb('action')} action${nb('action') > 1 ? 's' : ''} · ${nb('idée')} idée${nb('idée') > 1 ? 's' : ''}</p>`}</div>
    </div>
    <div class="carte" style="margin-top:1em"><h3>Fil de la réunion <small>${n.length} contribution${n.length > 1 ? 's' : ''}</small></h3>
      ${m.status === 'annulée' ? '' : `<div class="composer-r"><div class="filtres" id="m-kinds">${Object.entries(KINDS_N).map(([k, [ic, l]]) => `<button class="${r.kind === k ? 'on' : ''}" data-k="${k}">${ic} ${l}</button>`).join('')}</div>
        <textarea id="m-txt" rows="2" placeholder="${m.status === 'planifiée' ? 'Préparez la réunion : question à poser, point à ne pas oublier…' : 'Écrivez ce qui se dit : idée, décision, action à mener, question…'}"></textarea>
        <div class="actions" id="m-action-champs" ${r.kind === 'action' ? '' : 'hidden'}><select class="inline" id="m-qui">${optionsMembres()}</select><input class="inline" type="date" id="m-echeance" style="border:1px solid var(--trait);border-radius:.4em;padding:.25em .4em"></div>
        <div class="actions"><button class="btn prim" id="m-publier">Publier</button><span class="sm muted">Chaque membre écrit ; tout reste et nourrit le compte rendu.</span></div></div>`}
      <div class="filtres" style="margin:.8em 0 .4em"><button class="${!r.filtreFil ? 'on' : ''}" data-ff="">Tout</button>${Object.entries(KINDS_N).map(([k, [ic, l]]) => `<button class="${r.filtreFil === k ? 'on' : ''}" data-ff="${k}">${ic} ${l}s</button>`).join('')}</div>
      <div id="m-fil"></div></div></div>`;
  rendrePresenceReunion(); rendreFil();
  $('#m-retour').addEventListener('click', () => go('reunions'));
  $('#m-modifier').addEventListener('click', () => formReunion(m.id));
  $('#m-suppr')?.addEventListener('click', async () => { if (!confirm('Supprimer cette réunion, son fil et son compte rendu ?')) return; const { error } = await state.client.from('kp_meetings').delete().eq('id', m.id); if (error) { toast('Suppression impossible'); return; } state.reunions = state.reunions.filter(x => x.id !== m.id); go('reunions'); });
  $('#m-demarrer')?.addEventListener('click', async () => { if (await majReunion(m, { status: 'en cours', started_at: new Date().toISOString() })) { toast('Réunion démarrée'); renderNav(); rendreReunion(); annoncerReunion(m, 'démarrée'); } });
  $('#m-ics')?.addEventListener('click', () => telechargerICS(m));
  $('#m-inviter')?.addEventListener('click', () => inviterParEmail(m));
  $('#m-rouvrir')?.addEventListener('click', async () => { if (await majReunion(m, { status: 'en cours', ended_at: null })) rendreReunion(); });
  $('#m-cloturer')?.addEventListener('click', () => cloturerReunion(m));
  $('#m-regen')?.addEventListener('click', async () => { if (m.minutes_html && !confirm('Régénérer le compte rendu à partir du fil ? La version actuelle est conservée dans l’historique du document.')) return; await enregistrerCR(m, genererCR(m, r.notes), false); rendreReunion(); });
  $('#m-ia')?.addEventListener('click', () => redigerIA(m));
  $('#m-doc')?.addEventListener('click', () => ouvrirDocCR(m));
  $('#m-word')?.addEventListener('click', () => exporterWord(m.minutes_html, 'Compte rendu — ' + m.title));
  $('#m-envoyer')?.addEventListener('click', () => envoyerCR(m));
  $$('[data-odj]').forEach(c => c.addEventListener('change', async () => { const agenda = m.agenda.map((a, i) => i === +c.dataset.odj ? { ...a, done: c.checked } : a); await majReunion(m, { agenda }); c.closest('.cl-item').classList.toggle('fait', c.checked); }));
  $$('#m-kinds button').forEach(b => b.addEventListener('click', () => { r.kind = b.dataset.k; $$('#m-kinds button').forEach(x => x.classList.toggle('on', x === b)); $('#m-action-champs').hidden = r.kind !== 'action'; $('#m-txt').focus(); }));
  $$('[data-ff]').forEach(b => b.addEventListener('click', () => { r.filtreFil = b.dataset.ff; $$('[data-ff]').forEach(x => x.classList.toggle('on', x === b)); rendreFil(); }));
  $('#m-publier')?.addEventListener('click', publierNote);
  $('#m-txt')?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); publierNote(); } });
}
function rendrePresenceReunion() {
  const el = $('#m-participants'); const m = reunionDe(state.reunion.ouverte); if (!el || !m) return;
  const ids = [...new Set([...(m.participants || []), ...state.reunion.presence])];
  el.innerHTML = ids.map(id => { const x = membre(id); const la = state.reunion.presence.includes(id); return `<div class="ligne" style="padding:.3em 0"><div style="display:flex;gap:.6em;align-items:center"><span class="avatar xs" style="background:${x.color}">${initiales(x.name)}</span><div><b class="sm">${esc(x.name)}</b><small>${esc(x.role || '')}</small></div></div>${la ? '<span class="pill on" style="background:var(--vert-fond);color:var(--vert)"><i></i><span>dans la réunion</span></span>' : (m.participants || []).includes(id) ? '<small class="muted">invité·e</small>' : ''}</div>`; }).join('') || '<div class="vide" style="padding:.5em">Aucun participant.</div>';
  const nb = $('#m-nbpres'); if (nb) nb.textContent = state.reunion.presence.length ? `${state.reunion.presence.length} en ligne` : '';
}
function rendreFil() {
  const el = $('#m-fil'); if (!el) return; const r = state.reunion;
  let n = r.notes.slice(); if (r.filtreFil) n = n.filter(x => x.kind === r.filtreFil);
  n.sort((a, b) => b.created_at.localeCompare(a.created_at));
  el.innerHTML = n.length ? n.map(x => { const [ic, l, cls] = KINDS_N[x.kind] || KINDS_N.note; const mien = x.author === state.moi.user_id || state.moi.is_admin;
    return `<div class="rnote">${avatarDe(x.author)}<div style="min-width:0;flex:1"><div class="meta"><b>${esc(membre(x.author).name)}</b> <span class="etat ${cls}">${ic} ${l}</span> <small class="muted">${jourRelatif(x.created_at)} ${heureFr(x.created_at)}${x.edited_at ? ' · modifié' : ''}</small></div><p>${linkify(x.text)}</p>${x.kind === 'action' && (x.assignee || x.due_on) ? `<small class="muted">→ ${x.assignee ? esc(nomM(x.assignee)) : 'non attribuée'}${x.due_on ? ' · pour le ' + dateFr(x.due_on) : ''}</small>` : ''}</div>${mien ? `<span class="actions"><button class="btn sm" data-n-edit="${x.id}" title="Modifier">✎</button><button class="btn sm" data-n-suppr="${x.id}" title="Supprimer">✕</button></span>` : ''}</div>`; }).join('') : '<div class="vide">Rien encore. Les contributions des participants apparaissent ici en direct.</div>';
  $$('[data-n-suppr]', el).forEach(b => b.addEventListener('click', async () => { if (!confirm('Supprimer cette contribution ?')) return; const { error } = await state.client.from('kp_meeting_notes').delete().eq('id', b.dataset.nSuppr); if (error) { toast('Suppression impossible'); return; } r.notes = r.notes.filter(x => x.id !== b.dataset.nSuppr); rendreFil(); }));
  $$('[data-n-edit]', el).forEach(b => b.addEventListener('click', () => { const x = r.notes.find(y => y.id === b.dataset.nEdit); if (!x) return; modal(`<h3>Modifier</h3><label class="champ"><span>Type</span><select id="ne-kind">${Object.entries(KINDS_N).map(([k, [ic, l]]) => `<option value="${k}" ${x.kind === k ? 'selected' : ''}>${ic} ${l}</option>`).join('')}</select></label><label class="champ"><span>Texte</span><textarea id="ne-txt" rows="3">${esc(x.text)}</textarea></label><div class="ligne2"><label class="champ"><span>Responsable (action)</span><select id="ne-qui">${optionsMembres(x.assignee)}</select></label><label class="champ"><span>Échéance</span><input id="ne-date" type="date" value="${x.due_on || ''}"></label></div><div class="actions"><button class="btn prim" id="ne-ok">Enregistrer</button><button class="btn" onclick="fermerModal()">Annuler</button></div>`, mo => { $('#ne-ok', mo).addEventListener('click', async () => { const patch = { kind: $('#ne-kind').value, text: $('#ne-txt').value.trim(), assignee: $('#ne-qui').value || null, due_on: $('#ne-date').value || null, edited_at: new Date().toISOString() }; if (!patch.text) return; const { error } = await state.client.from('kp_meeting_notes').update(patch).eq('id', x.id); if (error) { toast('Modification impossible'); return; } Object.assign(x, patch); fermerModal(); rendreFil(); }); }); }));
}
async function publierNote() {
  const r = state.reunion; const m = reunionDe(r.ouverte); const txt = $('#m-txt'); const text = txt.value.trim(); if (!text || !m) return;
  const row = { meeting_id: m.id, author: state.moi.user_id, kind: r.kind, text, assignee: r.kind === 'action' ? ($('#m-qui').value || null) : null, due_on: r.kind === 'action' ? ($('#m-echeance').value || null) : null };
  $('#m-publier').disabled = true;
  const { data, error } = await state.client.from('kp_meeting_notes').insert(row).select().single();
  $('#m-publier').disabled = false;
  if (error) { toast('Publication impossible : ' + esc(error.message)); return; }
  if (!r.notes.find(x => x.id === data.id)) r.notes.push(data); txt.value = ''; rendreFil(); txt.focus();
}
function noteRecue(p) {
  const r = state.reunion; if (!r.ouverte) return;
  if (p.eventType === 'DELETE') { r.notes = r.notes.filter(x => x.id !== p.old.id); }
  else if (p.new?.meeting_id === r.ouverte) { const i = r.notes.findIndex(x => x.id === p.new.id); if (i >= 0) r.notes[i] = p.new; else r.notes.push(p.new); }
  else return;
  if (!$('#modal')) rendreFil();
}
function reunionModifiee(p) {
  if (p.eventType === 'DELETE') { state.reunions = state.reunions.filter(x => x.id !== p.old.id); if (state.reunion.ouverte === p.old.id) { toast('Cette réunion a été supprimée'); go('reunions'); return; } }
  else if (p.new?.id) { const i = state.reunions.findIndex(x => x.id === p.new.id); if (i >= 0) state.reunions[i] = p.new; else state.reunions.push(p.new); }
  if (state.vue !== 'reunions' || $('#modal') || document.activeElement?.matches('input,select,textarea')) { renderNav(); return; }
  if (state.reunion.ouverte) rendreReunion(); else vueReunions();
}

/* ---- Clôture et compte rendu ---- */
async function cloturerReunion(m) {
  const n = state.reunion.notes; const actions = n.filter(x => x.kind === 'action'), decisions = n.filter(x => x.kind === 'décision');
  if (!confirm(`Clôturer la réunion et générer le compte rendu ?\n${n.length} contribution(s), ${decisions.length} décision(s), ${actions.length} action(s).`)) return;
  if (!await majReunion(m, { status: 'terminée', ended_at: new Date().toISOString() })) return;
  await enregistrerCR(m, genererCR(m, n), false);
  if (actions.length || decisions.length) {
    if (confirm(`Créer ${actions.length} tâche(s) dans Suivi et ${decisions.length} décision(s) dans le journal des décisions ?`)) {
      for (const a of actions) await creerTache({ title: a.text, project_id: m.project_id, assignee: a.assignee, due_on: a.due_on, description: `Issue de la réunion « ${m.title} » du ${dateFr(m.starts_at)}.`, priority: 'normale' });
      for (const d of decisions) await state.client.from('kp_decisions').insert({ title: d.text.slice(0, 200), detail: d.text.length > 200 ? d.text : `Réunion « ${m.title} » du ${dateFr(m.starts_at)}.`, project_id: m.project_id, decided_on: ISO(new Date(m.starts_at)), status: 'validée', decided_by: state.moi.user_id });
      toast('Tâches et décisions créées');
    }
  }
  renderNav(); rendreReunion(); toast('<b>Réunion clôturée.</b> Le compte rendu est prêt à être envoyé.', 5000);
  annoncerReunion(m, 'clôturée');
}

/* ---- Annonces dans Discussions, agenda, invitations ---- */
const canalReunion = m => state.canaux.find(c => c.project_id === m.project_id && c.kind !== 'prive') || state.canaux.find(c => c.kind === 'general');
const urlApp = () => location.origin + location.pathname;
async function annoncerReunion(m, evt) {
  const canal = canalReunion(m); if (!canal) return;
  const [ic, kl] = KINDS_R[m.kind] || KINDS_R['présentiel'];
  const ou = [m.location ? '📍 ' + m.location : null, m.link ? '💻 ' + m.link : null].filter(Boolean).join(' · ');
  const body = evt === 'planifiée' ? `📅 @tous Réunion planifiée : « ${m.title} »\n${dateHeureFr(m.starts_at)} · ${m.duration_min} min · ${ic} ${kl}${ou ? '\n' + ou : ''}${(m.agenda || []).length ? '\nOrdre du jour : ' + m.agenda.map(a => a.text).join(' · ') : ''}\nOnglet Réunions → ouvrez-la pour y participer et noter en direct.`
    : evt === 'démarrée' ? `▶ @tous La réunion « ${m.title} » commence maintenant.${m.link ? '\n💻 ' + m.link : ''}\nOnglet Réunions → ouvrez-la pour suivre et écrire dans le fil.`
    : `■ @tous La réunion « ${m.title} » est terminée. Le compte rendu est disponible dans l’onglet Réunions.`;
  const { data, error } = await state.client.from('kp_messages').insert({ channel_id: canal.id, author: state.moi.user_id, body, mentions: extraireMentions(body) }).select().single();
  if (!error && data && !state.messages.find(x => x.id === data.id)) state.messages.push(data);
}
const icsDate = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsTexte = t => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function telechargerICS(m) {
  const fin = finPrevue(m); const desc = [m.objectives, (m.agenda || []).length ? 'Ordre du jour : ' + m.agenda.map((a, i) => (i + 1) + '. ' + a.text).join(' ') : null, m.link ? 'Visio : ' + m.link : null, 'Kaporo : ' + urlApp()].filter(Boolean).join('\n');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kaporo//Reunions//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', `UID:kaporo-${m.id}@kaporo`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(m.starts_at)}`, `DTEND:${icsDate(fin)}`, `SUMMARY:${icsTexte(m.title)}`, `DESCRIPTION:${icsTexte(desc)}`, m.location || m.link ? `LOCATION:${icsTexte(m.location || m.link)}` : null, m.link ? `URL:${m.link}` : null, 'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', `DESCRIPTION:${icsTexte(m.title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = m.title.replace(/[\\/:*?"<>|]+/g, '-') + '.ics'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Fichier calendrier téléchargé : ouvrez-le pour l’ajouter à votre agenda.');
}
function inviterParEmail(m) {
  const emails = (m.participants || []).filter(id => id !== state.moi.user_id).map(id => membre(id).email).filter(Boolean);
  const [ic, kl] = KINDS_R[m.kind] || KINDS_R['présentiel'];
  const corps = `Bonjour,\n\nVous êtes invité·e à la réunion « ${m.title} » (${nomProjet(m.project_id)}).\n\nQuand : ${dateHeureFr(m.starts_at)} (${m.duration_min} min)\nFormat : ${kl}${m.location ? '\nLieu : ' + m.location : ''}${m.link ? '\nVisio : ' + m.link : ''}${m.objectives ? '\n\nObjectifs : ' + m.objectives : ''}${(m.agenda || []).length ? '\n\nOrdre du jour :\n' + m.agenda.map((a, i) => (i + 1) + '. ' + a.text).join('\n') : ''}\n\nPendant la réunion, ouvrez Kaporo (onglet Réunions) pour suivre et noter en direct : ${urlApp()}\n\n${state.moi.name}`;
  window.location.href = `mailto:${emails.join(',')}?subject=${encodeURIComponent('Réunion : ' + m.title + ' — ' + dateFr(m.starts_at))}&body=${encodeURIComponent(corps)}`;
}
function genererCR(m, notes) {
  const p = id => esc(nomM(id)); const par = k => notes.filter(x => x.kind === k).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const li = arr => arr.length ? `<ul>${arr.map(x => `<li>${esc(x.text)} <em>(${p(x.author)})</em></li>`).join('')}</ul>` : '<p><em>Néant.</em></p>';
  const actions = par('action'); const duree = m.started_at && m.ended_at ? Math.round((new Date(m.ended_at) - new Date(m.started_at)) / 60000) : null;
  return `<h1>Compte rendu — ${esc(m.title)}</h1>
<p><strong>${esc(nomProjet(m.project_id))}</strong> · ${dateHeureFr(m.starts_at)} · ${KINDS_R[m.kind]?.[1] || m.kind}${m.location ? ' · ' + esc(m.location) : ''}${duree ? ' · durée ' + duree + ' min' : ''}</p>
<h2>Participants</h2><p>${(m.participants || []).map(id => `${p(id)} (${esc(membre(id).role || '')})`).join(', ') || '—'}${m.externals ? '. Invités : ' + esc(m.externals) : ''}</p>
${m.objectives ? `<h2>Objet et objectifs</h2><p>${esc(m.objectives)}</p>` : ''}
<h2>Ordre du jour</h2>${(m.agenda || []).length ? `<ol>${m.agenda.map(a => `<li>${esc(a.text)}${a.done ? ' — traité' : ' — non traité'}</li>`).join('')}</ol>` : '<p><em>Non précisé.</em></p>'}
<h2>Points abordés</h2>${li(par('note'))}
<h2>Décisions</h2>${li(par('décision'))}
<h2>Actions</h2>${actions.length ? `<table><thead><tr><th>Action</th><th>Responsable</th><th>Échéance</th></tr></thead><tbody>${actions.map(x => `<tr><td>${esc(x.text)}</td><td>${x.assignee ? p(x.assignee) : '—'}</td><td>${x.due_on ? dateFr(x.due_on) : '—'}</td></tr>`).join('')}</tbody></table>` : '<p><em>Aucune action.</em></p>'}
<h2>Idées à creuser</h2>${li(par('idée'))}
<h2>Points ouverts</h2>${li(par('question'))}
<p><em>Compte rendu établi par ${esc(state.moi.name)} le ${dateFr(new Date())}.</em></p>`;
}
async function enregistrerCR(m, html, ia) {
  const patch = { minutes_html: html, minutes_ai: !!ia };
  if (m.minutes_doc_id) {
    const { data: prev } = await state.client.from('kp_docs').select('content_html').eq('id', m.minutes_doc_id).maybeSingle();
    if (prev) { if (prev.content_html) { const { data: v } = await state.client.from('kp_doc_versions').select('num').eq('doc_id', m.minutes_doc_id).order('num', { ascending: false }).limit(1); await state.client.from('kp_doc_versions').insert({ doc_id: m.minutes_doc_id, num: ((v?.[0]?.num) || 0) + 1, label: 'Avant ' + (ia ? 'réécriture par l’IA' : 'régénération'), content_html: prev.content_html, author: state.moi.user_id }); }
      await state.client.from('kp_docs').update({ content_html: html, ystate: null, updated_by: state.moi.user_id, updated_at: new Date().toISOString() }).eq('id', m.minutes_doc_id); }
    else patch.minutes_doc_id = null;
  }
  if (!patch.minutes_doc_id && !m.minutes_doc_id) { const d = await creerDoc({ title: `CR — ${m.title} — ${dateFr(m.starts_at)}`, project_id: m.project_id, category: 'Compte rendu', content_html: html }); if (d) patch.minutes_doc_id = d.id; }
  return majReunion(m, patch);
}
async function redigerIA(m) {
  if (!state.reunion.notes.length && !confirm('Le fil est vide : le compte rendu ne contiendra que le cadrage. Continuer ?')) return;
  toast('✨ Rédaction en cours par l’IA… une trentaine de secondes.', 40000);
  const b = $('#m-ia'); if (b) b.disabled = true;
  try {
    const { data, error } = await state.client.functions.invoke('kp-compte-rendu', { body: { meeting_id: m.id } });
    if (error) { let code = ''; try { code = (await error.context?.json())?.error || ''; } catch (e) { } throw new Error(code || error.message); }
    if (!data?.html) throw new Error('Réponse vide');
    await enregistrerCR(m, data.html, true); rendreReunion(); toast('<b>Compte rendu rédigé.</b> Relisez-le, puis envoyez-le.', 5000);
  } catch (e) {
    console.error(e); const msg = String(e.message || e);
    toast(msg === 'CLE_MANQUANTE' ? '<b>IA non configurée.</b> L’administrateur doit enregistrer la clé ANTHROPIC_API_KEY dans Supabase (Edge Functions → Secrets).' : msg === 'NON_AUTHENTIFIE' ? 'Session expirée : reconnectez-vous.' : '<b>Rédaction impossible.</b> ' + esc(msg), 8000);
  }
  if (b) b.disabled = false;
}
async function ouvrirDocCR(m) {
  if (!m.minutes_doc_id) { const d = await creerDoc({ title: `CR — ${m.title} — ${dateFr(m.starts_at)}`, project_id: m.project_id, category: 'Compte rendu', content_html: m.minutes_html }); if (!d) return; await majReunion(m, { minutes_doc_id: d.id }); }
  fermerReunion(); go('redaction'); ouvrirDoc(m.minutes_doc_id);
}
function htmlVersTexte(html) {
  const d = document.createElement('div'); d.innerHTML = html;
  d.querySelectorAll('script,style').forEach(e => e.remove());
  d.querySelectorAll('li').forEach(e => e.prepend('• ')); d.querySelectorAll('td,th').forEach(e => e.append(' | '));
  d.querySelectorAll('h1,h2,h3,p,li,tr,div,br').forEach(e => e.append('\n')); d.querySelectorAll('h1,h2,h3').forEach(e => { e.prepend('\n'); e.append('\n'); });
  return d.textContent.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function envoyerCR(m) {
  const texte = htmlVersTexte(m.minutes_html); const sujet = `Compte rendu — ${m.title} — ${dateFr(m.starts_at)}`;
  const emails = (m.participants || []).map(id => membre(id).email).filter(Boolean);
  const canal = state.canaux.find(c => c.project_id === m.project_id && c.kind !== 'prive') || state.canaux.find(c => c.kind === 'general');
  modal(`<h3>Envoyer le compte rendu</h3>
    <div class="plus-liste">
      <button class="btn" id="e-chat">💬 Publier dans Discussions <small class="muted">· ${esc(canal?.name || 'canal')}</small></button>
      <button class="btn" id="e-mail">✉️ E-mail aux participants <small class="muted">· ${emails.length} adresse${emails.length > 1 ? 's' : ''}</small></button>
      <button class="btn" id="e-copie">📋 Copier le texte</button>
      <button class="btn" id="e-word">⬇ Télécharger en Word</button></div>
    <p class="sm muted" style="margin-top:.8em">L’e-mail s’ouvre dans votre messagerie avec le texte prérempli ; joignez le fichier Word si besoin.</p>
    <div class="actions" style="margin-top:.6em"><button class="btn" onclick="fermerModal()">Fermer</button></div>`, mo => {
    $('#e-chat', mo).addEventListener('click', async () => {
      if (!canal) { toast('Aucun canal disponible'); return; }
      const body = `📋 ${sujet}\n\n${texte.slice(0, 3500)}${texte.length > 3500 ? '\n\n[…] Compte rendu complet dans le module Réunions.' : ''}`;
      const { data, error } = await state.client.from('kp_messages').insert({ channel_id: canal.id, author: state.moi.user_id, body, mentions: [] }).select().single();
      if (error) { toast('Publication impossible'); return; }
      if (!state.messages.find(x => x.id === data.id)) state.messages.push(data);
      await majReunion(m, { minutes_sent_at: new Date().toISOString() }); fermerModal(); toast(`Publié dans « ${esc(canal.name)} »`); rendreReunion();
    });
    $('#e-mail', mo).addEventListener('click', async () => {
      const corps = texte.length > 1700 ? texte.slice(0, 1700) + '\n\n[…] Compte rendu complet dans Kaporo (module Réunions) ou en pièce jointe.' : texte;
      window.location.href = `mailto:${emails.join(',')}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
      await majReunion(m, { minutes_sent_at: new Date().toISOString() }); fermerModal(); rendreReunion();
    });
    $('#e-copie', mo).addEventListener('click', async () => { try { await navigator.clipboard.writeText(texte); toast('Texte copié'); } catch (e) { toast('Copie impossible'); } });
    $('#e-word', mo).addEventListener('click', () => exporterWord(m.minutes_html, sujet));
  });
}
