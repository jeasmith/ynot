// THROWAWAY PROTOTYPE — issue #7. Three structurally different ways to browse
// the tag vocabulary and manage it globally. Switch with ?variant=A|B|C.
//
// Tags live inside YNAB parent memos as hashtags, so a global rename or delete
// is a memo rewrite. Every impact preview here shows that rewrite literally,
// because "will this eat my memo text?" is the question the real thing must answer.

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", signDisplay: "auto" });

function txn(id, date, payee, account, group, category, amount, memo, status, splits = []) {
  return { id, date, payee, account, group, category, amount, memo, status, splits };
}

// Memos carry their hashtags inline, exactly as they would in YNAB.
const seedTransactions = [
  txn("t1", "2026-08-31", "Tesco", "Current Account", "Everyday", "Groceries", -72.43, "Weekly shop · Clubcard voucher used #Household", "cleared", [
    { category: "Groceries", group: "Everyday", memo: "Food", amount: -55.18 },
    { category: "Household goods", group: "Home", memo: "Cleaning supplies", amount: -17.25 },
  ]),
  txn("t2", "2026-08-30", "Acme Ltd", "Current Account", "Income", "Ready to Assign", 3240, "August payroll", "reconciled"),
  txn("t3", "2026-08-29", "IKEA", "Rewards Card", "Home", "Home improvement", -184.99, "Shelving and fixings for utility room #Home-Repair", "cleared"),
  txn("t4", "2026-08-28", "Trainline", "Rewards Card", "Work", "Work travel", -86.4, "Client visit to Leeds · reclaim in September #Work #Reimburse", "reconciled"),
  txn("t5", "2026-08-27", "IKEA refund", "Rewards Card", "Home", "Home improvement", 42.5, "Returned spare brackets #Home-Repair", "uncleared"),
  txn("t6", "2026-08-26", "The Fox & Hounds", "Joint Account", "Everyday", "Dining out", -96.8, "Dinner with Alex and Sam · I covered the table #Social #Dinner-Fox-2026-08-26", "cleared", [
    { category: "Dining out", group: "Everyday", memo: "My share", amount: -46.2 },
    { category: "Reimbursements", group: "Income", memo: "Alex owes", amount: -32.1 },
    { category: "Reimbursements", group: "Income", memo: "Sam owes", amount: -18.5 },
  ]),
  txn("t7", "2026-08-25", "Octopus Energy", "Joint Account", "Bills", "Energy", -118.74, "August electricity and gas #household", "reconciled"),
  txn("t8", "2026-08-24", "Transfer to savings", "Current Account", "Transfers", "Transfer", -500, "Emergency fund top-up #Monthly-Move", "reconciled"),
  txn("t9", "2026-08-23", "Boots Pharmacy", "Current Account", "Quality of life", "Health", -23.75, "Prescription · collect repeat next month", "cleared"),
  txn("t10", "2026-08-22", "Landlord", "Joint Account", "Bills", "Rent", -1450, "September rent #Household", "reconciled"),
  txn("t11", "2026-08-21", "Sainsbury's", "Joint Account", "Everyday", "Groceries", -94.18, "Food shop and birthday card #household #Birthday", "cleared", [
    { category: "Groceries", group: "Everyday", memo: "Food shop", amount: -89.18 },
    { category: "Gifts", group: "Quality of life", memo: "Birthday card", amount: -5 },
  ]),
  txn("t12", "2026-08-20", "Apple", "Rewards Card", "Bills", "Subscriptions", -8.99, "iCloud+ family plan #Subscription", "cleared"),
  txn("t13", "2026-08-19", "HMRC", "Current Account", "Income", "Ready to Assign", 126.4, "Tax refund #Tax", "reconciled"),
  txn("t14", "2026-08-18", "Thames Water", "Joint Account", "Bills", "Water", -42.16, "Quarterly direct debit #Household", "reconciled"),
  txn("t15", "2026-08-17", "Amazon", "Rewards Card", "Home", "Household goods", -31.48, "Light bulbs and picture hooks #HomeRepair", "cleared"),
  txn("t16", "2026-08-16", "Workshop Coffee", "Current Account", "Everyday", "Dining out", -4.2, "Coffee before the train #Work", "cleared"),
  txn("t17", "2026-08-15", "Admiral", "Current Account", "Bills", "Insurance", -61.24, "Car insurance monthly premium", "reconciled"),
  txn("t18", "2026-08-14", "Cash withdrawal", "Current Account", "Everyday", "Cash", -40, "Market and parking", "uncleared"),
  txn("t19", "2026-08-13", "Shell", "Rewards Card", "Transport", "Fuel", -68.31, "Full tank before Cornwall #Cornwall-2026", "cleared"),
  txn("t20", "2026-08-12", "Interest", "Easy Access Savings", "Income", "Ready to Assign", 38.12, "Monthly interest", "reconciled"),
  txn("t21", "2026-08-11", "National Trust", "Rewards Card", "Quality of life", "Holiday", -15, "Parking at Lanhydrock #Cornwall-2026", "cleared"),
  txn("t22", "2026-08-10", "John Lewis", "Joint Account", "Home", "Household goods", -86, "Replacement bedding #Household", "uncleared"),
  txn("t23", "2026-08-09", "Sea View Inn", "Rewards Card", "Quality of life", "Holiday", -328, "Three nights in St Ives #Cornwall-2026", "reconciled"),
  txn("t24", "2026-08-08", "Eden Project", "Rewards Card", "Quality of life", "Holiday", -71.5, "Admission and parking #Cornwall-2026", "cleared"),
  txn("t25", "2026-08-27", "Alex Morgan", "Current Account", "Income", "Reimbursements", 32.1, "Fox and Hounds dinner reimbursement #Dinner-Fox-2026-08-26 #Reimburse", "cleared"),
  txn("t26", "2026-08-31", "Sam Patel", "Current Account", "Income", "Reimbursements", 18.5, "Fox and Hounds dinner · pending transfer #Dinner-Fox-2026-08-26 #Reimburse", "uncleared"),
  txn("t27", "2026-04-12", "British Airways", "Rewards Card", "Quality of life", "Holiday", -410, "Flights booked for Cornwall #Cornwall-2026", "reconciled"),
  txn("t28", "2026-01-18", "John Lewis", "Joint Account", "Home", "Household goods", -114.5, "Winter duvet #Household", "reconciled"),
  txn("t29", "2025-11-03", "The Crown", "Current Account", "Everyday", "Dining out", -82.4, "Birthday dinner #Birthday-2025", "reconciled"),
  txn("t30", "2024-06-16", "Cornwall Council", "Current Account", "Quality of life", "Holiday", -6.5, "Beach parking #Cornwall-2024", "reconciled"),
  txn("t31", "2026-08-06", "Screwfix", "Rewards Card", "Home", "Home improvement", -57.8, "Utility room sealant and brushes #Home-Repair", "cleared"),
  txn("t32", "2026-08-05", "Wickes refund", "Rewards Card", "Home", "Home improvement", 23.4, "Returned unused tiles #Home-Repair", "cleared"),
];

