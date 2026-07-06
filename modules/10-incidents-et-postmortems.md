---
titre: Incidents et postmortems
cours: 16-observability-sre
notions: ["cycle de vie d'un incident (détection → mitigation → résolution → postmortem)", "sévérités SEV-1 à SEV-4", "rôles IC / Comms / Ops", "escalade et désescalade", "mitigation avant résolution", "postmortem blameless", "Just Culture", "timeline d'incident", "5 Whys", "action items suivis", "runbooks", "MTTD / MTTA / MTTR"]
outcomes:
  - sait classer un incident par sévérité et déclencher l'escalade sans hésiter en cas de doute
  - sait tenir les rôles IC / Comms / Ops et séparer coordination et debug pendant un incident
  - sait mener un postmortem blameless — timeline, root cause via 5 Whys, action items spécifiques et suivis
  - sait écrire un runbook actionnable rattaché à une alerte
prerequis: ["module 00 à 09 du cours 16 (piliers, métriques, SLO, alerting)", "module 08 — SLI/SLO/SLA et error budget", "module 09 — alerting sur symptômes et burn-rate"]
next: 11-capacity-planning
libs: []
tribuzen: gestion de l'incident RSVP TribuZen (rôles, sévérité, mitigation) puis postmortem blameless — timeline, 5 Whys, action items dans le repo smaurier/tribuzen
last-reviewed: 2026-07
---

# Incidents et postmortems

> **Outcomes — tu sauras FAIRE :** classer un incident par sévérité et escalader, tenir les rôles IC / Comms / Ops sans confondre coordination et debug, mener un postmortem **blameless** (timeline, 5 Whys, action items suivis), écrire un runbook rattaché à une alerte.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module couvre **la réponse à incident et le postmortem**. Il s'appuie sur les **alertes** (module 09) qui déclenchent la détection et sur les **SLO / error budget** (module 08) qui donnent le langage de l'impact. Le **load testing** et le dimensionnement qui empêchent les incidents de saturation sont le **module 11 (capacity-planning)**. Les **game days** et l'injection de pannes sont le **module 12 (chaos-engineering)**. Ici, on gère un incident réel et on en tire un apprentissage durable.

## 1. Cas concret d'abord

Samedi 21h03. L'alerte `RsvpErrorBudgetBurn` (celle que tu as écrite au module 09) se déclenche : le burn-rate de l'error budget de `POST /api/events/:id/rsvp` explose. En 4 minutes, trois parents postent dans le canal support TribuZen : « impossible de confirmer notre présence au repas de famille de demain ».

Sans méthode, voilà ce qui se passe : deux devs se connectent en même temps, l'un relance la base pendant que l'autre déploie un hotfix, personne ne prévient les familles, et le lendemain personne ne sait **ce qui s'est réellement passé** ni **comment l'éviter**. L'incident a duré 40 min ; le postmortem tient en une phrase accusatrice : « untel a poussé une migration le vendredi ».

Avec méthode, la même panne se déroule ainsi :

```
21:03  alerte RsvpErrorBudgetBurn (burn-rate x14 sur 5 min)
21:05  Sylvain acknowledge → se déclare IC, classe SEV-2
21:06  IC assigne : Ops = debug, Comms = status page + canal familles
21:09  Ops : "le dernier déploiement 21:00 a migré la table rsvp"
21:11  IC décide la MITIGATION : rollback (pas de root cause tout de suite)
21:14  rollback effectif, taux d'erreur RSVP redescend à 0.2 %
21:15  IC désescalade SEV-3, Comms poste "service rétabli"
21:16  incident résolu ; postmortem programmé lundi 10h
```

À la fin de ce module, tu sais dérouler cette colonne de gauche **et** transformer ces horodatages en un postmortem blameless qui produit des action items réellement suivis — pas un procès.

> Source de référence tout le long : Google SRE Book, chapitres *Managing Incidents* et *Postmortem Culture* (`sre.google/sre-book`).

