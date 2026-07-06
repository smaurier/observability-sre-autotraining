# Lab 10 — Incidents et postmortems

> **Outcome :** à la fin, tu sais mener un **postmortem blameless** de bout en bout à partir d'une timeline brute — classer la sévérité, reconstruire la root cause en 5 Whys, écrire des action items suivis et un runbook rattaché à l'alerte.
> **Vrai outil :** ta prose + un `postmortem.md` versionné dans un repo Git (celui de TribuZen ou un scratch). Le livrable est un document réel, pas un exercice sur harnais.
> **Feedback :** le coach valide en session — pas de test-runner auto-correcteur. L'oracle, c'est la grille d'auto-évaluation ci-dessous et les questions du coach.

---

## Énoncé

Un incident vient de frapper TribuZen. On te donne la **timeline brute** captée dans le canal `#incident` — des horodatages, des messages, du bruit. Ta mission : la transformer en un **postmortem blameless** exploitable et en un **runbook** qui évite la prochaine occurrence.

Tu dois produire un fichier `postmortem.md` qui contient :

1. Un **en-tête** : titre, date, sévérité (que tu classes toi-même et justifies), durée, auteur.
2. Un **résumé** en une phrase (quoi, combien de temps, quel impact).
3. La **timeline nettoyée** (tableau heure | événement).
4. La **root cause via 5 Whys** — remonte jusqu'à une cause **systémique**, pas un nom.
5. Les sections **« ce qui a bien fonctionné »** et **« ce qui peut être amélioré »**.
6. Un tableau d'**action items** : action + responsable + échéance + priorité (P1/P2/P3).
7. Un **runbook** court pour l'alerte concernée (fichier séparé `runbook.md`).

**Contrainte non négociable :** zéro blâme. Aucun nom de personne dans la root cause ni dans les faiblesses ; tout est formulé en faiblesse de **système/process**.

### Timeline brute fournie (le matériau)

Copie-la telle quelle, puis nettoie-la. Elle contient volontairement du bruit et une formulation accusatrice à neutraliser.

```
[22:14] bot: 🔴 ALERTE FamilyInviteHighErrorRate — taux d'erreur 5xx /invite = 18% (5m)
[22:15] léa: c'est encore les invitations ??
[22:16] léa: j'ack. je prends l'IC. je dis SEV-... 2 je pense, l'invite est down mais le reste tourne
[22:17] léa: sam tu peux être Ops et regarder ? je gère la comms famille en //
[22:18] sam: ok je regarde les logs invite
[22:19] léa: status page à jour : "envoi d'invitations perturbé, on est dessus"
[22:23] sam: logs pleins de "SMTP 421 too many connections" vers le provider mail
[22:24] sam: on a déployé à 22:00 un batch de relance d'invitations non envoyées
[22:26] sam: le batch envoie 4000 mails d'un coup sans throttling, le provider nous rate-limite et refuse aussi les mails temps réel
[22:27] léa: ok mitigation : on coupe le feature flag "batch_relance" tout de suite
[22:28] sam: flag coupé
[22:31] sam: erreurs /invite redescendent, 18% → 0.5%
[22:33] léa: je désescalade SEV-3, comms "service rétabli"
[22:35] léa: incident résolu. c'est max qui a lancé le batch sans prévenir aussi, faudra voir avec lui
[22:36] léa: postmortem demain 14h, je pré-remplis
```

**Pas de gap-fill.** Tu écris le postmortem complet ; le corrigé est un modèle, pas un texte à trous.

### Starter minimal

Crée un dossier de travail versionné :

```
tribuzen-postmortem-lab/
  postmortem.md      ← à écrire
  runbook.md         ← à écrire
```

