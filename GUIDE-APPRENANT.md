# Guide de l'apprenant -- Observabilite & SRE

> **Ce guide est ta boussole.** Il t'aide a savoir ou tu en es, par ou passer,
> et quoi faire quand tu bloques. Lis-le avant de commencer, et reviens-y regulierement.
>
> **Temps estime** : ~150-200h (4-6 mois a 8-10h/semaine)
>
> **Philosophie** : `console.log` n'est pas de l'observabilite. L'observabilite, c'est
> pouvoir repondre a n'importe quelle question sur ton systeme en production
> SANS deployer de nouveau code. C'est un superpouvoir que tout dev devrait maitriser.

---

## Avant de commencer -- Auto-diagnostic

Reponds honnetement. Ce n'est pas un examen -- c'est un GPS.

### Prerequis techniques

Coche ce que tu sais faire SANS chercher sur Google :
- [ ] Deployer une application Node.js avec Docker
- [ ] Utiliser un reverse proxy (nginx, traefik)
- [ ] Lire des logs applicatifs et reperer une erreur
- [ ] Comprendre les bases HTTP (status codes, headers)
- [ ] Utiliser un terminal et des commandes basiques Linux
- [ ] Avoir une idee de ce qu'est une metrique (CPU, memoire, latence)

**6/6** -> Tu es pret. Attaque directement le module 00.
**4-5/6** -> Revise Docker et les bases Linux, puis lance-toi.
**< 4/6** -> Termine d'abord les cours NestJS (05) et Architecture (10). Ce cours suppose une app a observer.

### Observabilite -- ou en es-tu deja ?

- [ ] Tu utilises autre chose que `console.log` pour le logging en production
- [ ] Tu sais ce qu'est Prometheus (ou un outil de metriques equivalent)
- [ ] Tu as deja configure une alerte (PagerDuty, Grafana, etc.)
- [ ] Tu sais ce qu'est le tracing distribue
- [ ] Tu as deja participe a un postmortem apres un incident

**5/5** -> Tu as de l'experience. Commence a la Phase 3 (module 10) apres avoir verifie le checkpoint Phase 2.
**2-4/5** -> Tu as des bases. Commence au debut, tu iras vite sur les fondamentaux.
**0-1/5** -> C'est le parcours classique. La majorite des devs n'ont jamais appris l'observabilite formellement.

### Le test decisif

Ton application en production repond lentement depuis 30 minutes. Comment diagnostiques-tu ?

- Si tu penses a : dashboards de metriques, traces de requetes lentes, logs correles par request ID, alertes SLO -> tu as le reflexe SRE. Verifie la Phase 3.
- Si tu penses "je regarde les logs et je cherche une erreur" -> c'est un debut, le cours va t'outiller.
- Si tu penses "je me connecte en SSH et je lance `top`" -> le cours va changer ta vie.

---

## Les 5 phases de ta progression

### Phase 1 -- Fondamentaux (modules 00-03) ~20-25h

> **Objectif** : Comprendre les 3 piliers de l'observabilite (logs, metriques, traces)
> et poser les bases du logging structure.
>
> **Analogie** : C'est comme installer des cameras de surveillance et des capteurs dans une usine.

| Module | Sujet | Temps | Note |
|---|---|---|---|
| 00 | Prerequis et introduction | 1h30 | Observabilite vs monitoring -- la difference est cruciale |
| 01 | Pourquoi l'observabilite | 2h | Les 3 piliers, les anti-patterns, le cout de ne pas observer |
| 02 | Logging structure | 3h | **Cours cle** -- JSON, niveaux, contexte, correlation |
| 03 | Niveaux de log et contexte | 3h | Quand utiliser `info`, `warn`, `error`, et comment structurer |

**Exercices Phase 1** : Prends une app existante et remplace tous les `console.log`
par du logging structure avec pino ou winston. C'est le meilleur exercice.

**Checkpoint Phase 1** :
- [ ] Tu sais expliquer les 3 piliers de l'observabilite (logs, metriques, traces)
- [ ] Tu sais configurer un logger structure (pino, winston) avec des niveaux et du contexte
- [ ] Tu sais ajouter un correlation ID a chaque requete pour tracer un flux
- [ ] Tu sais choisir le bon niveau de log (debug, info, warn, error)
- [ ] Tu ne mets plus jamais `console.log` en production

