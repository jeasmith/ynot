// Shared end-to-end fixtures: the fixture budget inside the fake YNAB, the `page.route` handler
// that stands in for https://api.ynab.com, a request recorder, a `securitypolicyviolation`
// listener that fails any test, and an axe helper.
import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Page } from '@playwright/test';
import { createFakeYnab, type FakeYnab } from '../test/fakeYnab.ts';

export const PAT = 'e2e-secret-token-0123456789';
export const YNAB_ORIGIN = 'https://api.ynab.com';
export const PLAN_ID = 'plan-household';

/**
 * The fixture budget:
 * - a restaurant bill split into own share and `#owed-alice`, `#owed-bob`, `#owed-carol` lines,
 *   and a `#owed-alice` repayment inflow;
 * - a transfer pair with both sides tagged `#trip`;
 * - a near-duplicate pair, `#home-repair` and `#home_repair`;
 * - a single-use tag, `#one-off`;
 * - a closed account holding old `#archive` transactions;
 * - prose with an escaped `\#`, which is not a tag.
 */
export function createFixtureYnab(): FakeYnab {
  return createFakeYnab({
    plans: [
      {
        id: PLAN_ID,
        name: 'Household',
        // The load reads history from the plan's first month, so this reaches the 2019 transactions.
        firstMonth: '2019-01-01',
        accounts: [
          { id: 'acc-checking', name: 'Everyday Checking' },
          { id: 'acc-savings', name: 'Holiday Savings' },
          { id: 'acc-old', name: 'Old Joint Account', closed: true },
        ],
        transactions: [
          {
            id: 'bill',
            date: '2026-01-02',
            amount: -120_000,
            payeeName: 'Trattoria',
            accountId: 'acc-checking',
            memo: null,
            subtransactions: [
              { id: 'bill-own', amount: -30_000, memo: 'Own share' },
              { id: 'bill-alice', amount: -25_000, memo: '#owed-alice' },
              { id: 'bill-bob', amount: -35_000, memo: '#owed-bob' },
              { id: 'bill-carol', amount: -30_000, memo: '#owed-carol' },
            ],
          },
          {
            id: 'repay',
            date: '2026-01-05',
            amount: 25_000,
            payeeName: 'Alice',
            accountId: 'acc-checking',
            memo: '#owed-alice',
          },
          {
            id: 'trip-out',
            date: '2026-02-01',
            amount: -50_000,
            payeeName: 'Transfer : Holiday Savings',
            accountId: 'acc-checking',
            memo: 'Holiday fund #trip',
            transferTransactionId: 'trip-in',
          },
          {
            id: 'trip-in',
            date: '2026-02-01',
            amount: 50_000,
            payeeName: 'Transfer : Everyday Checking',
            accountId: 'acc-savings',
            memo: 'Holiday fund #trip',
            transferTransactionId: 'trip-out',
          },
          {
            id: 'repair-1',
            date: '2026-03-03',
            amount: -80_000,
            payeeName: 'Plumber',
            accountId: 'acc-checking',
            memo: '#home-repair boiler',
          },
          {
            id: 'repair-2',
            date: '2026-03-10',
            amount: -20_000,
            payeeName: 'Hardware store',
            accountId: 'acc-checking',
            memo: '#home-repair',
          },
          {
            id: 'repair-3',
            date: '2026-03-12',
            amount: -15_000,
            payeeName: 'Hardware store',
            accountId: 'acc-checking',
            memo: '#home_repair',
          },
          {
            id: 'repair-4',
            date: '2026-03-14',
            amount: -5_000,
            payeeName: 'Hardware store',
            accountId: 'acc-checking',
            memo: '#home_repair',
          },
          {
            id: 'once',
            date: '2026-04-01',
            amount: -9_990,
            payeeName: 'Market stall',
            accountId: 'acc-checking',
            memo: 'Lamp #one-off',
          },
          {
            id: 'prose',
            date: '2026-04-02',
            amount: -1_000,
            payeeName: 'Coffee',
            accountId: 'acc-checking',
            memo: 'Issue \\#42 is not a tag',
          },
          {
            id: 'old-1',
            date: '2019-03-02',
            amount: -45_000,
            payeeName: 'Landlord',
            accountId: 'acc-old',
            memo: '#archive',
          },
          {
            id: 'old-2',
            date: '2019-04-02',
            amount: -45_000,
            payeeName: 'Landlord',
            accountId: 'acc-old',
            memo: '#archive',
          },
        ],
      },
      { id: 'plan-side', name: 'Side business', transactions: [] },
    ],
  });
}

