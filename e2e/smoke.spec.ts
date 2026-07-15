import { expect, test } from '@playwright/test'

test('app shell renders without console errors', async ({ page }) => {
  const consoleErrors: Array<string> = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    // Vite dev-server dependency re-optimization noise, not app errors.
    if (text.includes('Outdated Optimize Dep')) return
    if (text.includes('Failed to fetch dynamically imported module')) return
    consoleErrors.push(text)
  })

  await page.goto('/')

  await expect(page.locator('body')).toBeVisible()
  expect(consoleErrors).toEqual([])
})
