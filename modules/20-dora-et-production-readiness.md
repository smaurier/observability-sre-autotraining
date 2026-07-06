---
titre: DORA & production readiness
cours: 16-observability-sre
notions: ["4 métriques DORA (Deployment Frequency, Change Lead Time, Change Fail Rate, Failed Deployment Recovery Time)", "renommage MTTR → Failed Deployment Recovery Time", "bandes de performance (Elite / High / Medium / Low)", "lien DORA ↔ observabilité (les 4 clés se mesurent avec logs/métriques/incidents)", "Production Readiness Review (PRR)", "checklist PRR (observabilité, SLO, alertes, runbooks, dashboards, on-call, capacity)", "5 phases du PRR (engagement, analysis, improvements, training, onboarding)", "go / no-go de mise en production"]
outcomes:
  - sait citer les 4 métriques DORA, leur terminologie à jour et les bandes Elite/High/Medium/Low, sans confondre avec un deep-dive CI/CD (déféré au cours 15)
  - sait expliquer par quels signaux d'observabilité chaque métrique DORA se mesure
  - sait ce qu'est une Production Readiness Review et énumérer ses catégories de checklist
  - sait mener une PRR sur un service et rendre un verdict go / no-go argumenté
prerequis: ["modules 00-19 du cours (les 3 piliers, métriques, tracing, SLO, alerting, incidents, capacity, chaos, RGPD)"]
next: 21-projet-final
libs: []
tribuzen: revue de mise en production de TribuZen — passer la stack d'observabilité (logs, métriques, traces, SLO, alertes, dashboards, runbooks, on-call) au crible d'une PRR avant le go-live public
last-reviewed: 2026-07
---

# DORA & production readiness

> **Outcomes — tu sauras FAIRE :** citer les 4 métriques DORA à jour et leurs bandes de performance, relier chaque métrique aux signaux d'observabilité qui la mesurent, et mener une Production Readiness Review (PRR) aboutissant à un verdict go / no-go.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module fait le **pont** entre l'observabilité (tout ce cours) et la livraison. Les 4 métriques **DORA** sont vues **en survol** : définition, terminologie à jour, lien avec l'observabilité. Comment **instrumenter un pipeline** pour les collecter (webhooks CI, calcul du lead time, tableau de bord DORA automatisé) relève du **cours 15 — CI/CD**, où le sujet est traité en profondeur — on y renvoie explicitement. Le cœur de ce module, c'est la **Production Readiness Review** : la checklist qui décide si un service peut être exposé à de vrais utilisateurs. Le **toil** et la règle des 50 % sont effleurés (culture SRE) mais ne sont pas l'objet ici.

## 1. Cas concret d'abord

TribuZen a passé six mois en beta fermée. Toute la stack d'observabilité de ce cours existe : logs structurés (module 01), métriques Prometheus (02), traces OTel (04-05), Sentry (06), dashboards Grafana (07), SLO + error budget (08), alertes burn-rate (09), postmortems (10), load testing k6 (11). Vendredi, le CTO annonce : **« On ouvre TribuZen au public mercredi. »**

Deux questions te tombent dessus, et elles ne se répondent pas avec un dashboard :

1. **« Est-ce qu'on est une équipe qui livre bien ? »** — On déploie à quelle fréquence ? Combien de temps entre un commit et la prod ? Quel pourcentage de déploiements casse quelque chose ? Combien de temps pour s'en remettre ? Ces quatre chiffres ont un nom : les **métriques DORA**.

2. **« Est-ce que TribuZen est *prêt* pour la prod ? »** — L'observabilité est-elle branchée sur *tous* les endpoints ? Y a-t-il un SLO ? Les alertes ont-elles un runbook ? Qui est d'astreinte mercredi soir ? A-t-on tenu la charge d'un pic ? Cette question a elle aussi un nom et une méthode : la **Production Readiness Review (PRR)**.

Le premier bloc te dit *où en est ton équipe* dans le temps. Le second est un **go / no-go** avant un lancement précis. Ce module te donne le vocabulaire du premier (en survol, le deep est au cours 15) et la méthode du second (le cœur ici). À la fin, tu sauras remplir la PRR de TribuZen et dire, preuve à l'appui, si mercredi tient ou pas.

