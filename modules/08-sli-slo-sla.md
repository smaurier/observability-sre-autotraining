---
titre: SLI / SLO / SLA & error budget
cours: 16-observability-sre
notions: ["SLI (Service Level Indicator)", "SLO (Service Level Objective)", "SLA (Service Level Agreement)", "SLI en ratio (good events / valid events)", "SLI RED-based (availability, latency)", "error budget = 1 - SLO", "fenêtre rolling vs calendaire", "objectif réaliste (mesurer puis arrondir)", "error budget policy"]
outcomes:
  - sait distinguer SLI, SLO et SLA sans les confondre et dire lequel porte une conséquence contractuelle
  - sait choisir un SLI RED-based exprimé en ratio (bons évènements / évènements valides) mesurable en PromQL
  - sait fixer un objectif réaliste par mesure historique puis arrondi, et justifier pourquoi jamais 100%
  - sait calculer un error budget et écrire une error budget policy actionnable
prerequis: ["module 00 — 3 piliers logs/metrics/traces", "module 02 — métriques & PromQL (rate, histogram_quantile)", "module 03 — méthode RED", "module 07 — dashboards Grafana"]
next: 09-alerting-strategies
libs: []
tribuzen: définition des SLO de l'API TribuZen — disponibilité login, latence RSVP, error budget et policy de gel de déploiement
last-reviewed: 2026-07
---

# SLI / SLO / SLA & error budget

> **Outcomes — tu sauras FAIRE :** distinguer SLI/SLO/SLA, choisir un SLI RED-based en ratio, fixer un objectif réaliste (mesure → arrondi, jamais 100%), calculer un error budget et écrire une error budget policy.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module couvre **définir** la fiabilité — les trois sigles, l'error budget, le choix des SLI, les fenêtres, la policy. **Alerter** dessus (alerting sur symptômes, **burn-rate** multi-fenêtres, fatigue d'alerte, routing) est le **module 09 (alerting-strategies)** : quand on parle de « vitesse de consommation du budget », on pose le concept ici et on renvoie le calcul d'alerte au 09. Les métriques et PromQL de base viennent du **module 02**, la méthode RED du **module 03**.

## 1. Cas concret d'abord

Réunion TribuZen, lundi matin. Le PO demande : « est-ce que l'appli est fiable ? ». Trois réponses arrivent :

- le dev front : « ça marche chez moi » ;
- l'ops : « on a eu 2 alertes CPU cette nuit » ;
- le support : « 4 parents se sont plaints du bouton RSVP ».

Personne ne parle la même langue, et surtout **personne ne peut dire si on a le droit de déployer la nouvelle feature aujourd'hui**. C'est exactement le vide que comblent SLI, SLO et SLA : un langage commun, chiffré, du point de vue de l'utilisateur.

À la fin de ce module, la réponse à « est-ce fiable ? » sera une phrase unique et non négociable :

```
SLO login TribuZen : 99,9 % des POST /api/auth/login réussissent (status < 500),
                     mesuré sur une fenêtre rolling de 28 jours.
Error budget ce mois : 40 minutes d'indispo autorisées — il en reste 12.
→ Budget presque épuisé : on GÈLE la feature, on stabilise d'abord.
```

On construit chaque brique — le SLI qu'on mesure, l'objectif qu'on vise, le contrat éventuel, le budget qui arbitre vitesse vs fiabilité — sans deviner une seule formule.

---

## 2. Théorie complète, concise

### 2.1 Les trois sigles, une question chacun

Source : Google SRE Book, *Service Level Objectives*.

| Sigle | Nom | Question | Nature |
|-------|-----|----------|--------|
| **SLI** | Service Level **Indicator** | « Que mesure-t-on ? » | une **mesure** quantitative |
| **SLO** | Service Level **Objective** | « Quel niveau vise-t-on ? » | une **cible** interne sur ce SLI |
| **SLA** | Service Level **Agreement** | « Que se passe-t-il si on rate ? » | un **contrat** avec conséquence |

