# Glossaire Observabilite & SRE

## A

### Alerting Rule

Regle definie dans Prometheus (ou un autre systeme) qui declenche une alerte lorsqu'une condition est remplie pendant une duree donnee. Les regles sont ecrites en PromQL et declenchent des notifications via Alertmanager.

```yaml
alert: HighErrorRate
expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
for: 5m
```

### APM (Application Performance Monitoring)

Categorie d'outils qui mesurent et suivent les performances d'une application en production : temps de reponse, debit, erreurs, traces. Exemples : Datadog APM, New Relic, Elastic APM.

### Auto-instrumentation

Capacite d'un SDK (comme OpenTelemetry) a instrumenter automatiquement les bibliotheques et frameworks connus (Express, HTTP, pg, Redis) sans modification du code applicatif. Utilise des hooks et monkey-patching.

```typescript
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
```

## B

### Baggage

Mecanisme OpenTelemetry permettant de propager des paires cle-valeur arbitraires a travers les frontieres de services, en parallele du contexte de trace. Utile pour transmettre des metadonnees metier (tenantId, region).

### Blameless Culture

Culture d'equipe ou les postmortems et analyses d'incidents se concentrent sur les causes systemiques plutot que sur la responsabilite individuelle. L'objectif est d'ameliorer les processus, pas de punir les personnes.

### Blast Radius

Etendue de l'impact potentiel d'une panne ou d'une experience de chaos engineering. Controler le blast radius signifie limiter le nombre d'utilisateurs ou de services affectes.

### Burn Rate

Vitesse a laquelle une equipe consomme son error budget. Un burn rate de 1 signifie que le budget sera epuise exactement a la fin de la fenetre SLO. Un burn rate de 10 signifie qu'il sera epuise 10x plus vite.

```
burn_rate = error_rate_observe / error_budget_rate
```

## C

### Cardinality

Nombre de combinaisons uniques de labels pour une metrique. Une cardinalite elevee (ex: un label `userId` sur chaque requete) peut causer des problemes de performance et de stockage dans Prometheus.

### Chaos Engineering

Discipline consistant a injecter deliberement des pannes dans un systeme pour verifier sa resilience et decouvrir des faiblesses. Inspiree des pratiques de Netflix (Chaos Monkey).

### Child Logger

Logger derive d'un logger parent qui herite de sa configuration tout en ajoutant des champs de contexte supplementaires. Permet d'enrichir les logs sans repeter les bindings communs.

```typescript
const childLogger = logger.child({ requestId: 'abc-123', service: 'orders' });
```

### Circuit Breaker

Pattern de resilience qui arrete temporairement les appels vers un service defaillant apres un certain nombre d'echecs. Trois etats : Closed (normal), Open (bloque), Half-Open (test de reprise).

### Collector (OTel)

Composant OpenTelemetry qui recoit, traite et exporte des donnees de telemetrie (traces, metriques, logs). Decouple les applications des backends d'observabilite.

### Composite SLO

SLO combine a partir de plusieurs SLIs individuels. Par exemple : le service est conforme si ET la disponibilite est >= 99.9% ET la latence p99 est < 500ms.

### Context Propagation

Mecanisme permettant de transmettre le contexte de trace (traceId, spanId) entre les services d'un systeme distribue, generalement via des headers HTTP (W3C traceparent).

### Correlation ID

Identifiant unique (souvent un UUID) attache a une requete et propage a travers tous les services qu'elle traverse. Permet de retrouver tous les logs lies a une meme requete.

### Counter

Type de metrique Prometheus qui ne peut qu'augmenter (ou etre reinitialise a zero). Utilise pour compter des evenements : requetes, erreurs, octets transferes. Applique `rate()` pour obtenir le debit.

```typescript
const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'status'],
});
```

## D

### Dashboard

Tableau de bord visuel aggregant metriques, logs et traces pour fournir une vue d'ensemble de la sante d'un systeme. Grafana est l'outil le plus utilise pour les dashboards d'observabilite.

### Deployment Frequency

Metrique DORA mesurant la frequence a laquelle une equipe deploie du code en production. Les equipes "elite" deploient a la demande, plusieurs fois par jour.

### DORA Metrics

Ensemble de 4 metriques definies par le programme DORA (DevOps Research and Assessment) de Google : Deployment Frequency, Lead Time for Changes, Change Failure Rate, Mean Time to Recovery.

## E

### Error Budget

Quantite d'erreurs ou d'indisponibilite autorisee avant de violer un SLO. Pour un SLO de 99.9%, l'error budget est 0.1% du temps ou des requetes sur la fenetre de mesure.

### Error Budget Policy

Politique d'equipe definissant les actions a prendre lorsque l'error budget est epuise : gel des deployments, focus sur la fiabilite, revue des priorites.

### Event Loop Lag

