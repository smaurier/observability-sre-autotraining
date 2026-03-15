# Glossaire Observabilité & SRE

## A

### Alerting Rule

Regle definie dans Prometheus (où un autre système) qui declenche une alerte lorsqu'une condition est remplie pendant une duree donnee. Les regles sont ecrites en PromQL et declenchent des notifications via Alertmanager.

```yaml
alert: HighErrorRate
expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
for: 5m
```

### APM (Application Performance Monitoring)

Categorie d'outils qui mesurent et suivent les performances d'une application en production : temps de réponse, debit, erreurs, traces. Exemples : Datadog APM, New Relic, Elastic APM.

### Auto-instrumentation

Capacité d'un SDK (comme OpenTelemetry) a instrumenter automatiquement les bibliotheques et frameworks connus (Express, HTTP, pg, Redis) sans modification du code applicatif. Utilise des hooks et monkey-patching.

```typescript
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
```

## B

### Baggage

Mécanisme OpenTelemetry permettant de propager des paires clé-valeur arbitraires a travers les frontieres de services, en parallele du contexte de trace. Utile pour transmettre des metadonnees metier (tenantId, region).

### Blameless Culture

Culture d'équipe ou les postmortems et analyses d'incidents se concentrent sur les causes systemiques plutot que sur la responsabilite individuelle. L'objectif est d'ameliorer les processus, pas de punir les personnes.

### Blast Radius

Etendue de l'impact potentiel d'une panne ou d'une experience de chaos engineering. Controler le blast radius signifie limiter le nombre d'utilisateurs ou de services affectes.

### Burn Rate

Vitesse a laquelle une équipe consomme son error budget. Un burn rate de 1 signifie que le budget sera epuise exactement à la fin de la fenêtre SLO. Un burn rate de 10 signifie qu'il sera epuise 10x plus vite.

```
burn_rate = error_rate_observe / error_budget_rate
```

## C

### Cardinality

Nombre de combinaisons uniques de labels pour une metrique. Une cardinalite elevee (ex: un label `userId` sur chaque requête) peut causer des problèmes de performance et de stockage dans Prometheus.

### Chaos Engineering

Discipline consistant a injecter deliberement des pannes dans un système pour vérifier sa résilience et découvrir des faiblesses. Inspiree des pratiques de Netflix (Chaos Monkey).

### Child Logger

Logger dérivé d'un logger parent qui hérité de sa configuration tout en ajoutant des champs de contexte supplementaires. Permet d'enrichir les logs sans repeter les bindings communs.

```typescript
const childLogger = logger.child({ requestId: 'abc-123', service: 'orders' });
```

### Circuit Breaker

Pattern de résilience qui arrete temporairement les appels vers un service defaillant après un certain nombre d'echecs. Trois états : Closed (normal), Open (bloque), Half-Open (test de reprise).

### Collector (OTel)

Composant OpenTelemetry qui recoit, traite et exporte des donnees de telemetrie (traces, metriques, logs). Decouple les applications des backends d'observabilité.

### Composite SLO

SLO combine à partir de plusieurs SLIs individuels. Par exemple : le service est conforme si ET la disponibilité est >= 99.9% ET la latence p99 est < 500ms.

### Context Propagation

Mécanisme permettant de transmettre le contexte de trace (traceId, spanId) entre les services d'un système distribue, généralement via des headers HTTP (W3C traceparent).

### Correlation ID

Identifiant unique (souvent un UUID) attache à une requête et propage a travers tous les services qu'elle traverse. Permet de retrouver tous les logs lies à une même requête.

### Counter

Type de metrique Prometheus qui ne peut qu'augmenter (où etre reinitialise a zero). Utilise pour compter des événements : requêtes, erreurs, octets transferes. Applique `rate()` pour obtenir le debit.

```typescript
const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'status'],
});
```

## D

### Dashboard

Tableau de bord visuel aggregant metriques, logs et traces pour fournir une vue d'ensemble de la sante d'un système. Grafana est l'outil le plus utilise pour les dashboards d'observabilité.

### Deployment Frequency

Metrique DORA mesurant la frequence a laquelle une équipe deploie du code en production. Les équipes "elite" deploient à la demandé, plusieurs fois par jour.

### DORA Metrics

Ensemble de 4 metriques definies par le programme DORA (DevOps Research and Assessment) de Google : Deployment Frequency, Lead Time for Changes, Change Failure Rate, Mean Time to Recovery.

## E

### Error Budget

Quantite d'erreurs ou d'indisponibilite autorisee avant de violer un SLO. Pour un SLO de 99.9%, l'error budget est 0.1% du temps ou des requêtes sur la fenêtre de mesure.

### Error Budget Policy

Politique d'équipe definissant les actions a prendre lorsque l'error budget est epuise : gel des deployments, focus sur la fiabilité, revue des priorites.

### Event Loop Lag

