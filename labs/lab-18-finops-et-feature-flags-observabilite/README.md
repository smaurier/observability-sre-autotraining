# Lab 18 — FinOps de l'observabilité et feature flag observé

> **Outcome :** à la fin, tu sais (1) chiffrer les trois drivers de coût d'obs de TribuZen et les faire baisser sans perdre le signal — **drop à la source** dans l'OTel Collector + **sampling budget** tail-based — et (2) rendre le feed intelligent **observable** derrière un flag OpenFeature : tagger chaque requête avec `feature_flag.result.variant`, comparer les cohortes en PromQL, et brancher un **kill switch fail-safe** relié aux métriques.
> **Vrai outil :** `@openfeature/server-sdk` + `@openfeature/flagd-provider` (ou un provider en mémoire), `prom-client`, un **OTel Collector** réel et un **Prometheus** réel via le `docker-compose` fourni à la racine du cours. Aucun harnais simulé.
> **Feedback :** le coach valide en session — pas de test-runner auto-correcteur. Tes oracles : le résultat de `curl /metrics`, la config Collector qui **droppe** vraiment (comparer le volume avant/après), et une PromQL dans Prometheus qui sépare `variant="on"` de `variant="off"`.

---

## Énoncé

Tu reprends le cas concret du module : la facture Grafana Cloud de TribuZen a **triplé** (DEBUG laissé dans la boucle du feed, métrique labellée par `user_id`, traces à 100 %), et le produit veut lancer le **feed intelligent** sans risque. Tu traites les deux.

Tu dois livrer trois choses :

1. **Un budget d'obs chiffré** (`finops.ts`) qui calcule, pour TribuZen, le coût mensuel des logs (INFO vs DEBUG), la cardinalité de `feed_score` (sain vs avec `user_id`), et le volume de traces (100 % vs tail-based ~3 %). Objectif : **prouver par les chiffres** quel levier tirer en premier.
2. **La réduction sans perte de signal** : une config **OTel Collector** qui droppe les logs DEBUG + health-checks à la source, et applique un **tail_sampling** (100 % erreurs + lentes, 1 % nominal). Tu montres au coach que le volume exporté chute mais que **toutes** les erreurs passent encore.
3. **Le feed observable + kill switch** (`smart-feed.ts`) : évalue `smart-feed` via OpenFeature, tague la trace/métrique avec `feature_flag.key` et `feature_flag.result.variant` (label métrique **faible cardinalité** `variant="on|off"`), expose de quoi comparer `on` vs `off` en PromQL, et coupe le flag en fail-safe si `errorRate(variant="on") > 5 %`.

**Pas de gap-fill** — tu écris chaque fichier à partir du starter minimal. Le flag NE doit JAMAIS introduire de label à cardinalité illimitée.

### Starter minimal

Un dossier de travail (scratch, hors du repo cours) :

```
tribuzen-finops-lab/
  finops.ts            # budget chiffré (Exercice 1)
  smart-feed.ts        # flag observé + kill switch (Exercice 3)
  otel-collector.yaml  # drop + tail_sampling (Exercice 2)
  package.json
```

```jsonc
// package.json
{
  "type": "module",
  "dependencies": {
    "@openfeature/server-sdk": "^1",
    "@opentelemetry/api": "^1",
    "prom-client": "^15"
  },
  "devDependencies": { "tsx": "^4", "typescript": "^5" }
}
```

```ts
// finops.ts — STARTER (à compléter — Exercice 1)
const GIB = 1024 ** 3
// TODO: logGbPerMonth(rps, linesPerReq, bytesPerLine) → Go/mois
// TODO: comparer INFO (2 lignes/req, 500 o) vs DEBUG (15 lignes/req, 800 o) à 200 rps
// TODO: cardinality(labels[]) → produit ; comparer [10,5,4] vs [10,5,4,100000] (user_id)
// TODO: traceGbPerMonth(rps, spansPerReq, bytesPerSpan, sampleRate) ; 100 % vs 0.03
```

