# References & Lectures recommandees

Cette page rassemble les livres, papiers, outils et ressources communautaires essentiels pour approfondir vos connaissances en observabilite et SRE. Organisee par theme, chaque ressource est accompagnee d'un commentaire sur ce qu'elle apporte concretement.

---

## Livres essentiels

### Google SRE Book — "Site Reliability Engineering" (2016)

- Gratuit en ligne : [https://sre.google/sre-book/table-of-contents/](https://sre.google/sre-book/table-of-contents/)
- Chapitres cles en lien avec notre cours :
  - Ch. 1 (Introduction) → Module 00-01
  - Ch. 6 (Monitoring Distributed Systems) → Modules 04-06
  - Ch. 10 (Practical Alerting) → Module 11
  - Ch. 12 (Effective Troubleshooting) → Modules 02-03, 07
  - Ch. 14 (Managing Incidents) → Module 12
  - Ch. 15 (Postmortem Culture) → Module 13
  - Ch. 17 (Testing for Reliability) → Module 15
  - Ch. 22 (Cascading Failures) → Module 15
  - Ch. 28 (Accelerating SRE On-Call) → Module 12
- **Commentaire** : LE texte fondateur. Dense mais incontournable. Commencez par les Chapitres 6, 14 et 15.

### Google SRE Workbook — "The Site Reliability Workbook" (2018)

- Gratuit en ligne : [https://sre.google/workbook/table-of-contents/](https://sre.google/workbook/table-of-contents/)
- Chapitres cles :
  - Ch. 2 (Implementing SLOs) → Module 10
  - Ch. 5 (Alerting on SLOs) → Module 11
  - Ch. 9 (Incident Response) → Module 12
  - Ch. 11 (Managing Load) → Module 14
- **Commentaire** : Le compagnon pratique. La ou le SRE Book est theorique, le Workbook est ancre dans la pratique. Le Chapitre 5 sur le multi-window burn rate alerting est la source directe du Module 11.

### "Observability Engineering" — Charity Majors, Liz Fong-Jones, George Miranda (2022)

- Editeur : O'Reilly
- Couvre : Le changement de paradigme du monitoring vers l'observabilite, les donnees haute cardinalite, les wide events, le debugging base sur les traces
- **Commentaire** : Ecrit par les fondateurs de Honeycomb. Remet en question les idees recues. Essentiel pour comprendre POURQUOI l'observabilite va au-dela des 3 piliers.

### "Release It!" — Michael Nygard (2e edition, 2018)

- Editeur : Pragmatic Bookshelf
- Couvre : Les patterns de stabilite (circuit breaker, bulkhead, timeout, retry), les anti-patterns (cascading failures, blocked threads, self-denial attacks)
- **Commentaire** : La bible des patterns de resilience en production. Chaque pattern du Module 15 vient de ou est inspire par ce livre.

### "Designing Data-Intensive Applications" — Martin Kleppmann (2017)

- Editeur : O'Reilly
- Couvre : Les fondamentaux des systemes distribues, la consistance, la replication, le partitionnement
- **Commentaire** : Pas specifiquement sur l'observabilite, mais comprendre les systemes distribues est un prerequis pour comprendre pourquoi le tracing et les SLOs existent.

### "Chaos Engineering" — Casey Rosenthal, Nora Jones (2020)

- Editeur : O'Reilly
- Couvre : Les principes, les aspects sociotechniques, la verification continue, l'experimentation a grande echelle
- **Commentaire** : Va bien au-dela du "tuer un processus". Les chapitres sur les facteurs humains et l'adoption organisationnelle sont particulierement precieux.

---

## Papiers et articles fondateurs

### "Dapper, a Large-Scale Distributed Systems Tracing Infrastructure" (Google, 2010)

- Le papier qui a inspire Zipkin, Jaeger, et finalement OpenTelemetry
- **Contribution cle** : le modele trace/span, les strategies d'echantillonnage, le tracing a faible overhead

### "Accelerate" — Nicole Forsgren, Jez Humble, Gene Kim (2018)

- La recherche derriere les metriques DORA
- **Contribution cle** : la preuve statistique que la frequence de deploiement, le lead time, le MTTR et le change failure rate predisent la performance organisationnelle

### "On Designing and Deploying Internet-Scale Services" — James Hamilton (2007)

- Papier de Microsoft Research
- **Contribution cle** : des principes de conception operationnelle qui restent pertinents plus de 15 ans apres

---

## Outils et ecosysteme

### Observabilite

| Outil | Role | Licence | Modules |
|-------|------|---------|---------|
| **Pino** | Logger Node.js haute performance | MIT | 02, 03 |
| **prom-client** | Client Prometheus pour Node.js | Apache 2.0 | 04, 05, 06 |
| **OpenTelemetry** | SDK de telemetrie (traces, metriques, logs) | Apache 2.0 | 07, 08 |
| **Prometheus** | Monitoring et alerting, TSDB | Apache 2.0 | 05, 06, 09, 11 |
| **Grafana** | Visualisation et dashboards | AGPL 3.0 | 09, 17 |
| **Jaeger** | Tracing distribue | Apache 2.0 | 07, 08 |
| **Loki** | Agregation de logs (compatible Grafana) | AGPL 3.0 | 02 (reference) |
| **Tempo** | Backend de traces (compatible Grafana) | AGPL 3.0 | 07 (reference) |
| **Alertmanager** | Routage et silencing d'alertes | Apache 2.0 | 11 |

### Chaos Engineering

| Outil | Role | Licence |
|-------|------|---------|
| **Gremlin** | Plateforme SaaS de chaos engineering | Commercial |
| **Litmus Chaos** | Chaos engineering natif Kubernetes (CNCF) | Apache 2.0 |
| **Chaos Toolkit** | Framework CLI extensible | Apache 2.0 |
| **Toxiproxy** | Proxy TCP pour simuler conditions reseau | MIT |
| **k6** | Load testing (Grafana Labs) | AGPL 3.0 |

### Incident Management

| Outil | Role |
|-------|------|
| **PagerDuty** | Alerting et on-call management |
| **Opsgenie** | Alerting et escalation (Atlassian) |
| **Incident.io** | Incident management dans Slack |
| **Statuspage** | Communication de statut public |
| **Rootly** | Incident management automatise |

---

## Communaute et apprentissage continu

### Sites et blogs

- **SRE Weekly** (sreweekly.com) — newsletter hebdomadaire curee sur la fiabilite
- **Google SRE Blog** (sre.google/resources) — articles et case studies
- **Charity Majors' Blog** (charity.wtf) — reflexions sur l'observabilite et l'engineering management
- **Netflix Tech Blog** — articles sur le chaos engineering et la resilience
- **Grafana Blog** — tutoriels et bonnes pratiques observabilite

### Conferences

- **SREcon** (USENIX) — la conference de reference pour les SREs
- **KubeCon** (CNCF) — track observabilite et reliability
- **Monitorama** — conference dediee a l'observabilite
- **Chaos Conf** — conference dediee au chaos engineering

### Certifications

- **Google Professional Cloud DevOps Engineer** — couvre SRE, monitoring, incident management
- **Prometheus Certified Associate (PCA)** — certification CNCF sur Prometheus

---

::: tip Comment utiliser cette page
Ne lisez pas tout d'un coup. Utilisez cette page comme reference au fil de votre progression :
1. **Modules 00-04** : lisez les Chapitres 1 et 6 du SRE Book
2. **Modules 05-09** : explorez Prometheus, Grafana et Jaeger
3. **Modules 10-14** : lisez les Chapitres 2 et 5 du SRE Workbook + le Chapitre 14 du SRE Book
4. **Modules 15-19** : lisez "Release It!" et "Chaos Engineering"
:::
