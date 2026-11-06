# V2 : performance du chargement (D6), journal

Mission : rendre le chargement de l'accueil et des autres pages rapide et léger, sans changer l'apparence.
Hors de mon périmètre (agent « sobriété au repos ») : `src/client/odyssee/{OdysseeHome,StageBoard,scenery,engine}.tsx`,
`src/client/vfx/*`, `odyssee.css`. Pas de commit, pas de npm install, serveur 3000 non touché.

## Étapes

- [ ] 1. Lecture du code (App, main, Layout, vite.config, index.html, serveur, styles)
- [ ] 2. Construction de référence (arbre de travail au démarrage) dans le scratchpad, captures « avant »
- [ ] 3. Changements (découpage, polices, CSS par page, socket.io paresseux, serveur : compression, cache)
- [ ] 4. Mesures après, captures « après », tests

## Journal

- Démarrage (6 nov.) : lecture de PLAN-V2, RETOURS-FONDATEUR, v2-perf-mesure. Pas de journal précédent.
- Étape 2 : instantané de l'arbre de travail à 20 h 26 (`INSTANTANE`) copié dans
  `/tmp/claude-0/-home-user/ebfbab70-aaa1-5fe8-af22-8d09cef460f2/scratchpad/perf-chargement/avant` (node_modules en liens
  durs), `vite build --sourcemap` + serveur esbuild ; serveur « avant » sur le port 3181 (`serveur-avant.pid`).
  Méthode pour « après » : même instantané + mes seuls fichiers recopiés (dossier `apres`, port 3182), pour isoler mes
  changements de ceux de l'agent « repos » qui travaille en parallèle.
