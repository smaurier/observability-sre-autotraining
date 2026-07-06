# Lab 04 — Distributed tracing : construire et analyser une trace TribuZen

> **Outcome :** à la fin, tu sais assembler à la main une trace multi-services (root + child spans reliés par `trace_id` / `parentSpanId`), l'envoyer dans un vrai backend de traces, et **lire l'arbre dans Jaeger** pour localiser un goulot d'étranglement.
> **Vrai outil :** stack `docker-compose.tracing.yml` fournie à la racine du cours — **OpenTelemetry Collector** (réel, port OTLP 4318) + **Jaeger UI** (réel, port 16686). Pas de harnais simulé.
> **Feedback :** le coach valide en session (lecture de la trace dans Jaeger + grille ci-dessous). Pas de test-runner auto-correcteur.

> **Pourquoi construire la trace à la main ?** Ce module est conceptuel : l'instrumentation automatique avec le SDK OpenTelemetry est le **module 05**. Ici, tu forges le payload OTLP toi-même — c'est le meilleur moyen d'ancrer *trace_id constant*, *parentSpanId qui chaîne l'arbre* et *span kind*. Tu envoies ensuite ce payload au **vrai collector**, et tu regardes le **vrai Jaeger** reconstruire l'arbre. Rien n'est simulé côté outillage.

---

## Énoncé

On rejoue l'incident du module : une invitation TribuZen (« Inviter un membre ») met **4 secondes** à partir. La requête traverse 4 étapes :

```
POST /api/families/f-123/invitations   (BFF, root)
  ├─ authz.check              (INTERNAL)
  ├─ createInvitation         (INTERNAL)
  │    └─ db INSERT invitation (CLIENT, PostgreSQL)
  └─ sendInvite               (CLIENT, service Notifications)
       └─ HTTP POST email-provider/send (CLIENT)
```

Ta mission : **produire cette trace** en OTLP/JSON, l'**envoyer** au collector, puis l'**ouvrir dans Jaeger** et **remplir la grille d'analyse** pour désigner le span coupable — preuve à l'appui.

### Démarrer la stack (vrai outil)

```bash
# à la racine du cours 16-observability-sre
docker compose -f docker-compose.tracing.yml up -d

# Collector OTLP/HTTP : http://localhost:4318  (endpoint traces : /v1/traces)
# Jaeger UI          : http://localhost:16686
```

### Rappel du format OTLP/HTTP (vérifié sur opentelemetry.io/docs/specs/otlp)

- Endpoint traces : `POST http://localhost:4318/v1/traces`
- Header : `Content-Type: application/json`
- Corps : `resourceSpans[] → scopeSpans[] → spans[]`
- Champs d'un span (lowerCamelCase) : `traceId`, `spanId`, `parentSpanId`, `name`, `kind`, `startTimeUnixNano`, `endTimeUnixNano`, `attributes`
- `traceId` = 32 hex, `spanId` = 16 hex, `parentSpanId` vide (`""`) pour le root
- `kind` numérique : `1`=INTERNAL, `2`=SERVER, `3`=CLIENT, `4`=PRODUCER, `5`=CONSUMER

**Pas de gap-fill** : tu écris le JSON complet à partir du squelette ci-dessous.

### Starter minimal — `invitation-trace.json`

```json
{
  "resourceSpans": [
    {
      "resource": {
        "attributes": [
          { "key": "service.name", "value": { "stringValue": "tribuzen-bff" } }
        ]
      },
      "scopeSpans": [
        {
          "scope": { "name": "lab-04-manual" },
          "spans": [
            {
              "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
              "spanId": "00000000000000a1",
              "parentSpanId": "",
              "name": "POST /api/families/f-123/invitations",
              "kind": 2,
              "startTimeUnixNano": "1751800000000000000",
              "endTimeUnixNano":   "1751800004020000000",
              "attributes": [
                { "key": "family.id", "value": { "stringValue": "f-123" } }
              ]
            }
            // ← À TOI : ajouter authz.check, createInvitation, db INSERT,
            //           sendInvite, HTTP POST email-provider/send
          ]
        }
      ]
    }
  ]
}
```

### Envoyer la trace

```bash
curl -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d @invitation-trace.json
```

Ouvre ensuite `http://localhost:16686`, service `tribuzen-bff`, et trouve ta trace.

---

## Étapes (en friction)

