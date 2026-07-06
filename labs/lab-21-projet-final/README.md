# Lab 21 — Projet final (capstone) : la stack d'observabilité complète de TribuZen

> **Outcome :** à la fin, tu as monté **de bout en bout** l'observabilité de TribuZen — logs structurés + métriques Prometheus + traces OTel + dashboard RED Grafana + SLO + alerte burn-rate — puis tu as **joué un incident** et **écrit son postmortem**.
> **Vrai outil :** les `docker-compose` fournis à la racine du cours (Prometheus, Grafana, OTel Collector, Jaeger **réels**) + la `demo-app` instrumentée (proxy de l'API TribuZen) + k6. **Zéro harnais simulé.**
> **Feedback :** le coach valide en session — pas de test-runner auto-correcteur. La preuve, c'est la stack qui tourne et la corrélation qui fonctionne sous tes yeux.

---

## Énoncé

C'est le **capstone**. Tu ne découvres rien : tu **assembles** ce que les modules 00 à 20 ont posé. Objectif : reproduire, sur la stack Docker du cours, le vendredi soir du module 21 — depuis l'instrumentation jusqu'au postmortem, en passant par la corrélation des trois piliers et l'alerte burn-rate.

Tu travailles à la **racine du cours** `16-observability-sre/`, où vivent :

- `docker-compose.base.yml` — Prometheus (`:9090`) + Grafana (`:3001`)
- `docker-compose.tracing.yml` — OTel Collector (`:4318`) + Jaeger (`:16686`)
- `docker-compose.full.yml` — l'ensemble **+ la `demo-app`** instrumentée (`:3000`)
- `config/prometheus/prometheus.yml` — le scrape
- `config/prometheus/rules/slo-rules.yml` — recording rules SLI (p99, error rate)
- `config/prometheus/rules/alerting-rules.yml` — burn-rate 14.4× / 6×
- `config/grafana/dashboards/red-dashboard.json` — le dashboard RED
- `config/grafana/provisioning/` — datasource + dashboards provisionnés

**Livrables attendus (ce que le coach regarde en fin de session) :**

1. La stack `full` levée, `up{job=...} == 1` dans Prometheus, la `demo-app` scrapée.
2. Une **corrélation vivante** : partir d'un p99 élevé sur le dashboard RED → ouvrir la trace la plus lente dans Jaeger → retrouver ses logs par `traceId`.
3. Un **SLO + une alerte burn-rate** qui se déclenche quand tu injectes une panne.
4. Un **incident joué** (timeline) et son **postmortem blameless** écrit (fichier `.md`).
5. La **grille récapitulative** ci-dessous, remplie de ta main.

Pas de gap-fill : tu lances, tu observes, tu corrèles, tu écris. Le code d'instrumentation existe déjà dans `demo-app/` (tu l'as construit lab par lab) — ici tu prouves que **l'ensemble** forme un système.

---

## Étapes (en friction)

### Phase A — monter la stack (assemblage)

1. **Lève le socle seul d'abord.** `docker compose -f docker-compose.base.yml up -d`. Ouvre Prometheus (`http://localhost:9090`) et Grafana (`http://localhost:3001`, admin/admin). Vérifie que Grafana voit la datasource Prometheus.
2. **Ajoute l'app et le tracing.** Coupe, puis `docker compose -f docker-compose.full.yml up -d --build`. Attends que la `demo-app` soit `healthy`.
3. **Preuve d'intégration n°1 — le scrape.** Dans Prometheus, exécute `up`. La cible de la `demo-app` doit être à `1`. Si elle est à `0` : `/metrics` n'est pas exposé ou le job n'est pas déclaré dans `prometheus.yml`. **Ne continue pas** tant que `up == 1` (c'est le PIÈGE #1 du module).
4. **Génère du trafic.** Frappe l'app quelques minutes (boucle `curl` sur ses endpoints, ou un petit script k6 `constant-vus`). Sans trafic, tous tes graphes sont plats et tu ne peux rien corréler.

### Phase B — le dashboard RED (visualiser)

5. **Ouvre le dashboard RED** provisionné dans Grafana (`red-dashboard.json` : Rate, Error Rate %, Duration p50/p95/p99). Observe les trois panels se remplir. Lis à voix haute ce que chaque panel raconte.
6. **Rejoue les PromQL clés à la main** dans Prometheus pour comprendre ce que le dashboard exécute :
   ```promql
   sum(rate(http_requests_total[5m]))
   sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))
   histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
   ```