> **Test** : Un collegue ecrit `console.log('error:', err)`. Que lui dis-tu ?
> Si tu proposes `logger.error({ err, requestId, userId }, 'Payment failed')`, c'est bon.

---

### Phase 2 -- Instrumentation (modules 04-09) ~35-45h

> **Objectif** : Maitriser Prometheus pour les metriques, le tracing distribue,
> Sentry pour l'error tracking, OpenTelemetry, et Grafana pour les dashboards.
>
> **Analogie** : Tu installes les instruments de mesure. Sans donnees, pas de decisions.

| Module | Sujet | Temps | Note |
|---|---|---|---|
| 04 | Metriques et Prometheus | 4h | **Cours cle** -- counters, gauges, histograms, PromQL |
| 05 | RED et USE methodes | 3h | Les frameworks pour choisir quoi mesurer |
| 06 | Distributed tracing | 4h | **Cours cle** -- spans, traces, propagation de contexte |
| 07 | Sentry et error tracking | 3h | Capturer, grouper et prioriser les erreurs |
| 08 | OpenTelemetry Collector | 3h | Le pipeline d'instrumentation universel |
| 09 | Grafana dashboards | 4h | **Cours cle** -- creer des dashboards utiles (pas jolis) |

**Conseil** : Le module 04 (Prometheus) est le plus important de cette phase.
PromQL est un langage a part entiere -- prends le temps de pratiquer les requetes.
Ne te contente pas de copier-coller.

**Checkpoint Phase 2** :
- [ ] Tu sais instrumenter une app Node.js avec des metriques Prometheus (counter, gauge, histogram)
- [ ] Tu sais ecrire des requetes PromQL (rate, histogram_quantile, aggregations)
- [ ] Tu sais tracer une requete a travers plusieurs services avec OpenTelemetry
- [ ] Tu sais configurer Sentry pour capturer les erreurs avec contexte
- [ ] Tu sais creer un dashboard Grafana qui repond a une question metier

> **Test** : On te demande de mesurer la latence P99 d'une API. Comment fais-tu ?
> Si tu reponds "histogram Prometheus + `histogram_quantile(0.99, ...)`", c'est bon.

---

### Phase 3 -- SRE (modules 10-14) ~30-35h

> **Objectif** : SLI/SLO/SLA, strategies d'alerting, gestion d'incidents,
> capacity planning, et chaos engineering.
>
> **Analogie** : Tu passes de "j'instrumente" a "je garantis un niveau de service".

| Module | Sujet | Temps | Note |
|---|---|---|---|
| 10 | SLI, SLO, SLA | 3h | **Cours cle** -- definir et mesurer la fiabilite |
| 11 | Strategies d'alerting | 3h | **Cours cle** -- alerter sur les symptomes, pas les causes |
| 12 | Incidents et postmortems | 3h | Gestion d'incident, blameless postmortem |
| 13 | Capacity planning | 3h | Prevoir la charge, dimensionner les ressources |
| 14 | Chaos engineering | 3h | Casser volontairement pour renforcer |

**Attention** : Le module 11 (alerting) est critique. La regle numero 1 :
ne jamais alerter sur une cause (CPU > 80%) mais sur un symptome (latence P99 > 500ms).
Les mauvaises alertes tuent l'attention des equipes.

**Checkpoint Phase 3** :
- [ ] Tu sais definir un SLI et un SLO pour un service reel
- [ ] Tu sais calculer un error budget et expliquer son utilite
- [ ] Tu sais configurer des alertes basees sur les symptomes (pas les causes)
- [ ] Tu sais mener un postmortem blameless et en extraire des actions concretes
- [ ] Tu sais utiliser le chaos engineering pour valider la resilience

> **Test** : Le CPU est a 95% mais les utilisateurs ne voient aucun probleme. Faut-il alerter ?
> Si tu reponds "non, car le SLO est respecte -- on cree un ticket pour investiguer, pas une alerte", c'est bon.

---

### Phase 4 -- Expert (modules 15-20) ~30-40h

> **Objectif** : DORA metrics, observability as code, production readiness,
> projet final, Kubernetes, et FinOps.
>
> **Analogie** : Tu ne surveilles plus -- tu concois la strategie d'observabilite de l'organisation.