```markdown
<!-- postmortem.md — STARTER (à compléter) -->
# Postmortem — <titre factuel de l'incident>
**Date** : 2026-07-15   **Sévérité** : <SEV-?>   **Durée** : <fin - début>
**Auteur** : <toi>   **Reviewers** :

## Résumé
<une phrase : quoi, combien de temps, quel impact>

## Impact
<qui/combien affecté, SLO breach ?, error budget consommé ?>

## Timeline
| Heure | Événement |
|-------|-----------|
| 22:00 | ... |

## Root cause (5 Whys)
1. Pourquoi ? →
2. Pourquoi ? →
3. Pourquoi ? →
4. Pourquoi ? →
5. Pourquoi ? →
→ root cause systémique :

## Ce qui a bien fonctionné
-

## Ce qui peut être amélioré
-

## Action items
| Action | Responsable | Échéance | Priorité |
|--------|-------------|----------|----------|
|        |             |          |          |

## Leçons apprises
-
```

---

## Étapes (en friction)

1. **Classe la sévérité et justifie.** Léa a dit SEV-2 « à l'instinct ». Confirme ou corrige avec le tableau du module (impact business : une feature critique — l'invitation — est down, le reste tourne). Écris une phrase de justification.
2. **Calcule les métriques.** À partir des horodatages : MTTD (première alerte vs début réel du problème à 22:00), MTTR (22:00 → 22:31, retour à la normale). Note-les dans l'impact.
3. **Nettoie la timeline.** Garde les événements factuels (alerte, décisions, mitigation, retour à la normale), enlève le bruit conversationnel. Horaires exacts.
4. **Déroule les 5 Whys.** Pars de « les invitations échouaient ». Remonte : 5xx → SMTP 421 → provider rate-limit → batch de 4000 mails sans throttling → **pas de garde-fou (throttling/quota) sur les envois de masse**. Arrête-toi à la cause systémique.
5. **Neutralise le blâme.** Le message `[22:35]` désigne « max ». Ta root cause et tes sections ne doivent contenir **aucun nom** : reformule en absence de barrière (throttling, revue de charge, feature flag testé en préprod).
6. **Écris des action items SMART.** Au moins trois, dont un P1. Chacun : action spécifique + responsable + échéance datée + priorité. Range-les mentalement par levier (détection / mitigation / prévention).
7. **Écris le runbook** `runbook.md` pour `FamilyInviteHighErrorRate` : contexte, diagnostic (logs, déploiement récent, quota provider), mitigation (couper le flag batch), escalade. Mentionne qu'il sera rattaché à l'alerte via `runbook_url` (module 09).
8. **Commit.** `git add` + un commit — le postmortem est un artefact versionné, pas un brouillon jetable.

---

## Corrigé complet commenté

`postmortem.md` :

