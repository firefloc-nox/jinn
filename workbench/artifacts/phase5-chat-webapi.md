# Phase 5 — Chat via Hermes WebAPI SSE

## Objectif

Remplacer le spawn CLI de `HermesEngine` par un transport HTTP SSE vers la Hermes WebAPI (port 8642).
Le CLI spawn reste comme fallback si la WebAPI est indisponible.

---

## Flow : Jinn session → WebAPI transport → Hermes session → SSE → résultat

```
Jinn Gateway
  │
  ├─ POST /api/sessions       (Jinn crée une Jinn session)
  │     └─ EngineRunner.run()
  │           │
  │           ├─ HermesEngine.run(opts)
  │           │     │
  │           │     ├─ [1] webapi.isAvailable()   GET http://127.0.0.1:8642/health
  │           │     │        └─ cache 30s
  │           │     │
  │           │     ├─ WebAPI disponible ?
  │           │     │   OUI ──────────────────────────────────────────────────────┐
  │           │     │                                                             │
  │           │     │   [2a] runViaWebAPI(webapi, opts, startMs)                 │
  │           │     │         │                                                   │
  │           │     │         ├─ resumeSessionId présent ET "sess_*" ?            │
  │           │     │         │   NON → POST /api/sessions  (Hermes session)     │
  │           │     │         │          body: { source, model, system_prompt }  │
  │           │     │         │          → hermesSessionId = "sess_<hex>"        │
  │           │     │         │   OUI → réutiliser hermesSessionId directement   │
  │           │     │         │                                                   │
  │           │     │         └─ POST /api/sessions/:id/chat/stream              │
  │           │     │               Accept: text/event-stream                    │
  │           │     │               body: { message, model?, enabled_toolsets? }│
  │           │     │                                                             │
  │           │     │               ┌──────────── SSE stream ──────────────┐     │
  │           │     │               │  event: session.created              │     │
  │           │     │               │  event: run.started                  │     │
  │           │     │               │  event: message.started              │     │
  │           │     │               │  event: assistant.delta  ←── onStream│     │
  │           │     │               │  event: assistant.delta  ←── onStream│     │
  │           │     │               │  event: tool.pending                 │     │
  │           │     │               │  event: tool.started                 │     │
  │           │     │               │  event: tool.completed               │     │
  │           │     │               │  event: assistant.completed          │     │
  │           │     │               │  event: run.completed                │     │
  │           │     │               │  event: done                         │     │
  │           │     │               └──────────────────────────────────────┘     │
  │           │     │                                                             │
  │           │     │               EngineResult {                               │
  │           │     │                 sessionId: hermesSessionId,                │
  │           │     │                 result: <deltas agrégés>,                  │
  │           │     │                 hermesMeta: { hermesSessionId, ... }       │
  │           │     │               }                                    ←───────┘
  │           │     │
  │           │     └─ NON ou WebAPI mid-run error
  │           │         [2b] runViaCLI(opts)   ← comportement V1 d'origine
  │           │               spawn hermes.native chat -q [prompt] --quiet ...
  │           │               parse stdout → result + session_id
  │           │               → EngineResult
  │           │
  │           └─ EngineResult → session.engineSessionId, hermesMeta
  │
  └─ Réponse API Jinn
```

---

## Comparaison CLI spawn vs WebAPI