1. **Garde le `traceId` identique** sur les 6 spans (c'est le fil rouge de la requête). Change **uniquement** le `spanId` à chaque span.
2. **Chaîne l'arbre par `parentSpanId`** : `authz`, `createInvitation` et `sendInvite` ont pour parent le root (`00000000000000a1`) ; `db INSERT` a pour parent `createInvitation` ; `HTTP POST email` a pour parent `sendInvite`.
3. **Choisis le bon `kind`** par span : root = `2` (SERVER), `authz`/`createInvitation` = `1` (INTERNAL), `db INSERT`, `sendInvite`, `HTTP POST email` = `3` (CLIENT).
4. **Encode les durées** via `startTimeUnixNano`/`endTimeUnixNano` (1 ms = 1 000 000 ns). Fais en sorte que `HTTP POST email` dure ~3 880 ms et que tout le reste soit court.
5. **Pose 1 attribut métier** par span pertinent (`db.system=postgresql`, `invitation.channel=email`, …).
6. **Envoie** avec le `curl` ci-dessus. Corrige jusqu'à ce que Jaeger affiche **un seul arbre à 6 spans** (pas 6 traces séparées → signe d'un `traceId` ou `parentSpanId` cassé).
7. **Remplis la grille d'analyse** en lisant la trace dans Jaeger.

### Grille d'analyse (à remplir dans Jaeger)

| Question | Ta réponse (lue dans Jaeger) |
|---|---|
| Quel est le `trace_id` de la requête ? | |
| Combien de spans ? Lequel est le **root** (pas de parent) ? | |
| Durée totale de la trace ? | |
| Quel span porte la plus grosse durée **propre** ? | |
| Ce span est-il **interne** à TribuZen ou un appel **externe** ? (regarde `kind` + nom) | |
| Le `status` global est-il en erreur, ou juste lent ? | |
| Conclusion : quelle décision produit proposes-tu ? | |

---

## Corrigé complet commenté

`invitation-trace.json` complet :

```json
{
  "resourceSpans": [
    {
      "resource": {
        "attributes": [
          { "key": "service.name", "value": { "stringValue": "tribuzen-bff" } }
        ]
      },
      "scopeSpans": [
        {
          "scope": { "name": "lab-04-manual" },
          "spans": [

            {
              "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
              "spanId": "00000000000000a1",
              "parentSpanId": "",
              "name": "POST /api/families/f-123/invitations",
              "kind": 2,
              "startTimeUnixNano": "1751800000000000000",
              "endTimeUnixNano":   "1751800004020000000",
              "attributes": [
                { "key": "family.id", "value": { "stringValue": "f-123" } },
                { "key": "user.id",   "value": { "stringValue": "u-9" } }
              ]
            },

            {
              "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
              "spanId": "00000000000000b2",
              "parentSpanId": "00000000000000a1",
              "name": "authz.check",
              "kind": 1,
              "startTimeUnixNano": "1751800000010000000",
              "endTimeUnixNano":   "1751800000022000000",
              "attributes": [
                { "key": "user.id", "value": { "stringValue": "u-9" } }
              ]
            },

            {
              "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
              "spanId": "00000000000000c3",
              "parentSpanId": "00000000000000a1",
              "name": "createInvitation",
              "kind": 1,
              "startTimeUnixNano": "1751800000025000000",
              "endTimeUnixNano":   "1751800000120000000",
              "attributes": [
                { "key": "invitation.channel", "value": { "stringValue": "email" } }
              ]
            },

            {
              "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
              "spanId": "00000000000000d4",
              "parentSpanId": "00000000000000c3",
              "name": "db INSERT invitation",
              "kind": 3,
              "startTimeUnixNano": "1751800000030000000",
              "endTimeUnixNano":   "1751800000070000000",
              "attributes": [
                { "key": "db.system", "value": { "stringValue": "postgresql" } }
              ]
            },

            {
              "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
              "spanId": "00000000000000e5",
              "parentSpanId": "00000000000000a1",
              "name": "sendInvite",
              "kind": 3,
              "startTimeUnixNano": "1751800000120000000",
              "endTimeUnixNano":   "1751800004020000000",
              "attributes": [
                { "key": "tribuzen.service",   "value": { "stringValue": "notifications" } },
                { "key": "invitation.channel", "value": { "stringValue": "email" } }
              ]
            },

            {
              "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
              "spanId": "00000000000000f6",
              "parentSpanId": "00000000000000e5",
              "name": "HTTP POST email-provider/send",
              "kind": 3,
              "startTimeUnixNano": "1751800000130000000",
              "endTimeUnixNano":   "1751800004010000000",
              "attributes": [
                { "key": "server.address", "value": { "stringValue": "email-provider.example" } }
              ]
            }

          ]
        }
      ]
    }
  ]
}
```