```markdown
# Postmortem — Saturation SMTP après batch de relance des invitations
**Date** : 2026-07-15   **Sévérité** : SEV-2   **Durée** : 31 min (22:00 → 22:31)
**Auteur** : Sylvain   **Reviewers** : (équipe)

## Résumé
Un batch de relance envoyant 4000 e-mails d'invitation sans throttling a fait
rate-limiter notre provider SMTP, provoquant 18 % d'erreurs sur /invite
(temps réel inclus) pendant ~17 min. Mitigé en coupant le feature flag du batch.

<!-- SEV-2 justifiée : une feature critique (l'invitation de famille) est dégradée,
     mais le reste de l'app répond. Pas SEV-1 (pas de down global, pas de perte de
     données), pas SEV-3 (impact > mineur, pas de workaround pour l'utilisateur). -->

## Impact
- Erreurs 5xx sur POST /api/families/:id/invite : ~18 % de 22:14 à 22:31.
- Envois d'invitations temps réel bloqués (le rate-limit provider touche AUSSI le flux normal).
- SLO invitation : breach probable. Error budget à réconcilier au reporting.
- MTTD ≈ 14 min (problème réel dès 22:00, alerte à 22:14 — cf. action item détection).
- MTTR ≈ 31 min (22:00 → 22:31).

## Timeline
| Heure | Événement |
|-------|-----------|
| 22:00 | Déploiement + lancement du batch de relance (feature flag `batch_relance`) |
| 22:14 | Alerte FamilyInviteHighErrorRate (5xx /invite = 18 %) |
| 22:16 | IC = Léa, SEV-2 |
| 22:17 | Ops = Sam (logs) ; Léa gère la comms famille |
| 22:23 | Logs : "SMTP 421 too many connections" vers le provider mail |
| 22:26 | Cause probable : batch de 4000 mails sans throttling → rate-limit provider |
| 22:27 | Décision IC : mitigation = couper le feature flag `batch_relance` |
| 22:28 | Flag coupé |
| 22:31 | Erreurs /invite 18 % → 0.5 % |
| 22:33 | Désescalade SEV-3, comms "service rétabli" |
| 22:35 | Incident résolu |

## Root cause (5 Whys)
1. Pourquoi les invitations échouaient ? → /invite renvoyait des 5xx.
2. Pourquoi ? → le provider SMTP répondait 421 (too many connections).
3. Pourquoi ? → un batch a émis 4000 mails d'un coup, dépassant le quota du provider.
4. Pourquoi le batch a-t-il pu envoyer sans limite ? → aucun throttling / quota dans le job.
5. Pourquoi ce comportement n'a-t-il pas été vu avant prod ? → le flag `batch_relance`
   n'est jamais testé sous charge réaliste en préprod.
→ **Root cause systémique** : absence de garde-fou de débit sur les envois de masse,
   combinée à une absence de test de charge du batch avant activation en production.

## Ce qui a bien fonctionné
- L'alerte a bien détecté l'anomalie et les rôles ont été nommés immédiatement.
- La mitigation par feature flag a été rapide et propre (pas besoin de rollback complet).
- La comms famille a été postée avant même la compréhension de la cause.

## Ce qui peut être amélioré
- La détection est arrivée 14 min après le début réel (seuil d'alerte à revoir).
- Le batch d'envoi n'a aucune limitation de débit ni test de charge en préprod.
- Aucun runbook n'existait pour cette alerte (créé depuis).

## Action items
| Action | Responsable | Échéance | Priorité |
|--------|-------------|----------|----------|
| Ajouter un throttling (N mails/s) au job de relance | @sylvain | 2026-07-22 | P1 |
| Runbook FamilyInviteHighErrorRate + runbook_url sur l'alerte | @sylvain | 2026-07-17 | P1 |
| Alerte sur le taux de 421 SMTP (détecter la saturation plus tôt) | @equipe | 2026-07-24 | P2 |
| Test de charge du batch en préprod avant activation du flag | @equipe | 2026-07-31 | P3 |

## Leçons apprises
- Un envoi de masse sans limitation de débit est un incident en attente : le débit
  doit être une contrainte du code, pas de la discipline.
- Un flag qui change le comportement de charge doit être validé sous charge en préprod.
```

`runbook.md` :

```markdown
# Runbook — FamilyInviteHighErrorRate

## Contexte
Se déclenche quand le taux d'erreur 5xx sur POST /api/families/:id/invite
dépasse ~5 % sur 5 min. Cause fréquente : saturation du provider SMTP.

## Diagnostic
1. Un déploiement ou l'activation d'un flag batch récente ? (vérifier l'historique)
2. Logs /invite sur les 15 dernières min → chercher "SMTP 4xx/5xx", "421", "too many".
3. Taux d'erreur + p99 latence /invite en PromQL (module 04).
4. Vérifier le tableau de bord de consommation du quota provider.

## Mitigation
- Batch de relance actif → couper le feature flag `batch_relance`.
- Saturation provider persistante → activer la file d'attente d'envoi (mode différé).
- Dépendance provider totalement down → basculer sur le provider SMTP secondaire.

## Escalade
Non résolu en 30 min, ou provider injoignable → escalader à l'IC de garde.

<!-- À rattacher à l'alerte : annotations.runbook_url = <url de ce runbook> (module 09) -->
```