Le test de discrimination de Google, mot pour mot : *« an easy way to tell the difference between an SLO and an SLA is to ask "what happens if the SLOs aren't met?": if there is no explicit consequence, then you are almost certainly looking at an SLO »*. Pas de pénalité contractuelle ⇒ c'est un SLO, pas un SLA.

### 2.2 SLI — une mesure en ratio, du point de vue utilisateur

Un **SLI** (définition Google : *« a carefully defined quantitative measure of some aspect of the level of service »*) s'exprime presque toujours comme un **ratio d'évènements** :

```
SLI = évènements « bons » / évènements valides        (résultat entre 0 et 1)
```

Deux propriétés non négociables :

- **du point de vue utilisateur**, pas de la machine. Règle Google : *« start by thinking about what your users care about, not what you can measure »*. Le CPU à 80 % n'est **pas** un SLI (l'utilisateur ne le ressent pas) ; c'est un signal USE (module 03) utile pour diagnostiquer, pas pour définir la fiabilité.
- **borné 0–1** (un pourcentage). Ce format rend l'error budget calculable et l'outillage uniforme.

### 2.3 Choisir les SLI : RED-based, deux suffisent pour démarrer

Pour un service requête/réponse comme l'API TribuZen, on tire les SLI de la méthode **RED** (Rate/Errors/Duration, module 03). Les deux SLI canoniques du SRE Workbook :

**Availability** — proportion de requêtes qui réussissent (status non-5xx) :

```promql
# SLI disponibilité sur 28 jours (bons = status non 5xx / total)
sum(rate(http_requests_total{job="tribuzen-api", status!~"5.."}[28d]))
/
sum(rate(http_requests_total{job="tribuzen-api"}[28d]))
```

**Latency** — proportion de requêtes servies sous un seuil. On l'exprime en **ratio de buckets**, pas en quantile brut : « quelle part des requêtes est ≤ 300 ms ? ».

```promql
# SLI latence sur 28 jours : part des requêtes ≤ 300 ms
sum(rate(http_request_duration_seconds_bucket{job="tribuzen-api", le="0.3"}[28d]))
/
sum(rate(http_request_duration_seconds_count{job="tribuzen-api"}[28d]))
```

> Note : pour un **SLI de latence**, le ratio de buckets (`le="0.3"` / count) est préférable à `histogram_quantile(...)`. Un quantile te donne « le p99 vaut X ms » ; un SLO veut « Y % des requêtes sont sous le seuil » — c'est directement un ratio bon/total, agrégeable et budgétable. On garde `histogram_quantile` (module 02) pour les dashboards, le ratio de buckets pour les SLO.

**Conseil Google : commence avec peu de SLI.** Une disponibilité + une latence par parcours critique suffisent. Trop de SLI = personne ne les regarde.

### 2.4 SLO — la cible, fixée par la mesure puis l'arrondi

Un **SLO** est une cible sur un SLI, sur une fenêtre : `SLI >= cible sur N jours`. On ne l'invente **pas** au doigt mouillé. Procédure du SRE Workbook :

1. **mesure l'existant** sur une période historique (ex. le SLI a valu 99,73 % sur 3 mois) ;
2. **arrondis vers le bas** à un chiffre gérable (99,73 % → **99,5 %**) — surtout pas vers le haut ;
3. **valide que l'équipe peut le tenir** « sans toil excessif » ;
4. **fais valider par le produit** que ce niveau satisfait l'utilisateur.

**Jamais 100 %.** Wording Google : viser 100 % est *« unrealistic and undesirable »* — ça tue le rythme de déploiement et coûte une fortune. Même les services les plus critiques de Google visent 99,99 %, pas 100 %. Un SLO à 100 % signifie « interdit de déployer », car tout changement porte un risque.