---

## 2. Théorie complète, concise

### 2.1 Le cycle de vie d'un incident

Un incident traverse cinq phases. Retiens l'ordre — il structure tout le reste.

```
Détection → Triage → Mitigation → Résolution → Postmortem
 (alerte)   (sévérité) (limiter    (corriger la   (apprendre)
                        l'impact)   root cause)
```

- **Détection** : une alerte SLO (module 09), un utilisateur, ou un dev repère l'anomalie. On minimise le **MTTD** (Mean Time To Detect).
- **Triage** : qui est impacté, depuis quand, qu'est-ce qui a changé ? On en déduit la sévérité.
- **Mitigation** : on **limite l'impact** au plus vite (rollback, feature flag). Ce n'est PAS la correction définitive.
- **Résolution** : on corrige la cause racine, potentiellement des heures/jours plus tard.
- **Postmortem** : on apprend, sans blâmer.

Analogie médicale : on détecte la fièvre, on triage (urgences ou pas), on mitige (paracétamol), on résout (antibiotique), on fait le bilan (comment éviter la prochaine infection). La mitigation soulage ; elle ne guérit pas.

### 2.2 Classer par sévérité

La sévérité dépend de l'**impact business**, pas de la difficulté technique. Une échelle à quatre crans (à adapter au contexte) :

| Sévérité | Impact | Exemple TribuZen | Réponse | Escalade |
|----------|--------|------------------|---------|----------|
| SEV-1 | Service down, tous les users | API TribuZen renvoie 500 partout | < 15 min | IC + management + comms externe |
| SEV-2 | Feature critique dégradée | RSVP échoue, le reste marche | < 30 min | IC + on-call |
| SEV-3 | Dégradation mineure, workaround | recherche de famille lente | < 2h | on-call |
| SEV-4 | Cosmétique | favicon manquant en prod | jour ouvré suivant | ticket |

**Règle d'or : en cas de doute, escalade.** Il vaut mieux sur-réagir et désescalader que sous-réagir. La sévérité **n'est pas figée** : un SEV-3 dont l'impact s'avère plus large devient SEV-1 ; un SEV-1 mitigé redescend en SEV-2. N'importe qui peut *demander* une escalade ; l'IC *décide*.

### 2.3 Les rôles — la séparation des responsabilités

Le SRE Book appelle ça la **séparation récursive des responsabilités** : chacun a un domaine clair et n'a pas à surveiller le travail des autres. Sans rôles, un incident dégénère en *freelancing* — tout le monde touche à tout.

- **Incident Commander (IC)** — le chef d'orchestre. Il **ne debug pas**. Il tient l'état global de l'incident, décide de l'escalade, assigne les tâches, fixe la cadence des points de situation, et déclare l'incident résolu. Il n'a pas besoin d'être l'expert du système en panne : son métier est la **coordination**.
- **Operations Lead (Ops)** — le seul (avec son équipe) à **agir sur le système** : diagnostiquer, appliquer la mitigation. Il annonce à voix haute ce qu'il fait **avant** de le faire (« je lance le rollback vers v2.3.0 ») pour éviter deux actions conflictuelles en parallèle.
- **Communications Lead (Comms)** — l'interface avec l'extérieur : status page, canal familles, direction. Il traduit la technique en langage business.
- **(Optionnel) Planning Lead** — sur les gros incidents : logistique, tickets, relève des équipes, suivi des changements.

Deux invariants du SRE Book :
- **Un poste de commandement reconnu** : tout le monde sait *où* se trouve la coordination (un canal Slack dédié `#incident-<date>`, un doc live partagé).
- **Handoff explicite** : passer le rôle d'IC se fait à voix haute et est acté (« je te passe l'IC, tu confirmes ? »), jamais implicitement.

Sur un petit incident TribuZen, une même personne peut cumuler IC + Ops — mais **nomme le rôle quand même**, à voix haute. C'est le nommage qui crée la discipline, pas le nombre de personnes.