---

## 2. Théorie complète, concise

### 2.1 DORA — pourquoi ces 4 métriques (survol)

**DORA** = *DevOps Research and Assessment*, un programme de recherche (N. Forsgren, J. Humble, G. Kim, livre *Accelerate*) qui a cherché ce qui prédit la performance d'une organisation logicielle. Réponse : pas les lignes de code ni les features livrées, mais **4 métriques** qui capturent deux axes — la **vitesse** de livraison et la **stabilité** en production.

Découverte contre-intuitive à retenir : les équipes **Elite** sont à la fois **les plus rapides ET les plus stables**. Déployer souvent, en petits lots, réduit le risque par changement. Vitesse et stabilité ne s'opposent pas, elles se renforcent.

### 2.2 Les 4 métriques, terminologie à jour

Source : `dora.dev`, *DORA's software delivery metrics: the four keys* (vérifié en ligne). La terminologie a **évolué** — un point d'entretien classique :

| Métrique (nom à jour) | Axe | Question | Sens |
|---|---|---|---|
| **Deployment Frequency** | vitesse | À quelle fréquence déploie-t-on en prod ? | plus haut = mieux |
| **Change Lead Time** | vitesse | Combien de temps d'un commit à la prod ? | plus bas = mieux |
| **Change Fail Rate** | stabilité | Quelle proportion de déploiements exige une intervention immédiate ? | plus bas = mieux |
| **Failed Deployment Recovery Time** | stabilité | Combien de temps pour se remettre d'un déploiement raté ? | plus bas = mieux |

> **Attention terminologie (à connaître) :** l'ancienne métrique **MTTR** (*Mean Time To Restore*) a été **renommée** `Failed Deployment Recovery Time`. DORA a explicité ce changement (le MTTR moyen était trompeur, mal défini, difficile à mesurer). Si tu vois « MTTR » et « Failed Deployment Recovery Time », ce sont la même 4ᵉ clé, dans deux générations de vocabulaire. DORA suit aussi désormais des signaux supplémentaires (ex. *Deployment Rework Rate*, fiabilité) — hors périmètre survol.

### 2.3 Les bandes de performance

DORA classe les équipes en **Elite / High / Medium / Low** selon leurs 4 chiffres. Les seuils exacts bougent chaque année (rapport *State of DevOps* annuel) — **ne les apprends pas par cœur**, retiens les ordres de grandeur :

| Bande | Deployment Frequency | Change Lead Time | Change Fail Rate | Recovery Time |
|---|---|---|---|---|
| **Elite** | plusieurs fois / jour | < 1 h | faible | < 1 h |
| **High** | 1/jour → 1/semaine | 1 jour → 1 semaine | modéré | < 1 jour |
| **Medium** | 1/semaine → 1/mois | 1 semaine → 1 mois | plus élevé | 1 jour → 1 semaine |
| **Low** | < 1/mois | > 1 mois | élevé | > 1 semaine |

Règle d'or : le niveau global d'une équipe est tiré vers le bas par **sa métrique la plus faible**. Une équipe qui déploie 10 fois/jour mais met une semaine à se remettre d'un incident n'est pas Elite.

### 2.4 DORA ↔ observabilité : les 4 clés se **mesurent** avec ce cours

C'est le lien central du module. Chaque métrique DORA se calcule à partir de signaux que tu sais déjà produire :

- **Deployment Frequency** → un **counter** (module 02) incrémenté à chaque déploiement réussi (`deployments_total`), ou un annotation de déploiement sur les dashboards Grafana (module 07).
- **Change Lead Time** → horodatage `commit → deploy` : événement de commit (VCS) et événement de déploiement. Un **span** OTel « pipeline » (module 04) matérialise cette durée.
- **Change Fail Rate** → ratio déploiements suivis d'un rollback/incident. Se croise avec les **incidents** (module 10) et le taux d'erreur (SLO, module 08).
- **Failed Deployment Recovery Time** → durée `début incident → service restauré`, exactement la timeline d'un **postmortem** (module 10).

