/* ============================================================
   Budget : lignes prévisionnelles (dépenses, recettes), engagements, paiements, encaissements, journal
   ============================================================ */
const CAT_DEP = ['Foncier', 'Études et diagnostics', 'Honoraires (architecte, BET, contrôle)', 'Autorisations et taxes', 'Travaux gros œuvre', 'Travaux second œuvre', 'VRD et aménagements extérieurs', 'Frais financiers', 'Commercialisation', 'Frais généraux et pilotage', 'Aléas'];
const CAT_REC = ['Ventes VEFA', 'Ventes après livraison', 'Loyers et exploitation', 'Apports et subventions', 'Autres recettes'];
const TYPES_MVT = { engagement: ['Engagement', 'bleu'], paiement: ['Paiement', ''], encaissement: ['Encaissement', 'ambre'] };
state.budget = { lignes: [], mouvements: [], journal: null, projet: localStorage.getItem('kp.budget.projet') || 'kaporo1', onglet: localStorage.getItem('kp.budget.onglet') || 'synthese', devise: localStorage.getItem('kp.budget.devise') || 'GNF', ligne: null };
const projetBudget = () => state.projets.find(p => p.id === state.budget.projet) || state.projets[0];
const taux = () => Number(projetBudget()?.gnf_per_eur) || 9600;
const enDevise = n => state.budget.devise === 'EUR' ? (Number(n) || 0) / taux() : (Number(n) || 0);
const symDevise = () => state.budget.devise === 'EUR' ? '€' : 'GNF';
const fmtM = n => Math.round(enDevise(n)).toLocaleString('fr-FR') + ' ' + symDevise();
function abr(n) {
  const v = enDevise(n), a = Math.abs(v), d = symDevise();
  if (a >= 1e9) return (v / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' Md ' + d;
  if (a >= 1e6) return (v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M ' + d;
  if (a >= 1e4) return (v / 1e3).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' k ' + d;
  return Math.round(v).toLocaleString('fr-FR') + ' ' + d;
}
const parseMontant = v => { const n = Number(String(v).replace(/\s| | /g, '').replace(',', '.')); if (isNaN(n)) return NaN; return state.budget.devise === 'EUR' ? Math.round(n * taux()) : Math.round(n); };
const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;
const somme = (arr, f) => arr.reduce((s, x) => s + (Number(f ? f(x) : x) || 0), 0);
const mvtsDe = id => state.budget.mouvements.filter(m => m.line_id === id);
const typeRealise = l => l.kind === 'recette' ? 'encaissement' : 'paiement';
function totauxLigne(l) { const ms = mvtsDe(l.id); return { prevu: Number(l.planned) || 0, engage: somme(ms.filter(m => m.type === 'engagement'), m => m.amount), realise: somme(ms.filter(m => m.type === typeRealise(l)), m => m.amount) }; }
function totaux(lignes) { return lignes.reduce((t, l) => { const x = totauxLigne(l); t.prevu += x.prevu; t.engage += x.engage; t.realise += x.realise; return t; }, { prevu: 0, engage: 0, realise: 0 }); }
const lignesProjet = () => state.budget.lignes.filter(l => l.project_id === state.budget.projet).sort((a, b) => (a.kind > b.kind ? 1 : a.kind < b.kind ? -1 : 0) || a.category.localeCompare(b.category) || (a.sort - b.sort) || a.label.localeCompare(b.label));
const memoBudget = () => { const b = state.budget; localStorage.setItem('kp.budget.projet', b.projet); localStorage.setItem('kp.budget.onglet', b.onglet); localStorage.setItem('kp.budget.devise', b.devise); };

/* ---- Vue ---- */
const ONGLETS_BUDGET = [['synthese', 'Synthèse'], ['depenses', 'Dépenses'], ['recettes', 'Recettes'], ['mouvements', 'Mouvements'], ['journal', 'Journal']];
function vueBudget() {
  const main = $('#main'); main.className = ''; const b = state.budget; const p = projetBudget();
  if (!p) { main.innerHTML = '<div class="vide">Aucun projet.</div>'; return; }
  b.projet = p.id;
  main.innerHTML = `<div class="vue">
    <div class="suivi-tete"><div><h1>Budget</h1><p class="sous">Prévu, engagé, réalisé : le budget de chaque programme par poste, avec les mouvements datés et le journal de toutes les modifications. Les montants sont saisis et conservés en GNF.</p></div>
      <div class="actions"><button class="btn prim" id="b-ligne">＋ Ligne</button><button class="btn" id="b-mvt">＋ Mouvement</button><button class="btn" id="b-csv">⬇ CSV</button></div></div>
    <div class="onglets">${ONGLETS_BUDGET.map(([k, l]) => `<button class="${b.onglet === k ? 'on' : ''}" data-o="${k}">${l}</button>`).join('')}</div>
    <div class="barre-filtres"><div class="filtres">${state.projets.map(x => `<button class="${x.id === b.projet ? 'on' : ''}" data-bp="${x.id}">${esc(x.name)}</button>`).join('')}</div>
      <div class="filtres"><button class="${b.devise === 'GNF' ? 'on' : ''}" data-dev="GNF">GNF</button><button class="${b.devise === 'EUR' ? 'on' : ''}" data-dev="EUR">€ <small>(1 € = ${taux().toLocaleString('fr-FR')} GNF)</small></button></div>
      ${state.moi.is_admin ? '<button class="btn sm" id="b-taux">Taux</button>' : ''}</div>
    <div id="budget-corps"></div></div>`;
  $$('.onglets button').forEach(x => x.addEventListener('click', () => { b.onglet = x.dataset.o; memoBudget(); vueBudget(); }));
  $$('[data-bp]').forEach(x => x.addEventListener('click', () => { b.projet = x.dataset.bp; memoBudget(); vueBudget(); }));
  $$('[data-dev]').forEach(x => x.addEventListener('click', () => { b.devise = x.dataset.dev; memoBudget(); vueBudget(); }));
  $('#b-ligne').addEventListener('click', () => formLigne({ kind: b.onglet === 'recettes' ? 'recette' : 'dépense' }));
  $('#b-mvt').addEventListener('click', () => formMouvement({}));
  $('#b-csv').addEventListener('click', exporterBudgetCSV);
  $('#b-taux')?.addEventListener('click', formTaux);
  rendreBudget();
}
function rendreBudget() {
  const corps = $('#budget-corps'); if (!corps) return;
  ({ synthese: rendreSynthese, depenses: c => rendreLignes(c, 'dépense'), recettes: c => rendreLignes(c, 'recette'), mouvements: rendreMouvements, journal: rendreJournal }[state.budget.onglet] || rendreSynthese)(corps);
  $$('[data-ligne]', corps).forEach(el => el.addEventListener('click', e => { if (e.target.closest('button')) return; ficheLigne(el.dataset.ligne); }));
  $$('[data-mvt-suppr]', corps).forEach(x => x.addEventListener('click', () => supprimerMouvement(x.dataset.mvtSuppr)));
}
function rendreSynthese(corps) {
  const ls = lignesProjet(); const dep = ls.filter(l => l.kind === 'dépense'), rec = ls.filter(l => l.kind === 'recette');
  const td = totaux(dep), tr = totaux(rec);
  const marge = tr.prevu - td.prevu; const treso = tr.realise - td.realise;
  const parCat = (lignes, cats) => [...new Set([...cats, ...lignes.map(l => l.category)])].map(c => [c, lignes.filter(l => l.category === c)]).filter(([, x]) => x.length).map(([c, x]) => ({ c, ...totaux(x), n: x.length }));
  const tableau = (titre, rows, total, kind) => `<div class="carte"><h3>${titre} <small>${rows.reduce((s, r) => s + r.n, 0)} ligne${rows.reduce((s, r) => s + r.n, 0) > 1 ? 's' : ''}</small></h3>
    ${rows.length ? `<table class="tb"><thead><tr><th>Poste</th><th class="num">Prévu</th><th class="num">Engagé</th><th class="num">${kind === 'recette' ? 'Encaissé' : 'Payé'}</th><th class="num">Reste</th><th style="width:7em"></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.c)}</td><td class="num">${fmtM(r.prevu)}</td><td class="num ${r.engage > r.prevu ? 'dep' : ''}">${fmtM(r.engage)}</td><td class="num">${fmtM(r.realise)}</td><td class="num">${fmtM(r.prevu - r.engage)}</td><td>${jauge(pct(r.realise, r.prevu), kind === 'recette' ? 'or' : '')}<small class="muted">${pct(r.realise, r.prevu)} %</small></td></tr>`).join('')}
      <tr class="total"><td>Total</td><td class="num">${fmtM(total.prevu)}</td><td class="num">${fmtM(total.engage)}</td><td class="num">${fmtM(total.realise)}</td><td class="num">${fmtM(total.prevu - total.engage)}</td><td></td></tr></tbody></table>` : `<div class="vide">Aucune ligne. <button class="btn sm" data-structure="${kind}">Créer la structure type</button></div>`}</div>`;
  const depassements = dep.map(l => ({ l, ...totauxLigne(l) })).filter(x => x.engage > x.prevu);
  const derniers = state.budget.mouvements.filter(m => ls.find(l => l.id === m.line_id)).sort((a, b) => b.on_date.localeCompare(a.on_date) || b.created_at.localeCompare(a.created_at)).slice(0, 6);
  corps.innerHTML = `<div class="kpis kpis7">
      <div class="kpi"><b>${abr(td.prevu)}</b><small>Dépenses prévues</small></div>
      <div class="kpi"><b>${abr(td.engage)}</b><small>Engagé · ${pct(td.engage, td.prevu)} %</small>${jauge(pct(td.engage, td.prevu), 'bleu')}</div>
      <div class="kpi"><b>${abr(td.realise)}</b><small>Payé · ${pct(td.realise, td.prevu)} %</small>${jauge(pct(td.realise, td.prevu))}</div>
      <div class="kpi"><b>${abr(tr.prevu)}</b><small>Recettes prévues</small></div>
      <div class="kpi"><b>${abr(tr.realise)}</b><small>Encaissé · ${pct(tr.realise, tr.prevu)} %</small>${jauge(pct(tr.realise, tr.prevu), 'or')}</div>
      <div class="kpi ${marge < 0 ? 'rouge' : 'vert'}"><b>${abr(marge)}</b><small>Marge prévisionnelle · ${pct(marge, td.prevu)} %</small></div>
      <div class="kpi ${treso < 0 ? 'rouge' : ''}"><b>${abr(treso)}</b><small>Trésorerie à date</small></div></div>
    ${depassements.length ? `<div class="carte accent" style="margin-bottom:1em"><h3>Dépassements <small>${depassements.length}</small></h3>${depassements.map(x => `<div class="ligne" data-ligne="${x.l.id}" style="cursor:pointer"><div><b class="sm">${esc(x.l.label)}</b><small>${esc(x.l.category)}</small></div><span class="etat rouge">+ ${fmtM(x.engage - x.prevu)}</span></div>`).join('')}</div>` : ''}
    <div class="g g2">${tableau('Dépenses par poste', parCat(dep, CAT_DEP), td, 'dépense')}${tableau('Recettes par poste', parCat(rec, CAT_REC), tr, 'recette')}
      <div class="carte"><h3>Derniers mouvements</h3>${derniers.length ? derniers.map(ligneMouvement).join('') : '<div class="vide">Aucun mouvement.</div>'}</div>
      <div class="carte"><h3>Lecture</h3><p class="sm">• <b>Prévu</b> : le budget de la ligne. • <b>Engagé</b> : contrats, devis signés, commandes. • <b>Payé / encaissé</b> : l’argent réellement sorti ou entré.<br>• <b>Reste</b> = prévu − engagé. Un engagement supérieur au prévu apparaît en dépassement.<br>• <b>Marge prévisionnelle</b> = recettes prévues − dépenses prévues. <b>Trésorerie à date</b> = encaissé − payé.</p><p class="sm muted" style="margin-top:.6em">Chaque création, modification ou suppression est consignée dans l’onglet Journal.</p></div></div>`;
  $$('[data-structure]', corps).forEach(x => x.addEventListener('click', () => creerStructureType(x.dataset.structure)));
}
function rendreLignes(corps, kind) {
  const ls = lignesProjet().filter(l => l.kind === kind); const cats = [...new Set([...(kind === 'recette' ? CAT_REC : CAT_DEP), ...ls.map(l => l.category)])].map(c => [c, ls.filter(l => l.category === c)]).filter(([, x]) => x.length);
  const t = totaux(ls); const realLib = kind === 'recette' ? 'Encaissé' : 'Payé';
  const row = l => { const x = totauxLigne(l); const ph = l.phase_id && phaseDe(l.phase_id); return `<tr data-ligne="${l.id}" class="cli"><td><b>${esc(l.label)}</b><small class="muted">${[l.supplier, ph ? 'Ph. ' + ph.num : null].filter(Boolean).map(esc).join(' · ')}</small></td><td class="num">${fmtM(x.prevu)}</td><td class="num ${x.engage > x.prevu ? 'dep' : ''}">${fmtM(x.engage)}</td><td class="num">${fmtM(x.realise)}</td><td class="num">${fmtM(x.prevu - x.engage)}</td><td>${jauge(pct(x.realise, x.prevu), kind === 'recette' ? 'or' : '')}<small class="muted">${pct(x.realise, x.prevu)} %</small></td></tr>`; };
  corps.innerHTML = `<div class="carte">${ls.length ? `<table class="tb"><thead><tr><th>Ligne</th><th class="num">Prévu</th><th class="num">Engagé</th><th class="num">${realLib}</th><th class="num">Reste</th><th style="width:7em"></th></tr></thead><tbody>
    ${cats.map(([c, x]) => { const tc = totaux(x); return `<tr class="cat"><td>${esc(c)} <small class="muted">${x.length}</small></td><td class="num">${fmtM(tc.prevu)}</td><td class="num">${fmtM(tc.engage)}</td><td class="num">${fmtM(tc.realise)}</td><td class="num">${fmtM(tc.prevu - tc.engage)}</td><td></td></tr>${x.map(row).join('')}`; }).join('')}
    <tr class="total"><td>Total ${kind === 'recette' ? 'recettes' : 'dépenses'}</td><td class="num">${fmtM(t.prevu)}</td><td class="num">${fmtM(t.engage)}</td><td class="num">${fmtM(t.realise)}</td><td class="num">${fmtM(t.prevu - t.engage)}</td><td></td></tr></tbody></table>` : `<div class="vide">Aucune ligne de ${kind}. <button class="btn sm" data-structure="${kind}">Créer la structure type</button> ou ajoutez une ligne.</div>`}
    <p class="sm muted" style="margin-top:.6em">Cliquez une ligne pour la modifier ou saisir un mouvement.</p></div>`;
  $$('[data-structure]', corps).forEach(x => x.addEventListener('click', () => creerStructureType(x.dataset.structure)));
}
function ligneMouvement(m) {
  const l = state.budget.lignes.find(x => x.id === m.line_id); const [lib, cls] = TYPES_MVT[m.type] || [m.type, 'gris'];
  return `<div class="ligne mvt"><div style="min-width:0"><b class="sm">${esc(m.label || (l ? l.label : ''))}</b><small>${dateFr(m.on_date)} · ${l ? esc(l.label) + ' · ' : ''}${esc(membre(m.created_by).name)}${m.ref ? ' · réf. ' + esc(m.ref) : ''}</small></div>
    <span class="actions"><span class="etat ${cls}">${lib}</span><b class="num">${fmtM(m.amount)}</b><button class="btn sm" data-mvt-suppr="${m.id}" title="Supprimer">✕</button></span></div>`;
}
function rendreMouvements(corps) {
  const ids = new Set(lignesProjet().map(l => l.id)); const b = state.budget;
  let ms = b.mouvements.filter(m => ids.has(m.line_id)); if (b.filtreMvt) ms = ms.filter(m => m.type === b.filtreMvt);
  ms.sort((a, c) => c.on_date.localeCompare(a.on_date) || c.created_at.localeCompare(a.created_at));
  corps.innerHTML = `<div class="filtres">${[['', 'Tous'], ...Object.entries(TYPES_MVT).map(([k, [l]]) => [k, l + 's'])].map(([k, l]) => `<button class="${(b.filtreMvt || '') === k ? 'on' : ''}" data-fm="${k}">${l}</button>`).join('')}<span class="muted sm" style="align-self:center">${ms.length} mouvement${ms.length > 1 ? 's' : ''} · ${fmtM(somme(ms, m => m.amount))}</span></div>
    <div class="carte">${ms.length ? ms.map(ligneMouvement).join('') : '<div class="vide">Aucun mouvement.</div>'}</div>`;
  $$('[data-fm]', corps).forEach(x => x.addEventListener('click', () => { b.filtreMvt = x.dataset.fm; rendreBudget(); }));
}
async function rendreJournal(corps) {
  corps.innerHTML = '<div class="vide">Chargement du journal…</div>';
  const { data, error } = await state.client.from('kp_budget_log').select('*').eq('project_id', state.budget.projet).order('at', { ascending: false }).limit(300);
  if (error) { corps.innerHTML = '<div class="vide">Journal indisponible.</div>'; return; }
  const lib = e => { const d = e.detail || {}; const a = { insert: 'a créé', update: 'a modifié', delete: 'a supprimé' }[e.action] || e.action;
    if (d.table === 'ligne') { let s = `${a} la ligne « ${esc(d.label || '')} »`; if (e.action === 'update' && d.avant && d.apres && Number(d.avant.planned) !== Number(d.apres.planned)) s += ` : prévu ${fmtM(d.avant.planned)} → ${fmtM(d.apres.planned)}`; else if (e.action === 'insert' && d.apres) s += ` (prévu ${fmtM(d.apres.planned)})`; return s; }
    const [t] = TYPES_MVT[d.type] || [d.type]; return `${a} un ${(t || '').toLowerCase()} de ${fmtM(d.amount)}${d.label ? ' « ' + esc(d.label) + ' »' : ''}${d.on_date ? ' au ' + dateFr(d.on_date) : ''}`; };
  corps.innerHTML = `<div class="carte">${data.length ? data.map(e => `<div class="ligne"><div><b class="sm">${esc(membre(e.who).name)}</b> <span class="sm">${lib(e)}</span><small>${dateFr(e.at)} ${hhmm(new Date(e.at))}</small></div></div>`).join('') : '<div class="vide">Aucune modification enregistrée.</div>'}</div>`;
}

/* ---- Formulaires ---- */
const optionsCat = (kind, sel) => [...new Set([...(kind === 'recette' ? CAT_REC : CAT_DEP), ...state.budget.lignes.filter(l => l.kind === kind).map(l => l.category), ...(sel ? [sel] : [])])].map(c => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('');
const champMontant = (id, val, lib = 'Montant') => `<label class="champ"><span>${lib} (${symDevise()})</span><input id="${id}" inputmode="decimal" value="${val !== undefined && val !== null ? Math.round(enDevise(val)).toLocaleString('fr-FR') : ''}" placeholder="0"></label>`;
function formLigne(pre = {}, id) {
  const l = id ? state.budget.lignes.find(x => x.id === id) : null; const kind = l ? l.kind : (pre.kind || 'dépense');
  modal(`<h3>${l ? 'Modifier la ligne' : 'Nouvelle ligne de ' + kind}</h3>
    <div class="ligne2"><label class="champ"><span>Nature</span><select id="l-kind" ${l ? 'disabled' : ''}><option value="dépense" ${kind === 'dépense' ? 'selected' : ''}>Dépense</option><option value="recette" ${kind === 'recette' ? 'selected' : ''}>Recette</option></select></label>
      <label class="champ"><span>Poste</span><select id="l-cat">${optionsCat(kind, l?.category)}</select></label></div>
    <label class="champ"><span>Libellé</span><input id="l-label" value="${esc(l?.label || '')}" placeholder="Ex. Acquisition du terrain, lot 12"></label>
    <div class="ligne2">${champMontant('l-prevu', l?.planned, 'Montant prévu')}<label class="champ"><span>Phase</span><select id="l-phase">${optionsPhases(state.budget.projet, l?.phase_id)}</select></label></div>
    <div class="ligne2"><label class="champ"><span>Fournisseur / contrepartie</span><input id="l-four" value="${esc(l?.supplier || '')}"></label><label class="champ"><span>Note</span><input id="l-note" value="${esc(l?.note || '')}"></label></div>
    <div class="actions"><button class="btn prim" id="l-ok">${l ? 'Enregistrer' : 'Créer'}</button>${l ? '<button class="btn" id="l-suppr">Supprimer</button>' : ''}<button class="btn" onclick="fermerModal()">Annuler</button></div>`, mo => {
    $('#l-kind', mo).addEventListener('change', e => { $('#l-cat', mo).innerHTML = optionsCat(e.target.value); });
    $('#l-ok', mo).addEventListener('click', async () => {
      const label = $('#l-label').value.trim(); const planned = parseMontant($('#l-prevu').value || '0');
      if (!label) { toast('Donnez un libellé'); return; } if (isNaN(planned)) { toast('Montant invalide'); return; }
      const row = { kind: $('#l-kind').value, category: $('#l-cat').value, label, planned, phase_id: $('#l-phase').value || null, supplier: $('#l-four').value.trim() || null, note: $('#l-note').value.trim() || null };
      if (l) { const { error } = await state.client.from('kp_budget_lines').update(row).eq('id', l.id); if (error) { toast('Modification impossible : ' + esc(error.message)); return; } Object.assign(l, row); }
      else { const { data, error } = await state.client.from('kp_budget_lines').insert({ ...row, project_id: state.budget.projet, created_by: state.moi.user_id, sort: Date.now() / 1000 }).select().single(); if (error) { toast('Création impossible : ' + esc(error.message)); return; } if (!state.budget.lignes.find(x => x.id === data.id)) state.budget.lignes.push(data); }
      fermerModal(); toast('Enregistré'); rendreBudget();
    });
    $('#l-suppr', mo)?.addEventListener('click', async () => {
      if (!confirm('Supprimer cette ligne et ses mouvements ?')) return;
      const { error } = await state.client.from('kp_budget_lines').delete().eq('id', l.id); if (error) { toast('Suppression impossible'); return; }
      state.budget.lignes = state.budget.lignes.filter(x => x.id !== l.id); state.budget.mouvements = state.budget.mouvements.filter(m => m.line_id !== l.id); fermerModal(); rendreBudget();
    });
  });
}
function formMouvement(pre = {}) {
  const ls = lignesProjet(); if (!ls.length) { toast('Créez d’abord une ligne de budget'); return; }
  const lid = pre.line_id || ls[0].id; const l0 = ls.find(x => x.id === lid);
  const optLignes = sel => ['dépense', 'recette'].map(k => { const x = ls.filter(l => l.kind === k); return x.length ? `<optgroup label="${k === 'recette' ? 'Recettes' : 'Dépenses'}">${x.map(l => `<option value="${l.id}" ${l.id === sel ? 'selected' : ''}>${esc(l.category)} · ${esc(l.label)}</option>`).join('')}</optgroup>` : ''; }).join('');
  const optTypes = l => (l.kind === 'recette' ? ['engagement', 'encaissement'] : ['engagement', 'paiement']).map(t => `<option value="${t}" ${(pre.type || (l.kind === 'recette' ? 'encaissement' : 'paiement')) === t ? 'selected' : ''}>${TYPES_MVT[t][0]}${t === 'engagement' ? (l.kind === 'recette' ? ' (réservation, contrat signé)' : ' (contrat, devis signé, commande)') : ''}</option>`).join('');
  modal(`<h3>Nouveau mouvement</h3>
    <label class="champ"><span>Ligne de budget</span><select id="m-ligne">${optLignes(lid)}</select></label>
    <div class="ligne2"><label class="champ"><span>Type</span><select id="m-type">${optTypes(l0)}</select></label>${champMontant('m-montant', pre.amount)}</div>
    <div class="ligne2"><label class="champ"><span>Date</span><input id="m-date" type="date" value="${pre.on_date || auj()}"></label><label class="champ"><span>Référence (facture, contrat…)</span><input id="m-ref" placeholder="Ex. Facture 2026-014"></label></div>
    <label class="champ"><span>Libellé</span><input id="m-label" placeholder="Ex. Acompte 30 % étude de sol"></label>
    <div class="actions"><button class="btn prim" id="m-ok">Enregistrer</button><button class="btn" onclick="fermerModal()">Annuler</button></div>`, mo => {
    $('#m-ligne', mo).addEventListener('change', e => { const l = ls.find(x => x.id === e.target.value); $('#m-type', mo).innerHTML = optTypes(l); });
    $('#m-montant', mo).focus();
    $('#m-ok', mo).addEventListener('click', async () => {
      const amount = parseMontant($('#m-montant').value); if (isNaN(amount) || !amount) { toast('Indiquez un montant'); return; }
      const { data, error } = await state.client.from('kp_budget_moves').insert({ line_id: $('#m-ligne').value, type: $('#m-type').value, amount, on_date: $('#m-date').value || auj(), label: $('#m-label').value.trim() || null, ref: $('#m-ref').value.trim() || null, created_by: state.moi.user_id }).select().single();
      if (error) { toast('Enregistrement impossible : ' + esc(error.message)); return; }
      if (!state.budget.mouvements.find(m => m.id === data.id)) state.budget.mouvements.push(data);
      fermerModal(); toast('Mouvement enregistré'); if (state.budget.ligne) ficheLigne(state.budget.ligne); else rendreBudget();
    });
  });
}
async function supprimerMouvement(id) {
  if (!confirm('Supprimer ce mouvement ?')) return;
  const { error } = await state.client.from('kp_budget_moves').delete().eq('id', id); if (error) { toast('Suppression impossible'); return; }
  state.budget.mouvements = state.budget.mouvements.filter(m => m.id !== id); if (state.budget.ligne) ficheLigne(state.budget.ligne); else rendreBudget();
}
function ficheLigne(id) {
  const l = state.budget.lignes.find(x => x.id === id); if (!l) return; const x = totauxLigne(l); const ms = mvtsDe(id).sort((a, b) => b.on_date.localeCompare(a.on_date));
  state.budget.ligne = id;
  const mo = modal(`<h3>${esc(l.label)} <small style="font-family:var(--sans);font-size:.7em;color:var(--pierre)">${esc(l.category)} · ${l.kind}</small></h3>
    <div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><b>${abr(x.prevu)}</b><small>Prévu</small></div><div class="kpi ${x.engage > x.prevu ? 'rouge' : ''}"><b>${abr(x.engage)}</b><small>Engagé · ${pct(x.engage, x.prevu)} %</small></div><div class="kpi vert"><b>${abr(x.realise)}</b><small>${l.kind === 'recette' ? 'Encaissé' : 'Payé'} · ${pct(x.realise, x.prevu)} %</small></div></div>
    ${l.supplier || l.note || l.phase_id ? `<p class="sm muted" style="margin:-.4em 0 .8em">${[l.supplier, l.phase_id && phaseDe(l.phase_id) ? 'Phase ' + phaseDe(l.phase_id).num + ' · ' + phaseDe(l.phase_id).title : null, l.note].filter(Boolean).map(esc).join(' · ')}</p>` : ''}
    <div class="actions" style="margin-bottom:.8em"><button class="btn sm prim" id="f-mvt">＋ Mouvement</button><button class="btn sm" id="f-edit">Modifier la ligne</button></div>
    <h4 style="font-family:var(--sans);font-size:.8em;text-transform:uppercase;letter-spacing:.06em;color:var(--pierre);margin-bottom:.3em">Mouvements <small>${ms.length}</small></h4>
    <div>${ms.length ? ms.map(ligneMouvement).join('') : '<div class="vide">Aucun mouvement sur cette ligne.</div>'}</div>
    <div class="actions" style="margin-top:.8em"><button class="btn prim" id="f-fermer">Fermer</button></div>`, m => {
    $('.boite', m).classList.add('large');
    $('#f-mvt', m).addEventListener('click', () => formMouvement({ line_id: id }));
    $('#f-edit', m).addEventListener('click', () => { state.budget.ligne = null; formLigne({}, id); });
    $('#f-fermer', m).addEventListener('click', () => { state.budget.ligne = null; fermerModal(); rendreBudget(); });
    $$('[data-mvt-suppr]', m).forEach(b => b.addEventListener('click', () => supprimerMouvement(b.dataset.mvtSuppr)));
  });
  mo.addEventListener('click', e => { if (e.target === mo) { state.budget.ligne = null; rendreBudget(); } });
}
function formTaux() {
  const p = projetBudget();
  modal(`<h3>Taux de conversion · ${esc(p.name)}</h3><label class="champ"><span>GNF pour 1 €</span><input id="t-taux" inputmode="decimal" value="${taux()}"></label><p class="sm muted" style="margin-bottom:.8em">Sert uniquement à l’affichage en euros ; les montants restent enregistrés en GNF.</p><div class="actions"><button class="btn prim" id="t-ok">Enregistrer</button><button class="btn" onclick="fermerModal()">Annuler</button></div>`, mo => {
    $('#t-ok', mo).addEventListener('click', async () => {
      const v = Number(String($('#t-taux').value).replace(/\s/g, '').replace(',', '.')); if (!v || v <= 0) { toast('Taux invalide'); return; }
      const { error } = await state.client.from('kp_projects').update({ gnf_per_eur: v }).eq('id', p.id); if (error) { toast('Enregistrement impossible'); return; }
      p.gnf_per_eur = v; fermerModal(); vueBudget();
    });
  });
}
async function creerStructureType(kind) {
  const cats = kind === 'recette' ? CAT_REC : CAT_DEP;
  if (!confirm(`Créer ${cats.length} lignes de ${kind} (montants à zéro, à compléter) ?`)) return;
  const rows = cats.map((c, i) => ({ project_id: state.budget.projet, kind, category: c, label: c, planned: 0, created_by: state.moi.user_id, sort: i }));
  const { data, error } = await state.client.from('kp_budget_lines').insert(rows).select();
  if (error) { toast('Création impossible : ' + esc(error.message)); return; }
  data.forEach(d => { if (!state.budget.lignes.find(x => x.id === d.id)) state.budget.lignes.push(d); }); toast('Structure créée'); rendreBudget();
}
function exporterBudgetCSV() {
  const ls = lignesProjet(); const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const col = ['Nature', 'Poste', 'Libellé', 'Fournisseur', 'Phase', 'Prévu (GNF)', 'Engagé (GNF)', 'Réalisé (GNF)', 'Reste (GNF)', 'Note'];
  const rows = ls.map(l => { const x = totauxLigne(l); const ph = l.phase_id && phaseDe(l.phase_id); return [l.kind, l.category, l.label, l.supplier || '', ph ? `${ph.num}. ${ph.title}` : '', x.prevu, x.engage, x.realise, x.prevu - x.engage, l.note || ''].map(q).join(';'); });
  const ms = state.budget.mouvements.filter(m => ls.find(l => l.id === m.line_id)).sort((a, b) => a.on_date.localeCompare(b.on_date));
  const col2 = ['Date', 'Type', 'Ligne', 'Libellé', 'Référence', 'Montant (GNF)', 'Saisi par'];
  const rows2 = ms.map(m => { const l = ls.find(x => x.id === m.line_id); return [m.on_date, m.type, l ? l.label : '', m.label || '', m.ref || '', m.amount, membre(m.created_by).name].map(q).join(';'); });
  const blob = new Blob(['﻿' + [col.map(q).join(';'), ...rows, '', col2.map(q).join(';'), ...rows2].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `kaporo-budget-${state.budget.projet}-${auj()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