### 2.4 Mitigation avant résolution

Le réflexe le plus important du module : **mitiger d'abord, comprendre ensuite.**

Un service restauré en 5 min par un rollback vaut infiniment mieux qu'un fix parfait en 2h. La root cause peut attendre ; les utilisateurs, non. Leviers de mitigation classiques :

- **rollback** du dernier déploiement (le plus fréquent) ;
- **feature flag off** pour la feature cassée ;
- **scale up** si c'est une saturation (voir module 11) ;
- **mode dégradé** (cache stale, page statique) ;
- **redémarrage** (pansement sur un memory leak — à documenter comme dette).

Ne cherche pas la cause racine tant que l'hémorragie n'est pas stoppée.

### 2.5 La timeline — la matière première du postmortem

Pendant l'incident, quelqu'un (souvent l'IC au début, un *scribe* sur les gros incidents) note **chaque événement horodaté** : alertes, décisions, hypothèses, commandes exécutées et leurs effets. Cette timeline est ce qui transforme un souvenir flou en postmortem factuel.

```
21:03  alerte RsvpErrorBudgetBurn (burn-rate x14)
21:05  IC = Sylvain, SEV-2
21:09  hypothèse : migration rsvp du déploiement 21:00
21:11  décision IC : rollback (mitigation)
21:14  rollback OK, error_rate 12% → 0.2%
```

Note l'heure **exacte**. « Vers 21h » est inexploitable ; « 21:03 » permet de mesurer le MTTD et le MTTR au postmortem.

### 2.6 Le postmortem blameless

Le postmortem n'est **pas** une chasse aux coupables. C'est un outil d'apprentissage organisationnel. Le principe fondateur du SRE Book :

> On part du principe que **toute personne impliquée avait de bonnes intentions et a fait au mieux avec l'information dont elle disposait**.

La conséquence est reformulatoire :

- ❌ « Jean a déployé une migration sans DEFAULT le vendredi → prod down. »
- ✅ « Le pipeline CI ne rejouait pas les migrations sur une copie de prod, ce qui a permis à une migration sans valeur par défaut d'atteindre la production. »

Pourquoi le blameless *fonctionne* : quand les gens ont peur d'être punis, ils **cachent** les problèmes, **minimisent** la sévérité et **ne partagent pas** ce qu'ils ont appris. Un environnement blameless produit des signalements immédiats et des postmortems honnêtes.

**Just Culture** (emprunté à l'aviation et à la médecine) nuance : on distingue l'**erreur humaine** (involontaire → on corrige le *système*), le **comportement à risque** (raccourci conscient → on coache) et la **négligence délibérée** (très rare → discipline). Plus de 95 % des incidents relèvent de la première catégorie. La question n'est jamais « qui ? » mais « **pourquoi le système a-t-il permis cette erreur ?** ».

**Quand rédiger un postmortem ?** Le SRE Book donne des seuils : downtime visible au-delà d'un seuil, toute perte de données, intervention on-call (rollback, reroutage), résolution anormalement longue, ou échec du monitoring lui-même. Chez TribuZen : **toujours** pour SEV-1/SEV-2, dans les **48h** tant que les souvenirs sont frais.

### 2.7 Trouver la root cause — les 5 Whys

Technique simple : demander « pourquoi ? » en chaîne jusqu'à atteindre une cause *systémique* (pas un individu).

```
Problème : les RSVP échouaient pendant 11 min.
1. Pourquoi ? → l'API renvoyait 500 sur /rsvp.
2. Pourquoi ? → les INSERT échouaient sur la table rsvp.
3. Pourquoi ? → la migration 21:00 a ajouté une colonne NOT NULL sans DEFAULT.
4. Pourquoi ? → la review n'a pas repéré l'absence de DEFAULT.
5. Pourquoi ? → aucune étape du CI ne rejoue les migrations sur une copie de prod.
→ root cause SYSTÉMIQUE : le CI ne valide pas les migrations.
→ action : ajouter un job "migration dry-run sur snapshot de prod".
```

Pièges : ne t'arrête pas à « erreur humaine » (continue : *pourquoi le système l'a permis ?*), ni à « les humains sont faillibles » (trop abstrait). Il y a souvent **plusieurs branches** de causes — explore-les toutes.

### 2.8 Des action items qui existent vraiment

Le problème n°1 des postmortems, ce sont les action items jamais faits. Un bon action item est **SMART-isé** :

- **spécifique** : « ajouter un job de dry-run de migration dans le CI » (pas « améliorer les tests ») ;
- **assigné** : un responsable nommé ;
- **daté** : une échéance réaliste ;
- **priorisé** : P1 (cette semaine), P2 (ce sprint), P3 (ce trimestre) ;
- **suivi** : tracké dans l'outil d'équipe (Jira/Linear/GitHub Issues) et revu à chaque rétro.

Un action item qui n'est ni assigné ni tracké **n'existe pas**. On les classe utilement par levier : **détection** (alerter plus tôt), **mitigation** (réagir plus vite, ex. runbook), **prévention** (empêcher la récurrence).

### 2.9 Runbooks

Un runbook est un guide pas-à-pas pour diagnostiquer et mitiger **un type d'incident précis**. **Chaque alerte devrait pointer vers un runbook** (champ `runbook_url` dans les annotations de l'alerte Prometheus, module 09).