```ts
// smart-feed.ts — STARTER (à compléter — Exercice 3)
import { OpenFeature } from '@openfeature/server-sdk'
import { trace } from '@opentelemetry/api'
import { Counter, Histogram } from 'prom-client'

// TODO: métriques avec label variant (PAS user_id) : feed_requests_total, feed_latency_seconds
// TODO: evaluateFeed(userId) → getBooleanValue('smart-feed', false, { targetingKey: userId })
//        puis setAttribute('feature_flag.key','smart-feed') + ('feature_flag.result.variant', on?'on':'off')
// TODO: killSwitch(health) → si errorRate>0.05 sur variant="on" : disableFlag + alert, fail-safe sur erreur
```

```yaml
# otel-collector-config.yaml — STARTER (à compléter — Exercice 2)
receivers:
  otlp:
    protocols: { grpc: { endpoint: "0.0.0.0:4317" } }
processors:
  # TODO: filter/drop-debug (severity_texts DEBUG/TRACE)
  # TODO: filter/drop-health (bodies regexp /health, /metrics)
  # TODO: tail_sampling (keep-errors ERROR + keep-slow >2s + baseline 1%)
exporters:
  # TODO: exporter vers ton backend (loki/tempo/otlp)
service:
  pipelines: {}   # TODO: brancher logs et traces
```

> **Astuce dev :** lance le `docker-compose` fourni à la racine du cours (`16-observability-sre/`, variante *tracing* : OTel Collector + Prometheus + Tempo). Pointe ton SDK vers `http://localhost:4317`, monte ton `otel-collector-config.yaml`, et interroge Prometheus sur `http://localhost:9090`. L'important : voir le volume exporté **baisser** et une PromQL **séparer** les deux variantes.

---

## Étapes (en friction)

1. **Chiffre les 3 drivers** (`finops.ts`) — écris les trois fonctions et affiche les résultats. Attendu : DEBUG ≈ ×12 les logs, `user_id` fait passer la cardinalité de 200 à 20 000 000 séries, tail-based coupe ~97 % du volume de traces. Tu dois pouvoir dire au coach **quel levier rapporte le plus**.
2. **Écris le drop à la source** — dans `otel-collector-config.yaml`, ajoute `filter/drop-debug` (strict sur `severity_texts`) et `filter/drop-health` (regexp sur `bodies`). Branche-les dans le pipeline `logs`.
3. **Écris le sampling budget** — ajoute `tail_sampling` avec trois politiques : `keep-errors` (status ERROR), `keep-slow` (`threshold_ms: 2000`), `baseline` (probabilistic 1 %). Branche dans le pipeline `traces`.
4. **Prouve la baisse SANS perte** — envoie un mix de spans (dont quelques ERROR et quelques > 2 s). Vérifie côté backend que le volume chute **mais que 100 % des ERROR sont présents**. C'est le cœur du « réduire sans devenir aveugle ».
5. **Instrumente le flag** (`smart-feed.ts`) — déclare `feed_requests_total{variant,status}` et `feed_latency_seconds{variant}` (label `variant`, **jamais** `user_id`). Dans `evaluateFeed`, évalue `smart-feed` et tague le span actif avec `feature_flag.key` + `feature_flag.result.variant`.
6. **Compare les cohortes en PromQL** — dans Prometheus, écris la requête qui donne le p99 par variante et vérifie que `on` et `off` sont bien deux séries distinctes.
7. **Branche le kill switch** — `killSwitch(health)` : si `errorRate > 0.05` sur `variant="on"`, appelle `disableFlag('smart-feed')` + alerte ; enveloppe tout dans un `try/catch` qui retourne `false` (fail-safe).
8. **Vérifie le fallback** — coupe le provider de flags (ou fais échouer `getBooleanValue`) : le feed doit **retomber sur la version classique**, pas planter. Le chemin *flag off* est un vrai chemin de prod.

---

## Corrigé complet commenté