| Module | Sujet | Temps | Note |
|---|---|---|---|
| 15 | DORA metrics | 3h | Les 4 metriques qui mesurent la performance d'une equipe |
| 16 | Observability as Code | 3h | Dashboards, alertes, SLOs en code (Terraform, Jsonnet) |
| 17 | Production readiness | 3h | Checklist avant mise en production |
| 18 | Projet final | 8h+ | Strategie d'observabilite complete pour un systeme reel |
| 19 | Kubernetes observability | 3h | Metriques, logs et traces dans un cluster K8s |
| 20 | FinOps et observabilite | 3h | Maitriser les couts de l'observabilite |

**Checkpoint Phase 4** :
- [ ] Tu sais mesurer les 4 metriques DORA et proposer des ameliorations
- [ ] Tu sais versionner les dashboards et alertes en code
- [ ] Tu sais faire une revue de production readiness avant un lancement
- [ ] Tu as termine le projet final avec une stack d'observabilite complete
- [ ] Tu sais estimer et optimiser les couts d'observabilite

> **Test** : Le CTO te demande "comment va notre equipe de dev ?".
> Si tu montres les DORA metrics (deployment frequency, lead time, change failure rate, MTTR)
> avec des tendances et des objectifs, c'est bon.

---

### Phase 5 -- Bonus (modules 21-27) ~25-35h

> **Objectif** : Approfondissements : ELK, RGPD, observabilite frontend,
> instrumentation Next/Nuxt, APM, feature flags, et continuous profiling.
>
> **Analogie** : Les specialisations. Choisis celles qui correspondent a tes projets.

| Module | Sujet | Temps | Note |
|---|---|---|---|
| 21 | ELK Stack et Kibana | 3h | Elasticsearch, Logstash, Kibana |
| 22 | RGPD et observabilite | 2h | Anonymisation, retention, conformite |
| 23 | Observabilite frontend | 3h | Web Vitals, Real User Monitoring |
| 24 | Instrumentation Nuxt/Next | 3h | SSR, Server Components, edge |
| 25 | Panorama APM | 2h | Datadog, New Relic, Dynatrace -- comparatif |
| 26 | Feature flags et observabilite | 2h | LaunchDarkly, mesurer l'impact des flags |
| 27 | Continuous profiling | 3h | Pyroscope, pprof, profiling en production |

**Conseil** : Ces modules sont independants. Choisis ceux qui correspondent
a ton contexte professionnel. Le module 22 (RGPD) est important pour tout le monde.

**Checkpoint Phase 5** :
- [ ] Tu sais deployer et configurer une stack ELK
- [ ] Tu sais anonymiser les donnees d'observabilite pour la conformite RGPD
- [ ] Tu sais mesurer les Core Web Vitals avec du Real User Monitoring
- [ ] Tu sais instrumenter une app Next.js ou Nuxt avec OpenTelemetry
- [ ] Tu sais utiliser le continuous profiling pour trouver les bottlenecks en production

---

## Quand tu bloques

L'observabilite a ses propres defis. Voici comment debloquer :

### "PromQL est incomprehensible"
1. Commence par les requetes simples : `http_requests_total` -> `rate(http_requests_total[5m])`
2. La fonction `rate()` est la plus importante -- elle calcule le taux par seconde sur une fenetre
3. `histogram_quantile()` pour les percentiles -- c'est la 2e plus importante
4. Utilise l'explorateur Grafana pour tester les requetes en live

### "Trop de metriques, je ne sais pas quoi mesurer"
1. Utilise la methode RED pour les services : Rate, Errors, Duration
2. Utilise la methode USE pour l'infra : Utilization, Saturation, Errors
3. Commence par 5-10 metriques, pas 500. Tu ajouteras quand tu auras des questions specifiques
4. Chaque metrique doit repondre a une question. Pas de question = pas de metrique

### "Mes alertes se declenchent tout le temps (alert fatigue)"
1. Tu alertes probablement sur des causes au lieu de symptomes
2. Regle d'or : alerte uniquement si un utilisateur est impacte
3. Si le CPU est haut mais que le SLO est respecte -> pas d'alerte
4. Moins d'alertes, meilleures alertes. 5 alertes critiques > 50 alertes ignorees

### "Le tracing distribue, ca ne marche pas entre mes services"
1. Verifie la propagation de contexte : les headers `traceparent` doivent passer entre chaque appel HTTP
2. Verifie que chaque service a le SDK OpenTelemetry configure avec le meme exporter
3. Utilise Jaeger UI pour voir si les spans arrivent -- le probleme est souvent dans la config du collector

