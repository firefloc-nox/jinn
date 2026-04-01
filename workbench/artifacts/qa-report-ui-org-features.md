# QA Report — UI Org Features
**Date:** 2026-04-01 08:00 AM  
**Agent:** jinn-qa  
**URL testée:** http://127.0.0.1:7778  
**Méthode:** Analyse code source + API curl + Playwright headless

---

## 🔴 VERDICT GLOBAL: NEEDS FIXES

---

## 🚨 BUG CRITIQUE TRANSVERSAL — Build non déployé

### Root Cause identifiée

Jimmy (le serveur sur port 7778) sert l'UI depuis **`packages/jimmy/dist/web/`** (build du **31 mars 23:30**), mais les nouvelles features ont été compilées dans **`packages/web/.next/`** (build du **1er avril 07:52**).

**Le `postbuild` n'a pas été exécuté** — les nouvelles features sont compilées mais pas copiées dans le bundle servi.

```
Servi par jimmy:  packages/jimmy/dist/web/_next/.../page-c59896401b54010b.js  (40 KB)
Build récent:     packages/web/.next/static/.../page-6a8b33d020d9f9e3.js      (75 KB)
```

**Impact:** Les 4 features sont affectées car elles toutes dans le nouveau bundle non déployé.

**Fix:** Exécuter `pnpm build` depuis la racine du projet (ou équivalent) pour rebuilder jimmy avec le nouveau bundle web.

---

## Feature 1 — Page Org → bouton "+ New Agent"

**Statut: ❌ FAIL**

### Observations
- **Code source (✅):** Le bouton "+ New Agent" est présent dans `org/page.tsx` (ligne 125-131) et le composant `NewAgentModal` est correctement importé et géré avec `showNewAgent` state.
- **Modal 3 étapes (✅ code):** Le modal `new-agent-modal.tsx` implémente bien les 3 étapes (Identity → Engine → Persona) avec stepper visuel numéroté.
- **Runtime (❌):** Dans le bundle servi (`page-c59896401b54010b.js`, 40KB), aucune occurrence de `showNewAgent`, `NewAgentModal` ou du texte "New Agent" n'est présente dans la zone de tab bar. Le bouton est absent du DOM.

### Test Playwright
```
All buttons: ["dark", "Map", "Grid", "List", "Tree"]
New Agent button found: false
```
→ Seulement les boutons de tab sont rendus, pas le bouton "+ New Agent".

### Sévérité: CRITIQUE
Le bouton n'apparaît pas du tout dans l'UI servie.

### Screenshots
- `f1-org-loaded.png` — Page org chargée, bouton absent
- `f1-state.png` — DOM après hydratation complète

---

## Feature 2 — Employee detail → hermesProfile affiché

**Statut: ❌ FAIL (non déployé) / ✅ PASS (code)**

### Observations
- **Code source (✅):** Dans `employee-detail.tsx` (lignes 470-498), la section "Hermes Profile" est conditionnelle sur `employee.hermesProfile` :
  ```tsx
  {employee.hermesProfile && (
    <div className="mt-...">
      <p>Hermes Profile</p>
      <Badge>{employee.hermesProfile}</Badge>
      {employee.hermesProvider && <span>via {employee.hermesProvider}</span>}
      <button onClick={() => setShowProfileEditor(true)}>Edit Profile</button>
    </div>
  )}
  ```
- **API (✅):** L'endpoint `/api/org/employees/mon-agent` retourne bien `hermesProfile: "default"`. Le COO Jinn a `hermesProfile: "jinn-coo"`.
- **Runtime (❌):** Le panel détail s'ouvre (les éléments basiques comme nom, rank sont visibles) mais la section "Hermes Profile" n'apparaît pas dans les tests Playwright.

### Test Playwright
```
HERMES PROFILE label: false
"default" badge: false
Edit Profile button: false
Engine chip hermes: true  ← le chip engine hermes s'affiche bien
```

### Analyse
L'ancien bundle (~40KB) contient probablement une version antérieure de `EmployeeDetail` sans la section hermesProfile. Le nouveau bundle (75KB) contient le code corrigé.

### Sévérité: HAUTE
La section hermesProfile est invisible dans l'UI actuelle.

### Screenshots
- `f2-detail-panel.png` — Panel détail ouvert sans section hermesProfile
- `f2-jinn-panel.png` — COO Jinn sans section hermesProfile

---

## Feature 3 — Employee detail → section Services / cross-request

**Statut: ❌ FAIL (non déployé) / ✅ PASS (code)**

### Observations
- **Code source (✅):** Dans `employee-detail.tsx` (lignes 581-691), la section Services est conditionnelle sur `employee.provides` :
  ```tsx
  {employee.provides && employee.provides.length > 0 && (
    <div>
      <h3>Services</h3>
      {employee.provides.map((svc) => (
        <div key={svc.name}>
          <p>{svc.name}</p>
          <p>{svc.description}</p>
          <button onClick={...}>Request</button>
          {/* Inline cross-request form avec From Employee + Prompt + Submit */}
        </div>
      ))}
    </div>
  )}
  ```
- **Backend (✅):** L'agent `service-agent` avec `provides` a été créé pour le test. L'API `/api/org/employees/service-agent` retourne bien les `provides` (code-review, test-coverage).
- **API crossRequest (✅):** `api.crossRequest()` est implémenté dans `lib/api.ts` ligne 350.
- **Runtime (❌):** La section Services n'apparaît pas dans le panel détail de service-agent.