```ts
// finops.ts — CORRIGÉ (Exercice 1 : chiffrer les 3 drivers)
const GIB = 1024 ** 3

// LOGS : le coût suit le VOLUME → INFO vs DEBUG
function logGbPerMonth(rps: number, linesPerReq: number, bytesPerLine: number): number {
  return (rps * linesPerReq * bytesPerLine * 86400 * 30) / GIB
}
const logsInfo = logGbPerMonth(200, 2, 500)    // régime normal
const logsDebug = logGbPerMonth(200, 15, 800)  // DEBUG laissé dans la boucle du feed
console.log(`Logs INFO  : ${logsInfo.toFixed(0)} Go/mois`)   // ~5 Go
console.log(`Logs DEBUG : ${logsDebug.toFixed(0)} Go/mois`)  // ~62 Go → ×12 : LA fuite n°1

// MÉTRIQUES : le coût suit la CARDINALITÉ (produit des valeurs de labels)
const cardinality = (labels: number[]) => labels.reduce((a, b) => a * b, 1)
console.log(`Sain            : ${cardinality([10, 5, 4])} séries`)          // 200
console.log(`Avec user_id    : ${cardinality([10, 5, 4, 100_000])} séries`) // 20 000 000 → bombe

// TRACES : le coût suit VOLUME de spans × taille × sampling
function traceGbPerMonth(rps: number, spans: number, bytesPerSpan: number, sample: number): number {
  return (rps * spans * sample * 86400 * bytesPerSpan * 30) / GIB
}
console.log(`Traces 100 %     : ${traceGbPerMonth(200, 30, 1024, 1).toFixed(0)} Go/mois`)
console.log(`Traces tail ~3 % : ${traceGbPerMonth(200, 30, 1024, 0.03).toFixed(0)} Go/mois`) // −97 %
// Conclusion : 3 leviers indépendants — retirer DEBUG, retirer user_id, échantillonner.
```

```yaml
# otel-collector-config.yaml — CORRIGÉ (Exercices 2 & 3 : drop + sampling budget)
receivers:
  otlp:
    protocols:
      grpc: { endpoint: "0.0.0.0:4317" }

processors:
  # --- LOGS : on jette AVANT le backend payant (le drop le moins cher est celui qu'on n'ingère pas) ---
  filter/drop-debug:
    logs:
      exclude:
        match_type: strict
        severity_texts: ["DEBUG", "TRACE"]   # DEBUG en prod = ×10-20 le volume
  filter/drop-health:
    logs:
      exclude:
        match_type: regexp
        bodies: [".*GET /health.*", ".*GET /ready.*", ".*GET /metrics.*"]

  # --- TRACES : sampling budget — dépenser le budget là où il a de la valeur ---
  tail_sampling:
    decision_wait: 10s            # attendre la trace complète avant de décider
    policies:
      - name: keep-errors         # 100 % des erreurs : jamais échantillonnées
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: keep-slow           # 100 % des requêtes lentes (les outliers révèlent les bugs)
        type: latency
        latency: { threshold_ms: 2000 }
      - name: baseline            # 1 % du trafic nominal suffit pour les stats
        type: probabilistic
        probabilistic: { sampling_percentage: 1 }

exporters:
  loki: { endpoint: "http://loki:3100/loki/api/v1/push" }
  otlp/tempo: { endpoint: "tempo:4317", tls: { insecure: true } }

service:
  pipelines:
    logs:
      receivers: [otlp]
      processors: [filter/drop-debug, filter/drop-health]  # drop AVANT export
      exporters: [loki]
    traces:
      receivers: [otlp]
      processors: [tail_sampling]
      exporters: [otlp/tempo]
```