**Pourquoi ce corrigé est correct :**
- **Sévérité justifiée** par l'impact business (feature critique dégradée, pas de down global) et non par l'instinct.
- La **root cause est systémique** (« absence de throttling + pas de test de charge »), jamais « max a lancé le batch » — le nom du message `[22:35]` a disparu.
- Les 5 Whys **remontent** au-delà du symptôme technique (421) jusqu'à la barrière manquante et débouchent sur des action items concrets.
- Les **action items sont SMART** : chacun a un responsable, une échéance datée, une priorité — et couvre les trois leviers (détection, mitigation, prévention).
- Le **runbook** est rattachable à l'alerte via `runbook_url`, bouclant avec le module 09.

### Grille d'auto-évaluation (à passer avec le coach)

| Critère | Vert | Rouge |
|---------|------|-------|
| Sévérité | classée + justifiée par l'impact business | reprise à l'instinct, non justifiée |
| Blameless | zéro nom dans root cause / améliorations | « untel a fait… » subsiste quelque part |
| Root cause | systémique (barrière manquante), issue des 5 Whys | s'arrête au symptôme (421) ou à « erreur humaine » |
| Timeline | horaires exacts, bruit retiré, décisions gardées | approximative ou copiée-collée avec le bruit |
| Action items | spécifiques + assignés + datés + priorisés | vagues (« améliorer la CI »), sans owner/date |
| Métriques | MTTD et MTTR calculés depuis la timeline | absents ou inventés |
| Runbook | diagnostic + mitigation + escalade, lié à l'alerte | générique ou manquant |

### Coach — questions de vérification en session

- « Pourquoi SEV-2 et pas SEV-1 ni SEV-3 ? » (attendu : feature critique dégradée, pas de down global ni de workaround)
- « Montre-moi ta root cause. Y a-t-il un nom de personne dedans ? Sinon, où irait le blâme et pourquoi c'est un piège ? »
- « Ton 5 Whys s'arrête où, et pourquoi pas un cran plus tôt ni plus tard ? »
- « Prends ton premier action item : qui, pour quand, comment on vérifie qu'il est fait ? »
- « MTTD = 14 min : c'est bien ou pas, et quel action item l'attaque ? »
- « À quelle alerte ton runbook est-il rattaché, et par quel champ ? » (attendu : `runbook_url`, module 09)

---

## Variante J+30 (fading)

**Même livrable, sans rouvrir ce corrigé ni le module :**

1. On te donne une **nouvelle timeline brute** (un incident différent : `RsvpErrorBudgetBurn`, une migration DB ajoutant une colonne `NOT NULL` sans `DEFAULT` déployée un vendredi soir). Reconstruis le postmortem complet **en 30 min**.
2. Contrainte ajoutée : la timeline contient **deux** formulations accusatrices — repère-les et neutralise-les explicitement au coach.
3. Rédige les 5 Whys **à deux branches** (une branche « pourquoi la migration est passée en prod », une branche « pourquoi on ne l'a pas détecté plus tôt ») — il y a souvent plusieurs causes racines.
4. Produis **exactement 4 action items**, un par levier : détection, mitigation, prévention, process.

**Critère de réussite :** un `postmortem.md` blameless et versionné, root cause systémique à deux branches, MTTD/MTTR calculés, 4 action items SMART couvrant les 4 leviers — le tout sans nom de personne.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ces artefacts vivent ici :

```
tribuzen/
  ops/
    INCIDENT.md                       ← sévérités + rôles IC/Comms/Ops + process
    runbooks/
      family-invite-high-error-rate.md
    postmortems/
      TEMPLATE.md                     ← squelette blameless réutilisable
      2026-07-15-smtp-batch.md        ← le postmortem de ce lab
```

**Différences avec le lab :**
- Le postmortem est **relu en groupe** (peer review par un senior) puis publié dans le repo pour l'apprentissage d'équipe — dans le lab, c'est le coach qui joue ce rôle.
- Les action items sont **trackés** dans l'outil d'équipe (GitHub Issues) et revus à chaque rétro, pas seulement listés dans le `.md`.
- Le `runbook_url` est réellement branché sur l'alerte Prometheus/Alertmanager du module 09.

**Commit cible :**
```
docs(ops): postmortem blameless incident SMTP + runbook FamilyInviteHighErrorRate
```
