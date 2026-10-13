// Boundary evidence (design: "End-to-end, accessibility and boundary tests"; Req 1.4, 1.7, 1.11,
// 2.2, 2.9, 20.2, 21.3, 21.6). The `observed` fixture already fails every test on a CSP violation,
// on a request outside the app origin and https://api.ynab.com, and on an Authorization header
// sent to the app origin. These tests also assert those facts directly, so they are visible here.
import { readFileSync } from 'node:fs';
import {
  PAT,
  PLAN_ID,
  YNAB_ORIGIN,
  connectAndChoose,
  disconnect,
  expect,
  isPhone,
  test,
} from './fixtures.ts';

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const expectedHeaders = Object.fromEntries(
  (vercel.headers.find((rule) => rule.source === '/(.*)')?.headers ?? []).map(({ key, value }) => [
    key.toLowerCase(),
    value,
  ]),
);

test.describe('network boundary', () => {
  test('requests go only to the app origin or api.ynab.com, and the PAT goes only to YNAB', async ({
    page,
    baseURL,
    observed,
  }) => {
    const appOrigin = new URL(baseURL ?? '').origin;
    await connectAndChoose(page);
    await page.getByRole('row', { name: /#owed-alice/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: '#owed-alice' })).toBeVisible();
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByText('Refreshing…')).toBeHidden();

    const origins = new Set(observed.requests.map((request) => request.origin));
    expect([...origins].sort()).toEqual([appOrigin, YNAB_ORIGIN].sort());

    const appRequests = observed.requests.filter((request) => request.origin === appOrigin);
    expect(appRequests.length).toBeGreaterThan(0);
    for (const request of appRequests) {
      expect(request.method).toBe('GET');
      expect(request.headers['authorization']).toBeUndefined();
      // The PAT is never in a URL either.
      expect(request.url).not.toContain(PAT);
    }

    const ynabRequests = observed.requests.filter((request) => request.origin === YNAB_ORIGIN);
    expect(ynabRequests.length).toBeGreaterThan(0);
    for (const request of ynabRequests) {
      expect(request.method).toBe('GET');
      expect(request.headers['authorization']).toBe(`Bearer ${PAT}`);
      expect(request.url).not.toContain(PAT);
    }
    expect(observed.violations).toEqual([]);
  });

  test('the fake sees the reads of one budget load and a delta refresh', async ({ page, fake }) => {
    await connectAndChoose(page);
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByText('Refreshing…')).toBeHidden();
    const paths = fake.requests.map((request) => `${request.method} ${request.path}`);
    expect(paths).toContain('GET /v1/plans');
    expect(paths).toContain(`GET /v1/plans/${PLAN_ID}/transactions`);
    expect(fake.patches()).toEqual([]);
    const deltas = fake.requests.filter(
      (request) =>
        request.path.endsWith('/transactions') &&
        request.query['last_knowledge_of_server'] !== undefined,
    );
    expect(deltas.length).toBeGreaterThan(0);
  });

  test('the production build is served with the vercel.json headers', async ({ page }) => {
    const response = await page.goto('/');
    expect(response).not.toBeNull();
    const documentHeaders = response?.headers() ?? {};
    for (const [key, value] of Object.entries(expectedHeaders)) {
      expect(documentHeaders[key], `${key} on /`).toBe(value);
    }

    const script = await page.evaluate(
      () => document.querySelector<HTMLScriptElement>('script[type="module"]')?.src ?? '',
    );
    expect(script).toContain('/assets/');
    const asset = await page.request.get(script);
    expect(asset.status()).toBe(200);
    expect(asset.headers()['content-security-policy']).toBe(
      expectedHeaders['content-security-policy'],
    );
  });

  test('the listener sees a CSP violation, which fails any other test', async ({
    page,
    observed,
  }) => {
    await page.goto('/');
    expect(observed.violations).toEqual([]);
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__inline = true';
      document.head.append(script);
    });
    await expect.poll(() => observed.violations.length).toBeGreaterThan(0);
    expect(observed.violations[0]).toContain('script-src');
    // This test provoked the violation on purpose, so clear it before the fixture checks.
    observed.violations.splice(0);
  });
});

test.describe('browser storage', () => {
  const stored = (page: import('@playwright/test').Page) =>
    page.evaluate(() => ({
      local: Object.fromEntries(
        Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]),
      ),
      sessionKeys: Object.keys(sessionStorage),
      cacheNames: [] as string[],
    }));

  const otherStores = (page: import('@playwright/test').Page) =>
    page.evaluate(async () => ({
      databases: (await indexedDB.databases()).length,
      caches: (await caches.keys()).length,
      cookie: document.cookie,
    }));

  test('stores nothing when Remember is off, in any store', async ({ page, context }) => {
    await connectAndChoose(page, { remember: false });
    expect((await stored(page)).local).toEqual({});
    expect((await stored(page)).sessionKeys).toEqual([]);
    expect(await otherStores(page)).toEqual({ databases: 0, caches: 0, cookie: '' });
    expect(await context.cookies()).toEqual([]);
  });

  test('keeps ynot.pat only after Remember, and nothing after Disconnect', async ({ page }) => {
    await page.goto('/');
    expect((await stored(page)).local).toEqual({});

    await connectAndChoose(page, { remember: true });
    expect((await stored(page)).local).toEqual({ 'ynot.pat': PAT });
    expect((await stored(page)).sessionKeys).toEqual([]);
    expect(await otherStores(page)).toEqual({ databases: 0, caches: 0, cookie: '' });

    await disconnect(page);
    expect((await stored(page)).local).toEqual({});
    expect(await otherStores(page)).toEqual({ databases: 0, caches: 0, cookie: '' });
    await expect(page.getByRole('status')).toContainText('Disconnected');
  });

  test('forgets a remembered token when Disconnect is confirmed from the budget picker', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByLabel('YNAB personal access token').fill(PAT);
    await page.getByText('Remember on this device', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Connect' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Choose a budget' })).toBeVisible();
    expect((await stored(page)).local).toEqual({ 'ynot.pat': PAT });

    await disconnect(page);
    expect((await stored(page)).local).toEqual({});
    // Reloading does not reconnect: nothing was left behind.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Connect to YNAB' })).toBeVisible();
  });

  test('every control on the connect screen has a role and an accessible name', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Connect to YNAB' })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Remember on this device' })).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Connect' })).toBeDisabled();
    await expect(
      page.getByRole('link', { name: 'your YNAB account (opens in a new tab)' }),
    ).toHaveAttribute('href', 'https://app.ynab.com/settings/developer');
    await expect(page.getByRole('region', { name: 'Privacy' })).toBeVisible();
    // Reading this fixture guards the viewport helper used by the walkthrough.
    expect(typeof isPhone(page)).toBe('boolean');
  });
});
