---
titre: FinOps de l'observabilité et feature flags observés
cours: 16-observability-sre
notions: ["logs = volume (driver de coût)", "métriques = cardinalité (driver de coût)", "traces = spans × sampling (driver de coût)", "ingestion / stockage / rétention / requête", "sampling budget : head-based vs tail-based", "rétention tiered (hot / warm / cold)", "drop à la source (OTel Collector)", "FinOps de l'obs : budget & quota par équipe", "meta-observabilité (observer le coût de l'obs)", "règle des 90 % (données jamais lues)", "feature flag (découplage deploy / release)", "OpenFeature (@openfeature/server-sdk)", "flag observé : feature_flag.key / result.variant", "corréler flag → métrique", "kill switch relié aux métriques"]
outcomes:
  - sait décomposer la facture d'observabilité par pilier (logs = volume, métriques = cardinalité, traces = spans × sampling) et nommer le driver de coût dominant de chacun
  - sait réduire le coût d'obs sans perdre le signal — sampling budget, rétention tiered, drop à la source, agrégation de labels
  - sait poser une gouvernance FinOps de l'observabilité — budget/quota par équipe et meta-observabilité du coût
  - sait instrumenter un feature flag observable en taguant chaque trace/métrique avec le flag, puis corréler flag → métrique
  - sait implémenter un kill switch relié aux métriques pour un rollback en secondes
prerequis: ["modules 00 à 17 du cours (3 piliers, logs, métriques & cardinalité, tracing, OTel, SLO, alerting)", "module 02 — métriques, labels & cardinalité", "module 04 — sampling de traces (head-based)", "module 08 — SLI/SLO & error budget", "module 09 — alerting (burn-rate)"]
next: 19-rgpd-observabilite
libs: []
tribuzen: maîtriser le coût d'observabilité de TribuZen — budgéter cardinalité/volume/sampling par pilier et instrumenter le feature flag « feed intelligent » pour corréler flag → métrique et brancher un kill switch
last-reviewed: 2026-07
---

# FinOps de l'observabilité et feature flags observés

> **Outcomes — tu sauras FAIRE :** décomposer la facture d'obs par pilier et nommer le driver de coût, réduire le coût sans perdre le signal (sampling budget, rétention tiered, drop à la source), poser une gouvernance FinOps (budget/quota + meta-observabilité), instrumenter un feature flag observable et corréler flag → métrique, brancher un kill switch relié aux métriques.
> **Difficulté :** :star::star::star::star:
>
> **Portée :** ce module relie deux sujets qui se rejoignent en prod — le **coût** de l'observabilité (FinOps) et les **feature flags observés**. Les bases de cardinalité viennent du **module 02**, le sampling head-based du **module 04**, l'error budget du **module 08** et le burn-rate du **module 09** ; on les réutilise, on ne les réintroduit pas. Le **RGPD** des données d'obs (PII, minimisation) est le **module 19** — ici on parle euros et signal, pas conformité.

## 1. Cas concret d'abord

Lundi matin, le CTO de TribuZen te transfère la facture **Grafana Cloud** : elle a **triplé** en un mois, sans pic de trafic. En parallèle, l'équipe produit veut activer le nouveau **« feed intelligent »** (un tri des évènements familiaux par pertinence) mais personne n'ose : la dernière fois qu'on a poussé une feature d'un coup, elle a fait grimper la latence et il a fallu 20 min de pipeline CI/CD pour revenir en arrière.

Tu ouvres le détail de la facture et tu remontes trois causes, une par pilier :

```
Logs      : +1 200 $/mois → un dev a laissé logger.debug() dans la boucle du feed (INFO → DEBUG = ×15 le volume)
Métriques : +900 $/mois   → une métrique feed_score{user_id="..."} → une série PAR utilisateur (bombe de cardinalité)
Traces    : +1 500 $/mois → le feed est tracé à 100 %, sans sampling, 30 spans/requête
```