Autrement dit : **DORA, c'est l'observabilité regardée à l'échelle du processus de livraison**, pas d'une requête. La *mécanique de collecte* (webhooks CI, calcul automatisé, dashboard DORA) est le sujet du **cours 15 — CI/CD** ; ici on s'arrête au **quoi** et au **pourquoi**.

### 2.5 Production Readiness Review (PRR) — le concept

Source : Google *SRE Book*, ch. 32 *The Evolving SRE Engagement Model* (vérifié en ligne). Une **PRR** est *« un processus qui identifie les besoins de fiabilité d'un service à partir de ses spécificités »*. Analogie : la **checklist pré-vol** d'un pilote. Peu importe l'expérience, avant le décollage on parcourt la liste — instruments, carburant, gouvernes. La PRR fait pareil pour un service avant qu'il ne rencontre de vrais utilisateurs.

Deux objectifs, dans les termes du livre :
1. *« Vérifier qu'un service respecte les standards acceptés de mise en production et de préparation opérationnelle »* ;
2. améliorer la fiabilité en **minimisant les incidents** — poser les questions critiques **avant** le premier incident, pas après.

Point clé de posture : la PRR **n'est pas un tampon bloquant** pour ralentir les équipes. C'est un filet de sécurité qui rend explicites des angles morts. Elle est **itérative** : on la refait à chaque changement majeur, pas une seule fois pour la vie du service.

### 2.6 Les 5 phases du PRR (modèle simple)

Le SRE Book décrit un *Simple PRR Model* en 5 phases :

1. **Engagement** — cadrer le service avec l'équipe de dev, définir les **SLO**.
2. **Analysis** — passer le service au crible des **checklists** et des bonnes pratiques.
3. **Improvements & Refactoring** — prioriser et corriger les manques trouvés.
4. **Training** — préparer l'équipe (SRE / on-call) à opérer le service.
5. **Onboarding** — transférer progressivement la responsabilité opérationnelle.

Pour ce module, l'essentiel se joue en phase **Analysis** : la checklist.

### 2.7 La checklist PRR — les catégories

Le SRE Book examine ces aspects d'un service (regroupés ici en catégories opérationnelles). C'est le squelette de ton lab :

| Catégorie | Question centrale | Preuve attendue (evidence) |
|---|---|---|
| **Observabilité** | Logs structurés, métriques RED, traces branchés sur *tous* les endpoints ? | extrait de log JSON avec `traceId` ; `/metrics` exposant `http_requests_total` |
| **SLO** | Au moins un SLO dispo + un SLO latence, avec error budget suivi ? | fichier de définition SLO + dashboard error budget |
| **Alertes** | Alertes sur **symptômes** (burn-rate SLO), chaque alerte reliée à un **runbook** ? | `alert-rules.yaml` + liens runbooks |
| **Dashboards** | Un dashboard de service (RED + ressources + SLI) existe et est *as code* ? | lien dashboard Grafana provisionné |
| **Runbooks** | Chaque alerte a une procédure écrite : symptôme → diagnostic → remédiation ? | runbook par alerte |
| **On-call** | Qui répond, selon quelle rotation, avec quelle escalade ? | planning d'astreinte + politique d'escalade |
| **Capacity** | Un test de charge a fixé le point de rupture, requests/limits, autoscaling ? | rapport k6 + limites de ressources |

Deux priorités par item : `must-have` (bloquant pour le go) vs `should-have` (améliorable après). Le verdict global d'une PRR se rend en trois valeurs : **approved**, **conditionally-approved** (go avec conditions datées), **rejected** (no-go).

### 2.8 Le rappel qui sauve : liveness ≠ readiness

La production readiness s'appuie sur des **health checks** (vus à l'infra, cours 12) que la PRR vérifie. Le piège classique à connaître : ne **jamais** vérifier une dépendance (base de données) dans la **liveness probe**. Si la DB tombe et que la liveness la teste, l'orchestrateur **redémarre tous les pods en boucle** → service doublement mort. La liveness dit « le process est-il vivant ? » ; la **readiness** dit « peut-il servir du trafic ? » (et retire le pod du load balancer sans le tuer). La PRR contrôle que cette distinction est respectée.

