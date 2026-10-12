// The slice 1 walkthrough (design: "End-to-end, accessibility and boundary tests"; Req 3.1, 4.3,
// 10.3, 10.5, 11.6, 14.2, 20.1, 20.2, 21.3), run in Desktop Chromium and on a Pixel 7. Locators
// use `getByRole` with an accessible name; the password field is found by its label because a
// password input has no ARIA role.
import {
  PAT,
  PLAN_ID,
  connectAndChoose,
  disconnect,
  expect,
  expectNoSeriousViolations,
  isPhone,
  submitToken,
  test,
} from './fixtures.ts';

// Sorted by code point, so '-' comes before '_'.
const overviewTags = [
  '#archive',
  '#home-repair',
  '#home_repair',
  '#one-off',
  '#owed-alice',
  '#owed-bob',
  '#owed-carol',
  '#trip',
];

test.describe('connect and budget choice', () => {
  test('connects without remember and chooses a budget', async ({ page, fake }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Connect to YNAB' })).toBeVisible();
    await submitToken(page, { remember: false });

    await expect(page.getByRole('heading', { level: 1, name: 'Choose a budget' })).toBeVisible();
    const budgets = page.getByRole('list', { name: 'Budgets' });
    await expect(budgets.getByRole('button')).toHaveText(['Household', 'Side business']);
    await budgets.getByRole('button', { name: 'Household' }).click();

    await expect(page.getByRole('heading', { level: 2, name: 'Tag Overview' })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Ynot' })).toBeVisible();
    await expect(page.getByText('Household', { exact: true })).toBeVisible();
    await expect(page.getByText(/Last updated/)).toBeVisible();
    expect(
      fake.requests.every((request) => request.headers['authorization'] === `Bearer ${PAT}`),
    ).toBe(true);

    // A reload ends the session: nothing was remembered.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Connect to YNAB' })).toBeVisible();
  });

  test('connects with remember, and a reload connects from the remembered token', async ({
    page,
    fake,
  }) => {
    await page.goto('/');
    await submitToken(page, { remember: true });
    await expect(page.getByRole('heading', { level: 1, name: 'Choose a budget' })).toBeVisible();

    const before = fake.requests.length;
    await page.reload();
    // No Connect screen: the remembered token connects, and the budget choice shows.
    await expect(page.getByRole('heading', { level: 1, name: 'Choose a budget' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect', exact: true })).toHaveCount(0);
    expect(fake.requests.length).toBeGreaterThan(before);
    expect(fake.requests.at(-1)?.headers['authorization']).toBe(`Bearer ${PAT}`);

    await page.getByRole('button', { name: 'Side business' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Tag Overview' })).toBeVisible();
    await expect(page.getByText('No tags in this budget yet.')).toBeVisible();
  });

  test('says a rejected token is invalid, and stays on the connect screen', async ({ page }) => {
    await page.goto('/');
    // Any non-empty token is accepted by default, so reject this one with a one-off route.
    await page.route(/^https:\/\/api\.ynab\.com\/v1\/plans(\?.*)?$/, (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fallback()
        : route.fulfill({
            status: 401,
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify({
              error: { id: '401', name: 'unauthorized', detail: 'Unauthorized' },
            }),
          }),
    );
    await submitToken(page, { remember: false });
    await expect(page.getByRole('alert')).toContainText('YNAB rejected this token');
    await expect(page.getByRole('heading', { level: 1, name: 'Connect to YNAB' })).toBeVisible();
  });
});

test.describe('overview and reader', () => {
  test.beforeEach(async ({ page }) => {
    await connectAndChoose(page);
  });

  test('the overview lists the fixture tags, with the scope label and no escaped tag', async ({
    page,
  }) => {
    const table = page.getByRole('grid', { name: /Tag Overview/ });
    await expect(table).toBeVisible();
    await expect(page.getByText('all accounts · all time').first()).toBeVisible();
    const names = table.getByRole('rowheader');
    await expect(names).toHaveText(overviewTags);
    await expect(table.getByRole('row', { name: /#42/ })).toHaveCount(0);

    // A closed account's old tag is included (Req 11.6: never narrowed).
    const archive = table.getByRole('row', { name: /#archive/ });
    await expect(archive.getByRole('gridcell').nth(0)).toHaveText('−90.00');
    await expect(archive.getByRole('gridcell').nth(3)).toHaveText('2');
  });

  test('sorting the overview by transactions reorders the rows', async ({ page }) => {
    const table = page.getByRole('grid', { name: /Tag Overview/ });
    await table.getByRole('columnheader', { name: 'Transactions' }).click();
    // React Aria leaves aria-sort off the header on Android user agents, so check it on desktop.
    if (!isPhone(page)) {
      await expect(table.getByRole('columnheader', { name: 'Transactions' })).toHaveAttribute(
        'aria-sort',
        'ascending',
      );
    }
    // Ascending by transaction count, ties by tag.
    await expect(table.getByRole('rowheader')).toHaveText([
      '#one-off',
      '#owed-bob',
      '#owed-carol',
      '#archive',
      '#home-repair',
      '#home_repair',
      '#owed-alice',
      '#trip',
    ]);
  });

  test('opening a split tag shows the contributing split lines and a read-only marker', async ({
    page,
  }) => {
    await page.getByRole('row', { name: /#owed-alice/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: '#owed-alice' })).toBeFocused();

    const composition = page.getByRole('region', { name: 'Total composition' });
    const stat = (term: string) => composition.getByText(term, { exact: true }).locator('xpath=..');
    await expect(stat('Outflow')).toContainText('25.00');
    await expect(stat('Inflow')).toContainText('25.00');
    await expect(stat('Net')).toContainText('0.00');
    await expect(stat('Transactions')).toContainText('2');

    const members = page.getByRole('list', { name: 'Member transactions' });
    const bill = members.getByRole('listitem').filter({ hasText: 'Trattoria' });
    await expect(bill).toContainText(
      'Transaction total −120.00; only the tagged split lines count.',
    );
    await expect(
      bill.getByRole('img', { name: '#owed-alice read-only, in a split' }),
    ).toBeVisible();
    const lines = bill.getByRole('list', { name: 'Contributing split lines' });
    await expect(lines.getByRole('listitem')).toHaveCount(1);
    await expect(lines.getByRole('listitem')).toContainText('#owed-alice');
    await expect(lines.getByRole('listitem')).toContainText('−25.00');

    const repayment = members
      .getByRole('listitem')
      .filter({ has: page.getByText('Alice', { exact: true }) });
    await expect(repayment).toContainText('25.00');
    await expect(repayment.getByRole('img', { name: /read-only/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Back to all tags' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Tag Overview' })).toBeFocused();
  });

  test('a tag with a transfer pair names the pair without assuming it cancels', async ({
    page,
  }) => {
    await page.getByRole('row', { name: /#trip/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: '#trip' })).toBeVisible();
    const pairs = page.getByRole('list', { name: 'Transfer pairs' });
    await expect(pairs.getByRole('listitem')).toHaveCount(1);
    await expect(pairs.getByRole('listitem')).toContainText('is paired with');
    await expect(pairs.getByRole('listitem')).toContainText('Everyday Checking');
    await expect(pairs.getByRole('listitem')).toContainText('Holiday Savings');
    await expect(page.getByText(/do not necessarily cancel to zero/)).toBeVisible();
  });

  test('shows the near-duplicate and single-use markers with names', async ({ page }) => {
    const table = page.getByRole('grid', { name: /Tag Overview/ });
    const dash = table.getByRole('row', { name: /#home-repair/ });
    await expect(dash.getByRole('img', { name: 'Near-duplicate of #home_repair' })).toBeVisible();
    const underscore = table.getByRole('row', { name: /#home_repair/ });
    await expect(
      underscore.getByRole('img', { name: 'Near-duplicate of #home-repair' }),
    ).toBeVisible();
    // The words are on screen, not only in a tooltip.
    await expect(dash.getByText('Near-duplicate of #home_repair')).toBeVisible();
    const once = table.getByRole('row', { name: /#one-off/ });
    await expect(once.getByRole('img', { name: 'Single use, one transaction' })).toBeVisible();
    await expect(once.getByText('Single use')).toBeVisible();
    await expect(table.getByRole('row', { name: /#trip/ }).getByText('None')).toBeVisible();

    await page.getByRole('row', { name: /#home-repair/ }).click();
    await expect(
      page.getByRole('img', { name: 'Near-duplicate of #home_repair' }).first(),
    ).toBeVisible();
  });

  test('the tag list opens a tag, in the rail on desktop and in the drawer on a phone', async ({
    page,
  }) => {
    const toggle = page.getByRole('button', { name: 'Browse tags' });
    if (isPhone(page)) {
      await expect(page.getByRole('navigation', { name: 'Tag list' })).toBeHidden();
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('button', { name: 'Close tag list' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toBeFocused();
      await toggle.click();
      await page.getByRole('button', { name: 'Close tag list' }).click();
      await expect(toggle).toBeFocused();
      await toggle.click();
    } else {
      await expect(toggle).toBeHidden();
    }
    const rail = page.getByRole('navigation', { name: 'Tag list' });
    await expect(rail.getByRole('option')).toHaveCount(overviewTags.length);
    await expect(
      rail.getByRole('option', { name: /#home-repair/ }).getByRole('img', {
        name: 'Near-duplicate of #home_repair',
      }),
    ).toBeVisible();
    // A marker wraps below the name rather than squeezing it into one letter per line.
    const name = rail.getByText('#home-repair', { exact: true });
    const box = await name.boundingBox();
    expect(box?.height ?? Infinity).toBeLessThan(32);
    await rail.getByRole('option', { name: /#owed-bob/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: '#owed-bob' })).toBeVisible();
    if (isPhone(page))
      await expect(page.getByRole('navigation', { name: 'Tag list' })).toBeHidden();
  });

  test('has buttons at least 44px tall on a phone (Req 20.1)', async ({ page }) => {
    test.skip(!isPhone(page), 'phone layout only');
    for (const name of ['Refresh', 'Switch budget', 'Disconnect', 'Browse tags']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box?.height, `${name} height`).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('row', { name: /#trip/ }).click();
    const back = await page.getByRole('button', { name: 'Back to all tags' }).boundingBox();
    expect(back?.height).toBeGreaterThanOrEqual(44);
    // No horizontal page scroll.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('refresh', () => {
  test('Refresh shows changes made in YNAB, with a delta read', async ({ page, fake }) => {
    await connectAndChoose(page);
    const table = page.getByRole('grid', { name: /Tag Overview/ });
    await expect(table.getByRole('row', { name: /#fresh/ })).toHaveCount(0);

    fake.addTransaction(PLAN_ID, {
      id: 'fresh-1',
      date: '2026-05-01',
      amount: -3_000,
      accountId: 'acc-checking',
      memo: '#fresh',
    });
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(table.getByRole('row', { name: /#fresh/ })).toBeVisible();
    await expect(page.getByText('Refreshing…')).toBeHidden();

    const transactionReads = fake.requests.filter(
      (request) => request.method === 'GET' && request.path.endsWith('/transactions'),
    );
    expect(transactionReads.at(0)?.query['last_knowledge_of_server']).toBeUndefined();
    expect(transactionReads.at(-1)?.query['last_knowledge_of_server']).toBeDefined();
  });

  test('refreshes when the tab becomes visible again', async ({ page, fake }) => {
    await connectAndChoose(page);
    const table = page.getByRole('grid', { name: /Tag Overview/ });
    fake.addTransaction(PLAN_ID, {
      id: 'return-1',
      date: '2026-05-02',
      amount: -4_000,
      accountId: 'acc-checking',
      memo: '#returned',
    });
    await expect(table.getByRole('row', { name: /#returned/ })).toHaveCount(0);

    await page.evaluate(() => {
      const setVisibility = (state: string) => {
        Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      };
      setVisibility('hidden');
      setVisibility('visible');
    });
    await expect(table.getByRole('row', { name: /#returned/ })).toBeVisible();
  });

  test('a failed refresh pauses updates, keeps the data, and Retry recovers', async ({
    page,
    fake,
  }) => {
    await connectAndChoose(page);
    fake.queueFaults({ kind: '5xx', status: 503, on: 'GET' });
    await page.getByRole('button', { name: 'Refresh' }).click();
    const paused = page.getByRole('status').filter({ hasText: 'Updates paused' });
    await expect(paused).toBeVisible();
    await expect(page.getByRole('grid', { name: /Tag Overview/ })).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(paused).toBeHidden();
  });
});

// Axe runs on each screen and dialog, in both colour schemes and at both viewports (the
// projects). Serious and critical violations fail the test.
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`axe, ${colorScheme} scheme`, () => {
    test.use({ colorScheme });

    test('has no serious or critical violations on any slice 1 screen', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Connect to YNAB' })).toBeVisible();
      await expectNoSeriousViolations(page, 'connect');

      await submitToken(page, { remember: false });
      await expect(page.getByRole('heading', { level: 1, name: 'Choose a budget' })).toBeFocused();
      await expectNoSeriousViolations(page, 'budget choice');

      await page.getByRole('button', { name: 'Household' }).click();
      await expect(page.getByRole('heading', { level: 2, name: 'Tag Overview' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: 'Ynot' })).toBeFocused();
      await expectNoSeriousViolations(page, 'tag overview');

      await page.getByRole('row', { name: /#owed-alice/ }).click();
      await expect(page.getByRole('heading', { level: 2, name: '#owed-alice' })).toBeVisible();
      await expectNoSeriousViolations(page, 'tag reader, split');

      await page.getByRole('button', { name: 'Back to all tags' }).click();
      await page.getByRole('row', { name: /#trip/ }).click();
      await expect(page.getByRole('list', { name: 'Transfer pairs' })).toBeVisible();
      await expectNoSeriousViolations(page, 'tag reader, transfer pair');

      if (isPhone(page)) {
        await page.getByRole('button', { name: 'Browse tags' }).click();
        await expect(page.getByRole('button', { name: 'Close tag list' })).toBeFocused();
        await expectNoSeriousViolations(page, 'tag drawer');
        await page.getByRole('button', { name: 'Close tag list' }).click();
      }

      await page.getByRole('button', { name: 'Disconnect' }).click();
      const dialog = page.getByRole('alertdialog', { name: 'Disconnect from YNAB?' });
      await expect(dialog).toBeVisible();
      await expectNoSeriousViolations(page, 'disconnect dialog');
      await dialog.getByRole('button', { name: 'Yes, disconnect' }).click();

      await expect(page.getByRole('heading', { level: 1, name: 'Connect to YNAB' })).toBeVisible();
      await expect(page.getByRole('status')).toContainText('Disconnected');
      await expectNoSeriousViolations(page, 'connect, after disconnect');
    });

    test('has no serious or critical violations on the paused-updates banner', async ({
      page,
      fake,
    }) => {
      await connectAndChoose(page);
      fake.queueFaults({ kind: '5xx', status: 503, on: 'GET' });
      await page.getByRole('button', { name: 'Refresh' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Updates paused' })).toBeVisible();
      await expectNoSeriousViolations(page, 'updates paused');
      await disconnect(page);
    });
  });
}
