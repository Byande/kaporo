# Kaporo — espace de travail sécurisé

Application de collaboration des programmes immobiliers Kaporo 1 et Kaporo 2 (Conakry) : discussions en temps réel, coffre de documents, journal des décisions, module Suivi (tableau de bord, liste, kanban, Gantt, calendrier, fiches tâches avec sous-tâches et commentaires, phases), module Rédaction (documents co-édités en temps réel, versions, import/export Word), module Budget (prévu / engagé / réalisé, mouvements, journal), module Réunions (cadrage, séance en direct, compte rendu rédigé par l’IA via l’Edge Function `kp-compte-rendu`, envoi, archive), équipe (rôles libres et responsabilités).
- IA : fonction `supabase/functions/kp-compte-rendu` ; définir le secret `ANTHROPIC_API_KEY` dans Supabase (Edge Functions → Secrets).

- Source : `src/` (CSS dans `head.html`, HTML dans `body.html`, scripts dans `js/`).
- Construction : `python3 build.py` → `docs/index.html` (fichier unique à publier).
- Test local : `node serve.js` puis http://localhost:3000.
- Backend : Supabase (authentification par lien e-mail ou mot de passe, tables `kp_*`, coffre `kp-files`, règles RLS réservées aux membres invités).