**Vanity SLO à éviter :** un SLO que tu ne risques jamais de violer (99 % alors que tu tournes à 99,99 %) est inutile — il n'arbitre rien.

### 2.5 Fenêtre : rolling plutôt que calendaire

L'objectif se mesure sur une **fenêtre glissante** (rolling), pas sur le mois calendaire.

- **Rolling (recommandée)** — les 28 derniers jours en continu. Choisis un **multiple entier de semaines** (28 j, pas 30) pour garder le même nombre de week-ends dans chaque fenêtre. Colle au vécu utilisateur : la satisfaction ne « se remet pas à zéro » le 1er du mois.
- **Calendaire** — pratique pour aligner sur des cycles business/reporting, mais elle crée un effet pervers : le budget se recharge le 1er, ce qui encourage la prise de risque en fin de mois.

### 2.6 SLA — le contrat, plus souple que le SLO

Un **SLA** ajoute une **conséquence** (souvent financière : avoirs, pénalités) au non-respect. TribuZen n'a probablement pas de SLA client au lancement — c'est un produit, pas une prestation contractuelle. Mais dès qu'un client B2B signe « 99,9 % ou remboursement », c'est un SLA.

**Règle d'or :** le SLO interne est **toujours plus strict** que le SLA externe. SLA promis à 99,9 % ⇒ SLO interne à 99,95 %. La marge entre les deux, c'est ton filet : tu déclenches tes actions internes **avant** de violer le contrat.

### 2.7 Error budget — le cœur du dispositif

L'**error budget** est la dose d'échec que tu as le **droit** de dépenser avant de violer ton SLO :

```
Error budget = 1 - SLO
```

Un budget à 99,9 % / 28 j se traduit en unités concrètes :

| SLO | Error budget | Indispo autorisée / 28 j | Requêtes échouées / 1 M |
|-----|--------------|--------------------------|--------------------------|
| 99 % | 1 % | ~6 h 43 min | 10 000 |
| 99,5 % | 0,5 % | ~3 h 22 min | 5 000 |
| 99,9 % | 0,1 % | ~40 min | 1 000 |
| 99,95 % | 0,05 % | ~20 min | 500 |
| 99,99 % | 0,01 % | ~4 min | 100 |

(Minutes = `28 × 24 × 60 × (1 - SLO)`. Requêtes = `total × (1 - SLO)`.)

**Analogie du portefeuille :** chaque incident dépense une part du budget mensuel. Tant qu'il reste du budget, l'équipe déploie librement (le budget *sert* à ça : autoriser le risque). Portefeuille vide ⇒ on arrête de dépenser.

Le budget restant se lit en PromQL (1 = plein, 0 = épuisé) :

```promql
# fraction d'error budget restante pour un SLO de 99,9 %
1 - (
  (1 - (
    sum(rate(http_requests_total{job="tribuzen-api", status!~"5.."}[28d]))
    /
    sum(rate(http_requests_total{job="tribuzen-api"}[28d]))
  ))
  / (1 - 0.999)   # 0.999 = SLO target
)
```

> La **vitesse** à laquelle ce budget se vide (burn-rate) et les alertes multi-fenêtres qui en découlent sont le **module 09**. Ici on définit le budget ; là-bas on alerte dessus.

### 2.8 Error budget policy — l'accord écrit

Le budget ne sert à rien s'il ne **déclenche pas d'action**. Une **error budget policy** est un document, **signé par produit + dev + ops avant tout incident**, qui dit quoi faire selon la consommation :

| Budget consommé | Action |
|-----------------|--------|
| 0–50 % | Opérations normales — déploiements libres |
| 50–75 % | Revue renforcée — plus de tests, revue de code plus stricte |
| 75–100 % | **Gel des features** — seuls correctifs et travaux de fiabilité |
| > 100 % (SLO violé) | **Sprint fiabilité** — l'équipe se recentre jusqu'au retour sous SLO |

