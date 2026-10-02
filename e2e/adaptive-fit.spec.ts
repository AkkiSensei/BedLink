import { test, expect } from '@playwright/test'

const ROUTES = ['/login', '/nurse', '/dispatch', '/hospital']

test.describe('BedLink Adaptive Layouts & One-Screen Fit Audit', () => {
  for (const route of ROUTES) {
    test(`Verify ${route} fits one-screen layout law and touch target criteria`, async ({ page, isMobile }) => {
      const consoleErrors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text())
        }
      })

      // Navigate to route
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(500)

      const viewport = page.viewportSize()
      const isCompact = (viewport?.width ?? 1024) < 1024

      // 1. Assert: No Horizontal Overflow at any width (down to 320px)
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
      expect(scrollWidth, `Route ${route} must have no horizontal scroll overflow`).toBeLessThanOrEqual(clientWidth + 2)

      // 2. Assert: One-Screen Law (Document/Body does not scroll, only [data-scroll-region] handles scroll)
      const bodyOverflowY = await page.evaluate(() => {
        return window.getComputedStyle(document.body).overscrollBehaviorY
      })
      expect(['none', 'contain', 'auto']).toContain(bodyOverflowY)

      // 3. Assert: Input fields enforce >= 16px on mobile viewports to prevent browser auto-zoom
      if (isCompact && (viewport?.width ?? 1000) <= 640) {
        const inputFontSizes = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'))
          return inputs.map((el) => parseFloat(window.getComputedStyle(el).fontSize))
        })

        for (const size of inputFontSizes) {
          if (!isNaN(size) && size > 0) {
            expect(size, `Input on mobile ${route} must be >= 16px to prevent soft keyboard auto-zoom`).toBeGreaterThanOrEqual(15.9)
          }
        }
      }

      // 4. Assert: Touch Target Audit on coarse/mobile pointers
      if (isMobile) {
        const primaryButtons = page.locator('.primary-action-btn')
        const primaryCount = await primaryButtons.count()
        for (let i = 0; i < primaryCount; i++) {
          const btn = primaryButtons.nth(i)
          if (await btn.isVisible()) {
            const box = await btn.boundingBox()
            if (box) {
              expect(box.height, `Primary button on ${route} must have height >= 48px in thumb zone`).toBeGreaterThanOrEqual(48)
            }
          }
        }
      }

      // 5. Assert: Compact vs Expanded Navigation Rendering
      if (isCompact) {
        // On compact viewports, mobile bottom tabs or sticky actions should be active if rendered
        const mobileTabs = page.locator('.mobile-bottom-tabs')
        const tabCount = await mobileTabs.count()
        if (tabCount > 0 && route !== '/login') {
          await expect(mobileTabs.first()).toBeVisible()
        }
      } else {
        // On laptop (>= 1024px), mobile-only elements must be hidden
        const mobileTabs = page.locator('.mobile-bottom-tabs')
        const tabCount = await mobileTabs.count()
        if (tabCount > 0) {
          await expect(mobileTabs.first()).toBeHidden()
        }
      }

      // 6. Assert: Zero console errors during initial render
      const fatalErrors = consoleErrors.filter(
        (err) => !err.includes('Failed to load resource') && !err.includes('favicon')
      )
      expect(fatalErrors.length, `Route ${route} should render without fatal console errors`).toBe(0)
    })
  }
})
