---
titre: Observabilité Kubernetes
cours: 16-observability-sre
notions: ["3 couches à observer (node / orchestrateur / app)", "cAdvisor (kubelet /metrics/cadvisor)", "kube-state-metrics (état des objets K8s)", "node-exporter (métriques machine)", "kube-prometheus-stack (Helm)", "ServiceMonitor (monitoring.coreos.com/v1)", "logs de pods stdout/stderr éphémères", "probes liveness/readiness côté observation", "cardinalité pod/namespace en K8s"]
outcomes:
  - sait distinguer les trois couches à observer dans un cluster (node, orchestrateur, application) et l'outil de chacune
  - sait lire les métriques K8s natives (cAdvisor, kube-state-metrics, node-exporter) et écrire les PromQL de diagnostic pod
  - sait faire scraper une app par kube-prometheus-stack via un ServiceMonitor sans deviner l'apiVersion
  - sait retrouver les logs d'un pod éphémère et comprendre pourquoi ils disparaissent avec le pod
  - sait interpréter readiness/liveness côté observabilité et maîtriser la cardinalité introduite par les labels K8s
prerequis:
  - "module 01 — logging structuré (JSON sur stdout, corrélation)"
  - "module 02 — métriques et Prometheus (counter/gauge/histogram, scrape, PromQL rate/sum by)"
  - "module 03 — RED / USE / 4 signaux dorés"
  - "module 07 — dashboards Grafana"
  - "module 13 — observability as code (provisioning, GitOps)"
next: 15-elk-stack-kibana
libs: []
tribuzen: observation de TribuZen déployé sur un cluster K8s — santé des pods API/worker, latence par pod, logs de pods, scrape via ServiceMonitor
last-reviewed: 2026-07
---

# Observabilité Kubernetes

> **Outcomes — tu sauras FAIRE :** distinguer les 3 couches à observer (node / orchestrateur / app), lire les métriques K8s natives (`cAdvisor`, `kube-state-metrics`, `node-exporter`) et écrire les PromQL de diagnostic pod, faire scraper une app par un `ServiceMonitor`, retrouver les logs d'un pod éphémère, interpréter readiness/liveness côté obs et maîtriser la cardinalité `pod`/`namespace`.
> **Difficulté :** :star::star::star::star:
>
> **Portée :** ce module couvre **l'observation d'un cluster** déjà déployé. Il ne t'apprend **pas** à administrer Kubernetes — déployer, dimensionner, réseau, ingress, autoscaling *infra* sont le **cours 12 (cloud/K8s)**. Ici, on suppose un cluster qui tourne et on répond à : *où sont les signaux, avec quels outils, quelles PromQL*. Les **dashboards** (panels, variables) sont vus au module 07 ; les **alerting rules** (`PrometheusRule`, burn-rate) au module 09 ; l'**instrumentation applicative** (`prom-client`, OTel) aux modules 02 et 05. On les **réutilise** ici, on ne les réexplique pas.

## 1. Cas concret d'abord