---

## 3. Worked examples

### Exemple 1 — situer l'équipe TribuZen sur DORA (survol)

On collecte quatre chiffres bruts sur les 30 derniers jours de la beta et on les classe. **On ne code pas le collecteur ici** (c'est le cours 15) : on lit les chiffres et on rend un diagnostic.

```text
TribuZen — 30 derniers jours
  Deployment Frequency ......... 3 déploiements / semaine   → High
  Change Lead Time (médian) .... 2 jours                    → High
  Change Fail Rate ............. 8 %                          → High
  Failed Deployment Recovery ... 4 h (médian)                → High

Niveau global = min des 4 = High.
```

Lecture : équipe **High**, pas Elite — le frein est double (lead time de 2 jours, recovery de 4 h). Le lien avec l'observabilité saute aux yeux : pour *baisser* le Recovery Time, il faut de **meilleures alertes** (détecter vite, module 09) et de **meilleurs runbooks** (remédier vite, ce module). DORA ne se corrige pas « en soi » : on tire les leviers observabilité et CI/CD. **Comment** on automatise cette collecte → cours 15.

### Exemple 2 — extrait d'une PRR de l'API TribuZen

On instancie la checklist §2.7 sur le service `tribuzen-api`, catégorie **Observabilité** et **Alertes**, avec le verdict par item.

```text
PRR — service: tribuzen-api   version: 1.0.0   date: 2026-07-06
Reviewers: SRE (toi) + lead dev

[Observabilité]
  OBS-1  Logs JSON avec traceId sur tous les endpoints ....... ✅ must-have
         evidence: log POST /api/events/:id/rsvp → {level,traceId,...}
  OBS-2  Métriques RED exposées (/metrics Prometheus) ......... ✅ must-have
         evidence: curl /metrics | grep http_requests_total → OK
  OBS-3  Tracing distribué (OTel) sur les flux critiques ...... ⚠️ should-have
         evidence: trace login→RSVP OK, mais envoi d'e-mail non tracé

[SLO]
  SLO-1  SLO dispo (99.9%) + SLO latence (p99 < 300ms) ........ ✅ must-have
  SLO-2  Error budget suivi sur un dashboard .................. ✅ must-have

[Alertes]
  ALE-1  Alertes burn-rate SLO (pas seuils statiques) ......... ✅ must-have
  ALE-2  Chaque alerte pointe vers un runbook ................. ❌ must-have
         evidence: alerte "RSVP error budget burn" SANS runbook  ← BLOQUANT

[On-call]
  ONC-1  Rotation d'astreinte définie pour la semaine du go ... ❌ must-have
         evidence: personne d'assigné mercredi soir            ← BLOQUANT

Verdict: conditionally-approved
Conditions (avant go mercredi):
  1. Écrire le runbook de "RSVP error budget burn" (ALE-2)
  2. Assigner une astreinte mercredi 18h–minuit (ONC-1)
Non-bloquant (post-go): tracer l'envoi d'e-mail (OBS-3)
```

Ce qu'illustre l'exemple : un `must-have` non satisfait **bloque** (no-go tant qu'il n'est pas levé) ; un `should-have` devient une **condition datée post-go**. Le verdict n'est ni « oui » ni « non » binaire, mais **conditionally-approved** avec une liste d'actions précises. C'est ça, mener une PRR.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — croire que DORA se « déploie » comme un outil

DORA n'est pas une lib ni un dashboard qu'on installe. Ce sont **4 mesures** dérivées d'événements (déploiements, commits, incidents) que tu produis *déjà* avec ton observabilité. La partie « collecter automatiquement les 4 clés depuis le pipeline » est un vrai chantier — mais c'est le sujet du **cours 15**, pas ici. Ici : savoir ce que chaque clé veut dire et à quel signal elle se rattache.

### PIÈGE #2 — dire « MTTR » sans savoir qu'il a été renommé

En entretien, sortir « les 4 DORA : DF, Lead Time, CFR et MTTR » n'est plus tout à fait à jour. La 4ᵉ clé s'appelle désormais **Failed Deployment Recovery Time**. Savoir *pourquoi* (le MTTR moyen était ambigu et mal défini) montre que tu suis DORA, pas juste que tu as lu *Accelerate* en 2018.

### PIÈGE #3 — confondre MTTR/Recovery Time et « temps de résolution complet »

Le Recovery Time mesure le retour du service à un état **sain pour l'utilisateur** (souvent un rollback), pas la correction définitive du bug. Un rollback de 5 min suivi d'un vrai fix deux jours plus tard : le Recovery Time est de **5 min**, pas 2 jours. La PRR vérifie justement qu'un **rollback rapide** est possible.

### PIÈGE #4 — traiter la PRR comme un tampon ponctuel

« On a fait la PRR au lancement, c'est bon pour toujours. » Faux : la PRR est **itérative**. Un changement majeur d'archi, une nouvelle dépendance, un pic de charge attendu → on **refait** la revue. Le service de mercredi n'est pas celui de dans six mois.

### PIÈGE #5 — cocher « observabilité : OK » sans preuve

Une PRR se remplit avec des **evidence**, pas des affirmations. « On a des métriques » ne vaut rien ; `curl /metrics | grep http_requests_total` qui renvoie une ligne, si. Un item sans preuve vérifiable **n'est pas satisfait**. C'est la différence entre une checklist rituelle et une PRR utile.

### PIÈGE #6 — vérifier une dépendance dans la liveness probe

Rappel §2.8, parce qu'il coûte des pannes réelles : tester la DB dans la **liveness** provoque un restart-loop de tous les pods quand la DB tombe. Les dépendances se vérifient dans la **readiness** (retrait du load balancer), jamais dans la liveness (kill + restart).

---

## 5. Ancrage TribuZen

Ce module est **l'avant-dernier** du cours : c'est la revue qui autorise (ou non) le go-live public de TribuZen, juste avant le projet final (module 21).

**Le bloc DORA (survol)** sert de tableau de bord d'équipe pour TribuZen. On pose les 4 chiffres (Exemple 1) et on les affiche — pas pour juger, pour voir la tendance. Leur automatisation via le pipeline TribuZen (GitHub Actions → webhook → counter Prometheus) est renvoyée au **cours 15 — CI/CD**.

**La PRR est le livrable central.** Avant d'ouvrir TribuZen au public, on remplit la checklist §2.7 sur `tribuzen-api` (et sur le front, module 16). Elle agrège *tout* ce cours en un seul verdict :

| Catégorie PRR | Module du cours qui l'a construite |
|---|---|
| Observabilité (logs/métriques/traces) | 01, 02, 04, 05, 06 |
| SLO + error budget | 08 |
| Alertes burn-rate + runbooks | 09, 10 |
| Dashboards as code | 07, 13 |
| Capacity / load test | 11 |
| RGPD (PII hors logs/traces) | 19 |

Emplacement cible dans `smaurier/tribuzen` :

```text
tribuzen/
  ops/
    prr/
      tribuzen-api.prr.md      ← la checklist remplie (livrable du lab)
      runbooks/
        rsvp-error-budget-burn.md   ← runbook écrit en condition de go
    oncall/
      rotation-go-live.md      ← planning d'astreinte de la semaine de lancement
```

> Le résultat de la PRR conditionne directement le **module 21 (projet final)** : on ne « capstone » pas une stack qui n'a pas passé sa revue de mise en production.

---

## 6. Points clés

1. **DORA** = 4 métriques prédictives, deux axes : vitesse (Deployment Frequency, Change Lead Time) et stabilité (Change Fail Rate, Failed Deployment Recovery Time).
2. La 4ᵉ clé s'appelle désormais **Failed Deployment Recovery Time** (ex-`MTTR`) — connaître le renommage.
3. Bandes **Elite / High / Medium / Low** ; niveau global tiré par la **métrique la plus faible** ; seuils exacts = rapport annuel, pas à apprendre par cœur.
4. Chaque clé DORA se **mesure** avec des signaux d'observabilité (counter de déploiements, span de pipeline, incidents, error budget). L'**automatisation de la collecte** = cours 15.
5. Une **PRR** (SRE Book, ch. 32) est une checklist go/no-go avant exposition à de vrais utilisateurs — comme une checklist pré-vol ; **itérative**, pas un tampon unique.
6. Modèle en **5 phases** : Engagement, Analysis, Improvements, Training, Onboarding ; le cœur est la phase **Analysis** (la checklist).
7. Catégories PRR : **observabilité, SLO, alertes, runbooks, dashboards, on-call, capacity** — chaque item exige une **evidence**, sinon il n'est pas satisfait.
8. Verdict en trois valeurs : **approved / conditionally-approved / rejected** ; un `must-have` manquant bloque, un `should-have` devient une condition datée.
9. Piège opérationnel récurrent : ne jamais tester une dépendance dans la **liveness** probe (restart-loop) — c'est le rôle de la **readiness**.

---

## 7. Seeds Anki

```
Quelles sont les 4 métriques DORA (terminologie à jour) ?|Deployment Frequency, Change Lead Time, Change Fail Rate, Failed Deployment Recovery Time. Deux axes : vitesse (les 2 premières) et stabilité (les 2 dernières).
Par quel nom la métrique DORA "MTTR" a-t-elle été remplacée, et pourquoi ?|Failed Deployment Recovery Time. Le MTTR moyen était ambigu et mal défini ; DORA a clarifié le vocabulaire pour mesurer précisément le temps de retour à un service sain après un déploiement raté.
Comment détermine-t-on la bande DORA globale (Elite/High/Medium/Low) d'une équipe ?|Par sa métrique la plus faible : le niveau global est tiré vers le bas. Une équipe qui déploie souvent mais met une semaine à récupérer n'est pas Elite. Les seuils exacts viennent du rapport State of DevOps annuel.
En quoi DORA est-il lié à l'observabilité ?|Chaque clé DORA se mesure avec des signaux d'observabilité : counter de déploiements (Frequency), span/horodatage commit→deploy (Lead Time), incidents+rollbacks (Fail Rate), timeline de postmortem (Recovery Time). DORA = l'observabilité à l'échelle de la livraison. L'automatisation de la collecte relève du cours CI/CD.
Qu'est-ce qu'une Production Readiness Review (PRR) et d'où vient-elle ?|Une checklist systématique (Google SRE Book, ch. 32) qui vérifie qu'un service est prêt à être exposé à de vrais utilisateurs — analogie de la checklist pré-vol. Objectif : poser les questions critiques avant le premier incident. Elle est itérative, pas un tampon unique.
Cite les catégories d'une checklist PRR.|Observabilité (logs/métriques/traces), SLO + error budget, alertes (burn-rate) reliées à des runbooks, dashboards as code, on-call/astreinte, capacity/load test. Chaque item exige une evidence vérifiable.
Quels sont les trois verdicts possibles d'une PRR ?|approved, conditionally-approved (go avec conditions datées), rejected (no-go). Un item must-have manquant bloque le go ; un should-have devient une condition post-go.
Quelles sont les 5 phases du modèle simple de PRR ?|Engagement (cadrage + SLO), Analysis (checklist), Improvements & Refactoring (corriger les manques), Training (préparer l'équipe/on-call), Onboarding (transfert de responsabilité).
Pourquoi ne jamais vérifier une dépendance (ex: la DB) dans une liveness probe ?|Si la DB tombe, la liveness échoue et l'orchestrateur redémarre tous les pods en boucle → service doublement mort. Les dépendances se vérifient dans la readiness probe (retrait du load balancer), pas dans la liveness (kill+restart).
```

---

## Pont vers le lab

> Lab associé : `labs/lab-20-dora-et-production-readiness/README.md`. Mener une PRR complète de TribuZen : remplir la checklist (observabilité, SLO, alertes, runbooks, dashboards, on-call, capacity) avec evidence, situer l'équipe sur DORA en survol, et rendre un verdict go / no-go argumenté. README-only, coach en session, variante J+30.