### "Les dashboards sont jolis mais personne ne les regarde"
1. Un bon dashboard repond a UNE question. Pas dix
2. Mets le dashboard le plus important sur un ecran dans l'open space
3. Chaque panel doit avoir un titre qui est une question ("Est-ce que le checkout est rapide ?")
4. Si personne ne le regarde -> soit il ne repond pas a un vrai besoin, soit il est trop complexe

### "Je n'arrive pas a faire l'exercice"
1. Verifie que Docker est demarre et que Prometheus/Grafana tournent (`docker compose ps`)
2. Verifie que ton app expose les metriques sur `/metrics`
3. Verifie que Prometheus scrape ton app (Status > Targets dans l'UI Prometheus)

---

## Auto-evaluation par phase

Apres chaque phase, pose-toi ces questions. Si tu ne sais pas repondre,
reviens en arriere -- c'est un signe, pas un echec.

**Apres Phase 1** : "Quelle est la difference entre monitoring et observabilite ?"
-> Si tu reponds "le monitoring verifie des hypotheses connues, l'observabilite permet de poser des questions nouvelles", c'est bon.

**Apres Phase 2** : "Metriques, logs ou traces -- lequel utilises-tu en premier pour diagnostiquer un probleme ?"
-> Si tu reponds "metriques pour detecter, traces pour localiser, logs pour comprendre", c'est bon.

**Apres Phase 3** : "Qu'est-ce qu'un error budget et a quoi sert-il ?"
-> Si tu reponds "c'est le % d'indisponibilite acceptable selon le SLO, et il sert a arbitrer entre vitesse et fiabilite", c'est bon.

**Apres Phase 4** : "Comment justifier le cout de l'observabilite aupres du management ?"
-> Si tu parles de MTTR reduit, d'incidents evites, de DORA metrics, et de cout des pannes, c'est bon.

---

## Rythme recommande

| Rythme | Par semaine | Duree totale |
|---|---|---|
| **Decouverte** (a cote du boulot) | 4-6h | 6-7 mois |
| **Regulier** (motivation) | 8-10h | 4-5 mois |
| **Intensif** (objectif pro) | 12-15h | 3-4 mois |

### Conseils concrets

- **1 module = 1 a 2 sessions.** Les modules pratiques (04, 06, 09) prennent plus longtemps car il faut configurer l'infra.
- **Lance la stack en local.** Docker Compose avec Prometheus + Grafana + Jaeger, c'est ton labo.
- **Prometheus/PromQL (04) merite une semaine.** C'est la fondation de tout le reste.
- **Le projet final (18) vaut 2-3 semaines.** C'est une stack d'observabilite complete.
- **Observe un vrai systeme.** Instrumente ton projet perso ou le projet de ton equipe en parallele.

### Quand faire une pause

- Si PromQL te rend fou -> utilise l'explorateur Grafana et teste des requetes simples
- Si la stack Docker ne demarre pas -> verifie les ports, les volumes, et `docker compose logs`
- Si l'alert fatigue te gagne (meme dans le cours) -> relis le module 11

---

## Ressources complementaires

### Quand tu veux approfondir
- [Google SRE Book](https://sre.google/sre-book/table-of-contents/) -- gratuit en ligne, LA reference
- [Prometheus Docs](https://prometheus.io/docs/) -- documentation officielle
- [OpenTelemetry Docs](https://opentelemetry.io/docs/) -- le standard d'instrumentation
- *Observability Engineering* (Charity Majors et al.) -- excellent livre moderne

### Quand tu cherches une reponse rapide
- Prometheus UI > Graph -- tester des requetes PromQL
- Jaeger UI -- visualiser les traces distribuees
- Grafana Explore -- explorer metriques, logs et traces en un seul endroit

---

## Et apres ?

Tu as fini les 28 modules ? Tu es un SRE en herbe, avec les outils et la mentalite.

Voici les prochaines etapes :
1. **Instrumente un vrai projet** -- deploie la stack complete sur un projet d'equipe
2. **Combine avec les systemes distribues (cours 11)** -- l'observabilite est vitale en distribue
3. **Passe la certification Prometheus** -- Prometheus Certified Associate (PCA)
4. **Propose un SLO a ton equipe** -- c'est le meilleur moyen de changer la culture