```markdown
# Runbook — RsvpErrorBudgetBurn

## Contexte
Se déclenche quand le burn-rate de l'error budget RSVP dépasse x14 sur 5 min.

## Diagnostic
1. Un déploiement récent ? → vérifier l'historique de déploiement.
2. Logs applicatifs de /rsvp sur les 15 dernières min (module 01).
3. p99 de latence + taux d'erreur (PromQL du module 04).

## Mitigation
- Déploiement récent → rollback.
- Saturation DB → scale up le pool (module 11).
- Dépendance externe down → activer le mode dégradé.

## Escalade
Non résolu en 30 min → escalader à l'IC de garde.
```

### 2.10 Mesurer la maturité incident

Quatre métriques cardinales :

| Métrique | Définition | Cible indicative |
|----------|------------|------------------|
| **MTTD** | temps début du problème → première alerte | quelques min |
| **MTTA** | temps alerte → premier humain qui regarde | < 15 min |
| **MTTR** | temps début → résolution complète | dépend de la SEV |
| **MTBF** | temps entre deux incidents | le plus grand possible |

La timeline horodatée (§2.5) est ce qui rend ces métriques calculables. Sans elle, on *devine*.

---

## 3. Worked examples

### Exemple 1 — dérouler l'incident RSVP avec les rôles

Rejoue le cas concret, cette fois en explicitant chaque décision.

```
21:03  DÉTECTION — alerte RsvpErrorBudgetBurn (module 09). MTTD ≈ 2 min.
21:05  Sylvain acknowledge. Il annonce dans #incident-2026-07-11 :
       "Je suis IC. SEV-2 : RSVP échoue, le reste de l'app répond."
       → nomme le rôle même s'il est seul de garde.
21:06  IC assigne : "Ops = moi, je debug. Comms = bot status page + canal familles."
       (cumul IC/Ops assumé car incident petit, mais rôles NOMMÉS)
21:07  TRIAGE — qui/depuis quand/quoi a changé ?
       → 100% des RSVP échouent, depuis 21:00, un déploiement a eu lieu à 21:00.
21:09  Ops annonce AVANT d'agir : "hypothèse migration rsvp ; je regarde les logs."
       Logs : "null value in column 'reminder_optin' violates not-null".
21:11  DÉCISION IC : "mitigation d'abord → rollback v du déploiement 21:00."
       (on NE cherche PAS encore la root cause complète)
21:14  Ops : "rollback effectif." error_rate RSVP 12% → 0.2% (vérifié en PromQL).
21:15  IC désescalade SEV-3. Comms poste : "RSVP rétabli, analyse en cours."
21:16  IC déclare l'incident RÉSOLU. MTTR ≈ 13 min.
       "Postmortem lundi 10h, je le pré-remplis avec la timeline."
```