Le même mois, deux problèmes se répondent : **la facture d'obs explose** (FinOps) et **on ne sait pas déployer le feed sans risque** (feature flags). Ce module traite les deux, parce qu'en prod ils arrivent ensemble : la feature qu'on veut lancer prudemment est *aussi* celle qui coûte le plus cher à observer.

À la fin, tu sauras (a) budgéter le coût d'obs de TribuZen par pilier et le faire baisser sans devenir aveugle, et (b) mettre le feed **derrière un feature flag observable** — chaque trace taguée `feature_flag.key="smart-feed"`, une PromQL qui compare le groupe *flag on* au groupe *flag off*, et un **kill switch** qui coupe la feature en une seconde si la latence dérape.

---

## 2. Théorie complète, concise

### 2.1 Le paradoxe : plus tu observes, plus ça coûte

L'observabilité est une **assurance**. Trop peu : l'incident arrive et tu n'as pas les données pour le diagnostiquer, le MTTR explose. Trop : tu collectes tout, à la granularité maximale, avec 2 ans de rétention, et la facture mensuelle pourrait financer un ingénieur. La bonne dose : **du détail sur les données critiques, un échantillon sur le reste.**

Un repère qui revient dans l'industrie : **~90 % des données d'obs collectées ne sont jamais relues.** Pour chaque euro dépensé, une grosse part finance des données qui dorment dans un stockage cher. Le FinOps de l'obs, c'est trouver le **bon niveau de couverture par type de donnée** — pas maximiser, pas rogner à l'aveugle.

La facture se décompose en postes, quel que soit le fournisseur :

| Poste | Ce que tu paies | Part typique |
|-------|-----------------|--------------|
| **Ingestion** | recevoir + parser (logs, métriques, traces) | 30–40 % |
| **Stockage / indexation** | écrire et indexer | 20–30 % |
| **Requête** | rechercher, agréger | 15–25 % |
| **Rétention** | garder au-delà du minimum | 10–20 % |

> Les **prix** exacts par fournisseur (Datadog, Grafana Cloud, Elastic…) changent souvent. Retiens les **drivers** et les **ordres de grandeur**, pas un tarif au centime — vérifie toujours la grille officielle à jour. <!-- FLAG-DOC: tarifs cloud volatils, ne pas figer un prix -->

### 2.2 Le driver de coût est DIFFÉRENT pour chaque pilier

C'est l'idée centrale du module. On ne réduit pas les trois piliers de la même façon parce qu'ils ne coûtent pas pour la même raison.

**Logs → le VOLUME (Go ingérés).**

```
Coût logs ≈ Volume (Go/jour) × 30 × Prix par Go
```

Le multiplicateur qui tue, c'est le **niveau de log**. Passer de `INFO` à `DEBUG` multiplie le volume par **10 à 20**. Un `logger.debug()` oublié dans une boucle chaude (le feed du cas concret) suffit à ajouter des milliers d'euros par mois — c'est un robinet ouvert.

**Métriques → la CARDINALITÉ (nombre de séries).** Rappel du module 02 : chaque combinaison unique de labels = **une série** stockée et facturée. Le coût est proportionnel au nombre de séries **actives**, pas au nombre de métriques déclarées. L'explosion est **combinatoire** :

```
feed_score{route=10, status=5, method=4}              → 200 séries        (sain)
feed_score{route=10, status=5, method=4, pod=50}      → 10 000 séries     (k8s, ça monte)
feed_score{route=10, status=5, method=4, user_id=1e5} → 20 000 000 séries (bombe → OOM + facture)
```

Un `user_id`, une URL brute, un `session_id` en label = cardinalité illimitée. Ça va dans un **log**, jamais dans un label.

**Traces → le VOLUME de SPANS × la taille des spans.**

```
Coût traces ≈ spans/jour × taille moyenne d'un span × 30 × Prix par Go
```

Une requête dans un système distribué génère 20 à 100 spans ; avec des attributs riches (headers, paramètres, résultats SQL) un span pèse 1 à 5 Ko. Le levier n°1 ici est le **sampling** (§2.4).