**Pourquoi ce corrigé est correct :**

- **Un seul `traceId`** sur les 6 spans → Jaeger les rassemble dans **une** trace. Si tu voyais 6 traces distinctes, c'est un `traceId` divergent.
- **`parentSpanId` chaîne l'arbre** : le root a `""` (aucun parent) ; `db INSERT` pointe vers `createInvitation` (pas vers le root) → il apparaît **imbriqué** sous lui ; `HTTP POST email` pointe vers `sendInvite`. C'est ce chaînage, pas l'ordre du tableau, qui dessine la hiérarchie.
- **Durées** : `HTTP POST email` = `4010 − 130 = 3880 ms`, et `sendInvite` = `4020 − 120 = 3900 ms` ⇒ la quasi-totalité du temps de `sendInvite` est *dans* l'appel externe. `authz` (12 ms) et `db INSERT` (40 ms) sont négligeables.
- **`kind`** : le root est `SERVER` (2, requête entrante) ; les appels sortants (`db`, `sendInvite`, `HTTP email`) sont `CLIENT` (3) — Jaeger s'en sert pour le graphe de dépendances.

**Grille remplie (lecture attendue dans Jaeger) :**

| Question | Réponse |
|---|---|
| `trace_id` | `4bf92f3577b34da6a3ce929d0e0e4736` |
| Nombre de spans / root | 6 spans ; root = `POST /api/families/f-123/invitations` |
| Durée totale | ~4 020 ms |
| Plus grosse durée propre | `HTTP POST email-provider/send` (~3 880 ms) |
| Interne ou externe ? | **Externe** — appel `CLIENT` vers `email-provider.example` |
| Status | Pas d'erreur — juste **lent** (`Unset`/`Ok`) |
| Décision produit | Passer l'envoi d'email en **asynchrone** (répondre à l'utilisateur tout de suite ; notifier en arrière-plan). Le job async se reliera à cette trace via un **span link**. |

> Point clé : le status global n'est **pas** en erreur. Une alerte sur le taux d'erreur n'aurait rien vu ; les métriques disaient « p95 à 4 s » sans localiser. **Seule la trace** attribue les 3,88 s au bon span.

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées** (sans rouvrir ce corrigé) :

1. **En 20 minutes**, forge une **nouvelle** trace pour le flux « **Créer un événement familial** » : `POST /api/families/f-123/events` (root SERVER) → `validateEvent` (INTERNAL) → `db INSERT event` (CLIENT postgresql) → `scheduleReminders` (INTERNAL) → `HTTP POST push-provider/send` (CLIENT).
2. Cette fois, **injecte une erreur** : mets le span `HTTP POST push-provider/send` en échec via son `status` OTLP (`"status": { "code": 2 }` = ERROR) et un attribut `error.type`.
3. Génère un `traceId` **neuf** (32 hex) et des `spanId` cohérents.
4. Envoie, puis vérifie dans Jaeger que **le span est marqué en rouge/erreur** et que le status **remonte** au niveau de la trace.

**Critère de réussite :** Jaeger affiche un arbre à 5 spans, un `traceId` unique, et le span push est signalé en erreur.

---

## Application TribuZen

Dans le vrai produit `smaurier/tribuzen`, tu ne forgeras évidemment pas le JSON à la main : c'est le **SDK OpenTelemetry** (module 05) qui produit ces spans automatiquement à partir des appels HTTP/DB réels du BFF et des services. Ce lab te fait manipuler **le format cible** pour que, au module 05, tu saches exactement ce que le SDK génère et pourquoi.

Ce que tu portes dès maintenant dans TribuZen :

- Le **découpage en spans** d'un parcours métier (invitation, événement, connexion) — décidé ici, instrumenté au module 05.
- Les **attributs métier** standards (`family.id`, `user.id`, `invitation.channel`, `tribuzen.service`) — la convention de nommage que tes spans respecteront.
- Le réflexe d'analyse : ouvrir Jaeger, trier par **durée propre**, distinguer **interne vs externe**, lire le **status**.

**Commit cible (préparation, doc de conception) :**
```
docs(observability): trace TribuZen invitation — spans, kinds et attributs métier cibles
```

Le commit d'instrumentation réelle (`feat(observability): OTel tracing du BFF + services`) viendra au module 05.
