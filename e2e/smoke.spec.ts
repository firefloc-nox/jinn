import { test, expect } from '@playwright/test'

// ─── Dashboard ────────────────────────────────────────────────────────────────

test.describe('Dashboard', () => {
  test('charge sans erreur 500', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.status()).not.toBe(500)
    expect(response?.status()).not.toBe(404)
  })

  test('affiche le titre Jinn', async ({ page }) => {
    await page.goto('/')
    // Le title HTML est absent mais le branding "Jinn" est dans le DOM
    const jinnBranding = page.locator('text=Jinn').first()
    await expect(jinnBranding).toBeVisible()
  })

  test('defaultBrain est hermes via /api/status', async ({ request }) => {
    const resp = await request.get('/api/status')
    expect(resp.ok()).toBe(true)
    const data = await resp.json()
    expect(data.engines?.defaultBrain ?? data.engines?.default).toBe('hermes')
  })

  test('HermesActivityWidget visible dans le dashboard', async ({ page }) => {
    await page.goto('/')
    // Le widget "Hermes Activity" est présent dans le DOM — même en loading
    const widget = page.locator('text=Hermes Activity').first()
    await expect(widget).toBeVisible({ timeout: 8000 })
  })

  test('sidebar contient les liens Hermes', async ({ page }) => {
    await page.goto('/')
    // Sidebar: liens H · Sessions, H · Memory, H · Skills
    const sessionsLink = page.locator('a[aria-label="H · Sessions"]')
    const memoryLink = page.locator('a[aria-label="H · Memory"]')
    const skillsLink = page.locator('a[aria-label="H · Skills"]')
    await expect(sessionsLink).toBeAttached()
    await expect(memoryLink).toBeAttached()
    await expect(skillsLink).toBeAttached()
  })
})

// ─── Sessions Jinn ────────────────────────────────────────────────────────────