| Critère                  | CLI spawn (V1)                                    | WebAPI SSE (V2)                              |
|--------------------------|---------------------------------------------------|----------------------------------------------|
| Transport                | stdout/stderr de processus enfant                 | HTTP + Server-Sent Events                    |
| Streaming                | Pseudo (un seul onStream à la fin)                | Natif (token par token via assistant.delta)  |
| Parse fragile            | Oui — regex sur box-drawing Rich, metadata lines  | Non — JSON structuré par event               |
| LACP_BYPASS              | Requis (contourne le wrapper TTY)                 | Non requis                                   |
| Session Hermes           | ID parsé depuis stdout (session_id: ...)          | ID retourné par POST /api/sessions           |
| Résumé de session        | --resume <id> (CLI)                               | Réutilisation directe de hermesSessionId     |
| Profil                   | --profile <name>                                  | source="jinn-<profile>" (tracking only)      |
| Toolsets                 | --toolsets <csv>                                  | enabled_toolsets: [...] dans ChatRequest     |
| Skills                   | --skills <csv>                                    | Non supporté (WebAPI utilise config Hermes)  |
| Kill/interrupt           | SIGTERM/SIGKILL sur PID                           | Non implémenté (future: DELETE /sessions/:id)|
| Overhead démarrage       | ~500ms (spawn Python + import)                    | ~5ms (connexion TCP locale)                  |
| Dépendance               | hermes binary dans PATH                           | Hermes WebAPI tournant sur port 8642         |
| Robustesse               | Fragile si format stdout change                   | Stable (protocole SSE versionné)             |

---

## Conditions de fallback CLI

Le fallback sur `runViaCLI()` se déclenche dans deux cas :

**1. WebAPI indisponible au démarrage**
- `isAvailable()` → GET /health renvoie non-200 ou connection refused
- Cache 30s : pas de health check à chaque run
- Log : `[HermesEngine] WebAPI unavailable at 127.0.0.1:8642 — falling back to CLI spawn`

**2. WebAPI disponible mais échoue en cours d'exécution**
- `runViaWebAPI()` lève une exception (réseau, timeout, error SSE event)
- Le cache est invalidé immédiatement (`invalidateAvailabilityCache()`)
- Fallback CLI avec les mêmes opts → la requête n'est pas perdue
- Log : `[HermesEngine] WebAPI transport failed: <msg> — falling back to CLI spawn`

**Ce que le fallback NE couvre PAS :**
- Une session WebAPI déjà créée (`sess_*`) qui échoue en cours de stream — la session
  Hermes est créée mais le message n'a pas abouti. Le fallback CLI crée une nouvelle
  session CLI distincte. Ce cas est rare (réseau local très stable).

---

## Configuration

| Variable d'environnement  | Défaut      | Description                              |
|---------------------------|-------------|------------------------------------------|
| `HERMES_WEBAPI_HOST`      | `127.0.0.1` | Hôte de la Hermes WebAPI                 |
| `HERMES_WEBAPI_PORT`      | `8642`      | Port de la Hermes WebAPI                 |

Exemple : désactiver la WebAPI pour forcer le CLI spawn (debug) :
```bash
HERMES_WEBAPI_HOST=0.0.0.0 HERMES_WEBAPI_PORT=0 jinn start
```
(un port invalide fera échouer le health check → fallback automatique)

---

## Gestion du hermesProfile

`ChatRequest` (Hermes WebAPI) n'expose pas de champ `profile`.
La WebAPI tourne avec la configuration Hermes active au démarrage.

Workaround V2 : `source="jinn-<profile>"` passé dans le body de `POST /api/sessions`.
Cela permet le tracking côté Hermes mais n'active pas réellement un profil différent.

**Implication** : pour utiliser un profil Hermes spécifique, Jinn doit cibler une instance
Hermes WebAPI démarrée avec ce profil (`hermes -p <profile> serve`).
Une instance WebAPI par profil actif est la bonne architecture cible (Phase 6).

---

## Limites connues en V2

- `hermesSkills` non transmis (WebAPI ne supporte pas `--skills` dans ChatRequest)
- `hermesProvider` non transmis (idem)
- Pas de kill/interrupt WebAPI (SIGTERM uniquement via CLI)
- Un seul endpoint WebAPI → un seul profil actif par instance Hermes

---

## Fichiers modifiés

| Fichier                                               | Rôle                                           |
|-------------------------------------------------------|------------------------------------------------|
| `packages/jimmy/src/engines/hermes-webapi.ts`         | Transport WebAPI (nouveau fichier Phase 5)     |
| `packages/jimmy/src/engines/hermes.ts`                | HermesEngine : WebAPI-first + fallback CLI     |
| `packages/jimmy/src/engines/__tests__/hermes-webapi.test.ts` | Suite de tests (22 cas)               |