```ts
// smart-feed.ts — CORRIGÉ (Exercice 3 : flag observé + kill switch fail-safe)
import { OpenFeature } from '@openfeature/server-sdk'
import { trace } from '@opentelemetry/api'
import { Counter, Histogram } from 'prom-client'

// Label variant = FAIBLE cardinalité (2 valeurs). JAMAIS user_id ici (bombe, module 02).
const feedRequests = new Counter({
  name: 'feed_requests_total',
  help: 'Requêtes du feed familial',
  labelNames: ['variant', 'status'],   // variant ∈ {on, off}
})
const feedLatency = new Histogram({
  name: 'feed_latency_seconds',
  help: 'Latence du feed en secondes',
  labelNames: ['variant'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
})

const client = OpenFeature.getClient()

// Évalue le flag ET rend la requête observable (semconv OTel : feature_flag.*)
export async function evaluateFeed(userId: string): Promise<'on' | 'off'> {
  // défaut false → si le service de flags tombe, on sert le feed classique (fallback sûr)
  const on = await client.getBooleanValue('smart-feed', false, { targetingKey: userId })
  const variant: 'on' | 'off' = on ? 'on' : 'off'

  const span = trace.getActiveSpan()
  span?.setAttribute('feature_flag.key', 'smart-feed')
  span?.setAttribute('feature_flag.result.variant', variant) // variant préféré à result.value (taille/PII)
  return variant
}

// À appeler autour du traitement du feed : mesure la latence par variante
export function recordFeed(variant: 'on' | 'off', status: string, seconds: number): void {
  feedRequests.inc({ variant, status })
  feedLatency.observe({ variant }, seconds)
}

interface Health { errorRate: number } // ex. issu d'une PromQL sur variant="on"

// Kill switch : coupe la feature en secondes si le groupe exposé dérape. Fail-safe.
export async function feedAllowed(userId: string, health: Health): Promise<boolean> {
  try {
    const on = await client.getBooleanValue('smart-feed', false, { targetingKey: userId })
    if (!on) return false
    if (health.errorRate > 0.05) {         // > 5 % d'erreurs sur variant="on"
      await disableFlag('smart-feed')      // toggle off pour tout le monde (< 1 s vs 15 min CI/CD)
      await alertOncall('smart-feed auto-désactivé : errorRate > 5%', health)
      return false
    }
    return true
  } catch {
    return false // fail-safe : panne du provider OU des métriques → feed classique, jamais de crash
  }
}

declare function disableFlag(key: string): Promise<void>
declare function alertOncall(msg: string, ctx: unknown): Promise<void>
```

```promql
# Prometheus (Exercice 6) — comparer les cohortes : p99 par variante du flag
histogram_quantile(0.99,
  sum by (variant, le) (rate(feed_latency_seconds_bucket[5m]))
)

# taux d'erreur du groupe EXPOSÉ (la métrique qui nourrit le kill switch)
sum(rate(feed_requests_total{variant="on", status=~"5.."}[5m]))
/
sum(rate(feed_requests_total{variant="on"}[5m]))
```

**Pourquoi ce corrigé est correct :**
- **`finops.ts` prouve la priorité** : les trois leviers sont indépendants et chiffrés — on ne discute pas « à l'intuition » quel driver traiter d'abord.
- **Le drop est fait au Collector, pas au backend** : le log le moins cher est celui qu'on n'ingère jamais. DEBUG et health-checks partent avant la facturation.
- **Le tail_sampling garde 100 % des erreurs et des lenteurs** : −95 % de volume **sans** perdre ce qui sert au debug. C'est la différence avec un head-based 10 % qui jetterait aussi les erreurs.
- **Le label `variant` est à 2 valeurs** : la comparaison `on`/`off` en PromQL coûte 2 séries, pas 20 M. L'identité de l'utilisateur, si besoin, va dans un log/attribut de span.
- **`feature_flag.result.variant`** (identifiant court, stable) plutôt que `result.value` : conforme semconv OTel, spans plus légers, pas de fuite de valeur brute.
- **`feedAllowed` est fail-safe** : `getBooleanValue` renvoie le défaut `false` si le provider tombe, et le `catch` retourne `false` en cas d'erreur des métriques → le chemin *flag off* est toujours un chemin sûr.

### Grille d'auto-évaluation (à passer avec le coach)

| Critère | Vert | Rouge |
|---------|------|-------|
| Drivers chiffrés | logs=volume, métriques=cardinalité, traces=spans×sampling, avec ordres de grandeur | « on collecte trop » sans un chiffre |
| Drop logs | DEBUG + health droppés **au Collector**, avant l'export | filtre côté backend (déjà facturé) ou pas de drop |
| Sampling | tail-based : 100 % erreurs + lentes, 1 % nominal | head-based uniforme 10 % (jette 90 % des erreurs) |
| Baisse prouvée | volume exporté ↓ **et** 100 % des ERROR encore présents | volume ↓ mais des erreurs perdues, ou aucune preuve |
| Cardinalité du flag | label `variant="on\|off"` (2 valeurs) | `user_id`/`email` en label → bombe |
| Attribut OTel | `feature_flag.key` + `result.variant` (semconv) | attribut inventé (`feature_flag.new_checkout`) ou `result.value` brute |
| Comparaison | PromQL `sum by (variant, le)` sépare on/off | pas de `variant` dans le `by`, cohortes fusionnées |
| Kill switch | relié à `errorRate(variant="on")`, **fail-safe** vers off | pas de fallback, ou crash si le provider tombe |