TribuZen est passé en production sur un petit cluster Kubernetes : 3 nodes, un Deployment `tribuzen-api` (3 replicas), un Deployment `tribuzen-worker` (envoi d'e-mails). Samedi matin, des parents signalent que l'app « rame par moments ». Tu ouvres Grafana : la latence p99 de l'API oscille — parfois 120 ms, parfois 4 s, en dents de scie.

En prod classique (une VM), ton réflexe serait : `ssh` sur la machine, `tail -f` le log, `top`. **Ici, rien de tout ça ne marche comme avant :**

- il y a **3 replicas** de l'API — sur *lequel* la latence explose ?
- les pods sont **éphémères** : si un pod a été tué (OOM) à 9h03 et recréé, `kubectl logs` sur le pod actuel ne montre **rien** de l'incident ;
- un `POST /rsvp` lent peut venir de l'**app** (bug), du **container** (throttling CPU), ou du **node** (machine saturée). Trois couches, trois outils.

À la fin de ce module, tu sauras trancher en trois questions, chacune adressée à la bonne source :

```promql
# (couche orchestrateur — kube-state-metrics) un replica de l'API a-t-il redémarré ?
increase(kube_pod_container_status_restarts_total{namespace="tribuzen", pod=~"tribuzen-api-.*"}[1h])

# (couche container — cAdvisor) un pod API est-il throttlé / proche de sa limite mémoire ?
container_memory_working_set_bytes{namespace="tribuzen", pod=~"tribuzen-api-.*", container="api"}

# (couche app — ton histogram du module 02) quel POD précis a le p99 lent ?
histogram_quantile(0.99,
  sum by (pod, le) (rate(http_request_duration_seconds_bucket{namespace="tribuzen"}[5m])))
```

La dernière requête révèle que **un seul pod** (`tribuzen-api-7b9f-x2k9m`) porte tout le p99 : ses restarts sont montés et sa mémoire frôle la limite. Diagnostic : ce replica est OOM-throttlé, pas un bug applicatif. On construit chaque brique pour arriver là — sans deviner un nom de métrique.

---

## 2. Théorie complète, concise

### 2.1 Pourquoi K8s change l'observabilité : l'éphémérité

Un pod n'est pas un serveur. Il naît, vit peut-être 40 secondes, meurt, et un autre le remplace avec **une nouvelle IP et un nouveau nom**. Trois conséquences directes pour l'observation :

- **Les logs sur disque n'existent pas** : ton app doit logger sur `stdout`/`stderr` (module 01), et une brique de plateforme collecte ces flux *en continu*, sinon ils partent avec le pod (§2.6).
- **Les cibles de scrape bougent** : impossible de lister des `targets: ['ip:port']` en dur — Prometheus doit **découvrir** les pods via l'API K8s (§2.5).
- **Il y a plusieurs couches** entre l'utilisateur et le hardware : node → container → application. Chacune a sa source de métriques.

### 2.2 Les trois couches à observer

C'est la carte mentale du module. Trois questions, trois outils, ne jamais les confondre.

| Couche | Question | Outil / source | Exemples de métriques |
|--------|----------|----------------|-----------------------|
| **Node** (machine) | Mes machines ont-elles des ressources ? | `node-exporter` (DaemonSet) | `node_cpu_seconds_total`, `node_memory_MemAvailable_bytes`, `node_filesystem_avail_bytes` |
| **Orchestrateur** (K8s) | K8s fait-il son travail (pods sains, replicas OK) ? | `kube-state-metrics` | `kube_pod_status_phase`, `kube_pod_container_status_restarts_total`, `kube_node_status_condition` |
| **Container** | Ce container consomme-t-il / est-il throttlé ? | `cAdvisor` (intégré au kubelet) | `container_cpu_usage_seconds_total`, `container_memory_working_set_bytes` |
| **Application** | Mes endpoints répondent-ils bien ? | ton instrumentation (module 02/05) | `http_requests_total`, `http_request_duration_seconds` |

> Piège d'équipe classique : installer Prometheus, voir le CPU/mémoire des pods, et croire « l'observabilité est faite ». Sans les métriques **applicatives** (taux d'erreur, latence, métriques métier), tu surveilles la tuyauterie sans savoir si l'eau est potable. Les quatre couches sont complémentaires.

### 2.3 cAdvisor — métriques par container

**cAdvisor** (Container Advisor) est **intégré au kubelet** de chaque node. Il expose, sans aucune instrumentation, les métriques de ressources de chaque container, sur l'endpoint kubelet `/metrics/cadvisor` (vérifié docs kubernetes.io — le kubelet expose aussi `/metrics`, `/metrics/resource`, `/metrics/probes`).

Métriques à connaître (noms vérifiés — google/cadvisor) :

| Métrique | Type | Sens |
|----------|------|------|
| `container_cpu_usage_seconds_total` | counter | temps CPU cumulé du container (à passer en `rate()`) |
| `container_memory_working_set_bytes` | gauge | mémoire **active** — c'est la valeur comparée à la *limit* pour l'OOM kill |
| `container_memory_usage_bytes` | gauge | mémoire totale, **cache inclus** (trompeur — voir piège) |
| `container_network_receive_bytes_total` | counter | octets réseau entrants |

```promql
# CPU consommé par le container "api" (cœurs), par pod
sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="tribuzen", container="api"}[5m]))

# Mémoire active par pod — celle qui déclenche l'OOM
container_memory_working_set_bytes{namespace="tribuzen", container="api"}
```

**`working_set` vs `usage` :** `container_memory_usage_bytes` inclut le cache filesystem, que le kernel peut libérer sous pression. La valeur qui compte pour les OOM kills est `container_memory_working_set_bytes` — c'est **toujours** celle-là qu'on compare à la limit.

### 2.4 kube-state-metrics — l'état des objets K8s

`cAdvisor` te dit *combien consomme* un container. Il ne te dit **pas** si un Deployment a ses replicas, ni si un pod est bloqué en `Pending`. Cette info vient de **kube-state-metrics** (KSM) : un service qui interroge l'API Kubernetes et expose l'**état déclaratif** des objets (Pods, Deployments, Nodes, Jobs, PVC) en métriques Prometheus. C'est la source de vérité « K8s fait-il son travail ».

Métriques centrales (noms + labels vérifiés — github.com/kubernetes/kube-state-metrics) :

```promql
# Phase des pods : Pending, Running, Succeeded, Failed, Unknown (label `phase`)
kube_pod_status_phase{namespace="tribuzen", phase="Pending"} > 0

# Restarts d'un container (counter) — pic = CrashLoopBackOff / OOM récurrent
increase(kube_pod_container_status_restarts_total{namespace="tribuzen"}[1h]) > 3

# Pourquoi un container est en attente (label `reason` : CrashLoopBackOff, ImagePullBackOff...)
kube_pod_container_status_waiting_reason{reason="CrashLoopBackOff"} > 0

# Pourquoi un container s'est arrêté (label `reason` : OOMKilled, Error, Completed)
kube_pod_container_status_terminated_reason{reason="OOMKilled"} > 0

# Santé d'un node (labels `condition`=Ready/DiskPressure/... et `status`=true/false)
kube_node_status_condition{condition="Ready", status="true"} == 0   # node NotReady

# Replicas indisponibles d'un Deployment
kube_deployment_status_replicas_unavailable{namespace="tribuzen"} > 0
```

Retiens le couple : **cAdvisor = consommation**, **KSM = état/santé**. Un pod peut consommer peu (cAdvisor calme) tout en étant `CrashLoopBackOff` (KSM qui hurle).

### 2.5 kube-prometheus-stack et le ServiceMonitor

Déployer et configurer Prometheus « à la main » sur K8s (service discovery, relabeling, règles) est fastidieux. Le standard de fait est le Helm chart **kube-prometheus-stack** (repo `prometheus-community`), qui installe en une commande : le **Prometheus Operator**, Prometheus, Alertmanager, Grafana, `node-exporter`, `kube-state-metrics`, et des dashboards/règles préconfigurés.

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install kube-prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace
```

L'Operator apporte des **CRDs** (Custom Resource Definitions) qui remplacent l'édition manuelle de `prometheus.yml` :

| CRD (`monitoring.coreos.com/v1`) | Rôle |
|----------------------------------|------|
| `ServiceMonitor` | déclare *comment scraper* les métriques d'un **Service** |
| `PodMonitor` | idem, mais scrape directement des **pods** (jobs sans Service) |
| `PrometheusRule` | alerting rules + recording rules (module 09) |

**Le ServiceMonitor est le point clé pour faire observer TON app.** Au lieu d'ajouter une cible dans un fichier, tu déclares un objet K8s : Prometheus le découvre et scrape le Service correspondant. `apiVersion` et champs vérifiés (prometheus-operator) :

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: tribuzen-api
  namespace: tribuzen
  labels:
    release: kube-prometheus   # doit matcher ce que Prometheus sélectionne (voir note)
spec:
  selector:
    matchLabels:
      app: tribuzen-api        # sélectionne le Service portant ce label
  namespaceSelector:
    matchNames: [tribuzen]
  endpoints:
    - port: metrics            # NOM du port dans le Service (pas le numéro !)
      path: /metrics
      interval: 15s
```

Deux pièges qui coûtent des heures (§4) : le `port` est le **nom** du port du Service, pas son numéro ; et le ServiceMonitor doit porter le **label que l'instance Prometheus sélectionne** (souvent `release: <nom-du-release-helm>`), sinon il est silencieusement ignoré.

### 2.6 Logs de pods : éphémères par nature

Rappel du module 01 : ton app **logge sur stdout/stderr en JSON**, jamais dans un fichier interne au container (il disparaît avec le pod, et remplit le disque éphémère).

Le kubelet capture stdout/stderr et les stocke sur le node. `kubectl logs` lit **ce buffer**, qui est effacé quand le pod est supprimé/recréé :

```bash
kubectl logs -n tribuzen tribuzen-api-7b9f-x2k9m            # logs du pod courant
kubectl logs -n tribuzen tribuzen-api-7b9f-x2k9m -c api     # container précis (pod multi-container)
kubectl logs -n tribuzen tribuzen-api-7b9f-x2k9m --previous # logs de l'INSTANCE PRÉCÉDENTE (avant le dernier restart)
```

`--previous` est vital après un crash : il montre les logs de l'instance qui vient de mourir. Mais une fois le pod entièrement supprimé, tout est perdu. **D'où l'obligation d'un agrégateur** : un agent en **DaemonSet** (un par node, ex. Fluent Bit / Promtail) lit `/var/log/containers/*.log`, enrichit chaque ligne avec les métadonnées K8s (`namespace`, `pod`, `container`, labels) et l'envoie vers un backend durable (Loki au module 15, ELK aussi). `kubectl logs` = debug ponctuel ; l'agrégateur = mémoire persistante. Le *comment* déployer/configurer cet agrégateur relève de la plateforme (cours 12) ; ici tu dois savoir **pourquoi** il est indispensable et **où** retrouver un log d'incident.

### 2.7 Probes liveness/readiness — côté observabilité

Les probes sont un mécanisme K8s (défini au cours 12) mais elles ont un versant **observabilité** que tu dois lire :

- **liveness** : si elle échoue, K8s **tue et recrée** le container → tu le vois en `restarts` qui montent (KSM). Une liveness mal réglée provoque des restarts en boucle *sans vrai problème applicatif*.
- **readiness** : si elle échoue, K8s **retire le pod du Service** (plus de trafic) sans le tuer → le pod est vivant mais absent des endpoints.

Côté obs, le signal exploitable : le nombre de pods **prêts** vs désirés.

```promql
# des replicas de l'API sont-ils non prêts (readiness KO) ?
kube_deployment_status_replicas_unavailable{namespace="tribuzen", deployment="tribuzen-api"} > 0
```

Corollaire pratique : ton endpoint de readiness (`/health/ready`) doit refléter les **vraies** dépendances (DB joignable, etc.), et tu **exclus** `/health/*` et `/metrics` de tes métriques de latence applicative — sinon les probes polluent ton p99.

### 2.8 Cardinalité en K8s — le piège se rejoue en pire

Rappel module 02 : chaque combinaison de labels = une série. K8s **injecte automatiquement** des labels via le service discovery : `namespace`, `pod`, `container`, `node`. Or `pod` est **naturellement à haute cardinalité** : chaque rollout crée des noms de pods neufs (`tribuzen-api-7b9f-x2k9m`, puis `-a4d2-...`). Sur un cluster qui déploie souvent, garder le label `pod` sur *toutes* les métriques fait exploser les séries dans le temps.

Règles :
- garde `namespace` + `app`/`deployment` (faible cardinalité, stables) pour l'agrégation courante ;
- réserve le label `pod` au **diagnostic ponctuel** (`sum by (pod, le)`), pas aux dashboards permanents larges ;
- utilise `metricRelabelings` dans le ServiceMonitor pour **drop** les métriques inutiles à la source (ex. familles `go_*` verbeuses) et limiter la cardinalité ;
- ne rajoute **jamais** un label métier illimité (userId, eventId) par-dessus les labels K8s déjà nombreux.

---

## 3. Worked examples

### Exemple 1 — diagnostiquer le pod lent du cas concret, couche par couche

Symptôme : p99 de `tribuzen-api` en dents de scie. On descend les couches dans l'ordre.

**Étape A — couche app : est-ce UN pod ou TOUS ?** On garde `pod` (diagnostic ponctuel, cardinalité assumée) :

```promql
histogram_quantile(0.99,
  sum by (pod, le) (rate(http_request_duration_seconds_bucket{namespace="tribuzen"}[5m])))
```

Résultat : `tribuzen-api-7b9f-x2k9m` = 4 s, les deux autres pods = 120 ms. → un seul pod fautif.

**Étape B — couche orchestrateur (KSM) : ce pod a-t-il redémarré / été OOM ?**

```promql
increase(kube_pod_container_status_restarts_total{namespace="tribuzen", pod="tribuzen-api-7b9f-x2k9m"}[1h])
kube_pod_container_status_terminated_reason{pod="tribuzen-api-7b9f-x2k9m", reason="OOMKilled"}
```

Résultat : 4 restarts sur l'heure, `reason="OOMKilled"` = 1. → le pod se fait tuer pour dépassement mémoire.

**Étape C — couche container (cAdvisor) : confirme la pression mémoire.**

```promql
container_memory_working_set_bytes{namespace="tribuzen", pod="tribuzen-api-7b9f-x2k9m", container="api"}
```

Résultat : working set collé au plafond de la limit. → **Diagnostic : ce replica fuit / dépasse la mémoire, se fait OOM-killer, et pendant le redémarrage + GC il sert lentement.** Ce n'est ni un bug de logique métier, ni un node saturé : c'est une *limit* mémoire trop basse (ou une fuite). L'action (ajuster la limit, corriger la fuite) relève ensuite du cours 12 — mais **l'observabilité a localisé la cause en trois requêtes**.

### Exemple 2 — brancher TribuZen sur kube-prometheus-stack via un ServiceMonitor

Objectif : que le Prometheus du chart scrape l'API TribuZen. On ne touche pas à `prometheus.yml` — on déclare des objets K8s. L'API expose déjà `/metrics` (module 02) sur un port nommé `metrics`.

```yaml
# service.yaml — le Service DOIT nommer le port scrapé
apiVersion: v1
kind: Service
metadata:
  name: tribuzen-api
  namespace: tribuzen
  labels:
    app: tribuzen-api
spec:
  selector:
    app: tribuzen-api
  ports:
    - name: http                # port applicatif
      port: 3000
      targetPort: 3000
    - name: metrics             # <-- ce NOM est ce que le ServiceMonitor référence
      port: 9090
      targetPort: 9090
---
# servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: tribuzen-api
  namespace: tribuzen
  labels:
    release: kube-prometheus    # le label que l'instance Prometheus du chart sélectionne
spec:
  selector:
    matchLabels:
      app: tribuzen-api         # matche le Service ci-dessus
  namespaceSelector:
    matchNames: [tribuzen]
  endpoints:
    - port: metrics             # le NOM du port, pas 9090
      path: /metrics
      interval: 15s
      metricRelabelings:        # coupe la cardinalité inutile à la source
        - sourceLabels: [__name__]
          regex: 'go_.*'
          action: drop
```

Vérification (l'oracle, pas la foi) :

```bash
kubectl apply -f service.yaml -f servicemonitor.yaml
# port-forward vers le Prometheus du chart :
kubectl port-forward -n monitoring svc/kube-prometheus-kube-prome-prometheus 9090:9090
# puis http://localhost:9090 → Status → Targets : la cible tribuzen-api doit être UP
```

Si la cible **n'apparaît pas** : 9 fois sur 10, le label `release:` du ServiceMonitor ne matche pas le `serviceMonitorSelector` de l'instance Prometheus (piège #2), ou le `port` référencé n'est pas un **nom** de port du Service (piège #1).

---

## 4. Pièges & misconceptions

### PIÈGE #1 — dans un ServiceMonitor, mettre le numéro de port au lieu de son nom

```yaml
# ❌ FAUX : 9090 est le numéro, pas le nom du port
endpoints:
  - port: 9090
# ✅ le champ `port` attend le NOM du port tel que déclaré dans le Service
endpoints:
  - port: metrics
```

Le champ `port` du ServiceMonitor référence le **nom** du port du Service (`name: metrics`). Un numéro échoue silencieusement : la cible n'apparaît jamais, sans message d'erreur.

### PIÈGE #2 — ServiceMonitor ignoré parce que le label ne matche pas

Le Prometheus déployé par le chart ne prend **pas** tous les ServiceMonitors du cluster : il sélectionne ceux qui portent un label précis (via `serviceMonitorSelector`, souvent `release: <nom-release>`). Un ServiceMonitor sans ce label est **poliment ignoré** — pas d'erreur, juste aucune cible. Réflexe : copier le label des ServiceMonitors installés par le chart (`kubectl get servicemonitor -n monitoring --show-labels`).

### PIÈGE #3 — lire `container_memory_usage_bytes` pour juger l'OOM

`container_memory_usage_bytes` inclut le cache filesystem (libérable). Un pod peut y afficher une valeur haute sans risque d'OOM. La métrique qui déclenche le kill est `container_memory_working_set_bytes` — c'est **toujours** celle-là qu'on compare à la limit.

### PIÈGE #4 — croire que `kubectl logs` garde l'historique

`kubectl logs` lit un buffer local au node, effacé quand le pod est supprimé/recréé. Après un OOM + recréation, les logs de l'incident ne sont accessibles que via `--previous` (et seulement jusqu'au prochain cycle). Sans agrégateur durable (DaemonSet → Loki/ELK), l'historique est **perdu**. « J'ai les logs dans K8s » est faux : tu as un buffer volatil.

### PIÈGE #5 — garder le label `pod` sur tous les dashboards

`pod` est à cardinalité qui **croît à chaque rollout** (noms neufs). Un dashboard large qui agrège `by (pod)` en permanence accumule des séries mortes et alourdit Prometheus. Agrège par `namespace`/`app` pour le courant ; descends à `by (pod)` seulement en diagnostic ponctuel.

### PIÈGE #6 — confondre readiness et liveness dans le diagnostic

Restarts qui montent = **liveness** qui échoue (K8s tue et recrée). Pods vivants mais hors du Service (pas de trafic) = **readiness** qui échoue (K8s retire du load-balancing sans tuer). Confondre les deux mène au mauvais correctif : on ne « répare » pas des restarts en touchant la readiness.

### PIÈGE #7 — mesurer la latence des probes comme de la latence utilisateur

`/health/live`, `/health/ready` et `/metrics` sont appelés en boucle par K8s et Prometheus. Inclus dans ton histogram applicatif, ils faussent le débit et parfois le p99. Exclus ces routes de l'instrumentation de latence métier.

---

## 5. Ancrage TribuZen

TribuZen tourne dans le namespace `tribuzen` : Deployment `tribuzen-api` (3 replicas), `tribuzen-worker` (e-mails d'invitation), un `Service` par Deployment. L'observabilité du cluster se pose ainsi :

| Besoin TribuZen | Couche | Source | Requête / objet |
|-----------------|--------|--------|-----------------|
| « Un replica API redémarre-t-il ? » | orchestrateur | KSM | `increase(kube_pod_container_status_restarts_total{namespace="tribuzen"}[1h])` |
| « Le worker e-mail est-il OOM ? » | orchestrateur | KSM | `kube_pod_container_status_terminated_reason{pod=~"tribuzen-worker-.*", reason="OOMKilled"}` |
| « Quel pod porte le p99 lent ? » | application | ton histogram | `sum by (pod, le) (rate(http_request_duration_seconds_bucket{namespace="tribuzen"}[5m]))` |
| « Un pod est-il throttlé mémoire ? » | container | cAdvisor | `container_memory_working_set_bytes{namespace="tribuzen"}` |
| « Faire scraper l'API par le chart » | plateforme obs | ServiceMonitor | `ServiceMonitor/tribuzen-api` (Exemple 2) |
| « Retrouver le log d'un pod tué à 9h03 » | logs | agrégateur | Loki via DaemonSet (module 15) — pas `kubectl logs` |

Fichiers d'observabilité versionnés (GitOps, module 13) dans `smaurier/tribuzen` :

```
tribuzen/
  deploy/
    k8s/
      api-service.yaml            ← Service, port `metrics` NOMMÉ
      api-servicemonitor.yaml     ← ServiceMonitor (label release: correct)
      worker-servicemonitor.yaml
  ops/
    grafana/
      k8s-pods-tribuzen.json      ← dashboard pods (module 07, provisionné module 13)
```

> Les alertes K8s (`PrometheusRule` sur `CrashLoopBackOff`, `OOMKilled`, `kube_deployment_status_replicas_unavailable`) sont écrites au **module 09**. Ici, on garantit que les **signaux existent et sont lisibles couche par couche**.

---

## 6. Points clés

1. K8s = tout est **éphémère** : logs sans disque durable, cibles qui bougent, plusieurs couches — l'observation doit être *continue* et *découverte dynamiquement*.
2. **Quatre couches, quatre outils** : node → `node-exporter`, orchestrateur → `kube-state-metrics`, container → `cAdvisor`, app → ton instrumentation. Ne jamais les confondre.
3. **cAdvisor = consommation** par container (intégré au kubelet, `/metrics/cadvisor`) ; `container_memory_working_set_bytes` est la mémoire qui compte pour l'OOM, pas `..._usage_bytes`.
4. **kube-state-metrics = état/santé** des objets K8s : `kube_pod_status_phase`, `..._restarts_total`, `..._waiting_reason{reason}`, `..._terminated_reason{reason="OOMKilled"}`, `kube_node_status_condition`.
5. **kube-prometheus-stack** (Helm, `prometheus-community`) installe Operator + Prometheus + Grafana + exporters ; on configure via des **CRDs**, pas `prometheus.yml`.
6. **ServiceMonitor** (`monitoring.coreos.com/v1`) : `port` = **nom** du port du Service, et le ServiceMonitor doit porter le **label sélectionné** par l'instance Prometheus (`release:`), sinon ignoré.
7. **Logs de pods** : `kubectl logs [--previous]` = debug volatil ; l'historique durable exige un agrégateur en DaemonSet → Loki/ELK.
8. **Probes** côté obs : liveness KO → restarts (KSM) ; readiness KO → pod retiré du Service (`replicas_unavailable`). Exclure `/health/*` et `/metrics` du p99 applicatif.
9. **Cardinalité** : K8s injecte `namespace/pod/container/node` ; `pod` croît à chaque rollout → agréger par `namespace/app`, réserver `by (pod)` au diagnostic, `metricRelabelings` pour drop à la source.

---

## 7. Seeds Anki

```
Quelles sont les couches à observer dans un cluster K8s, et l'outil de chacune ?|Node (node-exporter), Orchestrateur/K8s (kube-state-metrics), Container (cAdvisor, intégré au kubelet), Application (ton instrumentation prom-client/OTel). Quatre couches complémentaires : voir la conso container sans les métriques app = surveiller la tuyauterie sans savoir si l'eau est potable.
cAdvisor vs kube-state-metrics : que donne chacun ?|cAdvisor = CONSOMMATION par container (CPU, mémoire, réseau ; ex. container_cpu_usage_seconds_total, container_memory_working_set_bytes), intégré au kubelet sur /metrics/cadvisor. kube-state-metrics = ÉTAT/SANTÉ des objets K8s (kube_pod_status_phase, restarts, OOMKilled, node Ready). Un pod peu gourmand peut être en CrashLoopBackOff : cAdvisor calme, KSM qui hurle.
Quelle métrique mémoire compare-t-on à la limit pour l'OOM, et pourquoi pas l'autre ?|container_memory_working_set_bytes (mémoire active). container_memory_usage_bytes inclut le cache filesystem, libérable par le kernel → valeur haute trompeuse. C'est working_set qui déclenche l'OOM kill.
Deux pièges qui font qu'un ServiceMonitor ne scrape rien ?|1) le champ endpoints[].port attend le NOM du port du Service (ex. "metrics"), pas son numéro. 2) le ServiceMonitor doit porter le label sélectionné par l'instance Prometheus (souvent release: <nom>), sinon il est silencieusement ignoré. apiVersion = monitoring.coreos.com/v1.
Pourquoi kubectl logs ne suffit-il pas en prod K8s ?|Les pods sont éphémères : kubectl logs lit un buffer local au node, effacé à la suppression/recréation du pod. --previous montre l'instance d'avant le dernier restart, mais tout part une fois le pod supprimé. Il faut un agrégateur en DaemonSet (Fluent Bit/Promtail → Loki/ELK) pour un historique durable.
liveness vs readiness côté observabilité ?|liveness KO → K8s TUE et recrée le container → restarts qui montent (kube_pod_container_status_restarts_total). readiness KO → K8s RETIRE le pod du Service (plus de trafic) sans le tuer → kube_deployment_status_replicas_unavailable. Ne pas confondre pour choisir le bon correctif.
Comment écrire le p99 de latence PAR pod, et pourquoi ne pas garder ce label partout ?|histogram_quantile(0.99, sum by (pod, le) (rate(http_request_duration_seconds_bucket{namespace="tribuzen"}[5m]))). Le label pod est à cardinalité qui croît à chaque rollout (noms neufs) → réservé au diagnostic ponctuel ; en dashboard large, agréger par namespace/app et drop l'inutile via metricRelabelings.
Comment déployer la stack d'observabilité K8s en une commande ?|Helm chart kube-prometheus-stack (repo prometheus-community) : installe Prometheus Operator + Prometheus + Alertmanager + Grafana + node-exporter + kube-state-metrics + dashboards/règles. On configure ensuite via des CRDs (ServiceMonitor, PodMonitor, PrometheusRule), pas en éditant prometheus.yml.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-14-kubernetes-observability/README.md`. Sur un cluster local **kind** + kube-prometheus-stack, observer TribuZen couche par couche : lire `kube-state-metrics` et `cAdvisor`, retrouver les logs d'un pod (`--previous`), brancher un `ServiceMonitor`, provoquer un OOM et le diagnostiquer — corrigé complet, grille, coach, variante J+30.
