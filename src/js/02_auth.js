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