Delai entre le moment ou un callback est planifie et le moment ou il est effectivement execute dans la boucle d'evenements Node.js. Un indicateur cle de saturation du runtime.

### Exporter (OTel)

Composant du Collector OpenTelemetry responsable d'envoyer les donnees de telemetrie vers un backend (Jaeger, Prometheus, OTLP endpoint). Exemples : `otlp`, `prometheus`, `logging`.

## F

### Failure Mode Analysis (FMEA)

Methode d'analyse systematique des modes de defaillance possibles d'un systeme, evaluant leur probabilite, impact et detectabilite. Aide a prioriser les efforts de resilience.

### Five Whys (5 Pourquoi)

Technique d'analyse de cause racine qui consiste a poser "Pourquoi ?" cinq fois successivement pour remonter d'un symptome a sa cause profonde. Utilisee dans les postmortems.

## G

### Game Day

Exercice planifie ou une equipe simule une panne en conditions controlees pour tester la resilience du systeme et les procedures d'incident. Forme structuree de chaos engineering.

### Gauge

Type de metrique Prometheus qui peut augmenter ou diminuer. Represente une valeur a un instant donne : temperature, connexions actives, utilisation memoire.

```typescript
const activeConnections = new Gauge({
  name: 'http_connections_active',
  help: 'Currently active HTTP connections',
});
```

### Golden Signals

Les 4 signaux cles definis par Google SRE pour monitorer un service : Latency, Traffic, Errors, Saturation. Base des methodes RED et USE.

### Grafana

Plateforme open source de visualisation et d'analyse. Se connecte a Prometheus, Jaeger et d'autres sources pour creer des dashboards, alertes et explorations.

## H

### Head-based Sampling

Strategie d'echantillonnage ou la decision de garder ou rejeter une trace est prise au debut (creation du root span). Simple mais ne peut pas filtrer sur le resultat final de la trace.

### Health Check

Endpoint HTTP qui indique l'etat de sante d'un service. Trois types principaux : liveness (le processus tourne), readiness (pret a recevoir du trafic), startup (initialisation terminee).

### Histogram

Type de metrique Prometheus qui echantillonne les observations (ex: durees de requetes) et les compte dans des buckets configurables. Permet de calculer des percentiles avec `histogram_quantile()`.

## I

### Incident

Evenement non planifie qui degrade ou interrompt un service, necessitant une reponse organisee. Classifie par severite (SEV1-SEV4) selon l'impact et l'urgence.

### Incident Commander (IC)

Role principal lors d'un incident, responsable de la coordination de la reponse, de la prise de decisions et de la delegation des taches aux autres roles.

### Ishikawa Diagram (Diagramme en arete de poisson)

Outil d'analyse de causes racines qui organise les causes potentielles en categories (People, Process, Technology, Environment). Aussi appele fishbone diagram.

## J

### Jaeger

Systeme de tracing distribue open source, compatible OpenTelemetry. Permet de visualiser les traces sous forme de waterfall, analyser les latences et les dependances entre services.

## K

### k6

Outil de load testing open source (Grafana Labs) qui utilise JavaScript/TypeScript pour definir les scenarios de test. Supporte les tests ramp-up, steady-state, spike et soak.

## L

### Label

Paire cle-valeur attachee a une metrique Prometheus pour la dimensionner. Exemples : `method="GET"`, `status="200"`, `route="/api/products"`.

### Lead Time for Changes

Metrique DORA mesurant le temps entre le commit d'un changement et son deploiement en production. Les equipes elite mesurent ce delai en heures.

### Liveness Probe

Verification periodique indiquant qu'un processus est vivant et non bloque. Si la probe echoue, le conteneur est redemarre (dans Kubernetes).

## M

### MTTR (Mean Time to Recovery)

Temps moyen entre la detection d'un incident et sa resolution complete. Metrique DORA mesurant la capacite d'une equipe a se remettre d'une panne.

### Multi-window Burn Rate

Strategie d'alerting recommandee par Google SRE Workbook combinant plusieurs fenetres temporelles (1h, 6h) et seuils de burn rate pour reduire les faux positifs et la fatigue d'alerte.

## O

### On-call

Pratique de disponibilite ou un ingenieur est designe pour repondre aux alertes et incidents en dehors des heures de bureau. Implique rotations, compensation et gestion de la fatigue.

### OpenTelemetry

Framework open source et standard pour la collecte de telemetrie (traces, metriques, logs). Fournit des SDKs pour de nombreux langages et un Collector pour le traitement des donnees.

### OTLP (OpenTelemetry Protocol)

Protocole de transport natif d'OpenTelemetry pour envoyer des traces, metriques et logs. Supporte gRPC (port 4317) et HTTP (port 4318).

## P

### PII (Personally Identifiable Information)

Donnees permettant d'identifier une personne : email, numero de carte, adresse. Les logs doivent etre proteges contre les fuites de PII via des redactors.

### Pino