Delai entre le moment où un callback est planifie et le moment où il est effectivement exécuté dans la boucle d'événements Node.js. Un indicateur clé de saturation du runtime.

### Exporter (OTel)

Composant du Collector OpenTelemetry responsable d'envoyer les donnees de telemetrie vers un backend (Jaeger, Prometheus, OTLP endpoint). Exemples : `otlp`, `prometheus`, `logging`.

## F

### Failure Mode Analysis (FMEA)

Méthode d'analyse systematique des modes de defaillance possibles d'un système, evaluant leur probabilite, impact et detectabilite. Aide a prioriser les efforts de résilience.

### Five Whys (5 Pourquoi)

Technique d'analyse de cause racine qui consiste a poser "Pourquoi ?" cinq fois successivement pour remonter d'un symptome a sa cause profonde. Utilisee dans les postmortems.

## G

### Game Day

Exercice planifie ou une équipe simule une panne en conditions controlees pour tester la résilience du système et les procedures d'incident. Forme structuree de chaos engineering.

### Gauge

Type de metrique Prometheus qui peut augmenter ou diminuer. Represente une valeur à un instant donne : temperature, connexions actives, utilisation mémoire.

```typescript
const activeConnections = new Gauge({
  name: 'http_connections_active',
  help: 'Currently active HTTP connections',
});
```

### Golden Signals

Les 4 signaux clés définis par Google SRE pour monitorer un service : Latency, Traffic, Errors, Saturation. Base des méthodes RED et USE.

### Grafana

Plateforme open source de visualisation et d'analyse. Se connecte a Prometheus, Jaeger et d'autres sources pour créer des dashboards, alertes et explorations.

## H

### Head-based Sampling

Stratégie d'echantillonnage ou la decision de garder ou rejeter une trace est prise au debut (création du root span). Simple mais ne peut pas filtrer sur le résultat final de la trace.

### Health Check

Endpoint HTTP qui indique l'état de sante d'un service. Trois types principaux : liveness (le processus tourne), readiness (pret a recevoir du trafic), startup (initialisation terminee).

### Histogram

Type de metrique Prometheus qui echantillonne les observations (ex: durees de requêtes) et les compte dans des buckets configurables. Permet de calculer des percentiles avec `histogram_quantile()`.

## I

### Incident

Événement non planifie qui degrade ou interrompt un service, necessitant une réponse organisee. Classifie par severite (SEV1-SEV4) selon l'impact et l'urgence.

### Incident Commander (IC)

Role principal lors d'un incident, responsable de la coordination de la réponse, de la prise de decisions et de la delegation des taches aux autres roles.

### Ishikawa Diagram (Diagramme en arete de poisson)

Outil d'analyse de causes racines qui organise les causes potentielles en categories (People, Process, Technology, Environment). Aussi appele fishbone diagram.

## J

### Jaeger

Système de tracing distribue open source, compatible OpenTelemetry. Permet de visualiser les traces sous forme de waterfall, analyser les latences et les dépendances entre services.

## K

### k6

Outil de load testing open source (Grafana Labs) qui utilise JavaScript/TypeScript pour définir les scenarios de test. Supporte les tests ramp-up, steady-state, spike et soak.

## L

### Label

Paire clé-valeur attachee à une metrique Prometheus pour la dimensionner. Exemples : `method="GET"`, `status="200"`, `route="/api/products"`.

### Lead Time for Changes

Metrique DORA mesurant le temps entre le commit d'un changement et son déploiement en production. Les équipes elite mesurent ce delai en heures.

### Liveness Probe

Vérification periodique indiquant qu'un processus est vivant et non bloque. Si la probe echoue, le conteneur est redemarre (dans Kubernetes).

## M

### MTTR (Mean Time to Recovery)

Temps moyen entre la detection d'un incident et sa résolution complete. Metrique DORA mesurant la capacité d'une équipe a se remettre d'une panne.

### Multi-window Burn Rate

Stratégie d'alerting recommandee par Google SRE Workbook combinant plusieurs fenetres temporelles (1h, 6h) et seuils de burn rate pour reduire les faux positifs et la fatigue d'alerte.

## O

### On-call

Pratique de disponibilité ou un ingenieur est designe pour repondre aux alertes et incidents en dehors des heures de bureau. Implique rotations, compensation et gestion de la fatigue.

### OpenTelemetry

Framework open source et standard pour la collecte de telemetrie (traces, metriques, logs). Fournit des SDKs pour de nombreux langages et un Collector pour le traitement des donnees.

### OTLP (OpenTelemetry Protocol)

Protocole de transport natif d'OpenTelemetry pour envoyer des traces, metriques et logs. Supporte gRPC (port 4317) et HTTP (port 4318).

## P

### PII (Personally Identifiable Information)

Donnees permettant d'identifier une personne : email, numéro de carte, adresse. Les logs doivent etre proteges contre les fuites de PII via des redactors.

### Pino

