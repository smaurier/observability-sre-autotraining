# Lab 08 — SLI / SLO / SLA & error budget

> **Outcome :** à la fin, tu sais définir 2–3 SLO réels pour TribuZen — chacun avec son SLI en PromQL, une cible dérivée d'une mesure, l'error budget chiffré, et une error budget policy actionnable.
> **Vrai outil :** PromQL réel contre le Prometheus du `docker-compose` du cours (métriques posées au lab 02) + un fichier `slos.yaml` versionné. Pas de harnais simulé.
> **Feedback :** le coach valide en session avec la grille ci-dessous — pas de test-runner auto-correcteur.

---

## Énoncé

Le PO TribuZen veut pouvoir répondre « est-ce fiable ? » avec des chiffres, et décider objectivement « déploie-t-on aujourd'hui ? ». Ton job : **définir les SLO de fondation** de l'API TribuZen.

Tu produis **un livrable écrit** (`ops/slo/slos.yaml` + une error budget policy) et tu **valides chaque SLI en PromQL** contre le Prometheus fourni. Ce n'est **pas** un exercice de code : c'est un exercice de définition, le cœur du métier SRE.

Tu choisis **deux SLO obligatoires + un troisième au choix** parmi les parcours TribuZen :

| Parcours | Route | Type de SLI attendu |
|----------|-------|---------------------|
| Login (**obligatoire**) | `POST /api/auth/login` | Availability |
| RSVP (**obligatoire**) | `POST /api/events/:id/rsvp` | Latency (seuil que tu choisis) |
| Fil famille (au choix) | `GET /api/families/:id/feed` | Availability ou Latency |
| Envoi d'invitation (au choix) | `POST /api/events/:id/invite` | Availability |

Pour **chaque** SLO, tu dois livrer les **5 éléments** :

1. **SLI** — la définition en une phrase (bons évènements / évènements valides), du point de vue utilisateur.
2. **Requête PromQL** — le SLI mesurable, testé contre Prometheus (elle doit renvoyer un nombre entre 0 et 1).
3. **Cible** — dérivée d'une **mesure historique arrondie vers le bas** (tu lis le SLI sur `[28d]`, tu arrondis bas). Jamais 100 %.
4. **Fenêtre** — rolling, multiple de semaines (justifie ton choix).
5. **Error budget** — chiffré : en % **et** en minutes d'indispo (ou en requêtes autorisées) sur la fenêtre.

Puis **un livrable transverse** : une **error budget policy** (tranches 50 / 75 / 100 %) avec, pour chaque tranche, l'action concrète pour l'équipe TribuZen.

### Starter — squelette `slos.yaml`

Crée `ops/slo/slos.yaml`. Un SLO est pré-rempli comme **modèle** ; à toi d'écrire les deux autres (dont RSVP en latency) :

```yaml
# ops/slo/slos.yaml — SLO de fondation TribuZen
window: 28d            # rolling, multiple de semaines

slos:
  - name: login-availability
    parcours: "POST /api/auth/login"
    sli_type: availability
    sli_description: "part des POST login avec status non-5xx (un 401 = succès du service)"
    sli_promql: |
      sum(rate(http_requests_total{route="/api/auth/login", status!~"5.."}[28d]))
      /
      sum(rate(http_requests_total{route="/api/auth/login"}[28d]))
    measured: 0.9987   # mesuré sur l'historique AVANT d'arrondir
    target: 0.998      # arrondi vers le BAS
    error_budget_pct: 0.2
    error_budget_minutes: 80.6   # 28*24*60*(1-0.998)

  # - name: rsvp-latency        <- À TOI (latency, ratio de buckets le="...")
  # - name: <parcours au choix> <- À TOI
```

### Starter — squelette policy

Crée `ops/slo/error-budget-policy.md` :

```markdown
# Error budget policy — TribuZen (signée produit + dev + ops)

| Budget consommé | Action pour l'équipe TribuZen |
|-----------------|-------------------------------|
| 0–50 %   | ... (à toi) |
| 50–75 %  | ... |
| 75–100 % | ... |
| > 100 %  | ... |
```

---

## Étapes (en friction)

1. **Lance la stack.** Depuis la racine du cours : `docker compose up -d` (Prometheus + API TribuZen instrumentée du lab 02). Vérifie que Prometheus scrape : cible `tribuzen-api` en `UP`.
2. **Mesure le SLI login.** Colle la PromQL du modèle dans Prometheus (onglet *Graph*), remplace la fenêtre par `[28d]` (ou `[1h]` si la stack est neuve, en le notant). Lis la valeur — c'est ton `measured`.
3. **Dérive la cible login.** Arrondis `measured` **vers le bas** à un cran gérable. Interdit : arrondir vers le haut, ou viser 100 %.
4. **Écris le SLO RSVP (latency).** Choisis un seuil (ex. 300 ms). Écris le **ratio de buckets** : `..._bucket{le="0.3"}` / `..._count`. Teste-le en PromQL (doit tomber entre 0 et 1). Dérive la cible.
5. **Écris le 3e SLO** (parcours au choix), même méthode.
6. **Chiffre chaque error budget.** Pour chaque SLO : `budget% = 1 - target`, `minutes = 28*24*60*budget%`. Reporte dans `slos.yaml`.
7. **Écris la policy.** Une action **concrète et actionnable** par tranche (pas « faire attention » — dis *quoi* on gèle, *qui* décide).
8. **Auto-contrôle pièges.** Vérifie : (a) aucun SLI ne compte les 4xx comme échec de dispo ; (b) aucune cible à 100 % ; (c) fenêtre en multiple de semaines ; (d) pour la latency, tu utilises bien un ratio de buckets et pas `histogram_quantile`.