### 2.3 Réduire le coût des LOGS sans devenir aveugle

- **Niveau dynamique** : rester en `INFO` en régime normal, basculer un module en `DEBUG` **temporairement** (surcharge à durée de vie, ex. 30 min max) pendant un incident, puis revenir. Sans redéploiement.
- **Log sampling** : pour un évènement à très haute fréquence, n'enregistrer qu'1 sur N — **mais jamais sur les erreurs** (une erreur = toujours loggée).
- **Drop à la source** (le plus efficace) : filtrer **avant** le backend payant, dans l'**OTel Collector**. On jette les health checks, les `DEBUG` en prod, et on tronque les gros attributs :

```yaml
# otel-collector-config.yaml — filtrer les logs AVANT l'ingestion payante
processors:
  filter/drop-noise:
    logs:
      exclude:
        match_type: regexp
        bodies: [".*GET /health.*", ".*GET /metrics.*"]
  filter/drop-debug:
    logs:
      exclude:
        match_type: strict
        severity_texts: ["DEBUG", "TRACE"]
service:
  pipelines:
    logs:
      receivers: [otlp]
      processors: [filter/drop-noise, filter/drop-debug]
      exporters: [loki]
```

### 2.4 Réduire le coût des TRACES : le sampling budget

Le **sampling** est le levier le plus puissant sur les traces. Deux familles (rappel/approfondissement du module 04) :

| Stratégie | Décision prise | Force | Limite |
|-----------|----------------|-------|--------|
| **Head-based** | au **début** de la trace, 1er service | simple, faible overhead | décide *avant* de connaître le résultat → peut rater les erreurs |
| **Tail-based** | à la **fin**, une fois tous les spans vus | garde 100 % des erreurs et des requêtes lentes | nécessite un Collector central + buffer mémoire |

L'idée du **sampling budget** : tu ne gardes pas un pourcentage uniforme, tu **dépenses ton budget de traces là où il a de la valeur**. Politique tail-based typique :

```yaml
# otel-collector-config.yaml — tail_sampling : garder ce qui sert au debug
processors:
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: keep-errors            # 100 % des erreurs
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: keep-slow              # 100 % des requêtes > 2 s
        type: latency
        latency: { threshold_ms: 2000 }
      - name: baseline               # 1 % du trafic nominal
        type: probabilistic
        probabilistic: { sampling_percentage: 1 }
```

Résultat : tu passes de 100 % à ~2–5 % de traces conservées (−95 % de coût) **tout en gardant 100 % des erreurs et des lenteurs** — la capacité de debug reste quasi intacte. Un head-based uniforme à 10 %, lui, jette 90 % des erreurs : moins cher mais aveugle.

### 2.5 Réduire le coût des MÉTRIQUES : cardinalité, downsampling, recording rules