Points clés de l'exemple : l'IC **décide** la mitigation et **ne debug pas** lui-même quand l'équipe est plus grande ; Ops **verbalise avant d'agir** ; la mitigation (rollback) précède toute recherche de cause racine ; chaque étape est **horodatée** pour le postmortem.

### Exemple 2 — le postmortem blameless de cet incident

```markdown
# Postmortem — Échec des RSVP après déploiement 21:00
**Date** : 2026-07-11   **Sévérité** : SEV-2   **Durée** : 13 min (21:03 → 21:16)
**Auteur** : Sylvain   **Reviewers** : (équipe)

## Résumé
Une migration ajoutant une colonne NOT NULL sans DEFAULT a fait échouer 100 % des
INSERT sur la table rsvp pendant 11 min. Mitigé par rollback.

## Impact
- 100 % des tentatives de RSVP en échec de 21:05 à 21:14 (~34 familles concernées).
- SLO RSVP : breach. Error budget mensuel consommé : ~9 %.

## Timeline
| Heure | Événement |
|-------|-----------|
| 21:00 | Déploiement (migration `add reminder_optin`) |
| 21:03 | Alerte RsvpErrorBudgetBurn (burn-rate x14) |
| 21:05 | IC = Sylvain, SEV-2 |
| 21:11 | Décision : rollback (mitigation) |
| 21:14 | Rollback effectif, error_rate 12% → 0.2% |
| 21:16 | Incident résolu |

## Root cause (5 Whys)
Migration 500 → INSERT KO → colonne NOT NULL sans DEFAULT → review n'a pas vu →
**le CI ne rejoue pas les migrations sur une copie de prod** (cause systémique).

## Ce qui a bien fonctionné
- L'alerte SLO a détecté en ~2 min (MTTD faible).
- Le rollback était propre et rapide.

## Ce qui peut être amélioré
- La review humaine n'a pas suffi à attraper l'absence de DEFAULT.
- Aucun runbook n'existait pour cette alerte (créé depuis).

## Action items
| Action | Responsable | Échéance | Priorité |
|--------|-------------|----------|----------|
| Job CI "dry-run migration sur snapshot de prod" | @sylvain | 2026-07-18 | P1 |
| Runbook RsvpErrorBudgetBurn + `runbook_url` sur l'alerte | @sylvain | 2026-07-14 | P1 |
| Lint migrations : interdire NOT NULL sans DEFAULT | @equipe | 2026-07-25 | P2 |

## Leçons apprises
Une review humaine ne remplace pas une barrière automatisée. La détection SLO
a parfaitement joué son rôle ; la prévention est le vrai chantier.
```

Remarque le ton : **aucun nom** dans la root cause, tout est formulé en faiblesses de système. C'est ça, blameless.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — l'IC qui debug

Dès que l'IC met les mains dans le système, personne ne coordonne : les updates s'arrêtent, deux personnes agissent en parallèle, la status page se fige. **L'IC orchestre, l'Ops agit.** Sur un incident solo, si tu dois debugger, dis-le explicitement (« je bascule Ops 5 min, IC en pause ») — le nommage garde la discipline.

### PIÈGE #2 — chercher la root cause avant de mitiger

« Comprenons d'abord ce qui se passe » coûte des minutes d'indisponibilité. Un rollback restaure en 5 min ; l'enquête peut se faire ensuite, à froid, sur les données figées. **Mitigation > compréhension**, toujours, pendant l'incident.

### PIÈGE #3 — le postmortem qui nomme un coupable