### Coach — questions de vérification en session

- « Montre-moi tes trois chiffres. Lequel de DEBUG, `user_id` ou traces-100 % traites-tu en premier, et pourquoi ? » (attendu : le plus gros gain, justifié par le calcul)
- « Ton Collector droppe les DEBUG. Pourquoi le faire ici et pas côté Loki/Datadog ? » (attendu : ce qui n'est pas ingéré n'est pas facturé)
- « Tu passes les traces à 1 %. Comment gardes-tu quand même 100 % des erreurs ? » (attendu : politiques `keep-errors`/`keep-slow` du tail_sampling)
- « Tu veux mesurer l'impact du feed par utilisateur. Pourquoi PAS `user_id` en label ? » (attendu : cardinalité illimitée → OOM + facture ; user_id va en log/span)
- « `feature_flag.result.variant` ou `result.value` — lequel et pourquoi ? » (attendu : variant, plus léger et pas de fuite de valeur)
- « Le service de flags tombe en pleine prod. Que voit un parent sur son feed ? » (attendu : le feed classique, grâce au défaut `false` + catch fail-safe)
- « Ton kill switch se déclenche. En combien de temps la feature est-elle coupée, vs un rollback CI/CD ? » (attendu : < 1 min vs 5–15 min)

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées, sans rouvrir ce corrigé ni le module :**

1. Reproduis **de mémoire, en 30 min**, `smart-feed.ts` + le `tail_sampling`, mais cette fois le kill switch doit se déclencher sur un **burn-rate d'error budget** (module 08/09) du groupe `variant="on"`, pas sur un simple taux d'erreur instantané. Explique au coach pourquoi le burn-rate est un meilleur signal (moins de faux positifs).
2. Ajoute une **alerte de meta-observabilité** : une règle Prometheus qui se déclenche si la cardinalité totale (`prometheus_tsdb_head_series`) dépasse un seuil — et démontre-la en créant volontairement une métrique à `user_id`, puis en la corrigeant.
3. Ajoute une **rétention tiered** minimale sur les traces : garde 7 jours par défaut mais **archive 1 an** les traces d'incidents (celles taguées `error`). Décris la règle, même sans l'implémenter côté backend.
4. **Piège volontaire à éviter :** n'ajoute **pas** de nouveau label à haute cardinalité « juste pour l'A/B test ». Si tu as besoin de segmenter, utilise un `variant` ou un `user_tier` (≤ 4 valeurs), jamais un identifiant.

**Critère de réussite :** le budget est rechiffré, le tail_sampling garde 100 % des erreurs, le feed est observable par `variant`, le kill switch fail-safe se déclenche sur burn-rate, et l'alerte de cardinalité se déclenche puis se résout quand tu retires le `user_id`.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ces briques vivent ici :

```
tribuzen/
  src/
    feed/
      smart-feed.ts        ← evaluateFeed + feedAllowed (Corrigé)
    observability/
      metrics.ts           ← feed_requests_total / feed_latency_seconds (label variant)
  ops/
    otel-collector.yaml    ← drop DEBUG/health + tail_sampling (Corrigé)
    prometheus-cost.yaml   ← meta-observabilité : alerte cardinalité & volume
    finops-budget.md       ← budget d'obs par pilier (issu de finops.ts)
```

**Différences avec le lab :**
- Le `disableFlag` de démo devient un vrai appel admin au provider (**Unleash** self-hosted ou **flagd**), avec audit log — qui a coupé quoi, quand.
- Les métriques `variant` sont scrapées par le **Prometheus** du cours et la comparaison `on`/`off` devient un **panneau Grafana** (module 07) plutôt qu'une PromQL à la main.
- Le kill switch est relié au **burn-rate d'error budget** (modules 08–09) et déclenche une **alerte routée** (module 09), pas un simple `console.log`.
- Le `targetingKey` (souvent l'`userId`) et les contextes d'évaluation soulèvent une question **RGPD** (PII, rétention) traitée au **module 19** — ici on ne fait que le poser.

**Commit cible :**
```
feat(observability): budget FinOps par pilier + feed intelligent observable (flag variant, tail-sampling, kill switch fail-safe)
```
