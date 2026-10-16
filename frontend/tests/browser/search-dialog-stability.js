// Run via Playwright browser_run_code_unsafe's filename argument with localhost:3000 running.
// Real components and CSS; all API responses are synthetic and isolated from the backend.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Playwright evaluates this function expression.
async (page) => {
  const measurements = [];
  const failures = [];
  await page.unroute('**/api/**');
  await page.context().addCookies([
    { name: 'JSESSIONID', value: 'search-layout-fixture', domain: 'localhost', path: '/' },
  ]);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/me')) {
      return route.fulfill({ json: { success: true, data: {
        authenticated: true, user: { id: 'fixture-me', name: 'Fixture Me', avatarUrl: '' },
      } } });
    }
    if (url.pathname.endsWith('/auth/ws-token')) {
      return route.fulfill({ status: 503, json: { detail: 'Offline browser fixture' } });
    }
    if (url.pathname.endsWith('/users') || url.pathname.endsWith('/rooms/discover')) {
      const query = url.searchParams.get('query') || '';
      if (query) await new Promise((resolve) => setTimeout(resolve, 500));
      if (query === 'error') return route.fulfill({ status: 500, json: { detail: 'Fixture search failure' } });
      const count = query === 'one' ? 1 : query === 'many' ? 20 : 0;
      const content = Array.from({ length: count }, (_, index) => ({
        id: `fixture-${index}`, name: `Fixture person or room ${index}`, avatarUrl: '',
        memberCount: 1, maxMembers: 10, description: 'Fixture room description',
      }));
      return route.fulfill({ json: { success: true, data: {
        content, page: 0, size: 50, totalElements: count, totalPages: count ? 1 : 0,
      } } });
    }
    return route.fulfill({ json: { success: true, data: [] } });
  });
  try {
    for (const [width, height] of [[360, 800], [768, 900], [1440, 900], [768, 420]]) {
      await page.setViewportSize({ width, height });
      await page.goto('http://localhost:3000/dashboard');
      for (const [name, label, loadingLabel] of [
        ['New message', 'Search users', 'Searching users'],
        ['Discover rooms', 'Search public rooms', 'Loading public rooms'],
      ]) {
        await page.getByRole('button', { name, exact: true }).first().click();
        const dialog = page.getByRole('dialog', { name, exact: true });
        const input = dialog.getByRole('searchbox', { name: label });
        const busy = dialog.getByRole('status', { name: loadingLabel });
        await input.waitFor();
        await busy.waitFor({ state: 'hidden' });
        // Opening animation is intentionally excluded from the search measurement.
        await page.waitForTimeout(250);
        await input.focus();
        const original = await input.elementHandle();
        const baseline = await input.boundingBox();
        const dialogBaseline = await dialog.boundingBox();
        let maxShift = 0;
        for (const query of ['s', 'ss', 'one', 'many', 'error', 'none']) {
          const previousRows = await dialog.getByRole('button', { name: /^(Message|Join) / }).elementHandles();
          await input.fill(query);
          await busy.waitFor({ state: 'visible' });
          if (await dialog.locator('[data-slot="skeleton"]').count()) {
            failures.push({ name, width, height, query, skeletonFlash: true });
          }
          for (const row of previousRows) {
            const retained = await row.evaluate((element) => element.isConnected);
            if (!retained || !(await row.isDisabled())) {
              failures.push({ name, width, height, query, rowReplacedOrEnabled: true });
            }
          }
          for (const phase of ['loading', 'resolved']) {
            if (phase === 'resolved') await busy.waitFor({ state: 'hidden' });
            const box = await input.boundingBox();
            const bounds = await dialog.boundingBox();
            const shift = Math.max(
              ...['x', 'y', 'width', 'height'].map((key) => Math.abs(box[key] - baseline[key])),
              ...['x', 'y', 'width', 'height'].map((key) => Math.abs(bounds[key] - dialogBaseline[key])),
            );
            maxShift = Math.max(maxShift, shift);
            const focused = await original.evaluate((element) => element.isConnected && element === document.activeElement);
            if (shift > 1 || !focused) failures.push({ name, width, height, query, phase, shift, focused });
            if (bounds.x < -1 || bounds.y < -1 || bounds.x + bounds.width > width + 1
              || bounds.y + bounds.height > height + 1) {
              failures.push({ name, width, height, query, phase, outsideViewport: true });
            }
            if (phase === 'resolved' && query === 'many') {
              const scrollable = await dialog.evaluate((element) => [...element.querySelectorAll('*')].some((child) =>
                ['auto', 'scroll'].includes(getComputedStyle(child).overflowY) && child.scrollHeight > child.clientHeight,
              ));
              if (!scrollable) failures.push({ name, width, height, noResultsScroll: true });
            }
          }
        }
        measurements.push({ name, width, height, maxShift });
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
      }
    }
    if (failures.length) throw new Error(JSON.stringify({ measurements, failures }));
    return { measurements, passed: true };
  } finally {
    await page.goto('about:blank');
    await page.unroute('**/api/**');
    await page.context().clearCookies();
  }
}