« X a poussé une migration cassée » **n'est pas une root cause** — c'est un blâme. Ça pousse l'équipe à cacher les incidents suivants. La root cause est systémique : *pourquoi le système a-t-il laissé passer cette migration ?* Reformule toujours en faiblesse de barrière (CI, review, tests, alerte manquante).

### PIÈGE #4 — s'arrêter trop tôt (ou trop tard) dans les 5 Whys

S'arrêter à « erreur humaine » rate la vraie cause (continue : *pourquoi le système l'a permis ?*). S'arrêter à « les humains sont faillibles » est trop abstrait pour produire une action. La bonne profondeur est celle qui débouche sur un **action item concret et vérifiable**.

### PIÈGE #5 — des action items sans propriétaire ni date

« Améliorer la CI » n'arrivera jamais. Un action item non assigné, non daté, non tracké dans l'outil d'équipe **n'existe pas**. Spécifique + responsable + échéance + priorité + ticket, sinon le prochain incident sera identique.

### PIÈGE #6 — la sévérité gravée dans le marbre

Rester en SEV-3 « parce que c'est comme ça qu'on a démarré » alors que l'impact grossit fait perdre du temps. La sévérité **évolue** : réévalue-la à chaque nouvelle info. En cas de doute, escalade — désescalader est facile.

### PIÈGE #7 — confondre mitigation et résolution

Un rollback (mitigation) protège les utilisateurs mais ne corrige pas le bug de migration (résolution). Clore l'incident sans action item de résolution laisse une bombe amorcée : le prochain qui « re-déploie la feature » rejoue la panne.

---

## 5. Ancrage TribuZen

L'incident RSVP est la **suite directe** du fil-rouge observabilité : l'alerte du module 09 déclenche, les SLO du module 08 donnent le langage de l'impact, les métriques/logs des modules 01-04 servent au diagnostic. Ce module ajoute la couche **humaine et process**.

Ce que TribuZen pose grâce à ce module :

| Artefact | Où | Rôle dans TribuZen |
|----------|-----|--------------------|
| Convention de sévérité SEV-1..4 | `ops/INCIDENT.md` | vocabulaire partagé de l'impact famille |
| Rôles IC / Comms / Ops | `ops/INCIDENT.md` | qui fait quoi, même en équipe réduite |
| Template de postmortem | `ops/postmortems/TEMPLATE.md` | postmortem blameless en < 48h |
| Postmortem RSVP | `ops/postmortems/2026-07-11-rsvp.md` | premier apprentissage documenté |
| Runbook RsvpErrorBudgetBurn | `ops/runbooks/rsvp-error-budget-burn.md` | rattaché à l'alerte via `runbook_url` |

Emplacement cible dans `smaurier/tribuzen` :

```
tribuzen/
  ops/
    INCIDENT.md                       ← sévérités + rôles + process
    runbooks/
      rsvp-error-budget-burn.md       ← runbook lié à l'alerte (module 09)
    postmortems/
      TEMPLATE.md                     ← squelette blameless
      2026-07-11-rsvp.md              ← postmortem du cas concret
```

> Le boucle-retour concrète : l'action item P1 « job CI de dry-run de migration » **empêche la récurrence** de cet incident. C'est le sens du postmortem — pas archiver une panne, mais rendre la même panne **impossible**.

---

## 6. Points clés

