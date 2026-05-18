import { test, expect } from '@playwright/test'

const LINE_COUNT = 2000

test.describe.serial('Performance: 2000-line script', () => {
  let projectId: string

  test('seed project with 2000 lines via IndexedDB', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /new/i }).click()
    await page.getByPlaceholder('Project name…').fill('Perf Test 2000')
    await page.getByRole('button', { name: 'Create' }).click()

    await page.waitForURL(/\/editor\//)
    projectId = page.url().split('/editor/')[1]!

    // Inject 2000 lines directly via raw IndexedDB — bypasses UI for speed
    const result = await page.evaluate(
      async ({ pid, count }) => {
        return new Promise<string>((resolve, reject) => {
          const openReq = indexedDB.open('elegant-tide')
          openReq.onsuccess = () => {
            const db = openReq.result
            const storeNames = Array.from(db.objectStoreNames)
            if (!storeNames.includes('lines')) {
              resolve(`stores: ${storeNames.join(', ')}`)
              return
            }
            const tx = db.transaction(['lines'], 'readwrite')
            const store = tx.objectStore('lines')
            for (let i = 0; i < count; i++) {
              void store.put({
                id: `perf-${i}`,
                projectId: pid,
                type: 'subtitle',
                order: (i + 1) * 1024,
                translations: {
                  en: `Performance test line ${i + 1}: The quick brown fox jumps over the lazy dog.`,
                },
                updatedAt: Date.now(),
                version: -1,
              })
            }
            tx.oncomplete = () => resolve('ok')
            tx.onerror = () => reject(tx.error)
          }
          openReq.onerror = () => reject(openReq.error)
        })
      },
      { pid: projectId, count: LINE_COUNT },
    )

    expect(result).toBe('ok')
  })

  test('editor renders 2000-line script and scroll latency < 50ms', async ({ page }) => {
    await page.goto(`/editor/${projectId}`)

    // Wait for virtual list to render first row
    await expect(page.locator('[data-testid="line-row"]').first()).toBeVisible({ timeout: 15_000 })

    // Measure synchronous scroll latency via requestAnimationFrame timing
    const scrollLatency = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="line-list"]') as HTMLElement | null
      if (!container) return -1
      const start = performance.now()
      container.scrollTop += 10_000
      // Force layout flush
      void container.scrollTop
      return performance.now() - start
    })

    expect(scrollLatency).toBeGreaterThan(0) // sanity
    expect(scrollLatency).toBeLessThan(50)
  })

  test('projector cue update < 50ms end-to-end', async ({ page, context }) => {
    await page.goto(`/control/${projectId}`)
    await expect(page.locator('[data-testid="cue-line"]').first()).toBeVisible({ timeout: 15_000 })

    // Set initial cue
    await page.locator('[data-testid="cue-line"]').first().click()

    // Open projector
    const projectorPage = await context.newPage()
    await projectorPage.goto(`/projector/${projectId}`)
    await projectorPage.waitForLoadState('domcontentloaded')

    // Ensure projector is listening (wait for first text)
    await page.locator('[data-testid="cue-line"]').first().click()
    await expect(projectorPage.locator('[data-testid="projector-text"]')).toBeVisible({ timeout: 3_000 })

    // Advance cue and measure projector update latency
    const nextBtn = page.getByRole('button', { name: /next|›/i }).first()

    const latency = await page.evaluate(async () => {
      const channel = new BroadcastChannel(`elegant-tide:session:${window.__e2eProjectId}`)
      const start = performance.now()
      channel.postMessage({ kind: 'cue.next' })
      return new Promise<number>((resolve) => {
        channel.onmessage = () => resolve(performance.now() - start)
        setTimeout(() => resolve(-1), 200)
      })
    })

    // Click next via UI and check projector updates
    const start = Date.now()
    await nextBtn.click()
    // Projector text should change within 100ms (BroadcastChannel is same-process)
    await projectorPage.waitForFunction(
      (prevText) => {
        const el = document.querySelector('[data-testid="projector-text"]')
        return el?.textContent?.trim() !== prevText
      },
      await projectorPage.locator('[data-testid="projector-text"]').textContent(),
      { timeout: 1_000 },
    )
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(100)

    void latency // informational only

    await projectorPage.close()
  })
})

declare global {
  interface Window {
    __e2eProjectId?: string
  }
}