### Phase C — corréler les trois piliers (la couture)

7. **Trouve une requête lente.** Envoie quelques requêtes qui traversent un service lent (ou injecte un délai — voir Phase E). Repère le p99 qui monte sur le dashboard.
8. **Saute à la trace.** Ouvre Jaeger (`http://localhost:16686`), filtre sur le service de la `demo-app`, trie par durée décroissante, ouvre la trace la plus lente. Identifie le span qui mange le temps. **Note son `traceId`.**
9. **Saute aux logs.** `docker compose logs demo-app | Select-String <traceId>` (PowerShell) et retrouve les lignes de log de **cette** requête. Vérifie qu'elles portent bien le `traceId`. Si les logs n'ont pas de `traceId`, la corrélation est cassée (PIÈGE #3) — c'est le point à réparer.

### Phase D — SLO + alerte burn-rate (le signal)

10. **Lis les recording rules** `slo-rules.yml` : elles pré-calculent l'error rate et le p99. Vérifie dans Prometheus que `slo:http_request_error_rate:ratio_rate5m` renvoie une valeur.
11. **Lis les alertes** `alerting-rules.yml` : `HighErrorBurnRate_1h` (seuil `14.4 * 0.001`, `for: 2m`, sévérité `page`) et `_6h`. Ouvre l'onglet **Alerts** de Prometheus — les alertes doivent être listées à l'état `inactive`.

### Phase E — jouer l'incident et le postmortem (le pilier humain)

12. **Injecte la panne.** Fais échouer ou ralentir un endpoint : active le middleware de chaos de la `demo-app` (injection d'erreurs 500 ou de latence), ou pousse la charge k6 en `spike`. Garde un œil sur le dashboard RED et l'onglet Alerts.
13. **Observe la détection automatique.** L'alerte burn-rate passe `pending` puis `firing`. **Note l'heure exacte.** C'est ta détection — avant tout ticket support.
14. **Diagnostique** avec le workflow de la Phase C (RED → trace → logs). Note chaque étape avec son horodatage : tu construis la **timeline**.
15. **Mitige** (coupe le chaos / arrête le spike) et vérifie le retour à la normale sur le dashboard.
16. **Écris le postmortem** dans `labs/lab-21-projet-final/postmortem.md`, structure blameless imposée (Résumé, Impact, Timeline, Root cause, Résolution, Lessons learned, Action items **avec owner + deadline**).

### Phase F — clôture

17. **Remplis la grille récapitulative** ci-dessous.
18. `docker compose -f docker-compose.full.yml down -v` pour tout nettoyer.

---

## Grille récapitulative (à remplir de ta main)

Coche seulement ce que tu as **vu fonctionner**, pas ce que tu supposes fonctionner.

| # | Preuve à obtenir | Où / commande | Vu ? |
|---|------------------|---------------|------|
| 1 | Stack `full` levée, tous les conteneurs `up` | `docker compose ps` | ☐ |
| 2 | Cible `demo-app` scrapée | Prometheus → `up` == 1 | ☐ |
| 3 | Dashboard RED se remplit (rate, errors, p99) | Grafana → RED Metrics Dashboard | ☐ |
| 4 | p99 par route calculé avec `le` dans le `by` | Prometheus, PromQL Phase B | ☐ |
| 5 | Trace la plus lente identifiée + span coupable | Jaeger → tri par durée | ☐ |
| 6 | Logs retrouvés par `traceId` de la trace | `docker compose logs` + filtre | ☐ |
| 7 | Recording rule SLI renvoie une valeur | Prometheus → `slo:...:ratio_rate5m` | ☐ |
| 8 | Alertes burn-rate listées `inactive` au repos | Prometheus → onglet Alerts | ☐ |
| 9 | Alerte burn-rate `firing` après injection | Prometheus → Alerts pendant l'incident | ☐ |
| 10 | Timeline de l'incident horodatée | ta note / postmortem.md | ☐ |
| 11 | Postmortem blameless avec action items datés | `postmortem.md` | ☐ |
| 12 | Diagnostic en < 5 min sans SSH ni `console.log` ajouté | chrono de la Phase E | ☐ |

**Critère de réussite du capstone :** les lignes 2, 6, 9 et 11 cochées. Ce sont les quatre jointures qui font d'un tas de conteneurs une **stack observable** : le scrape (métriques vivantes), la corrélation par `traceId` (les piliers cousus), l'alerte burn-rate (le signal automatique), le postmortem (le pilier humain).

---

## Coach — comment mener la session

Le coach ne corrige pas un fichier : il **provoque la panne** et regarde l'apprenant naviguer. Points d'attention :

- **Ne pas laisser sauter le check `up == 1`** (étape 3). C'est le piège d'intégration n°1 ; le débusquer maintenant évite 30 min de « pourquoi mon dashboard est vide ».
- **Exiger le saut par `traceId`** (étape 9). Si l'apprenant « lit les logs au hasard » au lieu de filtrer par le `traceId` de la trace, la couture n'est pas comprise — refaire l'Exemple 1 du module.
- **Vérifier que l'alerte est sur le symptôme** : demander « pourquoi n'alerte-t-on pas sur le CPU ? ». Réponse attendue : symptôme + vitesse (burn-rate), pas cause (PIÈGE #4).
- **Casser le postmortem s'il nomme un coupable.** Reformuler avec l'apprenant vers « le système a permis… » + un action item qui ferme la faille (test de charge au CI, alerte pool DB).
- **Chronométrer le diagnostic** (ligne 12). L'enjeu du cours entier est là : passer de « on ne sait pas » à « root cause » en minutes, pas en heures.

Questions de relance si l'apprenant bloque :
1. « Ton dashboard est vert mais l'alerte a firé — quelle est la première hypothèse ? » (→ divergence de source, PIÈGE #2).
2. « Le p99 global est bon mais un parent rame — que regardes-tu ? » (→ p99 **par route**, PIÈGE #6).
3. « Tu as la trace lente. Comment retrouves-tu *exactement* ce qui s'est passé ? » (→ filtrer les logs sur le `traceId`).

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées, ~45 min, sans rouvrir ce README ni le module 21 :**

1. **De mémoire**, lève la stack `full`, génère du trafic, et prouve `up == 1`.
2. **Injecte une panne différente** de celle de la session (si tu avais fait de la latence, fais des erreurs 500, ou l'inverse) — l'alerte à surveiller change (`HighErrorBurnRate` vs latence).
3. **Ajoute une brique non couverte en session** : un **deuxième SLO** (si tu avais travaillé la disponibilité, ajoute la latence) avec sa propre alerte burn-rate, en réutilisant les recording rules comme modèle.
4. **Diagnostique et écris un nouveau postmortem** — objectif : détection → root cause en **moins de 4 minutes**.

**Critère de réussite :** le nouveau SLO apparaît dans Prometheus, sa nouvelle alerte fire pendant l'incident, et le postmortem a au moins **deux** action items avec owner + deadline, dont un qui ferme la faille système (pas juste « refaire attention »).

---

## Application TribuZen

La `demo-app` du lab est le **proxy** de l'API TribuZen. Dans `smaurier/tribuzen`, la même stack se pose ainsi :

```
tribuzen/
  src/
    observability/
      logger.ts          ← Pino + traceId (module 01)
      metrics.ts         ← counters + histogram RED (module 02)
      tracing.ts         ← OTel SDK + OTLP (module 05)
  ops/
    prometheus.yml
    rules/
      slo-rules.yml      ← SLI /rsvp p99 + error rate
      alerting-rules.yml ← burn-rate 14.4× / 6×
    grafana/
      red-dashboard.json
      error-budget.json
    postmortems/
      2026-07-03-rsvp-latency.md   ← le postmortem de ce lab, versionné
```

**Différences par rapport au lab :**

- Les métriques portent des **labels métier TribuZen** (`route="/api/events/:id/rsvp"`, métrique `tribuzen_rsvp_confirmed_total`) plutôt que les endpoints génériques de la `demo-app`.
- Le dashboard et les alertes sont **provisionnés as code** dans le repo (module 13) et déployés par la CI, pas cliqués à la main dans Grafana.
- Le postmortem vit dans `ops/postmortems/` du repo, revu en équipe, et ses action items deviennent des issues GitHub avec owner et deadline réels.

**Commit cible :**
```
chore(observability): stack complète TribuZen — RED + SLO + burn-rate + postmortem incident /rsvp
```