1. Cycle d'un incident : **Détection → Triage → Mitigation → Résolution → Postmortem**.
2. La sévérité (SEV-1..4) mesure l'**impact business**, évolue dans le temps ; **en cas de doute, escalade**.
3. Rôles séparés : **IC** coordonne (ne debug pas), **Ops** agit sur le système (annonce avant d'agir), **Comms** parle à l'extérieur.
4. Poste de commandement reconnu (canal dédié + doc live) et **handoff explicite** de l'IC.
5. **Mitiger d'abord** (rollback, feature flag), comprendre ensuite. Un service restauré en 5 min bat un fix parfait en 2h.
6. La **timeline horodatée** est la matière première du postmortem et rend MTTD/MTTA/MTTR calculables.
7. Postmortem **blameless** : tout le monde a agi au mieux avec l'info disponible ; la root cause est un **système**, jamais une personne.
8. **Just Culture** : erreur (corriger le système) vs risque (coacher) vs négligence (rare) ; >95 % = erreur.
9. **5 Whys** jusqu'à une cause systémique qui débouche sur un action item concret.
10. Action item = spécifique + assigné + daté + priorisé + **tracké**, sinon il n'existe pas.
11. Chaque alerte pointe vers un **runbook** (`runbook_url`).

---

## 7. Seeds Anki

```
Quel est l'ordre des cinq phases d'un incident ?|Détection → Triage → Mitigation → Résolution → Postmortem. La mitigation limite l'impact (rollback, flag) ; la résolution corrige la root cause plus tard ; le postmortem fait apprendre.
Pourquoi mitiger avant de chercher la root cause ?|Un service restauré en 5 min par un rollback protège les utilisateurs immédiatement ; un fix parfait en 2h les laisse dans le noir. On stoppe l'hémorragie d'abord, on enquête à froid ensuite sur les données figées.
Que fait l'Incident Commander, et que ne fait-il PAS ?|Il coordonne : tient l'état de l'incident, décide l'escalade, assigne les rôles, cadence les updates, déclare la résolution. Il ne debug PAS le système — c'est le rôle d'Ops. Son métier est la coordination, pas l'expertise technique du système en panne.
Sur quoi repose la sévérité d'un incident, et évolue-t-elle ?|Sur l'impact business (users affectés, feature critique, données), pas sur la difficulté technique. Elle évolue : un SEV-3 dont l'impact grossit devient SEV-1. En cas de doute, on escalade (désescalader est facile).
Qu'est-ce qu'un postmortem blameless, en une phrase ?|Un postmortem qui part du principe que toute personne impliquée a agi au mieux avec l'information disponible. La root cause est cherchée dans le système/les process, jamais dans un individu — sinon les gens cachent les incidents suivants.
Reformule "Jean a poussé une migration cassée" en cause systémique.|"Le CI ne rejouait pas les migrations sur une copie de prod, laissant une migration NOT NULL sans DEFAULT atteindre la production." On décrit une barrière absente, pas une faute.
À quoi servent les 5 Whys et où faut-il s'arrêter ?|Enchaîner "pourquoi ?" jusqu'à une cause SYSTÉMIQUE actionnable. Ne pas s'arrêter à "erreur humaine" (continuer : pourquoi le système l'a permis ?) ni à "les humains sont faillibles" (trop abstrait pour agir).
Qu'est-ce qui rend un action item réel plutôt que décoratif ?|Spécifique + assigné (responsable nommé) + daté (échéance) + priorisé (P1/P2/P3) + tracké dans l'outil d'équipe. Un action item non assigné et non suivi n'existe pas — c'est le problème n°1 des postmortems.
Que sont MTTD, MTTA, MTTR ?|MTTD = temps début→première alerte (détection). MTTA = temps alerte→premier humain qui regarde. MTTR = temps début→résolution complète. La timeline horodatée de l'incident est ce qui les rend calculables.
À quoi sert un runbook et comment est-il relié aux alertes ?|Guide pas-à-pas pour diagnostiquer/mitiger un type d'incident précis. Chaque alerte doit pointer vers son runbook via le champ runbook_url dans ses annotations (module 09), pour réagir vite en pleine nuit.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-10-incidents-et-postmortems/README.md`. Tu mènes le postmortem blameless de l'incident RSVP TribuZen à partir d'une timeline brute : sévérité, root cause en 5 Whys, action items suivis, runbook — grille d'auto-évaluation, coach en session, variante J+30.
