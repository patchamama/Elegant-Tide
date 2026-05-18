import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRT_FIXTURE = path.join(__dirname, '../fixtures/sample.srt')

let projectId: string

test.describe.serial('Golden path: import → edit → projection', () => {
  test('create project and navigate to editor', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /new/i }).click()
    await page.getByPlaceholder('Project name…').fill('E2E Test Production')
    await page.getByRole('button', { name: 'Create' }).click()

    await page.waitForURL(/\/editor\//)
    projectId = page.url().split('/editor/')[1]!
    expect(projectId).toBeTruthy()
  })

  test('import SRT file and verify lines', async ({ page }) => {
    await page.goto(`/editor/${projectId}`)

    // Open import dialog
    await page.getByRole('button', { name: /import/i }).click()
    await expect(page.getByText('Import Script')).toBeVisible()

    // Upload fixture SRT
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(SRT_FIXTURE)

    // Preview should show 5 lines (from sample.srt)
    await expect(page.getByText('5 lines')).toBeVisible({ timeout: 8_000 })

    // Confirm import
    await page.getByRole('button', { name: /import 5 lines/i }).click()

    // Lines should appear in editor
    await expect(page.locator('[data-testid="line-row"]').first()).toBeVisible({ timeout: 8_000 })
    const lineCount = await page.locator('[data-testid="line-row"]').count()
    expect(lineCount).toBeGreaterThanOrEqual(5)
  })

  test('edit a subtitle line', async ({ page }) => {
    await page.goto(`/editor/${projectId}`)

    // Wait for lines to load
    await expect(page.locator('[data-testid="line-row"]').first()).toBeVisible({ timeout: 8_000 })

    // Click the first cell — contenteditable or textarea
    const firstRow = page.locator('[data-testid="line-row"]').first()
    const firstCell = firstRow.locator('[contenteditable], textarea').first()
    await firstCell.click()

    // Append text
    await page.keyboard.press('End')
    await page.keyboard.type(' edited')
    await page.keyboard.press('Tab')

    // Cell should now contain the edit (check via attribute)
    await expect(firstCell).toContainText('edited')
  })

  test('navigate to control page and see script lines', async ({ page }) => {
    await page.goto(`/control/${projectId}`)

    // Script panel should show cue lines
    await expect(page.locator('[data-testid="cue-line"]').first()).toBeVisible({ timeout: 8_000 })
    const cueCount = await page.locator('[data-testid="cue-line"]').count()
    expect(cueCount).toBeGreaterThanOrEqual(5)

    // Navigation buttons should be present
    await expect(page.getByRole('button', { name: /next|›/i }).first()).toBeVisible()
  })

  test('projector receives cue update via BroadcastChannel', async ({ page, context }) => {
    await page.goto(`/control/${projectId}`)
    await expect(page.locator('[data-testid="cue-line"]').first()).toBeVisible({ timeout: 8_000 })

    // Click the first cue line to set current line
    await page.locator('[data-testid="cue-line"]').first().click()

    // Open projector page in a new tab
    const projectorPage = await context.newPage()
    await projectorPage.goto(`/projector/${projectId}`)
    await projectorPage.waitForLoadState('domcontentloaded')

    // Wait for projector to show text (BroadcastChannel may not fire until control sends welcome)
    // Re-click the first cue to trigger a cue.goto broadcast
    await page.locator('[data-testid="cue-line"]').first().click()

    // Projector text should appear within 500ms
    const start = Date.now()
    await expect(projectorPage.locator('[data-testid="projector-text"]')).toBeVisible({ timeout: 2_000 })
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(500)

    await projectorPage.close()
  })
})