// The active account only bounds the register (ADR 0002); tags are budget-wide.
const ACTIVE_ACCOUNT = "Current Account";
const BUDGET_NAME = "Household Budget";

// ---------------------------------------------------------------------------
// Tag identity: case-insensitive, canonical display spelling.
// ---------------------------------------------------------------------------

const TAG_PATTERN = /#([A-Za-z0-9][A-Za-z0-9-]*)/g;

function tagKey(name) { return name.toLowerCase(); }

function parseTags(memo) {
  return [...memo.matchAll(TAG_PATTERN)].map((match) => match[1]);
}

// Pulling a hashtag out leaves gaps. Close them without touching the separators
// the human typed — an over-eager tidy silently rewrites their prose.
function tidyMemo(text) {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[\s·,;]+/, "")
    .replace(/[\s·,;]+$/, "")
    .trim();
}

function humanText(memo) {
  return tidyMemo(memo.replace(TAG_PATTERN, ""));
}

function buildVocabulary(list) {
  const byKey = new Map();
  list.forEach((transaction) => {
    const seen = new Set();
    parseTags(transaction.memo).forEach((spelling) => {
      const key = tagKey(spelling);
      if (!byKey.has(key)) byKey.set(key, { key, spellings: new Map(), transactions: [], accounts: new Set() });
      const entry = byKey.get(key);
      entry.spellings.set(spelling, (entry.spellings.get(spelling) ?? 0) + 1);
      if (!seen.has(key)) {
        seen.add(key);
        entry.transactions.push(transaction);
        entry.accounts.add(transaction.account);
      }
    });
  });

  return [...byKey.values()].map((entry) => {
    // Canonical display spelling: the most-used spelling, ties broken alphabetically.
    const ranked = [...entry.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const inflow = entry.transactions.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
    const outflow = entry.transactions.filter((item) => item.amount < 0).reduce((sum, item) => sum + item.amount, 0);
    const dates = entry.transactions.map((item) => item.date).sort();
    return {
      key: entry.key,
      name: ranked[0][0],
      spellings: ranked.map(([spelling, count]) => ({ spelling, count })),
      transactions: entry.transactions.slice().sort((a, b) => b.date.localeCompare(a.date)),
      count: entry.transactions.length,
      accounts: [...entry.accounts].sort(),
      splitCount: entry.transactions.filter((item) => item.splits.length).length,
      inflow,
      outflow,
      net: inflow + outflow,
      firstUsed: dates[0],
      lastUsed: dates[dates.length - 1],
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// Loose form used only to spot near-duplicates like Home-Repair vs HomeRepair.
function looseKey(name) { return name.toLowerCase().replace(/-/g, ""); }

function vocabularyIssues(vocab) {
  const issues = [];

  vocab.filter((tag) => tag.spellings.length > 1).forEach((tag) => {
    issues.push({
      id: `case:${tag.key}`,
      kind: "case",
      severity: "risk",
      title: `${tag.spellings.map((item) => `#${item.spelling}`).join(" and ")} are one tag`,
      detail: `Tag identity is case-insensitive, so these ${tag.count} transactions already share a single tag. Only the display spelling disagrees. Normalising rewrites ${tag.spellings.slice(1).reduce((sum, item) => sum + item.count, 0)} memo${tag.spellings.slice(1).reduce((sum, item) => sum + item.count, 0) === 1 ? "" : "s"}.`,
      tags: [tag],
      operation: { type: "rename", from: tag.key, to: tag.name },
    });
  });

  const byLoose = new Map();
  vocab.forEach((tag) => {
    const loose = looseKey(tag.name);
    if (!byLoose.has(loose)) byLoose.set(loose, []);
    byLoose.get(loose).push(tag);
  });
  [...byLoose.values()].filter((group) => group.length > 1).forEach((group) => {
    const [target, ...rest] = group.slice().sort((a, b) => b.count - a.count);
    issues.push({
      id: `near:${group.map((tag) => tag.key).join("+")}`,
      kind: "near",
      severity: "warn",
      title: `${group.map((tag) => `#${tag.name}`).join(" and ")} look like the same idea`,
      detail: `These are separate tags with separate totals. Merging keeps #${target.name} and rewrites ${rest.reduce((sum, tag) => sum + tag.count, 0)} memo${rest.reduce((sum, tag) => sum + tag.count, 0) === 1 ? "" : "s"}.`,
      tags: group,
      operation: { type: "merge", from: rest.map((tag) => tag.key), to: target.name },
    });
  });

  vocab.filter((tag) => tag.count === 1).forEach((tag) => {
    issues.push({
      id: `single:${tag.key}`,
      kind: "single",
      severity: "calm",
      title: `#${tag.name} is used once`,
      detail: `Used on ${tag.transactions[0].payee} (${formatDate(tag.transactions[0].date)}). A one-off tag may be deliberate, or a typo that never got a second use. Deleting it removes the tag from the vocabulary entirely.`,
      tags: [tag],
      operation: { type: "delete", from: tag.key },
    });
  });

  const order = { risk: 0, warn: 1, calm: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity] || a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------------------
// Memo rewriting — the mechanism behind every global rename and delete.
// ---------------------------------------------------------------------------

// ops: [{ from: <key>, to: <spelling> | null }]. `to: null` deletes the tag.
function rewriteMemo(memo, ops) {
  const map = new Map(ops.map((op) => [op.from, op.to]));
  const seen = new Set();
  let next = memo.replace(TAG_PATTERN, (match, name) => {
    const key = tagKey(name);
    if (!map.has(key)) { seen.add(key); return match; }
    const replacement = map.get(key);
    if (replacement === null) return "";
    // A merge can collapse two tags onto one; never emit the survivor twice.
    if (seen.has(tagKey(replacement))) return "";
    seen.add(tagKey(replacement));
    return `#${replacement}`;
  });
  return tidyMemo(next);
}

function affectedBy(list, ops) {
  const keys = new Set(ops.map((op) => op.from));
  return list.filter((transaction) => parseTags(transaction.memo).some((name) => keys.has(tagKey(name))))
    .map((transaction) => ({ transaction, before: transaction.memo, after: rewriteMemo(transaction.memo, ops) }))
    .filter((row) => row.before !== row.after)
    .sort((a, b) => b.transaction.date.localeCompare(a.transaction.date));
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const variants = {
  A: { name: "Vocabulary ledger", render: renderLedger },
  B: { name: "Tag reader", render: renderReader },
  C: { name: "Vocabulary console", render: renderConsole },
};

const state = {
  variant: getVariant(),
  transactions: seedTransactions.map((item) => ({ ...item })),
  undoSnapshot: null,
  lastAction: null,
  // A
  sortKey: "name",
  sortDirection: 1,
  ledgerQuery: "",
  expanded: "cornwall-2026",
  // B
  railQuery: "",
  railSort: "name",
  openTag: "cornwall-2026",
  // C
  command: "",
  resolvedTag: "household",
  plan: [],
  dismissed: new Set(),
};

let vocab = buildVocabulary(state.transactions);

const app = document.querySelector("#app");
const dialog = document.querySelector("#preview-dialog");
const dialogContent = document.querySelector("#preview-content");
const toast = document.querySelector("#undo-toast");
const switcher = document.querySelector("#prototype-switcher");

function getVariant() {
  const value = new URLSearchParams(location.search).get("variant")?.toUpperCase();
  return ["A", "B", "C"].includes(value) ? value : "A";
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function esc(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function formatAmount(value) { return money.format(value); }
function signClass(value) { return value > 0 ? "positive" : value < 0 ? "negative" : "muted"; }

function formatDate(iso) {
  const [year, month, day] = iso.split("-");
  return `${day} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(month) - 1]} ${year.slice(2)}`;
}

function findTag(key) { return vocab.find((tag) => tag.key === key) ?? null; }

function scopeBannerMarkup() {
  return `<div class="scope-banner"><span>◎</span><p>Tags are <strong>budget-wide</strong>. Everything below spans every account in ${esc(BUDGET_NAME)}, including transactions outside the active <strong>${esc(ACTIVE_ACCOUNT)}</strong> register. Renaming or deleting a tag here changes memos in accounts you are not currently browsing.</p></div>`;
}

function totalsStripMarkup(tag, columns = 4) {
  return `<div class="totals-strip" style="grid-template-columns:repeat(${columns},minmax(0,1fr))">
    <div><p class="eyebrow">Inflow</p><p class="figure positive">${esc(formatAmount(tag.inflow))}</p><small>${tag.transactions.filter((item) => item.amount > 0).length} parents</small></div>
    <div><p class="eyebrow">Outflow</p><p class="figure negative">${esc(formatAmount(tag.outflow))}</p><small>${tag.transactions.filter((item) => item.amount < 0).length} parents</small></div>
    <div><p class="eyebrow">Net total</p><p class="figure ${signClass(tag.net)}">${esc(formatAmount(tag.net))}</p><small>signed parent amounts</small></div>
    <div><p class="eyebrow">Spread</p><p class="figure">${tag.accounts.length}</p><small>${tag.accounts.length === 1 ? esc(tag.accounts[0]) : "accounts, budget-wide"}</small></div>
  </div>`;
}

function tagFlagsMarkup(tag) {
  const flags = [];
  if (tag.spellings.length > 1) flags.push(`<span class="flag risk">${tag.spellings.length} spellings</span>`);
  if (tag.count === 1) flags.push(`<span class="flag calm">single use</span>`);
  if (tag.accounts.length > 1) flags.push(`<span class="flag warn">${tag.accounts.length} accounts</span>`);
  if (tag.splitCount) flags.push(`<span class="flag calm">${tag.splitCount} with splits</span>`);
  return flags.join(" ");
}

// A parent transaction row. Splits render as read-only context, never as targets.
function transactionMarkup(transaction, highlightKey) {
  const tags = parseTags(transaction.memo);
  const human = humanText(transaction.memo);
  return `<article class="txn">
    <span class="date">${esc(formatDate(transaction.date))}</span>
    <div>
      <span class="payee">${esc(transaction.payee)}</span>
      <span class="meta">
        <span class="status-dot ${transaction.status}" title="${transaction.status}"></span>
        <span>${esc(transaction.account)}</span><span>·</span>
        <span>${esc(transaction.group)} › ${esc(transaction.category)}</span>
        ${transaction.splits.length ? `<span>·</span><span>Split (${transaction.splits.length})</span>` : ""}
      </span>
      ${human ? `<span class="memo">${esc(human)}</span>` : `<span class="memo"><em>no memo text besides tags</em></span>`}
      <span class="tags">${tags.map((name) => `<span class="tag-pill${highlightKey && tagKey(name) === highlightKey ? " selected" : ""}">#${esc(name)}</span>`).join("")}</span>
      ${transaction.splits.length ? `<div class="splits">
        <p class="split-head">Split context — not independently taggable</p>
        ${transaction.splits.map((split) => `<div class="split-line"><span>${esc(split.category)} · ${esc(split.memo)}</span><span class="amount ${signClass(split.amount)}">${esc(formatAmount(split.amount))}</span></div>`).join("")}
        <p class="split-note">Tagging is parent-only, so this tag counts the whole ${esc(formatAmount(transaction.amount))} — every line above, not just the one the tag is about.</p>
      </div>` : ""}
    </div>
    <span class="amount ${signClass(transaction.amount)}">${esc(formatAmount(transaction.amount))}</span>
  </article>`;
}

function mastheadMarkup(subtitle) {
  return `<header class="masthead glass">
    <div>
      <p class="eyebrow">Ynot prototype · issue #7</p>
      <h1>${esc(subtitle)}</h1>
    </div>
    <span class="spacer"></span>
    <span class="budget-chip">Budget <b>${esc(BUDGET_NAME)}</b></span>
    <span class="budget-chip">Active register <b>${esc(ACTIVE_ACCOUNT)}</b></span>
    <span class="budget-chip">Vocabulary <b>${vocab.length} tags</b></span>
  </header>`;
}

// ---------------------------------------------------------------------------
// Variant A — vocabulary ledger: one dense table, management as a row action.
// ---------------------------------------------------------------------------

function sortedVocabulary() {
  const query = state.ledgerQuery.trim().toLowerCase().replace(/^#/, "");
  const rows = vocab.filter((tag) => !query || tag.key.includes(query));
  const direction = state.sortDirection;
  return rows.sort((a, b) => {
    if (state.sortKey === "name") return a.name.localeCompare(b.name) * direction;
    if (state.sortKey === "count") return (a.count - b.count) * direction;
    if (state.sortKey === "net") return (a.net - b.net) * direction;
    if (state.sortKey === "outflow") return (a.outflow - b.outflow) * direction;
    if (state.sortKey === "lastUsed") return a.lastUsed.localeCompare(b.lastUsed) * direction;
    return 0;
  });
}

function renderLedger() {
  const rows = sortedVocabulary();
  const header = (key, label, numeric = false) =>
    `<th class="${numeric ? "num" : ""}"><button data-sort="${key}">${esc(label)}${state.sortKey === key ? (state.sortDirection === 1 ? " ↑" : " ↓") : ""}</button></th>`;

  app.innerHTML = `<div class="shell">
    ${mastheadMarkup("Vocabulary ledger")}
    ${scopeBannerMarkup()}
    <div class="masthead glass" style="position:static;margin-bottom:10px">
      <input class="search-field" data-ledger-query type="search" placeholder="Filter the vocabulary…" value="${esc(state.ledgerQuery)}" />
      <span class="muted">${rows.length} of ${vocab.length} tags · ${rows.reduce((sum, tag) => sum + tag.count, 0)} tagged parents</span>
    </div>
    <div class="a-table-wrap solid">
      <table class="a-table">
        <thead><tr>
          ${header("name", "Tag")}
          ${header("count", "Uses", true)}
          <th>Signals</th>
          ${header("outflow", "Outflow", true)}
          <th class="num">Inflow</th>
          ${header("net", "Net", true)}
          ${header("lastUsed", "Last used")}
          <th class="num">Manage</th>
        </tr></thead>
        <tbody>
          ${rows.length ? rows.map((tag) => `
            <tr class="${state.expanded === tag.key ? "open" : ""}" data-open="${esc(tag.key)}">
              <td><span class="tag-pill">#${esc(tag.name)}</span></td>
              <td class="num mono">${tag.count}</td>
              <td>${tagFlagsMarkup(tag) || `<span class="muted">—</span>`}</td>
              <td class="num amount negative">${esc(formatAmount(tag.outflow))}</td>
              <td class="num amount positive">${esc(formatAmount(tag.inflow))}</td>
              <td class="num amount ${signClass(tag.net)}">${esc(formatAmount(tag.net))}</td>
              <td class="mono muted">${esc(formatDate(tag.lastUsed))}</td>
              <td>
                <span class="row-actions">
                  <button class="ghost-button" data-rename="${esc(tag.key)}">Rename</button>
                  <button class="ghost-button" data-delete="${esc(tag.key)}">Delete</button>
                </span>
              </td>
            </tr>
            ${state.expanded === tag.key ? `<tr class="a-detail"><td colspan="8"><div class="a-detail-inner">
              ${totalsStripMarkup(tag)}
              <div class="solid">${tag.transactions.map((item) => transactionMarkup(item, tag.key)).join("")}</div>
            </div></td></tr>` : ""}
          `).join("") : `<tr><td colspan="8"><p class="empty">No tag matches that filter.</p></td></tr>`}
        </tbody>
      </table>
    </div>
  </div>`;

  app.querySelectorAll("[data-sort]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const key = button.dataset.sort;
    state.sortDirection = state.sortKey === key ? -state.sortDirection : 1;
    state.sortKey = key;
    render();
  }));
  app.querySelectorAll("[data-open]").forEach((row) => row.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    state.expanded = state.expanded === row.dataset.open ? null : row.dataset.open;
    render();
  }));
  wireManageButtons();
  const search = app.querySelector("[data-ledger-query]");
  search.addEventListener("input", () => { state.ledgerQuery = search.value; render({ focus: "[data-ledger-query]" }); });
}

// ---------------------------------------------------------------------------
// Variant B — tag reader: persistent rail, one tag open at a time.
// ---------------------------------------------------------------------------

function renderReader() {
  const query = state.railQuery.trim().toLowerCase().replace(/^#/, "");
  const railTags = vocab.filter((tag) => !query || tag.key.includes(query)).slice().sort((a, b) => {
    if (state.railSort === "uses") return b.count - a.count || a.name.localeCompare(b.name);
    if (state.railSort === "net") return a.net - b.net;
    return a.name.localeCompare(b.name);
  });
  const open = findTag(state.openTag) ?? railTags[0] ?? null;

  app.innerHTML = `<div class="shell">
    ${mastheadMarkup("Tag reader")}
    ${scopeBannerMarkup()}
    <div class="b-layout">
      <aside class="b-rail glass">
        <div class="b-rail-head">
          <p class="eyebrow" style="margin:0">Vocabulary</p>
          <select data-rail-sort aria-label="Sort tags">
            <option value="name"${state.railSort === "name" ? " selected" : ""}>A–Z</option>
            <option value="uses"${state.railSort === "uses" ? " selected" : ""}>Most used</option>
            <option value="net"${state.railSort === "net" ? " selected" : ""}>Largest spend</option>
          </select>
        </div>
        <input class="search-field" data-rail-query type="search" placeholder="Find a tag…" value="${esc(state.railQuery)}" style="width:100%;margin-bottom:7px" />
        <ul class="b-rail-list">
          ${railTags.length ? railTags.map((tag) => `<li><button class="b-rail-item" data-tag="${esc(tag.key)}" aria-current="${open && tag.key === open.key}">
            <span class="name">#${esc(tag.name)}</span>
            <span class="count">${tag.count}</span>
            <span class="net ${signClass(tag.net)}">${esc(formatAmount(tag.net))}</span>
          </button></li>`).join("") : `<li><p class="empty">Nothing matches.</p></li>`}
        </ul>
      </aside>

      ${open ? `<section class="b-reader">
        <div class="b-reader-head glass">
          <div class="b-title-row">
            <h2>#${esc(open.name)}</h2>
            ${tagFlagsMarkup(open)}
          </div>
          <p class="muted" style="margin-top:5px;font-size:9.5px;line-height:1.5">
            ${open.count} parent transaction${open.count === 1 ? "" : "s"} across ${esc(open.accounts.join(", "))} ·
            first used ${esc(formatDate(open.firstUsed))}, last used ${esc(formatDate(open.lastUsed))}
            ${open.spellings.length > 1 ? ` · stored as ${open.spellings.map((item) => `#${esc(item.spelling)}`).join(" and ")}, displayed as <b>#${esc(open.name)}</b>` : ""}
          </p>
          ${totalsStripMarkup(open)}
          <div class="b-manage-strip">
            <button class="secondary-button" data-rename="${esc(open.key)}">Rename globally</button>
            <button class="secondary-button" data-merge="${esc(open.key)}">Merge into…</button>
            <button class="danger-button" data-delete="${esc(open.key)}">Delete tag</button>
            <span class="spacer" style="flex:1 1 auto"></span>
            <span class="muted" style="align-self:center">Every action previews its memo rewrite first.</span>
          </div>
        </div>
        <div class="b-list solid">
          <div class="b-list-head">
            <p class="eyebrow" style="margin:0">Matching parent transactions</p>
            <span class="muted">${open.splitCount ? `${open.splitCount} contain splits, shown as context` : "no splits in this tag"}</span>
          </div>
          ${open.transactions.map((item) => transactionMarkup(item, open.key)).join("")}
        </div>
      </section>` : `<section class="b-reader"><div class="solid"><p class="empty">Pick a tag from the rail.</p></div></section>`}
    </div>
  </div>`;

  app.querySelectorAll("[data-tag]").forEach((button) => button.addEventListener("click", () => { state.openTag = button.dataset.tag; render(); }));
  const railQuery = app.querySelector("[data-rail-query]");
  railQuery.addEventListener("input", () => { state.railQuery = railQuery.value; render({ focus: "[data-rail-query]" }); });
  app.querySelector("[data-rail-sort]").addEventListener("change", (event) => { state.railSort = event.target.value; render(); });
  wireManageButtons();
}

// ---------------------------------------------------------------------------
// Variant C — vocabulary console: command bar, health feed, staged change plan.
// ---------------------------------------------------------------------------

function parseCommand(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  const verb = parts[0].toLowerCase();
  const args = parts.slice(1).map((part) => part.replace(/^#/, ""));
  if (verb === "rename" && args.length === 2) return { type: "rename", from: tagKey(args[0]), to: args[1] };
  if (verb === "delete" && args.length === 1) return { type: "delete", from: tagKey(args[0]) };
  if (verb === "merge" && args.length === 2) return { type: "merge", from: [tagKey(args[0])], to: args[1] };
  return { type: "browse", from: tagKey(trimmed.replace(/^#/, "")) };
}

function planImpact() {
  const ops = state.plan.flatMap(planOps);
  return affectedBy(state.transactions, ops);
}

function planOps(entry) {
  if (entry.type === "rename") return [{ from: entry.from, to: entry.to }];
  if (entry.type === "delete") return [{ from: entry.from, to: null }];
  if (entry.type === "merge") return entry.from.map((key) => ({ from: key, to: entry.to }));
  return [];
}

function describePlanEntry(entry) {
  if (entry.type === "rename") {
    // A case-only rename is a spelling normalisation, not a move to a new tag.
    if (tagKey(entry.to) === entry.from) return `Normalise <code>#${esc(entry.to)}</code> spelling`;
    return `Rename <code>#${esc(findTag(entry.from)?.name ?? entry.from)}</code> → <code>#${esc(entry.to)}</code>`;
  }
  if (entry.type === "delete") return `Delete <code>#${esc(findTag(entry.from)?.name ?? entry.from)}</code>`;
  return `Merge ${entry.from.map((key) => `<code>#${esc(findTag(key)?.name ?? key)}</code>`).join(" + ")} → <code>#${esc(entry.to)}</code>`;
}

function renderConsole() {
  const parsed = parseCommand(state.command);
  const browsing = parsed?.type === "browse" ? findTag(parsed.from) : findTag(state.resolvedTag);
  const issues = vocabularyIssues(vocab).filter((issue) => !state.dismissed.has(issue.id));
  const staged = planImpact();
  const suggestions = vocab.filter((tag) => !parsed || parsed.type !== "browse" || tag.key.includes(parsed.from)).slice(0, 8);

  app.innerHTML = `<div class="shell">
    ${mastheadMarkup("Vocabulary console")}
    ${scopeBannerMarkup()}

    <div class="c-command glass">
      <div class="c-command-row">
        <input class="c-input" data-command type="text" placeholder="#tag to browse, or: rename #Old #New · merge #Old #Keep · delete #Tag" value="${esc(state.command)}" />
        <button class="primary-button" data-run ${parsed && parsed.type !== "browse" ? "" : "disabled"}>Stage command</button>
      </div>
      <div class="c-suggest">
        ${suggestions.length ? suggestions.map((tag) => `<button class="tag-pill" data-browse="${esc(tag.key)}">#${esc(tag.name)} <span class="muted">${tag.count}</span></button>`).join("") : `<span class="muted">No tag matches.</span>`}
      </div>
    </div>

    <div class="c-columns">
      <div>
        <div class="c-health">
          <p class="eyebrow" style="margin:0 0 2px">Vocabulary health · ${issues.length} open</p>
          ${issues.length ? issues.map((issue) => `<article class="c-issue solid">
            <div class="c-issue-head">
              <span class="flag ${issue.severity}">${issue.kind === "case" ? "same tag" : issue.kind === "near" ? "near duplicate" : "one-off"}</span>
              <h3>${issue.title}</h3>
            </div>
            <p>${issue.detail}</p>
            <div class="c-issue-evidence">${issue.tags.map((tag) => `<button class="tag-pill" data-browse="${esc(tag.key)}">#${esc(tag.name)} <span class="muted">${tag.count} · ${esc(formatAmount(tag.net))}</span></button>`).join("")}</div>
            <div class="c-issue-actions">
              <button class="secondary-button" data-stage="${esc(issue.id)}">Stage fix</button>
              <button class="ghost-button" data-dismiss="${esc(issue.id)}">Not an issue</button>
            </div>
          </article>`).join("") : `<div class="solid"><p class="empty">No collisions, near-duplicates, or one-off tags left.</p></div>`}
        </div>

        ${browsing ? `<div class="c-preview-list">
          <div class="solid" style="overflow:hidden">
            <div class="b-list-head">
              <p class="eyebrow" style="margin:0">#${esc(browsing.name)} · ${browsing.count} parents, budget-wide</p>
              <span class="amount ${signClass(browsing.net)}">${esc(formatAmount(browsing.net))} net</span>
            </div>
            ${totalsStripMarkup(browsing)}
            ${browsing.transactions.map((item) => transactionMarkup(item, browsing.key)).join("")}
          </div>
        </div>` : ""}
      </div>

      <aside class="c-plan glass">
        <div class="c-plan-head">
          <p class="eyebrow" style="margin:0">Change plan</p>
          <span class="muted">${state.plan.length} operation${state.plan.length === 1 ? "" : "s"}</span>
        </div>
        ${state.plan.length ? `<ul class="c-plan-list">
          ${state.plan.map((entry, index) => `<li class="c-plan-item">
            <span class="c-plan-op">${describePlanEntry(entry)}<button class="ghost-button" data-unstage="${index}" aria-label="Remove operation">✕</button></span>
            <small>${affectedBy(state.transactions, planOps(entry)).length} memo rewrite${affectedBy(state.transactions, planOps(entry)).length === 1 ? "" : "s"}</small>
          </li>`).join("")}
        </ul>
        <div class="c-plan-total">Combined: <b>${staged.length}</b> parent memo${staged.length === 1 ? "" : "s"} rewritten across <b>${new Set(staged.map((row) => row.transaction.account)).size}</b> account${new Set(staged.map((row) => row.transaction.account)).size === 1 ? "" : "s"}. Human memo text is never touched.</div>
        <div class="c-plan-actions">
          <button class="primary-button" data-review-plan ${staged.length ? "" : "disabled"}>Review ${staged.length} change${staged.length === 1 ? "" : "s"}</button>
          <button class="ghost-button" data-clear-plan>Clear plan</button>
        </div>` : `<p class="muted" style="line-height:1.5">Nothing staged. Fix an issue on the left, or type a command above, then review everything as one batch.</p>`}
      </aside>
    </div>
  </div>`;

  const input = app.querySelector("[data-command]");
  input.addEventListener("input", () => {
    state.command = input.value;
    const next = parseCommand(state.command);
    if (next?.type === "browse" && findTag(next.from)) state.resolvedTag = next.from;
    render({ focus: "[data-command]" });
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const next = parseCommand(state.command);
    if (next && next.type !== "browse") stageOperation(next);
  });
  app.querySelector("[data-run]").addEventListener("click", () => {
    const next = parseCommand(state.command);
    if (next && next.type !== "browse") stageOperation(next);
  });
  app.querySelectorAll("[data-browse]").forEach((button) => button.addEventListener("click", () => {
    state.resolvedTag = button.dataset.browse;
    state.command = "";
    render();
  }));
  app.querySelectorAll("[data-stage]").forEach((button) => button.addEventListener("click", () => {
    const issue = vocabularyIssues(vocab).find((item) => item.id === button.dataset.stage);
    if (issue) stageOperation(issue.operation);
  }));
  app.querySelectorAll("[data-dismiss]").forEach((button) => button.addEventListener("click", () => { state.dismissed.add(button.dataset.dismiss); render(); }));
  app.querySelectorAll("[data-unstage]").forEach((button) => button.addEventListener("click", () => { state.plan.splice(Number(button.dataset.unstage), 1); render(); }));
  app.querySelector("[data-clear-plan]")?.addEventListener("click", () => { state.plan = []; render(); });
  app.querySelector("[data-review-plan]")?.addEventListener("click", () => openImpactPreview({
    title: `Apply ${state.plan.length} vocabulary change${state.plan.length === 1 ? "" : "s"}?`,
    ops: state.plan.flatMap(planOps),
    summary: state.plan.map(describePlanEntry).join(" · "),
    onApply: () => { state.plan = []; },
  }));
}

function stageOperation(operation) {
  state.plan.push(operation);
  state.command = "";
  render();
}

// ---------------------------------------------------------------------------
// Global rename / delete / merge — every path lands in the same impact preview.
// ---------------------------------------------------------------------------

function wireManageButtons() {
  app.querySelectorAll("[data-rename]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    openRenameDialog(button.dataset.rename);
  }));
  app.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const tag = findTag(button.dataset.delete);
    openImpactPreview({
      title: `Delete #${tag.name} from ${tag.count} parent${tag.count === 1 ? "" : "s"}?`,
      ops: [{ from: tag.key, to: null }],
      summary: `#${tag.name} leaves the vocabulary once its final association is removed. Net total ${formatAmount(tag.net)} disappears with it.`,
      destructive: true,
    });
  }));
  app.querySelectorAll("[data-merge]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    openMergeDialog(button.dataset.merge);
  }));
}

function openRenameDialog(key) {
  const tag = findTag(key);
  dialogContent.innerHTML = `<div class="dialog-head">
      <p class="eyebrow">Global rename</p>
      <h2 id="preview-title">Rename #${esc(tag.name)}</h2>
      <p>Renames every use of this tag across the whole budget — ${tag.count} parent transaction${tag.count === 1 ? "" : "s"} in ${esc(tag.accounts.join(", "))}.</p>
    </div>
    <div class="dialog-body">
      <label class="eyebrow" for="rename-input">New spelling</label>
      <input class="rename-field" id="rename-input" value="${esc(tag.name)}" />
      <p class="muted" style="margin-top:6px;line-height:1.5">Tag identity is case-insensitive, so changing only the capitalisation renormalises the display spelling without changing which transactions match.</p>
      <div data-collision></div>
    </div>
    <div class="dialog-actions">
      <button class="secondary-button" data-cancel>Cancel</button>
      <button class="primary-button" data-next>Preview impact</button>
    </div>`;

  const input = dialogContent.querySelector("#rename-input");
  const collision = dialogContent.querySelector("[data-collision]");
  const checkCollision = () => {
    const value = input.value.trim().replace(/^#/, "");
    const existing = value && tagKey(value) !== tag.key ? findTag(tagKey(value)) : null;
    collision.innerHTML = existing
      ? `<div class="callout">#${esc(existing.name)} already exists with ${existing.count} transaction${existing.count === 1 ? "" : "s"}. Continuing merges the two tags into one — the totals combine and #${esc(tag.name)} leaves the vocabulary.</div>`
      : "";
  };
  input.addEventListener("input", checkCollision);
  checkCollision();

  dialogContent.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
  dialogContent.querySelector("[data-next]").addEventListener("click", () => {
    const value = input.value.trim().replace(/\s+/g, "-").replace(/^#/, "");
    if (!value) return;
    const existing = tagKey(value) !== tag.key ? findTag(tagKey(value)) : null;
    openImpactPreview({
      title: existing ? `Merge #${tag.name} into #${existing.name}?` : `Rename #${tag.name} to #${value}?`,
      ops: [{ from: tag.key, to: existing ? existing.name : value }],
      summary: existing
        ? `Both tags become #${existing.name}. Combined net total ${formatAmount(tag.net + existing.net)} across ${new Set([...tag.accounts, ...existing.accounts]).size} accounts.`
        : `Tag membership and totals are unchanged — only the spelling stored in each memo moves.`,
    });
  });
  if (!dialog.open) dialog.showModal();
}

function openMergeDialog(key) {
  const tag = findTag(key);
  const others = vocab.filter((item) => item.key !== tag.key);
  dialogContent.innerHTML = `<div class="dialog-head">
      <p class="eyebrow">Merge tags</p>
      <h2 id="preview-title">Merge #${esc(tag.name)} into another tag</h2>
      <p>The surviving tag keeps its spelling. #${esc(tag.name)} leaves the vocabulary and its ${tag.count} transaction${tag.count === 1 ? "" : "s"} join the survivor's totals.</p>
    </div>
    <div class="dialog-body">
      <label class="eyebrow" for="merge-target">Merge into</label>
      <select class="rename-field" id="merge-target">
        ${others.map((item) => `<option value="${esc(item.key)}">#${esc(item.name)} — ${item.count} uses, ${esc(formatAmount(item.net))} net</option>`).join("")}
      </select>
      <div class="callout calm" data-merge-note></div>
    </div>
    <div class="dialog-actions">
      <button class="secondary-button" data-cancel>Cancel</button>
      <button class="primary-button" data-next>Preview impact</button>
    </div>`;

  const select = dialogContent.querySelector("#merge-target");
  const note = dialogContent.querySelector("[data-merge-note]");
  const describe = () => {
    const target = findTag(select.value);
    const shared = tag.transactions.filter((item) => target.transactions.includes(item)).length;
    note.innerHTML = `Combined: ${tag.count + target.count - shared} parents, net ${esc(formatAmount(tag.net + target.net - tag.transactions.filter((item) => target.transactions.includes(item)).reduce((sum, item) => sum + item.amount, 0)))}.${shared ? ` ${shared} transaction${shared === 1 ? " carries" : "s carry"} both tags already and will not be double-counted.` : ""}`;
  };
  select.addEventListener("change", describe);
  describe();

  dialogContent.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
  dialogContent.querySelector("[data-next]").addEventListener("click", () => {
    const target = findTag(select.value);
    openImpactPreview({
      title: `Merge #${tag.name} into #${target.name}?`,
      ops: [{ from: tag.key, to: target.name }],
      summary: `#${tag.name} leaves the vocabulary. Transactions already carrying both tags keep a single #${target.name}.`,
    });
  });
  if (!dialog.open) dialog.showModal();
}

// Renders the memo rewrite literally, so the human text is visibly preserved.
function memoDiffMarkup(row, ops) {
  const keys = new Set(ops.map((op) => op.from));
  const mark = (memo, isAfter) => esc(memo).replace(/#([A-Za-z0-9][A-Za-z0-9-]*)/g, (match, name) =>
    keys.has(tagKey(name)) || isAfter ? `<ins>${match}</ins>` : match);
  const removed = parseTags(row.before).filter((name) => !parseTags(row.after).some((other) => tagKey(other) === tagKey(name)));
  return `<div class="memo-diff-row">
    <span class="who"><span>${esc(row.transaction.payee)} · <span class="muted">${esc(row.transaction.account)}</span></span><span class="amount ${signClass(row.transaction.amount)}">${esc(formatAmount(row.transaction.amount))}</span></span>
    <div class="line"><b>Before</b><span class="before">${mark(row.before, false)}</span></div>
    <div class="line after"><b>After</b><span>${row.after ? mark(row.after, true) : `<span class="muted">(memo emptied)</span>`}</span></div>
    ${removed.length ? `<div class="line"><b>Drops</b><span>${removed.map((name) => `<del>#${esc(name)}</del>`).join(" ")}</span></div>` : ""}
  </div>`;
}

function openImpactPreview({ title, ops, summary, destructive = false, onApply = null }) {
  const rows = affectedBy(state.transactions, ops);
  const accounts = new Set(rows.map((row) => row.transaction.account));
  const outside = rows.filter((row) => row.transaction.account !== ACTIVE_ACCOUNT).length;
  const netMoved = rows.reduce((sum, row) => sum + row.transaction.amount, 0);
  const withSplits = rows.filter((row) => row.transaction.splits.length).length;

  dialogContent.innerHTML = `<div class="dialog-head">
      <p class="eyebrow">Impact preview · simulated write</p>
      <h2 id="preview-title">${esc(title)}</h2>
      <p>${summary}</p>
    </div>
    <div class="dialog-body">
      <div class="impact-summary">
        <div><p class="eyebrow">Memos rewritten</p><p class="figure">${rows.length}</p></div>
        <div><p class="eyebrow">Accounts touched</p><p class="figure">${accounts.size}</p></div>
        <div><p class="eyebrow">Outside ${esc(ACTIVE_ACCOUNT)}</p><p class="figure ${outside ? "negative" : ""}">${outside}</p></div>
        <div><p class="eyebrow">Signed total affected</p><p class="figure ${signClass(netMoved)}">${esc(formatAmount(netMoved))}</p></div>
      </div>
      ${outside ? `<div class="callout">${outside} of these ${rows.length} transaction${rows.length === 1 ? " is" : "s are"} outside the active ${esc(ACTIVE_ACCOUNT)} register — in ${esc([...accounts].filter((name) => name !== ACTIVE_ACCOUNT).join(", "))}. Tag changes are budget-wide and cannot be limited to the account you are browsing.</div>` : ""}
      ${withSplits ? `<div class="callout calm">${withSplits} of these parents ${withSplits === 1 ? "contains" : "contain"} splits. Split memos are never touched; only the parent memo is rewritten.</div>` : ""}
      <p class="eyebrow" style="margin:11px 0 5px">Exact memo rewrites</p>
      <div class="memo-diff">${rows.map((row) => memoDiffMarkup(row, ops)).join("")}</div>
      ${destructive ? `<div class="callout">Deleting is not reversible in YNAB once written. This prototype offers undo only for the current tab.</div>` : ""}
    </div>
    <div class="dialog-actions">
      <button class="secondary-button" data-cancel>Cancel</button>
      <button class="${destructive ? "danger-button" : "primary-button"}" data-confirm ${rows.length ? "" : "disabled"}>${destructive ? "Delete" : "Apply"} ${rows.length} memo rewrite${rows.length === 1 ? "" : "s"}</button>
    </div>`;

  dialogContent.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
  dialogContent.querySelector("[data-confirm]").addEventListener("click", () => simulateWrite(rows, ops, title, onApply));
  if (!dialog.open) dialog.showModal();
}

function simulateWrite(rows, ops, title, onApply) {
  state.undoSnapshot = state.transactions.map((item) => ({ ...item }));
  dialogContent.innerHTML = `<div class="dialog-head">
      <p class="eyebrow">Simulated write</p>
      <h2 id="preview-title">Updating ${rows.length} parent memo${rows.length === 1 ? "" : "s"}…</h2>
      <p>This prototype never contacts YNAB.</p>
    </div>
    <div class="dialog-body">
      <div class="progress-track"><span></span></div>
      <p class="muted" style="margin-top:8px">Writing in one batch per account.</p>
    </div>`;

  setTimeout(() => {
    const byId = new Map(rows.map((row) => [row.transaction.id, row.after]));
    state.transactions = state.transactions.map((item) => (byId.has(item.id) ? { ...item, memo: byId.get(item.id) } : item));
    vocab = buildVocabulary(state.transactions);
    if (onApply) onApply();
    // Keep the open/selected tag valid after a rename, merge, or delete.
    const survivors = new Set(vocab.map((tag) => tag.key));
    if (!survivors.has(state.openTag)) state.openTag = vocab[0]?.key ?? null;
    if (!survivors.has(state.expanded)) state.expanded = null;
    if (!survivors.has(state.resolvedTag)) state.resolvedTag = vocab[0]?.key ?? null;
    state.lastAction = title.replace(/\?$/, "");
    dialog.close();
    toast.innerHTML = `<span>${esc(state.lastAction)} — ${rows.length} memo${rows.length === 1 ? "" : "s"} rewritten. Undo exists only in this tab.</span><button data-undo>Undo</button>`;
    toast.classList.add("visible");
    toast.querySelector("[data-undo]").addEventListener("click", undoLastWrite);
    render();
  }, 720);
}

function undoLastWrite() {
  if (!state.undoSnapshot) return;
  state.transactions = state.undoSnapshot;
  state.undoSnapshot = null;
  vocab = buildVocabulary(state.transactions);
  state.lastAction = "Undid the last vocabulary change";
  toast.classList.remove("visible");
  render();
}

// ---------------------------------------------------------------------------
// Render + switcher
// ---------------------------------------------------------------------------

function render({ focus = null } = {}) {
  const selectionStart = focus ? document.querySelector(focus)?.selectionStart : null;
  variants[state.variant].render();
  renderSwitcher();
  if (focus) {
    const field = document.querySelector(focus);
    field?.focus();
    if (selectionStart !== null && field?.setSelectionRange) field.setSelectionRange(selectionStart, selectionStart);
  }
}

function renderSwitcher() {
  const order = Object.keys(variants);
  const prototypeMode = ["localhost", "127.0.0.1", ""].includes(location.hostname) || new URLSearchParams(location.search).get("prototype") === "1";
  switcher.innerHTML = `<button data-cycle="-1" aria-label="Previous variant">←</button><span>${state.variant} — ${esc(variants[state.variant].name)}</span><button data-cycle="1" aria-label="Next variant">→</button>`;
  switcher.hidden = !prototypeMode;
  switcher.querySelectorAll("[data-cycle]").forEach((button) => button.addEventListener("click", () => cycleVariant(Number(button.dataset.cycle))));
  switcher.dataset.index = order.indexOf(state.variant);
}

function cycleVariant(direction) {
  const order = Object.keys(variants);
  const index = order.indexOf(state.variant);
  state.variant = order[(index + direction + order.length) % order.length];
  state.ledgerQuery = "";
  state.railQuery = "";
  state.command = "";
  const url = new URL(location.href);
  url.searchParams.set("variant", state.variant);
  history.replaceState({}, "", url);
  render();
}

window.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  if (event.target.matches("input, textarea, select, [contenteditable='true']") || dialog.open) return;
  cycleVariant(event.key === "ArrowLeft" ? -1 : 1);
});
window.addEventListener("popstate", () => { state.variant = getVariant(); render(); });
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

render();