- **Agréger les labels à haute cardinalité** : remplacer `user_id` (10⁵ valeurs) par `user_tier` (`free`/`premium`/`enterprise`, 3 valeurs) ; templatiser les routes (`/api/events/:id/rsvp`, module 02).
- **Auditer les métriques inutilisées** : une série qui n'apparaît dans **aucun** dashboard, **aucune** alerte, **aucune** recording rule est du coût pur. On la supprime.
- **Downsampling temporel** : garder 15 s de résolution sur les données récentes, agréger à 5 min / 1 h sur les anciennes (personne ne debugge à la seconde une donnée d'il y a 3 mois).
- **Recording rules** : pré-calculer les agrégats coûteux pour requêter des séries légères et, à terme, jeter la métrique brute à haute cardinalité.

### 2.6 Rétention tiered : toutes les données ne valent pas le même stockage

Une donnée d'obs perd de la valeur avec l'âge. On la fait **descendre en tiers** de stockage de moins en moins cher :

| Tier | Âge | Stockage | Accès | Coût relatif |
|------|-----|----------|-------|--------------|
| **Hot** | 0–7 j | SSD indexé | temps réel | élevé |
| **Warm** | 7–30 j | HDD indexé | requêtes lentes OK | moyen |
| **Cold** | 30–90 j | object storage (S3) | batch | faible |
| **Archive** | 90 j–1 an | Glacier | restauration en heures | très faible |
| **Delete** | > 1 an | supprimé | — | zéro |

Passer de « tout en hot 1 an » à cette politique tiered coupe le coût de stockage de **80–90 %** sans rien perdre d'exploitable.

### 2.7 Gouvernance FinOps : budget, quota, meta-observabilité

Réduire une fois ne suffit pas : sans garde-fous, le coût redérive au prochain `logger.debug()` oublié. Trois pratiques :

- **Budget + quota par équipe/service** : chaque équipe a un plafond (Go de logs/jour, séries de métriques, spans/jour). Ça **responsabilise** : le coût d'obs devient le problème de l'équipe qui le génère.
- **Meta-observabilité** : tu **observes le coût de l'observabilité elle-même**. Une alerte sur le volume de logs, une sur la cardinalité :

```yaml
# prometheus — alerter sur le coût de l'obs (meta-observabilité)
groups:
  - name: observability-cost
    rules:
      - alert: MetricCardinalityExplosion
        expr: prometheus_tsdb_head_series > 500000
        for: 15m
        labels: { severity: critical }
        annotations:
          summary: "Cardinalité > 500k séries — risque de crash Prometheus"
          description: "Séries actives : {{ $value }}."
```

- **Rollout progressif de l'obs** (*phased rollout*) : ne déploie pas les 3 piliers d'un coup. Phase 1 métriques RED + SLO ; phase 2 logs `INFO` corrélés ; phase 3 traces échantillonnées sur les services critiques. On paie au rythme du besoin réel.

### 2.8 Feature flags : découpler *déployer* de *release*

Un **feature flag** (ou toggle) active/désactive une fonctionnalité **sans redéployer**. Il découple le **déploiement** (le code est en prod) du **release** (la feature est visible) :

```
Sans flag : Deploy = Release          Avec flag : Deploy ≠ Release
  rollback = re-déploiement (min)        rollback = toggle off (secondes)
  branches longues                       trunk-based, on déploie souvent
```

Types courants : *release toggle* (temporaire, on/off d'une feature), *experiment* (A/B test), *ops toggle* (long terme, ex. kill switch), *permission* (feature premium).

**OpenFeature** est le standard **CNCF** qui unifie l'API des flags — tu changes de fournisseur (LaunchDarkly, Unleash, Flagsmith, flagd…) sans toucher le code applicatif. Vérifié docs OpenFeature (`@openfeature/server-sdk`) :

```ts
import { OpenFeature } from '@openfeature/server-sdk'

// setProviderAndWait : le provider est prêt avant toute évaluation (registre un seul provider actif)
await OpenFeature.setProviderAndWait(myProvider)
const client = OpenFeature.getClient()

// getBooleanValue(clé, valeurParDéfaut, contexte) → en cas d'erreur d'éval, retourne la valeur par défaut
const smartFeed = await client.getBooleanValue('smart-feed', false, { targetingKey: userId })
```

Point clé de fiabilité : **la valeur par défaut est le comportement de repli.** Si le service de flags est injoignable, `getBooleanValue` renvoie le défaut — le code derrière le flag doit donc avoir un **fallback** testé (chemin *flag off* aussi solide que *flag on*).

### 2.9 Le flag OBSERVÉ : corréler flag → métrique

Un flag qu'on ne mesure pas ne sert qu'à moitié. Le rendre **observable** = tagguer chaque signal de télémétrie avec l'état du flag, pour pouvoir **comparer** le groupe exposé au groupe témoin.

OpenTelemetry définit des **conventions sémantiques** dédiées (statut *development*, vérifié registre semconv OTel). Attributs exacts à ne pas inventer :

| Attribut | Type | Rôle |
|----------|------|------|
| `feature_flag.key` | string | la clé du flag évalué (ex. `"smart-feed"`) |
| `feature_flag.result.variant` | string | identifiant de la variante — **à préférer** à la valeur brute |
| `feature_flag.result.value` | any | la valeur évaluée (peut être grosse ou sensible → préférer `variant`) |
| `feature_flag.provider.name` | string | le fournisseur de flags |
| `feature_flag.result.reason` | string | comment la valeur a été décidée (`targeting_match`, `default`, `error`…) |

```ts
// à l'évaluation du flag, on tague la trace courante (semconv OTel)
import { trace } from '@opentelemetry/api'
const span = trace.getActiveSpan()
span?.setAttribute('feature_flag.key', 'smart-feed')
span?.setAttribute('feature_flag.result.variant', smartFeed ? 'on' : 'off')
```

Côté métriques, on ajoute un label **faible cardinalité** `variant="on|off"` (jamais l'`user_id`). La comparaison devient une PromQL directe — p99 du groupe *on* vs *off* :

```promql
histogram_quantile(0.99,
  sum by (variant, le) (rate(http_request_duration_seconds_bucket{route="/api/feed"}[5m]))
)
```

Si le `variant="on"` a un p99 nettement supérieur au `variant="off"`, le feed intelligent dégrade la latence : décision de rollout **fondée sur une mesure**, pas sur une intuition.

### 2.10 Kill switch : le flag relié aux métriques

Un **kill switch** est un *ops toggle* conçu pour **désactiver instantanément** une feature en cas de problème, sans déploiement. Branché sur l'observabilité, il devient **automatique** : si une métrique de santé franchit un seuil, on coupe le flag et on alerte.

```
MTTR avec kill switch      : < 1 min   (toggle off)
MTTR avec rollback CI/CD   : 5–15 min  (rebuild + redeploy)
```

Le principe : lier le seuil (ex. burn-rate d'error budget du module 09) à la désactivation du flag, avec **fail-safe** (en cas de doute ou d'erreur d'évaluation, on désactive). On y revient en worked example.

---

## 3. Worked examples

### Exemple 1 — chiffrer les trois causes de la facture TribuZen

On reprend le cas concret et on met un montant sur chaque pilier, pour prioriser. Un petit calcul reproductible (pas de magie, juste les formules du §2.2) :

```ts
// finops-estimate.ts — ordres de grandeur, pas une facture exacte
const GIB = 1024 ** 3

// --- LOGS : le passage INFO → DEBUG sur le feed ---
function logGbPerMonth(rps: number, linesPerReq: number, bytesPerLine: number): number {
  return (rps * linesPerReq * bytesPerLine * 86400 * 30) / GIB
}
const logsInfo  = logGbPerMonth(200, 2, 500)   // régime normal
const logsDebug = logGbPerMonth(200, 15, 800)  // debug laissé dans la boucle du feed
console.log(`Logs INFO  : ${logsInfo.toFixed(0)} Go/mois`)   // ~5 Go
console.log(`Logs DEBUG : ${logsDebug.toFixed(0)} Go/mois`)  // ~62 Go → ×12, la fuite

// --- MÉTRIQUES : la cardinalité de feed_score ---
const cardinality = (labels: number[]) => labels.reduce((a, b) => a * b, 1)
console.log(`Sain (route×status×method) : ${cardinality([10, 5, 4])} séries`)       // 200
console.log(`Avec user_id (1e5)         : ${cardinality([10, 5, 4, 100000])} séries`) // 20 000 000

// --- TRACES : l'effet du sampling ---
function traceGbPerMonth(rps: number, spansPerReq: number, bytesPerSpan: number, sample: number): number {
  return (rps * spansPerReq * sample * 86400 * bytesPerSpan * 30) / GIB
}
console.log(`Traces 100 %     : ${traceGbPerMonth(200, 30, 1024, 1).toFixed(0)} Go/mois`)
console.log(`Traces tail ~3 % : ${traceGbPerMonth(200, 30, 1024, 0.03).toFixed(0)} Go/mois`) // −97 %
```

Lecture : les trois leviers sont **retirer le DEBUG** (logs ÷12), **retirer `user_id` du label** (cardinalité 20 M → 200), **échantillonner les traces** (−97 %). On règle les trois causes sans perdre le signal utile — les erreurs et les requêtes lentes restent tracées à 100 %.

### Exemple 2 — un kill switch relié aux métriques

Le feed intelligent est derrière `smart-feed`. On l'auto-désactive si son taux d'erreur dépasse un seuil, en **fail-safe**.

```ts
// kill-switch.ts
import { OpenFeature } from '@openfeature/server-sdk'

interface Health { errorRate: number } // ex. issu d'une PromQL sur variant="on"

const client = OpenFeature.getClient()

async function feedEnabled(userId: string, health: Health): Promise<boolean> {
  try {
    // 1) le flag est-il activé ? (défaut false = fallback sûr si le service de flags tombe)
    const on = await client.getBooleanValue('smart-feed', false, { targetingKey: userId })
    if (!on) return false

    // 2) circuit breaker : la métrique de santé du groupe exposé
    if (health.errorRate > 0.05) {          // > 5 % d'erreurs sur variant="on"
      await disableFlag('smart-feed')       // kill : on coupe pour TOUT le monde
      await alertOncall('smart-feed auto-désactivé : errorRate > 5%', health)
      return false
    }
    return true
  } catch {
    return false // fail-safe : au moindre doute, on sert le feed classique
  }
}

// disableFlag = appel admin au provider (Unleash/LaunchDarkly/flagd) ou toggle en base
declare function disableFlag(key: string): Promise<void>
declare function alertOncall(msg: string, ctx: unknown): Promise<void>
```

Ce que ce corrigé garantit : la feature se coupe en **secondes** (pas 15 min de pipeline), la décision s'appuie sur une **métrique réelle** du groupe `variant="on"`, et **tout chemin d'erreur mène à *flag off*** — la panne d'obs ou du service de flags dégrade proprement vers le feed classique, jamais vers une page cassée.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — « on garde tout, au cas où »

Collecter 100 % à granularité max « pour être tranquille » finance surtout les ~90 % de données jamais relues. La bonne posture n'est pas *maximale* mais *suffisante* : détail sur le critique (erreurs, endpoints business), échantillon sur le nominal. Couverture ≠ facture.

### PIÈGE #2 — head-based uniforme à 10 % pour « diviser le coût par 10 »

C'est moins cher **et** aveugle : tu jettes aussi 90 % des **erreurs**, justement ce que tu voulais debugger. Le bon arbitrage coût/signal, c'est le **tail-based** (ou head + règles) : 100 % des erreurs et des lenteurs, ~1 % du reste. Presque le même prix qu'un 10 % uniforme, capacité de debug quasi intacte.

### PIÈGE #3 — un `user_id` en label de métrique (même « juste pour le flag »)

Pour mesurer l'impact du flag, la tentation est `feed_score{user_id="..."}`. C'est une bombe de cardinalité (module 02). Le flag se mesure avec un label **faible cardinalité** `variant="on|off"`. L'identité de l'utilisateur, si vraiment nécessaire au debug, va dans un **log** ou un **attribut de span**, pas dans un label.

### PIÈGE #4 — confondre `feature_flag.result.value` et `feature_flag.result.variant`

La convention OTel privilégie **`result.variant`** (un identifiant court et stable, ex. `"on"`) plutôt que **`result.value`** (la valeur brute, potentiellement grosse ou sensible). Mettre la valeur brute en attribut de trace gonfle la taille des spans (coût §2.2) et peut fuiter des données. Réflexe : `variant` d'abord.

### PIÈGE #5 — un flag sans fallback testé

`getBooleanValue('x', false, ctx)` renvoie le défaut si le service de flags est injoignable. Si le chemin *flag off* n'est pas testé aussi sérieusement que *flag on*, une panne du provider de flags casse la feature. Le *flag off* est un vrai chemin de production, pas un rebut.

### PIÈGE #6 — DEBUG activé « juste pour ce déploiement » et jamais retiré

`INFO → DEBUG` = ×10–20 le volume de logs. Un DEBUG global laissé actif est la première cause de dérive de facture. Le bon outil est le niveau **dynamique à durée de vie** (§2.3) : DEBUG ciblé sur un module, 30 min, retour auto à INFO.

### PIÈGE #7 — réduire le coût une fois, sans garde-fou

Un nettoyage ponctuel redérive au prochain merge. Sans **quota par équipe** ni **meta-observabilité** (alerte cardinalité/volume), tu refais l'audit dans trois mois. Le FinOps de l'obs est un processus (budget + alerte + revue), pas une opération one-shot.

---

## 5. Ancrage TribuZen

Ce module ajoute deux briques au produit : une **discipline de coût** sur toute l'instrumentation posée depuis le module 02, et le **feed intelligent observable**.

Budget d'obs cible de TribuZen (garde-fous concrets) :

| Pilier | Driver | Garde-fou TribuZen |
|--------|--------|--------------------|
| Logs | volume | `INFO` par défaut ; DEBUG dynamique ≤ 30 min ; drop health-checks au Collector |
| Métriques | cardinalité | interdiction `user_id`/`email` en label ; ≤ 5–6 labels ; alerte cardinalité > 500k |
| Traces | spans × sampling | tail-based : 100 % erreurs + lentes, 1 % nominal ; attributs tronqués |
| Rétention | durée | logs 7 j hot / 30 j warm / 90 j cold ; traces 7 j (sauf incidents archivés 1 an) |

Le **feed intelligent** derrière `smart-feed`, observé de bout en bout :

```
tribuzen/
  src/
    feed/
      smart-feed.ts        ← client.getBooleanValue('smart-feed', false, { targetingKey })
      kill-switch.ts       ← Exemple 2 : circuit breaker relié à errorRate(variant="on")
    observability/
      flags.ts             ← setAttribute('feature_flag.key' / 'result.variant') sur la trace
  ops/
    otel-collector.yaml    ← tail_sampling + drop DEBUG/health (§2.3, §2.4)
    prometheus-cost.yaml   ← meta-observabilité : alerte cardinalité & volume
```

Le récit produit : on active `smart-feed` à 5 % des familles, la trace de chaque requête feed porte `feature_flag.result.variant`, une PromQL compare le p99 `on` vs `off`, le burn-rate d'error budget (module 08/09) surveille le groupe exposé, et le kill switch coupe tout si ça dérape — pendant que la facture reste sous contrôle grâce au sampling et au drop à la source.

> Le **RGPD** de ces données (le `targetingKey` est-il une PII ? que garde-t-on des contextes d'évaluation ?) est le **module 19**. La mesure *business* de l'A/B test (conversion, significativité statistique) déborde l'observabilité pure et n'est pas l'objet ici — on reste sur le signal technique et le coût.

---

## 6. Points clés

1. L'obs est une assurance : vise la **couverture suffisante**, pas maximale ; ~90 % des données collectées ne sont jamais relues.
2. **Driver de coût par pilier** : logs = **volume**, métriques = **cardinalité**, traces = **spans × taille × sampling**. On réduit chacun différemment.
3. `INFO → DEBUG` = ×10–20 le volume de logs : niveau **dynamique** à durée de vie, et **drop à la source** (Collector) avant le backend payant.
4. **Sampling budget** : tail-based garde 100 % des erreurs + lenteurs et ~1 % du nominal → −95 % de coût, signal quasi intact. Le head-based uniforme jette aussi les erreurs.
5. **Rétention tiered** (hot/warm/cold/archive) coupe 80–90 % du coût de stockage sans perte exploitable.
6. **Gouvernance FinOps** : budget/quota par équipe + **meta-observabilité** (alerter sur cardinalité et volume) ; c'est un processus, pas un one-shot.
7. **Feature flag** = découpler *deploy* de *release* ; **OpenFeature** unifie l'API ; la **valeur par défaut** est le fallback si le service de flags tombe.
8. **Flag observé** : tagguer trace/métrique avec `feature_flag.key` / `result.variant` (convention OTel) ; comparer via un label **faible cardinalité** `variant="on|off"` — jamais `user_id`.
9. **Kill switch** relié aux métriques = rollback en secondes (vs 5–15 min CI/CD), **fail-safe** : tout chemin d'erreur mène à *flag off*.

---

## 7. Seeds Anki

```
Quel est le driver de coût de chaque pilier d'observabilité ?|Logs = le VOLUME (Go ingérés). Métriques = la CARDINALITÉ (nombre de séries actives). Traces = le VOLUME de spans × leur taille × le taux de sampling. On réduit chacun différemment.
Pourquoi un logger.debug() oublié en boucle fait exploser la facture ?|Passer de INFO à DEBUG multiplie le volume de logs par 10 à 20. Un DEBUG laissé actif dans un chemin chaud ajoute des milliers d'euros/mois. Parade : niveau de log DYNAMIQUE à durée de vie (DEBUG ciblé ≤ 30 min) + drop à la source dans l'OTel Collector.
Tail-based vs head-based sampling : lequel pour le meilleur ratio coût/signal ?|Tail-based : décision à la fin de la trace → on garde 100 % des erreurs et des requêtes lentes, ~1 % du nominal. −95 % de coût, capacité de debug quasi intacte. Le head-based uniforme à 10 % est moins cher mais jette aussi 90 % des erreurs (aveugle).
Comment mesurer l'impact d'un feature flag sans bombe de cardinalité ?|On tague trace/métrique avec un label FAIBLE cardinalité variant="on|off" (jamais user_id). PromQL : histogram_quantile(0.99, sum by (variant, le) (rate(..._bucket[5m]))) → compare p99 du groupe on vs off. L'user_id va dans un log/attribut de span, pas dans un label.
Quels attributs OTel pour un flag observé, et lequel préférer ?|Convention semconv OTel (statut development) : feature_flag.key, feature_flag.result.variant, feature_flag.result.value, feature_flag.provider.name, feature_flag.result.reason. Préférer result.variant (identifiant court/stable) à result.value (valeur brute, potentiellement grosse ou sensible).
En OpenFeature, que se passe-t-il si le service de flags est injoignable ?|getBooleanValue(clé, défaut, contexte) retourne la VALEUR PAR DÉFAUT. Donc le chemin "flag off" est un vrai chemin de production : il doit avoir un fallback testé aussi sérieusement que "flag on". Fail-safe.
Qu'est-ce qu'un kill switch et quel gain de MTTR ?|Un ops toggle qui désactive une feature instantanément sans redéploiement. Relié aux métriques (ex. errorRate du groupe variant="on"), il coupe automatiquement en fail-safe. MTTR < 1 min contre 5–15 min pour un rollback CI/CD.
Qu'est-ce que la meta-observabilité et pourquoi le FinOps de l'obs est un processus ?|Meta-observabilité = observer le coût de l'observabilité elle-même (alerte sur cardinalité > 500k séries, sur volume de logs/jour). Sans quota par équipe + ces alertes, le coût redérive au prochain DEBUG oublié ou label user_id. Réduire une fois ne suffit pas.
Rétention tiered : principe et gain ?|Faire descendre les données d'obs de tiers de stockage selon leur âge : hot (SSD, 0-7j) → warm (HDD, 7-30j) → cold (S3, 30-90j) → archive (Glacier) → delete. Coupe 80-90 % du coût de stockage vs "tout en hot 1 an", sans perte exploitable.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-18-finops-et-feature-flags-observabilite/README.md`. Réduire le coût d'obs de TribuZen (chiffrer les 3 drivers, écrire le drop à la source + le sampling budget) et rendre le feed intelligent observable (tagger `feature_flag.result.variant`, comparer en PromQL, brancher un kill switch fail-safe) — corrigé complet commenté, grille, coach en session, variante J+30.