---

## Corrigé complet commenté

### `ops/slo/slos.yaml`

```yaml
# ops/slo/slos.yaml — SLO de fondation TribuZen
window: 28d   # rolling : multiple de 4 semaines -> même nb de week-ends par fenêtre,
              # et pas de "recharge" du budget le 1er du mois (piège fenêtre calendaire)

slos:
  # ---- SLO 1 : disponibilité du login (obligatoire) ----
  - name: login-availability
    parcours: "POST /api/auth/login"
    sli_type: availability
    sli_description: "part des POST login avec status non-5xx (un 401 = succès du service)"
    sli_promql: |
      sum(rate(http_requests_total{route="/api/auth/login", status!~"5.."}[28d]))
      /
      sum(rate(http_requests_total{route="/api/auth/login"}[28d]))
    measured: 0.9987          # lu dans Prometheus sur l'historique
    target: 0.998             # arrondi VERS LE BAS (99,87 -> 99,8), marge réelle
    error_budget_pct: 0.2     # 1 - 0.998
    error_budget_minutes: 80.6 # 28*24*60*0.002

  # ---- SLO 2 : latence du RSVP (obligatoire) ----
  - name: rsvp-latency
    parcours: "POST /api/events/:id/rsvp"
    sli_type: latency
    sli_description: "part des RSVP servis en 300 ms ou moins (ratio de buckets, pas un quantile)"
    sli_promql: |
      sum(rate(http_request_duration_seconds_bucket{route="/api/events/:id/rsvp", le="0.3"}[28d]))
      /
      sum(rate(http_request_duration_seconds_count{route="/api/events/:id/rsvp"}[28d]))
    measured: 0.964
    target: 0.95              # arrondi bas (96,4 -> 95). 5 % des RSVP ont droit d'être > 300 ms
    error_budget_pct: 5.0     # 1 - 0.95
    error_budget_minutes: null # SLO de latence : budget en PART de requêtes, pas en minutes
    error_budget_requests_per_million: 50000  # 5 % de 1 M

  # ---- SLO 3 : disponibilité du fil famille (au choix) ----
  - name: family-feed-availability
    parcours: "GET /api/families/:id/feed"
    sli_type: availability
    sli_description: "part des GET feed avec status non-5xx"
    sli_promql: |
      sum(rate(http_requests_total{route="/api/families/:id/feed", status!~"5.."}[28d]))
      /
      sum(rate(http_requests_total{route="/api/families/:id/feed"}[28d]))
    measured: 0.9971
    target: 0.995             # consulté souvent mais moins critique qu'un login -> SLO + souple
    error_budget_pct: 0.5
    error_budget_minutes: 201.6 # 28*24*60*0.005
```

### `ops/slo/error-budget-policy.md`

```markdown
# Error budget policy — TribuZen
> Signée produit + dev + ops le 2026-07-06. Révisée chaque trimestre.
> S'applique par SLO, sur la fenêtre rolling 28 j.

| Budget consommé | Action |
|-----------------|--------|
| 0–50 %   | Opérations normales. Déploiements libres sur main. |
| 50–75 %  | Revue renforcée : 2 reviewers, tests de charge (module 11) sur les routes du SLO touché avant merge. |
| 75–100 % | **Gel des features.** Seuls correctifs et travaux de fiabilité mergés. Le gel est levé par l'ops quand le budget repasse < 75 %. |
| > 100 % (SLO violé) | **Sprint fiabilité.** L'équipe se recentre exclusivement sur le retour sous SLO. Le PO reporte la roadmap. Postmortem blameless (module 10). |
```

### Pourquoi ce corrigé est correct

