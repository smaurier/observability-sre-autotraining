# Lab 14 — Observabilité Kubernetes

> **Outcome :** à la fin, tu sais observer TribuZen sur un **vrai** cluster Kubernetes local : lire les métriques natives (`kube-state-metrics`, `cAdvisor`), retrouver les logs d'un pod éphémère (`kubectl logs --previous`), brancher ton app via un `ServiceMonitor`, provoquer un `OOMKilled` et le diagnostiquer couche par couche.
> **Vrai outil :** `kind` (Kubernetes IN Docker) + `kube-prometheus-stack` (Helm) + `kubectl`. Aucun harnais simulé — l'oracle, c'est l'UI Prometheus (`http://localhost:9090`) et `kubectl`.
> **Feedback :** le coach valide en session — pas de test-runner auto-correcteur.

---

## Pré-requis outils

Ce lab tourne sur un cluster **local**, pas un cloud. Installe (une fois) :

- **Docker** (déjà là depuis le module 00) ;
- **kind** — `https://kind.sigs.k8s.io` (`brew install kind`, `choco install kind`, ou binaire) ;
- **kubectl** — `https://kubernetes.io/docs/tasks/tools/` ;
- **helm** — `https://helm.sh/docs/intro/install/`.

> **Si tu ne peux pas installer kind** (poste verrouillé) : le lab reste faisable en mode **conceptuel** — voir la section « Variante sans cluster » en fin de README. Tu écris les mêmes manifests + PromQL, et tu les valides avec le coach à la lecture. Le cœur pédagogique (les 3 couches, le ServiceMonitor, l'OOM) ne dépend pas de l'exécution.

---

## Énoncé

Tu reprends TribuZen déployé sur K8s (cas concret du module) : une API qui, sur *un* replica, rame et redémarre. Tu vas **reproduire** ce scénario en local et le **diagnostiquer** avec les bons outils, couche par couche.

Tu dois :

1. **Monter un cluster local** kind (1 node suffit) et y installer `kube-prometheus-stack`.
2. **Déployer une mini-app TribuZen** (fournie ci-dessous) qui expose `/metrics` (module 02) et qu'on peut faire fuir en mémoire à la demande.
3. **La faire scraper** par le Prometheus du chart via un **ServiceMonitor** — cible **UP** dans Prometheus.
4. **Provoquer un `OOMKilled`** (limit mémoire basse + fuite déclenchée) et le **diagnostiquer** en 3 requêtes (KSM → cAdvisor → app).
5. **Retrouver les logs** de l'instance morte avec `kubectl logs --previous`.

**Pas de gap-fill** — tu écris les manifests et les PromQL. Le starter donne le squelette de l'app et les commandes de cluster.

### Starter — l'app à observer

Une image Node minimale qui expose `/metrics` et une route `/leak` qui gonfle la mémoire (pour déclencher l'OOM). Tu peux réutiliser l'instrumentation `prom-client` du lab 02.

```ts
// server.ts — mini-app TribuZen observable + fuite déclenchable
import express from 'express'
import { Counter, Histogram, register, collectDefaultMetrics } from 'prom-client'

collectDefaultMetrics({ prefix: 'tribuzen_' })

const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Requêtes HTTP',
  labelNames: ['method', 'route', 'status'],
})
const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durée HTTP (s)',
  labelNames: ['method', 'route'],
  buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
})

const app = express()
app.use((req, res, next) => {
  const stop = httpDuration.startTimer({ method: req.method })
  res.on('finish', () => {
    const route = req.route?.path ?? 'unmatched'
    stop({ method: req.method, route })
    httpRequests.inc({ method: req.method, route, status: String(res.statusCode) })
  })
  next()
})

// fuite mémoire volontaire : chaque appel retient ~20 Mo → OOM garanti si limit basse
const leaked: Buffer[] = []
app.post('/leak', (_req, res) => {
  leaked.push(Buffer.alloc(20 * 1024 * 1024, 1))
  res.json({ retained_mb: leaked.length * 20 })
})

app.post('/api/events/:id/rsvp', (req, res) =>
  setTimeout(() => res.json({ eventId: req.params.id, status: 'confirmed' }), 60))

// health + metrics : NE PAS mesurer ces routes comme latence utilisateur
app.get('/health/ready', (_req, res) => res.json({ ok: true }))
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType)
  res.end(await register.metrics())
})

app.listen(3000, () => console.log('tribuzen-api on :3000, /metrics on same port'))
```

```dockerfile
# Dockerfile — pour charger l'image dans kind
FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install express prom-client
COPY server.ts .
RUN npm install -g tsx
CMD ["tsx", "server.ts"]
```

### Starter — commandes cluster

```bash
# 1. cluster local (1 node) + charge l'image locale dedans (kind n'a pas accès à ton Docker local)
kind create cluster --name tribuzen-obs
docker build -t tribuzen-api:lab .
kind load docker-image tribuzen-api:lab --name tribuzen-obs

# 2. la stack d'observabilité (Operator + Prometheus + Grafana + KSM + node-exporter)
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install kube-prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace

kubectl create namespace tribuzen
```

À toi d'écrire : `deployment.yaml` (avec une **limit mémoire basse**, ex. `128Mi`, port `metrics` nommé), `service.yaml` (port `metrics` NOMMÉ), `servicemonitor.yaml`.

---

## Étapes (en friction)

1. **Monte le cluster** et installe le chart (commandes ci-dessus). Vérifie : `kubectl get pods -n monitoring` → Prometheus, Grafana, kube-state-metrics, node-exporter tous `Running`.
2. **Trouve le label de sélection** des ServiceMonitors du chart : `kubectl get servicemonitor -n monitoring --show-labels`. Note la valeur de `release` (ex. `release=kube-prometheus`). Ton ServiceMonitor devra la porter.
3. **Écris `deployment.yaml`** : image `tribuzen-api:lab`, `imagePullPolicy: IfNotPresent`, un port `containerPort: 3000` **nommé** `metrics`, et surtout `resources.limits.memory: 128Mi` (pour l'OOM), un `readinessProbe` sur `/health/ready`.
4. **Écris `service.yaml`** : sélectionne le pod (`app: tribuzen-api`), expose un port **nommé** `metrics` → `targetPort: 3000`.
5. **Écris `servicemonitor.yaml`** : `apiVersion: monitoring.coreos.com/v1`, label `release:` copié à l'étape 2, `selector.matchLabels: {app: tribuzen-api}`, `endpoints: [{ port: metrics, path: /metrics, interval: 15s }]`.
6. **Applique** (`kubectl apply -n tribuzen -f .`) et **vérifie la cible** : `kubectl port-forward -n monitoring svc/kube-prometheus-kube-prome-prometheus 9090:9090`, puis `http://localhost:9090` → *Status → Targets* → `tribuzen-api` doit être **UP**. Si absent : relis pièges #1 (port = nom) et #2 (label release) du module.
7. **Provoque l'OOM** : `kubectl port-forward -n tribuzen deploy/tribuzen-api 3000:3000` puis une dizaine de `curl -X POST localhost:3000/leak`. Observe `kubectl get pods -n tribuzen -w` : le pod passe `OOMKilled` puis redémarre.
8. **Diagnostique en 3 requêtes** dans Prometheus (voir corrigé) : restarts (KSM) → OOMKilled (KSM) → working set (cAdvisor). Puis relie au p99 par pod.
9. **Récupère les logs de l'instance morte** : `kubectl logs -n tribuzen deploy/tribuzen-api --previous`. Constate que sans `--previous` tu n'as **que** l'instance courante.
10. **Nettoie** : `kind delete cluster --name tribuzen-obs`.

---

## Corrigé complet commenté

```yaml
# deployment.yaml — l'app à observer, avec une limit mémoire volontairement basse
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tribuzen-api
  namespace: tribuzen
  labels: { app: tribuzen-api }
spec:
  replicas: 1
  selector:
    matchLabels: { app: tribuzen-api }
  template:
    metadata:
      labels: { app: tribuzen-api }   # ces labels deviennent des cibles du Service
    spec:
      containers:
        - name: api
          image: tribuzen-api:lab
          imagePullPolicy: IfNotPresent  # image chargée via `kind load`, pas un registry
          ports:
            - name: metrics             # NOM du port — référencé par le ServiceMonitor
              containerPort: 3000
          readinessProbe:               # readiness KO => pod retiré du Service (pas tué)
            httpGet: { path: /health/ready, port: metrics }
            initialDelaySeconds: 3
            periodSeconds: 5
          resources:
            limits:
              memory: 128Mi             # basse EXPRÈS : quelques /leak => OOMKilled
---
# service.yaml — le port `metrics` DOIT être nommé (le ServiceMonitor cible le nom)
apiVersion: v1
kind: Service
metadata:
  name: tribuzen-api
  namespace: tribuzen
  labels: { app: tribuzen-api }
spec:
  selector: { app: tribuzen-api }
  ports:
    - name: metrics                     # <-- ce nom, pas le numéro 3000
      port: 3000
      targetPort: metrics
---
# servicemonitor.yaml — fait découvrir l'app par le Prometheus du chart
apiVersion: monitoring.coreos.com/v1   # CRD du Prometheus Operator
kind: ServiceMonitor
metadata:
  name: tribuzen-api
  namespace: tribuzen
  labels:
    release: kube-prometheus            # DOIT matcher `serviceMonitorSelector` du chart
spec:                                   #   (valeur relevée à l'étape 2)
  selector:
    matchLabels: { app: tribuzen-api }  # matche le Service ci-dessus
  namespaceSelector:
    matchNames: [tribuzen]
  endpoints:
    - port: metrics                     # NOM du port du Service, pas 3000
      path: /metrics
      interval: 15s
      metricRelabelings:                # drop la cardinalité inutile à la source
        - sourceLabels: [__name__]
          regex: 'go_.*'
          action: drop
```

**Les 3 requêtes de diagnostic (UI Prometheus) — dans l'ordre où on descend les couches :**

```promql
# (1) COUCHE ORCHESTRATEUR — kube-state-metrics : le pod a-t-il redémarré ?
increase(kube_pod_container_status_restarts_total{namespace="tribuzen", pod=~"tribuzen-api-.*"}[15m])

# (2) COUCHE ORCHESTRATEUR — la raison du DERNIER arrêt : OOMKilled ?
# le pod a déjà redémarré → last_terminated_reason PERSISTE la cause (terminated_reason serait retombé à 0)
kube_pod_container_status_last_terminated_reason{namespace="tribuzen", reason="OOMKilled"}

# (3) COUCHE CONTAINER — cAdvisor : mémoire active collée à la limit (128Mi) ?
container_memory_working_set_bytes{namespace="tribuzen", container="api"}
```

Et le lien avec la couche app (le p99 par pod du module) :

```promql
histogram_quantile(0.99,
  sum by (pod, le) (rate(http_request_duration_seconds_bucket{namespace="tribuzen"}[5m])))
```

**Pourquoi ce corrigé est correct :**
- Le port `metrics` est **nommé** dans le container ET le Service, et le ServiceMonitor le référence par ce **nom** — sinon la cible n'apparaît jamais (piège #1).
- Le label `release: kube-prometheus` est ce que l'instance Prometheus du chart sélectionne — sans lui, le ServiceMonitor est ignoré en silence (piège #2).
- La `limit.memory: 128Mi` + `/leak` reproduisent un vrai `OOMKilled` : la requête (2) le prouve via `kube-state-metrics`, et (3) le confirme via `cAdvisor` (working set, pas usage — piège #3).
- `--previous` est la seule façon de lire les logs de l'instance tuée : `kubectl logs` seul ne montre que le pod recréé (piège #4).

### Grille d'auto-évaluation (à passer avec le coach)

| Critère | Vert | Rouge |
|---------|------|-------|
| Cible scrapée | `tribuzen-api` **UP** dans Targets | absente (port en numéro, ou label release manquant) |
| Bonne couche | restarts/OOM lus dans KSM, conso dans cAdvisor | cherche l'OOM dans cAdvisor ou l'inverse |
| Mémoire | lit `working_set_bytes` | lit `usage_bytes` pour juger l'OOM |
| Logs | retrouve l'incident via `--previous` | croit que `kubectl logs` garde l'historique |
| Cardinalité | `by (pod)` seulement pour le diagnostic, drop `go_*` | garde `pod` partout, aucun relabeling |
| Probes | sait que readiness KO ≠ restart | confond liveness (tue) et readiness (retire) |

### Coach — questions de vérification en session

- « Montre la cible `tribuzen-api` UP. Si tu remplaces `port: metrics` par `port: 3000`, que se passe-t-il ? » (attendu : disparaît)
- « Ton pod est OOMKilled. Quelle métrique le prouve, et dans quel outil ? » (attendu : `..._last_terminated_reason{reason="OOMKilled"}` — persiste après le restart —, KSM)
- « Pourquoi `working_set_bytes` et pas `usage_bytes` ? »
- « Sans `--previous`, pourquoi ne vois-tu pas le crash dans les logs ? »
- « Pourquoi ne pas garder `by (pod)` dans un dashboard permanent ? »

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées, sans rouvrir ce corrigé ni le module :**

1. Recrée le cluster + la stack **de mémoire, en 40 min**, et fais passer la cible **UP** du premier coup (écris le ServiceMonitor sans regarder).
2. Ajoute un **deuxième Deployment** `tribuzen-worker` (même image) et son ServiceMonitor. Écris une PromQL qui compare les restarts des **deux** deployments : `sum by (deployment) (increase(kube_pod_container_status_restarts_total{namespace="tribuzen"}[1h]))` (indice : le label `deployment` peut nécessiter un join `kube_pod_owner` — sinon agrège par `pod` regex).
3. **Piège volontaire à éviter :** ne mets pas le port en numéro dans le ServiceMonitor. Explique au coach en une phrase pourquoi.

**Critère de réussite :** les deux cibles `UP`, un OOM diagnostiqué en 3 requêtes sans aide, et zéro `pod` label dans le dashboard large.

---

## Variante sans cluster (poste verrouillé)

Si `kind` est impossible, le lab devient **conceptuel** et reste valable :

1. Écris les trois manifests (`deployment.yaml`, `service.yaml`, `servicemonitor.yaml`) **complets**, corrects, dans un dossier — le coach les relit ligne à ligne (port nommé ? label release ? working set ?).
2. Écris les **4 PromQL** du corrigé et explique, pour chacune, **quelle couche** elle interroge et **quel outil** produit la métrique.
3. Réponds aux questions du coach ci-dessus à l'oral.

Le raisonnement « 3 couches / bon outil / bon nom de métrique » — qui est le cœur du module — ne dépend pas de l'exécution du cluster.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ces manifests d'observabilité vivent ici (versionnés, GitOps — module 13) :

```
tribuzen/
  deploy/
    k8s/
      api-deployment.yaml
      api-service.yaml            ← port `metrics` NOMMÉ
      api-servicemonitor.yaml     ← label release: correct
      worker-servicemonitor.yaml
```

**Différences avec le lab :**
- Pas de route `/leak` en prod (elle n'existe que pour reproduire l'OOM en local) ; la vraie limit mémoire est calée sur le profil réel du service, pas volontairement basse.
- Les alertes `PrometheusRule` (CrashLoopBackOff, OOMKilled, replicas indisponibles) sont ajoutées au **module 09** — ici on garantit d'abord que les signaux sont lisibles.
- Les logs partent vers **Loki** via un DaemonSet (module 15) : en prod on ne diagnostique pas avec `kubectl logs`, on requête l'agrégateur.

**Commit cible :**
```
feat(deploy): observe tribuzen-api sur K8s — ServiceMonitor + limits + readiness, diagnostic OOM 3 couches
```