Le point politique (SRE Workbook) : *tous les stakeholders doivent être d'accord que la policy est applicable* **avant** d'en avoir besoin. Décidée à froid, elle protège l'ingénieur ; décidée en pleine crise, elle est ignorée.

---

## 3. Worked examples

### Exemple 1 — définir le SLO de disponibilité du login TribuZen

Contexte : le login est le point d'entrée. S'il tombe, plus personne n'entre. On veut un SLO de disponibilité.

**Étape 1 — le SLI (ratio, RED-based).** Bons évènements = `POST /api/auth/login` avec status < 500. Évènements valides = tous les `POST /api/auth/login`.

```promql
sum(rate(http_requests_total{route="/api/auth/login", status!~"5.."}[28d]))
/
sum(rate(http_requests_total{route="/api/auth/login"}[28d]))
```

Note : un 401 (mauvais mot de passe) est un **succès du service** — l'API a fait son travail. On exclut donc seulement les 5xx, pas les 4xx.

**Étape 2 — mesurer l'existant.** Sur 90 jours d'historique, ce ratio vaut **99,87 %**.

**Étape 3 — arrondir vers le bas.** 99,87 % → **SLO = 99,8 %** sur 28 jours rolling. Tenable, avec une marge réelle.

**Étape 4 — error budget.**

```
budget       = 1 - 0,998 = 0,002 = 0,2 %
indispo/28 j = 28 × 24 × 60 × 0,002 ≈ 80,6 minutes
```

**Résultat — la fiche SLO :**

```
SLO  : disponibilité login ≥ 99,8 % sur 28 jours rolling
SLI  : POST /api/auth/login status non-5xx / total POST /api/auth/login
Budget : 0,2 % ≈ 80 min d'indispo autorisées par fenêtre de 28 jours
```

### Exemple 2 — SLO de latence RSVP + décision de déploiement

Le RSVP est l'action métier clé (cf. modules 02/03). On veut qu'il soit **rapide**.

**SLI de latence** — part des RSVP servis sous 300 ms :

```promql
sum(rate(http_request_duration_seconds_bucket{route="/api/events/:id/rsvp", le="0.3"}[28d]))
/
sum(rate(http_request_duration_seconds_count{route="/api/events/:id/rsvp"}[28d]))
```

Mesure historique : 96,4 % des RSVP sont sous 300 ms → **SLO = 95 %** sur 28 j (arrondi bas). Error budget = 5 % de requêtes autorisées **au-dessus** de 300 ms.

**Décision de déploiement.** Milieu de fenêtre, le dashboard montre : SLI latence à 95,3 %, budget consommé à **82 %**. La feature « rappel automatique » est prête.

Application de la policy (§2.8) : 82 % ⇒ tranche **75–100 % = gel des features**. On **ne déploie pas** la feature ; on investigue d'abord pourquoi la latence dérive (base ? appel externe ?). Ce n'est pas une punition : c'est l'error budget qui **arbitre objectivement** vitesse vs fiabilité, sans débat d'opinion en réunion.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — confondre SLO et SLA

