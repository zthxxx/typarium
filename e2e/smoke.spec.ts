import { expect, test } from '@playwright/test'

test('app shell renders without console errors', async ({ page }) => {
  const consoleErrors: Array<string> = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  await page.goto('/')

  await expect(page.locator('body')).toBeVisible()
  expect(consoleErrors).toEqual([])
})