Logger Node.js haute performance utilisant la serialisation JSON native de V8. Significativement plus rapide que Winston ou Bunyan. Supporte les child loggers, transports et redactors.

### Postmortem

Document ecrit apres un incident decrivant ce qui s'est passe, l'impact, les causes racines et les actions correctives. Doit etre blameless, factuel et partage largement.

### Processor (OTel)

Composant du Collector OpenTelemetry qui transforme les donnees entre reception et export. Exemples : batch (regroupement), memory_limiter, filter, tail_sampling, attributes.

### Production Readiness Review (PRR)

Processus d'evaluation systematique determinant si un service est pret pour la production. Couvre l'observabilite, le scaling, la securite, la reprise et les dependances.

### prom-client

Bibliotheque Node.js officielle pour exposer des metriques au format Prometheus. Fournit Counter, Gauge, Histogram, Summary et collecte des metriques par defaut.

### Prometheus

Systeme de monitoring et d'alerting open source, avec un modele pull-based, un stockage TSDB et le langage de requete PromQL. Standard de facto pour les metriques dans l'ecosysteme cloud-native.

### PromQL

Langage de requete de Prometheus. Permet de selectionner, agreger et transformer les series temporelles. Fonctions cles : `rate()`, `increase()`, `histogram_quantile()`, `predict_linear()`.

## R

### Rate

Fonction PromQL calculant le debit par seconde d'un counter sur une fenetre de temps. `rate(http_requests_total[5m])` retourne le nombre moyen de requetes par seconde sur 5 minutes.

### Readiness Probe

Verification indiquant qu'un service est pret a recevoir du trafic. Contrairement a la liveness probe, un echec retire le service du load balancer sans le redemarrer.

### Receiver (OTel)

Composant du Collector OpenTelemetry qui recoit les donnees de telemetrie. Supporte OTLP, Prometheus, Jaeger, Zipkin et d'autres formats.

### RED Method

Methode d'observabilite pour les services orientes requetes : Rate (debit), Errors (taux d'erreur), Duration (latence). Applicable a tout microservice ou API.

### Redactor

Mecanisme de Pino qui masque ou supprime automatiquement des champs sensibles dans les logs avant leur emission. Protege contre les fuites de PII.

```typescript
const logger = pino({ redact: ['req.headers.authorization', '*.password'] });
```

### Runbook

Document operationnel decrivant les etapes a suivre pour diagnostiquer et resoudre un probleme specifique. Lie aux alertes pour guider l'operateur on-call.

## S

### Sampling

Technique de reduction du volume de telemetrie en ne conservant qu'une fraction des donnees. Deux approches : head-based (decision au debut) et tail-based (decision a la fin de la trace).

### SLA (Service Level Agreement)

Contrat formel entre un fournisseur et un client specifiant les niveaux de service garantis et les consequences (financieres) en cas de non-respect. Plus strict qu'un SLO.

### SLI (Service Level Indicator)

Mesure quantitative d'un aspect du service : disponibilite, latence, debit, taux d'erreur. Base sur laquelle les SLOs sont definis.

### SLO (Service Level Objective)

Objectif interne de fiabilite base sur un SLI. Exemple : "99.9% des requetes aboutissent avec succes sur 30 jours glissants". Moins strict qu'un SLA.

### Span

Unite de travail dans une trace distribuee. Contient un nom d'operation, des timestamps debut/fin, des attributs, des evenements et un lien vers le span parent.

### Structured Logging

Pratique de logger des evenements sous forme de donnees structurees (JSON) plutot que du texte libre. Permet le parsing automatique, le filtrage et l'analyse.

## T

### Tail-based Sampling

Strategie d'echantillonnage ou la decision de garder une trace est prise apres que tous les spans sont collectes. Permet de garder preferentiellement les traces avec erreurs ou latence elevee.

### Toil

Travail manuel, repetitif, automatisable, tactique et sans valeur durable. Le SRE book de Google recommande de limiter le toil a 50% du temps d'un SRE.

### Trace

Ensemble de spans lies representant le parcours complet d'une requete a travers un systeme distribue. Identifie par un traceId unique.

### Trace Context (W3C)

Standard W3C definissant le format des headers HTTP pour la propagation du contexte de trace : `traceparent` (version, traceId, spanId, flags) et `tracestate` (metadonnees vendor).

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
```

### TSDB (Time Series Database)

Base de donnees optimisee pour le stockage et la requete de series temporelles. Prometheus utilise une TSDB integree avec compression et retention configurables.

## U

### USE Method

Methode d'observabilite pour les ressources systeme : Utilization (taux d'utilisation), Saturation (file d'attente), Errors (erreurs materielles/logicielles). Applicable a CPU, memoire, disque, reseau.

## W

### Waterfall View

Vue de visualisation d'une trace distribuee montrant les spans sous forme de barres horizontales sur une timeline. Permet de visualiser les dependances et les latences entre services.