Logger Node.js haute performance utilisant la serialisation JSON native de V8. Significativement plus rapide que Winston ou Bunyan. Supporte les child loggers, transports et redactors.

### Postmortem

Document écrit après un incident decrivant ce qui s'est passe, l'impact, les causes racines et les actions correctives. Doit etre blameless, factuel et partage largement.

### Processor (OTel)

Composant du Collector OpenTelemetry qui transforme les donnees entre reception et export. Exemples : batch (regroupement), memory_limiter, filter, tail_sampling, attributes.

### Production Readiness Review (PRR)

Processus d'évaluation systematique determinant si un service est pret pour la production. Couvre l'observabilité, le scaling, la sécurité, la reprise et les dépendances.

### prom-client

Bibliotheque Node.js officielle pour exposer des metriques au format Prometheus. Fournit Counter, Gauge, Histogram, Summary et collecte des metriques par defaut.

### Prometheus

Système de monitoring et d'alerting open source, avec un modèle pull-based, un stockage TSDB et le langage de requête PromQL. Standard de facto pour les metriques dans l'ecosysteme cloud-native.

### PromQL

Langage de requête de Prometheus. Permet de selectionner, agreger et transformer les series temporelles. Fonctions clés : `rate()`, `increase()`, `histogram_quantile()`, `predict_linear()`.

## R

### Rate

Fonction PromQL calculant le debit par seconde d'un counter sur une fenêtre de temps. `rate(http_requests_total[5m])` retourne le nombre moyen de requêtes par seconde sur 5 minutes.

### Readiness Probe

Vérification indiquant qu'un service est pret a recevoir du trafic. Contrairement à la liveness probe, un echec retire le service du load balancer sans le redemarrer.

### Receiver (OTel)

Composant du Collector OpenTelemetry qui recoit les donnees de telemetrie. Supporte OTLP, Prometheus, Jaeger, Zipkin et d'autres formats.

### RED Method

Méthode d'observabilité pour les services orientes requêtes : Rate (debit), Errors (taux d'erreur), Duration (latence). Applicable a tout microservice ou API.

### Redactor

Mécanisme de Pino qui masque ou supprime automatiquement des champs sensibles dans les logs avant leur emission. Protege contre les fuites de PII.

```typescript
const logger = pino({ redact: ['req.headers.authorization', '*.password'] });
```

### Runbook

Document operationnel decrivant les étapes à suivre pour diagnostiquer et résoudre un problème spécifique. Lie aux alertes pour guider l'operateur on-call.

## S

### Sampling

Technique de reduction du volume de telemetrie en ne conservant qu'une fraction des donnees. Deux approches : head-based (decision au debut) et tail-based (decision à la fin de la trace).

### SLA (Service Level Agreement)

Contrat formel entre un fournisseur et un client specifiant les niveaux de service garantis et les consequences (financieres) en cas de non-respect. Plus strict qu'un SLO.

### SLI (Service Level Indicator)

Mesure quantitative d'un aspect du service : disponibilité, latence, debit, taux d'erreur. Base sur laquelle les SLOs sont définis.

### SLO (Service Level Objective)

Objectif interne de fiabilité base sur un SLI. Exemple : "99.9% des requêtes aboutissent avec succes sur 30 jours glissants". Moins strict qu'un SLA.

### Span

Unite de travail dans une trace distribuee. Contient un nom d'operation, des timestamps debut/fin, des attributs, des événements et un lien vers le span parent.

### Structured Logging

Pratique de logger des événements sous forme de donnees structurees (JSON) plutot que du texte libre. Permet le parsing automatique, le filtrage et l'analyse.

## T

### Tail-based Sampling

Stratégie d'echantillonnage ou la decision de garder une trace est prise après que tous les spans sont collectes. Permet de garder preferentiellement les traces avec erreurs ou latence elevee.

### Toil

Travail manuel, repetitif, automatisable, tactique et sans valeur durable. Le SRE book de Google recommande de limiter le toil a 50% du temps d'un SRE.

### Trace

Ensemble de spans lies representant le parcours complet d'une requête a travers un système distribue. Identifie par un traceId unique.

### Trace Context (W3C)

Standard W3C definissant le format des headers HTTP pour la propagation du contexte de trace : `traceparent` (version, traceId, spanId, flags) et `tracestate` (metadonnees vendor).

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
```

### TSDB (Time Series Database)

Base de donnees optimisee pour le stockage et la requête de series temporelles. Prometheus utilise une TSDB intégrée avec compression et retention configurables.

## U

### USE Method

Méthode d'observabilité pour les ressources système : Utilization (taux d'utilisation), Saturation (file d'attente), Errors (erreurs materielles/logicielles). Applicable a CPU, mémoire, disque, réseau.

## W

### Waterfall View

Vue de visualisation d'une trace distribuee montrant les spans sous forme de barres horizontales sur une timeline. Permet de visualiser les dépendances et les latences entre services.