Le SLO est une cible **interne** (conséquence = actions d'équipe) ; le SLA est un **contrat externe** (conséquence = pénalité). Test infaillible : « que se passe-t-il si on rate ? ». Pas de pénalité contractuelle ⇒ SLO. Corollaire : le SLO interne doit être **plus strict** que le SLA, jamais l'inverse.

### PIÈGE #2 — prendre une métrique système pour un SLI

`CPU`, `RAM`, `nb de threads` ne sont **pas** des SLI : l'utilisateur ne les ressent pas. Ce sont des signaux USE de diagnostic (module 03). Un SLI se mesure **du point de vue de l'utilisateur** : requêtes réussies, latence perçue. Un CPU à 90 % avec des réponses rapides = SLO vert.

### PIÈGE #3 — viser 100 %

100 % est *unrealistic and undesirable* (Google) : ça interdit de facto tout déploiement et coûte une fortune en sur-ingénierie. L'error budget = `1 - SLO` serait nul → aucune marge pour innover. On vise 99,x %, jamais 100 %.

### PIÈGE #4 — inventer le chiffre au lieu de le mesurer

« On met 99,99 %, ça fait sérieux » sans jamais avoir mesuré l'existant = SLO irréaliste, violé dès la première semaine, puis ignoré. La cible se **dérive de la mesure historique arrondie vers le bas**, et se valide avec le produit.

### PIÈGE #5 — le 4xx compté comme échec de disponibilité

Un `400`/`401`/`404` est en général un **succès du service** : l'API a correctement rejeté une requête invalide ou refusé un mauvais mot de passe. Compter les 4xx comme des erreurs de dispo pollue le SLI et déclenche de fausses violations. On filtre `status!~"5.."` (les 5xx), pas `status=~"4..|5.."`. (Exception à trancher avec le produit : un 429 chronique peut être un vrai signal de dégradation.)

### PIÈGE #6 — fenêtre calendaire et budget qui « se recharge »

Une fenêtre par mois calendaire remet le budget à zéro le 1er → incitation à prendre des risques fin de mois « puisque ça repart demain ». La fenêtre **rolling** (multiple de semaines, ex. 28 j) supprime l'effet de bord et colle au vécu utilisateur.

### PIÈGE #7 — une policy écrite après l'incident

Une error budget policy décidée **pendant** la crise est ignorée (« juste ce déploiement, c'est urgent »). Elle doit être signée à froid par produit + dev + ops **avant**, sinon elle n'a aucune autorité.

---

## 5. Ancrage TribuZen

Les SLO sont la **couche de contrat de fiabilité** de TribuZen : ils s'appuient sur les métriques posées au module 02 (`http_requests_total`, `http_request_duration_seconds`) et alimentent les alertes du module 09.

Les trois SLO de départ de TribuZen (peu, ciblés sur les parcours critiques) :

| Parcours | Type SLI | SLO | Fenêtre | Pourquoi ce SLO |
|----------|----------|-----|---------|-----------------|
| Login (`/api/auth/login`) | Availability | 99,8 % status non-5xx | 28 j rolling | porte d'entrée : s'il tombe, personne n'entre |
| RSVP (`/api/events/:id/rsvp`) | Latency | 95 % ≤ 300 ms | 28 j rolling | action métier clé, la lenteur fait fuir |
| Fil famille (`GET /api/families/:id/feed`) | Availability | 99,5 % status non-5xx | 28 j rolling | consulté souvent, moins critique qu'un login |

Emplacement cible dans `smaurier/tribuzen` :

```
tribuzen/
  ops/
    slo/
      slos.yaml              ← définition déclarative des 3 SLO (nom, SLI PromQL, cible, fenêtre)
      error-budget-policy.md ← policy signée produit+dev+ops (tranches 50/75/100 %)
  src/
    observability/
      metrics.ts             ← http_requests_total, http_request_duration_seconds (module 02)
```

Le `error-budget-policy.md` n'est pas un artefact technique : c'est un **accord d'équipe** qui rend la décision « on déploie ou pas ? » automatique et dépassionnée. C'est le livrable qui transforme les métriques en gouvernance.

> Alerter sur ces SLO (burn-rate multi-fenêtres, routing, anti-fatigue) est le **module 09**. Le dashboard qui affiche budget restant et SLI est un panel Grafana (module 07).

---

## 6. Points clés

1. **SLI** = ce qu'on mesure (ratio bons/valides, 0–1) ; **SLO** = la cible visée ; **SLA** = le contrat avec conséquence. Test SLO vs SLA : « que se passe-t-il si on rate ? ».
2. Un SLI se mesure **du point de vue utilisateur** (requêtes, latence perçue), jamais via une métrique système (CPU, RAM).
3. SLI RED-based canoniques d'un service requête/réponse : **availability** (non-5xx / total) et **latency** (part ≤ seuil, ratio de buckets `le`).
4. Un SLO se **dérive de la mesure historique arrondie vers le bas**, pas d'un chiffre inventé. **Jamais 100 %** (unrealistic and undesirable).
5. Fenêtre **rolling** en multiple de semaines (ex. 28 j), pas calendaire — évite le budget qui se recharge le 1er.
6. Le SLO interne est **toujours plus strict** que le SLA externe (marge = filet de sécurité).
7. **Error budget = 1 - SLO** ; il se convertit en minutes d'indispo et en requêtes échouées autorisées. Il *sert* à autoriser le risque.
8. Une **error budget policy** (50 % revue / 75 % gel features / 100 % sprint fiabilité) doit être signée à froid par produit+dev+ops.
9. Le 4xx est un succès du service : on filtre `status!~"5.."`, pas les 4xx.

---

## 7. Seeds Anki

```
Quelle question distingue un SLO d'un SLA ?|« Que se passe-t-il si on ne l'atteint pas ? » Pas de conséquence contractuelle (pénalité) => c'est un SLO (cible interne). Une conséquence explicite (avoir, pénalité) => c'est un SLA (contrat externe).
Quelle est la formule générique d'un SLI ?|SLI = évènements « bons » / évènements valides, résultat entre 0 et 1 (un pourcentage). Mesuré du point de vue utilisateur, jamais via une métrique système (CPU, RAM).
Quels deux SLI RED-based pour démarrer sur un service requête/réponse ?|Availability = requêtes non-5xx / total (sum(rate(...{status!~"5.."}[28d])) / sum(rate(...[28d]))). Latency = part des requêtes ≤ seuil via ratio de buckets (sum(rate(..._bucket{le="0.3"}[28d])) / sum(rate(..._count[28d]))).
Comment fixe-t-on un objectif de SLO, et pourquoi jamais 100 % ?|On mesure l'existant sur un historique, on arrondit vers le BAS (ex. 99,73 % -> 99,5 %), on valide que l'équipe tient sans toil et que le produit est OK. Jamais 100 % : unrealistic and undesirable (Google) — ça interdit tout déploiement et error budget = 0.
Qu'est-ce qu'un error budget et comment se calcule-t-il ?|Error budget = 1 - SLO : la dose d'échec autorisée avant de violer le SLO. 99,9 % / 28 j ≈ 40 min d'indispo ou 1000 requêtes échouées / million. Il SERT à autoriser le risque : plein => on déploie, vide => on gèle.
Pourquoi une fenêtre rolling plutôt que calendaire ?|La calendaire remet le budget à zéro le 1er du mois => incite à prendre des risques en fin de mois. La rolling (multiple de semaines, ex. 28 j) colle au vécu utilisateur (la satisfaction ne se remet pas à zéro) et supprime cet effet de bord.
Qu'est-ce qu'une error budget policy et quand la décide-t-on ?|Un document signé par produit+dev+ops AVANT tout incident, qui dit quoi faire selon la consommation : ~50 % revue renforcée, ~75 % gel des features, >100 % sprint fiabilité. Décidée à froid elle a autorité ; décidée en crise elle est ignorée.
Un status 401 (mauvais mot de passe) compte-t-il comme un échec de disponibilité ?|Non. Un 4xx est en général un succès du service (l'API a correctement rejeté). On filtre status!~"5.." pour le SLI de dispo, pas les 4xx. Les compter comme erreurs déclenche de fausses violations de SLO.
Relation entre SLO interne et SLA externe ?|Le SLO interne est TOUJOURS plus strict que le SLA. SLA à 99,9 % => SLO à 99,95 %. La marge est un filet : on déclenche les actions internes avant de violer le contrat.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-08-sli-slo-sla/README.md`. Définir 2–3 SLO réels de TribuZen (SLI en PromQL, cible dérivée d'une mesure, error budget chiffré, error budget policy) — grille d'évaluation, coach en session, variante J+30.