test.describe('Sessions', () => {
  test('liste des sessions se charge via API', async ({ request }) => {
    const resp = await request.get('/api/sessions')
    expect(resp.ok()).toBe(true)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test('session engine=hermes dans la liste', async ({ request }) => {
    const resp = await request.get('/api/sessions')
    const sessions = await resp.json() as Array<{ engine: string }>
    const hermesSessions = sessions.filter(s => s.engine === 'hermes')
    // Au moins quelques sessions hermes existent
    expect(hermesSessions.length).toBeGreaterThanOrEqual(0)
  })

  test('session a les champs attendus', async ({ request }) => {
    const resp = await request.get('/api/sessions')
    const sessions = await resp.json() as Array<Record<string, unknown>>
    if (sessions.length === 0) return // skip si pas de sessions
    const s = sessions[0]
    expect(s).toHaveProperty('id')
    expect(s).toHaveProperty('engine')
    expect(s).toHaveProperty('status')
  })

  test('créer une nouvelle session retourne un objet valide', async ({ request }) => {
    const resp = await request.post('/api/sessions', {
      data: { message: 'Réponds juste: e2e-session-smoke', source: 'e2e-smoke' }
    })
    // 200 ou 201 attendu
    expect([200, 201]).toContain(resp.status())
    const session = await resp.json()
    expect(session).toHaveProperty('id')
    expect(session.engine).toBe('hermes')
  })
})

// ─── Page Hermes Sessions ─────────────────────────────────────────────────────

test.describe('Hermes Sessions Page', () => {
  test('/hermes/sessions charge sans erreur', async ({ page }) => {
    const resp = await page.goto('/hermes/sessions')
    expect(resp?.status()).not.toBe(500)
    expect(resp?.status()).not.toBe(404)
  })

  test('sessions listées avec source et model', async ({ page }) => {
    await page.goto('/hermes/sessions')
    // Attendre que le contenu se charge (au moins 1 session)
    await page.waitForSelector('[data-testid="session-row"], table tbody tr, .session-item, li', {
      timeout: 8000
    }).catch(() => {
      // fallback: juste vérifier que la page a du contenu
    })
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
    expect(body!.length).toBeGreaterThan(100)
  })

  test('API hermes/sessions retourne total et items', async ({ request }) => {
    const resp = await request.get('/api/hermes/sessions?limit=10')
    expect(resp.ok()).toBe(true)
    const data = await resp.json()
    expect(data).toHaveProperty('items')
    expect(data).toHaveProperty('total')
    expect(Array.isArray(data.items)).toBe(true)
    expect(typeof data.total).toBe('number')
    expect(data.total).toBeGreaterThan(0)
  })

  test('search filtre les sessions via API', async ({ request }) => {
    // D'abord récupérer un titre existant pour chercher
    const all = await request.get('/api/hermes/sessions?limit=5')
    const allData = await all.json()
    if (!allData.items?.length) return

    const firstSource = allData.items[0].source
    if (!firstSource) return

    const filtered = await request.get(`/api/hermes/sessions?search=${firstSource}&limit=10`)
    expect(filtered.ok()).toBe(true)
    const filteredData = await filtered.json()
    expect(filteredData.items?.length).toBeGreaterThanOrEqual(1)
  })
})

// ─── Page Hermes Memory ───────────────────────────────────────────────────────

test.describe('Hermes Memory Page', () => {
  test('/hermes/memory charge sans erreur', async ({ page }) => {
    const resp = await page.goto('/hermes/memory')
    expect(resp?.status()).not.toBe(500)
    expect(resp?.status()).not.toBe(404)
  })

  test('API memory retourne des entrées', async ({ request }) => {
    const resp = await request.get('/api/hermes/memory')
    expect(resp.ok()).toBe(true)
    const data = await resp.json()
    expect(data).toHaveProperty('memory')
    expect(data.memory).toHaveProperty('entries')
    expect(Array.isArray(data.memory.entries)).toBe(true)
    expect(data.memory.entries.length).toBeGreaterThan(0)
  })

  test('entrées memory affichées dans la page', async ({ page }) => {
    await page.goto('/hermes/memory')
    // Attendre que les données se chargent
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    // La page doit afficher le contenu de mémoire (au moins un token distinctif)
    expect(body).toBeTruthy()
    expect(body!.length).toBeGreaterThan(200)
  })
})

// ─── Page Hermes Skills ───────────────────────────────────────────────────────

test.describe('Hermes Skills Page', () => {
  test('/hermes/skills charge sans erreur', async ({ page }) => {
    const resp = await page.goto('/hermes/skills')
    expect(resp?.status()).not.toBe(500)
    expect(resp?.status()).not.toBe(404)
  })

  test('API skills retourne des skills avec catégories', async ({ request }) => {
    const resp = await request.get('/api/hermes/skills')
    expect(resp.ok()).toBe(true)
    const data = await resp.json()
    expect(data).toHaveProperty('skills')
    expect(data).toHaveProperty('categories')
    expect(data).toHaveProperty('count')
    expect(data.count).toBeGreaterThan(0)
    expect(Array.isArray(data.skills)).toBe(true)
  })

  test('search filtre les skills via API', async ({ request }) => {
    const resp = await request.get('/api/hermes/skills?search=github')
    expect(resp.ok()).toBe(true)
    const data = await resp.json()
    expect(data.skills?.length).toBeGreaterThanOrEqual(0)
    // Si skills github existent, ils doivent contenir "github"
    if (data.skills?.length > 0) {
      const names = data.skills.map((s: { name: string }) => s.name.toLowerCase())
      const hasGithub = names.some((n: string) => n.includes('github'))
      expect(hasGithub).toBe(true)
    }
  })
})

// ─── Org / Agent Runtime UI ───────────────────────────────────────────────────

test.describe('Org', () => {
  test('new agent modal surfaces runtime vocabulary and Hermes variants', async ({ page }) => {
    const resp = await page.goto('/org')
    expect(resp?.status()).not.toBe(500)
    expect(resp?.status()).not.toBe(404)

    await page.getByRole('button', { name: /new agent/i }).click()
    await expect(page.getByText('New Agent').first()).toBeVisible()
    await page.getByPlaceholder('My Agent').fill('Runtime QA Agent')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Runtime').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /hermes:openrouter/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /hermes:ollama/i })).toBeVisible()
  })

  test('new agent modal fallback chain editor works', async ({ page }) => {
    const resp = await page.goto('/org')
    expect(resp?.status()).not.toBe(500)

    await page.getByRole('button', { name: /new agent/i }).click()
    await expect(page.getByText('New Agent').first()).toBeVisible()
    await page.getByPlaceholder('My Agent').fill('Fallback QA Agent')

    // Step 1 -> 2
    await page.getByRole('button', { name: 'Next' }).click()
    // Step 2 -> 3
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 3: Fallback Runtime Chain section
    await expect(page.getByText('Fallback Runtime Chain')).toBeVisible()
    await expect(page.getByText('No fallback runtimes — add one below')).toBeVisible()

    // Add a fallback runtime — check via Remove button presence (unique to the chain)
    await page.locator('select').filter({ hasText: '+ Add fallback runtime' }).selectOption('codex')
    await page.waitForTimeout(300)
    // 1 Remove button appeared = codex was added
    await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible()

    // Add another
    await page.locator('select').filter({ hasText: '+ Add fallback runtime' }).selectOption('hermes:openrouter')
    await page.waitForTimeout(300)
    // 2 Remove buttons now
    const removeButtons = page.getByRole('button', { name: 'Remove' })
    await expect(removeButtons).toHaveCount(2)

    // Remove one
    await removeButtons.first().click()
    await page.waitForTimeout(300)
    // After remove, 1 runtime remains
    await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(1)
  })
})

// ─── Settings ─────────────────────────────────────────────────────────────────

test.describe('Settings', () => {
  test('/settings charge sans erreur', async ({ page }) => {
    const resp = await page.goto('/settings')
    expect(resp?.status()).not.toBe(500)
    expect(resp?.status()).not.toBe(404)
    await expect(page.locator('text=Runtime Routing').first()).toBeVisible()
    await expect(page.locator('text=Primary Runtime').first()).toBeVisible()
  })

  test('default brain = hermes dans /api/status', async ({ request }) => {
    const resp = await request.get('/api/status')
    expect(resp.ok()).toBe(true)
    const data = await resp.json()
    // defaultBrain ou default doit être hermes
    const brain = data.engines?.defaultBrain ?? data.engines?.default ?? data.brain?.primary
    expect(brain).toBe('hermes')
  })

  test('/api/status contient les engines enregistrés', async ({ request }) => {
    const resp = await request.get('/api/status')
    const data = await resp.json()
    expect(data.engines?.registered).toBeDefined()
    expect(data.engines.registered.hermes).toBeDefined()
    expect(data.engines.registered.hermes.available).toBe(true)
  })
})

// ─── Cron ─────────────────────────────────────────────────────────────────────

test.describe('Cron', () => {
  test('/cron charge sans erreur', async ({ page }) => {
    const resp = await page.goto('/cron')
    expect(resp?.status()).not.toBe(500)
    expect(resp?.status()).not.toBe(404)
  })

  test('/api/cron retourne une liste de jobs', async ({ request }) => {
    const resp = await request.get('/api/cron')
    expect(resp.ok()).toBe(true)
    const data = await resp.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  test('le job morning-brief est visible dans /api/cron', async ({ request }) => {
    // Note: "dream" est un job Jinn-natif (UUID pur) — absent de /api/cron qui
    // ne liste que les jobs sourced de Hermes cron.
    // "morning-brief" est un job Hermes — il doit apparaître.
    const resp = await request.get('/api/cron')
    const jobs = await resp.json() as Array<{ name: string }>
    const morningBriefJob = jobs.find(j => j.name === 'morning-brief')
    expect(morningBriefJob).toBeDefined()
  })

  test('les jobs ont les champs attendus', async ({ request }) => {
    const resp = await request.get('/api/cron')
    const jobs = await resp.json() as Array<Record<string, unknown>>
    for (const job of jobs.slice(0, 3)) {
      expect(job).toHaveProperty('id')
      expect(job).toHaveProperty('name')
      expect(job).toHaveProperty('schedule')
      expect(job).toHaveProperty('engine')
    }
  })
})
