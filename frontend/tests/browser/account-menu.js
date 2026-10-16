// Run with Playwright browser_run_code_unsafe's filename argument against the local dev server.
// All API traffic uses fixtures; no backend session or external service is needed.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright evaluates this function expression.
async (page) => {
  await page.context().addCookies([
    { name: 'JSESSIONID', value: 'account-menu-fixture', domain: 'localhost', path: '/' },
  ]);
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    if (url.includes('/auth/me')) {
      return route.fulfill({ json: { success: true, data: {
        authenticated: true, user: { id: 'menu-fixture', name: 'Menu Test' },
      } } });
    }
    if (url.includes('/auth/ws-token')) {
      return route.fulfill({ status: 503, json: { detail: 'Offline browser fixture' } });
    }
    return route.fulfill({ json: { success: true, data: [] } });
  });
  const results = [];
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('http://localhost:3000/dashboard');
    const trigger = page.getByRole('button', { name: 'Account menu' });
    await trigger.click();
    const menu = page.getByRole('menu', { name: 'Account', exact: true });
    await menu.waitFor({ state: 'visible' });
    const result = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const items = [...element.querySelectorAll('[role^="menuitem"]')];
      return {
        withinViewport: rect.left >= 0 && rect.right <= innerWidth
          && rect.top >= 0 && rect.bottom <= innerHeight,
        receivesPointer: items.every((item) => {
          const bounds = item.getBoundingClientRect();
          return item.contains(document.elementFromPoint(
            bounds.x + bounds.width / 2, bounds.y + bounds.height / 2,
          ));
        }),
      };
    });
    if (!result.withinViewport || !result.receivesPointer) {
      throw new Error(`Account menu obscured or outside viewport at ${width}px: ${JSON.stringify(result)}`);
    }
    await menu.getByRole('menuitemradio', { name: 'Dark' }).click({ timeout: 3000 });
    if (await menu.getByRole('menuitemradio', { name: 'Dark' }).getAttribute('aria-checked') !== 'true') {
      throw new Error(`Theme action did not work at ${width}px`);
    }
    await page.keyboard.press('Escape');
    if (await menu.count() || !(await trigger.evaluate((element) => element === document.activeElement))) {
      throw new Error(`Escape did not close menu and restore focus at ${width}px`);
    }
    results.push({ width, ...result });
  }
  await page.unroute('**/api/**');
  await page.context().clearCookies();
  return results;
}