- **SLI en ratio, point de vue utilisateur.** Chaque `sli_promql` renvoie un nombre entre 0 et 1 : bons évènements / total. Aucun n'utilise CPU/RAM (ce serait du USE, pas un SLI).
- **`status!~"5.."` et pas les 4xx.** Le login exclut seulement les 5xx : un 401 (mauvais mot de passe) est un succès du service. Compter les 4xx gonflerait de fausses violations (piège #5 du module).
- **Cible dérivée puis arrondie bas.** `measured` (lu dans Prometheus) → `target` toujours **en dessous**. Jamais 100 % : sinon error budget = 0, plus aucun droit de déployer.
- **Latency = ratio de buckets.** Pour le RSVP on écrit `_bucket{le="0.3"} / _count`, pas `histogram_quantile`. Un SLO veut « quelle part est sous le seuil ? » — directement un ratio budgétable ; le quantile reste pour les dashboards (module 02).
- **Budget chiffré et parlant.** Availability → minutes d'indispo (`28*24*60*(1-target)`). Latency → part de requêtes (les minutes n'ont pas de sens pour un seuil de latence). Le budget devient une décision, pas un affichage.
- **Fenêtre rolling multiple de semaines.** 28 j, pas 30 : même nombre de week-ends, pas de recharge calendaire.
- **Policy actionnable et signée à froid.** Chaque tranche dit *quoi* geler et *qui* décide de lever le gel — décidée avant l'incident, donc elle a autorité (piège #7).

---

## Grille d'évaluation (le coach coche)

| Critère | OK ? |
|---------|------|
| 2 SLO obligatoires (login availability + RSVP latency) + 1 au choix | ☐ |
| Chaque SLO a ses 5 éléments (SLI, PromQL, cible, fenêtre, budget) | ☐ |
| Chaque `sli_promql` testée dans Prometheus renvoie un nombre ∈ [0,1] | ☐ |
| SLI de dispo filtre `status!~"5.."` (pas les 4xx) | ☐ |
| SLI de latence = ratio de buckets (`le`), pas `histogram_quantile` | ☐ |
| Cible dérivée d'un `measured` puis arrondie **vers le bas**, jamais 100 % | ☐ |
| Fenêtre rolling en multiple de semaines, justifiée | ☐ |
| Error budget chiffré (% + minutes ou requêtes) et cohérent avec la cible | ☐ |
| Policy : 1 action **concrète** par tranche, dit quoi geler + qui décide | ☐ |
| L'apprenant sait dire, pour un budget consommé donné, s'il déploie ou pas | ☐ |

---

## Coach — conduite de session

- **Ouvre par la question du PO**, pas par le YAML : « le PO te demande si on déploie aujourd'hui, budget à 82 %. Ta réponse ? ». Si l'apprenant hésite, le concept de policy n'est pas ancré — reprends §2.8 du module.
- **Piège à provoquer :** laisse-le écrire `status=~"4..|5.."` pour la dispo, puis demande « un mauvais mot de passe, c'est une panne du service ? ». Il doit corriger seul vers `!~"5.."`.
- **Piège latency :** s'il dégaine `histogram_quantile` pour le SLI RSVP, demande « ton SLO dit *le p99 vaut X* ou *Y % sont sous le seuil* ? ». Réoriente vers le ratio de buckets.
- **Vérifie l'arrondi :** s'il arrondit `measured` vers le haut « pour être ambitieux », rappelle qu'un SLO violé dès J+3 est ignoré ensuite. La cible doit être **tenable**.
- **Ne laisse pas passer une policy molle** (« faire attention »). Exige une action mécanique : *quoi* est gelé, *qui* lève le gel.
- **Renvois de portée :** si l'apprenant part sur « à quelle vitesse le budget se vide / quelle alerte », note-le et renvoie au **module 09** (burn-rate). Ici on définit, on n'alerte pas encore.

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées. Sans rouvrir ce corrigé ni le module 08 :**

1. **En 25 minutes**, définis un SLO **de bout en bout** pour le parcours composite « ouvrir l'appli → login → charger le fil famille » : les deux services sont **en série**. Calcule le SLO composite (indice : les disponibilités des maillons en série se **multiplient**) et explique pourquoi il est forcément **plus bas** que chaque maillon.
2. Ajoute une **règle de latency budget** : sur les 80 minutes d'indispo login, combien de minutes reste-t-il si Prometheus indique que le SLI vaut 99,86 % à mi-fenêtre ? Déduis l'action de la policy.
3. **Critère de réussite :** le SLO composite est chiffré et justifié, et tu sais dire à voix haute « on déploie / on gèle » avec le budget restant.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ces livrables vivent ici :

```
tribuzen/
  ops/
    slo/
      slos.yaml               ← les 3 SLO de fondation (ce lab)
      error-budget-policy.md  ← policy signée produit+dev+ops
```

**Différences par rapport au lab :**

- Les `measured` viendront de **vraies** requêtes `[28d]` sur le Prometheus de prod, pas de valeurs d'exemple.
- Les SLI seront transformés en **recording rules** Prometheus (pré-calcul) et affichés dans un **panel Grafana** dédié « SLO & budget » (module 07) — ici on les teste à la main.
- Les **alertes burn-rate** sur ces SLO (module 09) consommeront le même `slos.yaml`. Le fichier de ce lab est la source de vérité réutilisée en aval.

**Commit cible :**
```
feat(slo): SLO de fondation TribuZen (login, rsvp, feed) + error budget policy
```