### Test Playwright
```
Services section heading: false
code-review: false
test-coverage: false
Request btn: false
```

### Sévérité: HAUTE
Toute la section Services + cross-request est absente de l'UI actuelle.

### Screenshots
- `f3-service-panel.png` — Panel de service-agent sans section Services

---

## Feature 4 — Chat → bouton resume pour engine hermes

**Statut: ⚠️ PARTIAL — Menu visible mais commande incorrecte dans build servi**

### Observations
- **Code source NEW BUILD (✅):** Dans `app/chat/page.tsx` (lignes 408-411) :
  ```typescript
  const cli = sessionMeta.engine === 'codex' ? 'codex' : sessionMeta.engine === 'hermes' ? 'hermes' : 'claude'
  const resumeCmd = cli === 'hermes'
    ? `hermes chat --resume ${sessionMeta.engineSessionId}`
    : `${cli} --resume ${sessionMeta.engineSessionId}`
  ```
  → Correct: hermes génère `hermes chat --resume <id>`

- **Code source OLD BUILD (❌):** Extrait du bundle servi `page-721a0d25257a5233.js` :
  ```javascript
  let e="codex"===m.engine?"codex":"claude";
  ee("".concat(e," --resume ...)
  ```
  → **BUG:** Pour engine=hermes, `e` vaut `"claude"` → commande générée: `claude --resume <id>` ❌

- **Runtime UI (⚠️):** Le menu "Copy CLI Resume Command" **est visible** dans l'UI (testé avec Playwright sur session morning-brief). Le bouton s'affiche correctement quand `engineSessionId` est présent. Mais la commande copiée est incorrecte pour les sessions hermes.

### Test Playwright
```
Copy CLI Resume Command: true  ← bouton visible ✅
# Mais la commande dans le presse-papiers serait: "claude --resume sess_962d789dd5fe40cf9d79b5f4d2a67bfb" 
# Au lieu de: "hermes chat --resume sess_962d789dd5fe40cf9d79b5f4d2a67bfb"
```

### Sévérité: HAUTE — Bug fonctionnel
L'utilisateur qui copie la commande CLI pour reprendre une session hermes obtient `claude --resume` au lieu de `hermes chat --resume`, rendant la commande inutilisable.

### Screenshots
- `f4-more-menu-final.png` — Menu ouvert avec "Copy CLI Resume Command" visible
- `f4-morning-brief-selected.png` — Session hermes morning-brief sélectionnée

---

## Récapitulatif

| Feature | Code Source | API Backend | Runtime UI | Statut |
|---------|-------------|-------------|------------|--------|
| 1. Bouton "+ New Agent" | ✅ Implémenté | ✅ API POST `/api/org/employees` fonctionne | ❌ Absent (ancien bundle) | **FAIL** |
| 2. hermesProfile dans detail | ✅ Implémenté | ✅ Retourné par API | ❌ Section invisible (ancien bundle) | **FAIL** |
| 3. Services / cross-request | ✅ Implémenté | ✅ `provides` retourné par API | ❌ Section invisible (ancien bundle) | **FAIL** |
| 4. hermes chat --resume | ✅ Fix dans new build | ✅ engineSessionId dans sessions | ⚠️ Bouton visible mais commande incorrecte (ancien bundle) | **FAIL** |

---

## Diagnostics Additionnels

### Erreurs JS Console
Aucune erreur JavaScript console détectée par Playwright.

### APIs Backend — Fonctionnelles ✅
- `GET /api/org` → COO Jinn + employees avec hermesProfile ✅
- `GET /api/org/employees/mon-agent` → `hermesProfile: "default"` ✅
- `POST /api/org/employees` → Création d'agent fonctionne ✅
- `GET /api/hermes/profiles` → 7 profils listés ✅
- `GET /api/sessions` → Sessions avec `engine: "hermes"` et `engineSessionId` ✅

### Notes sur service-agent
Un agent `service-agent` a été créé dans `~/.jinn/org/default/service-agent.yaml` avec `provides` pour tester la Feature 3. Il peut être supprimé après le fix.

---

## Action Requise

### Fix Immédiat (bloquant)
```bash
# Depuis la racine du projet jinn-hermes-frontend/jinn
pnpm build

# OU si seulement le web package est concerné:
cd packages/web && pnpm build
# Suivi du postbuild qui copie dans jimmy/dist/web/
```

Ensuite redémarrer jimmy pour servir le nouveau bundle.

### Vérification Post-Fix
1. ✅ Vérifier que `packages/jimmy/dist/web/_next/static/chunks/app/org/page-6a8b33d020d9f9e3.js` est bien présent (75KB)
2. ✅ Tester le bouton "+ New Agent" sur `/org`
3. ✅ Cliquer sur mon-agent → vérifier badge "default" sous "Hermes Profile"
4. ✅ Cliquer sur service-agent → vérifier section "Services" avec bouton "Request"
5. ✅ Sur `/chat` → sélectionner une session hermes → More menu → vérifier que "Copy CLI Resume Command" génère `hermes chat --resume <id>`

---

*Rapport généré par jinn-qa le 2026-04-01*