export interface RecordedBrowserRequest {
  readonly url: string;
  readonly origin: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface Observed {
  /** Every request the page made, in order. */
  readonly requests: readonly RecordedBrowserRequest[];
  /** `securitypolicyviolation` events. Any entry fails the test. */
  readonly violations: string[];
}

interface Fixtures {
  fake: FakeYnab;
  observed: Observed;
}

/**
 * `observed` is automatic: it routes YNAB to the fake, records every request and CSP violation,
 * and after the test fails it if the page broke the boundary.
 */
export const test = base.extend<Fixtures>({
  // Playwright requires a destructuring pattern for the fixtures argument, even an empty one.
  // oxlint-disable-next-line no-empty-pattern
  fake: async ({}, use) => {
    await use(createFixtureYnab());
  },
  observed: [
    async ({ page, fake, baseURL }, use) => {
      const appOrigin = new URL(baseURL ?? 'http://localhost').origin;
      const requests: RecordedBrowserRequest[] = [];
      const violations: string[] = [];
      const pending: Promise<void>[] = [];

      await page.route(`${YNAB_ORIGIN}/**`, fake.routeHandler);
      await page.exposeFunction('__reportCspViolation', (detail: string) => {
        violations.push(detail);
      });
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          const report = (window as unknown as { __reportCspViolation: (detail: string) => void })
            .__reportCspViolation;
          report(`${event.violatedDirective} blocked ${event.blockedURI || 'inline'}`);
        });
      });
      page.on('request', (request) => {
        pending.push(
          request.allHeaders().then((headers) => {
            requests.push({
              url: request.url(),
              origin: new URL(request.url()).origin,
              method: request.method(),
              headers,
            });
          }),
        );
      });

      const observed: Observed = { requests, violations };
      await use(observed);
      await Promise.all(pending);

      expect(violations, 'Content-Security-Policy violations').toEqual([]);
      for (const request of requests) {
        expect([appOrigin, YNAB_ORIGIN], `request to ${request.url}`).toContain(request.origin);
        if (request.origin === appOrigin) {
          expect(request.headers['authorization'], `Authorization sent to ${request.url}`).toBe(
            undefined,
          );
        }
      }
    },
    { auto: true },
  ],
});

export { expect };

export function isPhone(page: Page): boolean {
  const viewport = page.viewportSize();
  return viewport !== null && viewport.width < 1024;
}

/** Fails on serious or critical axe violations, naming the rule and the elements. */
export async function expectNoSeriousViolations(page: Page, screen: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(
    serious.map((violation) => ({
      screen,
      rule: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target.join(' ')),
    })),
    `axe violations on ${screen}`,
  ).toEqual([]);
}

// ---- Driving the app, by role and accessible name ----

/**
 * The token field is a password input, which has no ARIA role, so it is found by its label (its
 * accessible name). Every other control is found with `getByRole`.
 */
export async function submitToken(page: Page, { remember }: { remember: boolean }): Promise<void> {
  await page.getByLabel('YNAB personal access token').fill(PAT);
  if (remember) {
    // Click the visible label text as a person would: the input itself sits under the drawn box.
    await page.getByText('Remember on this device', { exact: true }).first().click();
    await expect(page.getByRole('checkbox', { name: 'Remember on this device' })).toBeChecked();
  }
  await page.getByRole('button', { name: 'Connect' }).click();
}

export async function connectAndChoose(
  page: Page,
  { remember = false, plan = 'Household' }: { remember?: boolean; plan?: string } = {},
): Promise<void> {
  await page.goto('/');
  await submitToken(page, { remember });
  await page.getByRole('button', { name: plan }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Tag Overview' })).toBeVisible();
}

export async function disconnect(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await page
    .getByRole('alertdialog', { name: 'Disconnect from YNAB?' })
    .getByRole('button', { name: 'Yes, disconnect' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Connect to YNAB' })).toBeVisible();
}
