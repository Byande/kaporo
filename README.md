# Kaporo — espace de travail sécurisé

Application de collaboration des programmes immobiliers Kaporo 1 et Kaporo 2 (Conakry) : discussions en temps réel, coffre de documents, journal des décisions, module Suivi (tableau de bord, liste, kanban, Gantt, calendrier, fiches tâches avec sous-tâches et commentaires, phases), module Rédaction (documents co-édités en temps réel, versions, import/export Word), module Budget (prévu / engagé / réalisé, mouvements, journal), équipe.

- Source : `src/` (CSS dans `head.html`, HTML dans `body.html`, scripts dans `js/`).
- Construction : `python3 build.py` → `docs/index.html` (fichier unique à publier).
- Test local : `node serve.js` puis http://localhost:3000.
- Backend : Supabase (authentification par lien e-mail ou mot de passe, tables `kp_*`, coffre `kp-files`, règles RLS réservées aux membres invités).
