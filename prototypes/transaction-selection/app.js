// THROWAWAY PROTOTYPE: three dense Find → Review → Apply variants,
// switchable with ?variant=A|B|C on one route.

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", signDisplay: "auto" });

const transactions = [
  { id: "t1", date: "31 Aug", payee: "Tesco", account: "Current Account", group: "Everyday", category: "Groceries", amount: -72.43, memo: "Weekly shop · Clubcard voucher used", tags: ["Household"], status: "cleared", splits: [{ category: "Groceries", memo: "Food", amount: -55.18 }, { category: "Household", memo: "Cleaning supplies", amount: -17.25 }] },
  { id: "t2", date: "30 Aug", payee: "Acme Ltd", account: "Current Account", group: "Income", category: "Ready to Assign", amount: 3240, memo: "August payroll", tags: [], status: "reconciled", splits: [] },
  { id: "t3", date: "29 Aug", payee: "IKEA", account: "Rewards Card", group: "Home", category: "Home improvement", amount: -184.99, memo: "Shelving and fixings for utility room", tags: ["Home-Repair"], status: "cleared", splits: [] },
  { id: "t4", date: "28 Aug", payee: "Trainline", account: "Rewards Card", group: "Work", category: "Work travel", amount: -86.4, memo: "Client visit to Leeds · reclaim in September", tags: ["Work", "Reimburse"], status: "reconciled", splits: [] },
  { id: "t5", date: "27 Aug", payee: "IKEA refund", account: "Rewards Card", group: "Home", category: "Home improvement", amount: 42.5, memo: "Returned spare brackets", tags: ["Home-Repair"], status: "uncleared", splits: [] },
  { id: "t6", date: "26 Aug", payee: "The Fox & Hounds", account: "Joint Account", group: "Everyday", category: "Dining out", amount: -64.2, memo: "Dinner with Alex · waiting on £32.10", tags: ["Social"], status: "cleared", splits: [{ category: "Dining out", memo: "My share", amount: -32.1 }, { category: "Reimbursements", memo: "Alex's share", amount: -32.1 }] },
  { id: "t7", date: "25 Aug", payee: "Octopus Energy", account: "Joint Account", group: "Bills", category: "Energy", amount: -118.74, memo: "August electricity and gas", tags: ["Household"], status: "reconciled", splits: [] },
  { id: "t8", date: "24 Aug", payee: "Transfer to savings", account: "Current Account", group: "Transfers", category: "Transfer", amount: -500, memo: "Emergency fund top-up", tags: ["Monthly-Move"], status: "reconciled", splits: [] },
  { id: "t9", date: "23 Aug", payee: "Boots Pharmacy", account: "Current Account", group: "Quality of life", category: "Health", amount: -23.75, memo: "Prescription · collect repeat next month", tags: [], status: "cleared", splits: [] },
  { id: "t10", date: "22 Aug", payee: "Landlord", account: "Joint Account", group: "Bills", category: "Rent", amount: -1450, memo: "September rent", tags: ["Household"], status: "reconciled", splits: [] },
  { id: "t11", date: "21 Aug", payee: "Sainsbury's", account: "Joint Account", group: "Everyday", category: "Groceries", amount: -94.18, memo: "Food shop and birthday card", tags: ["Household", "Birthday"], status: "cleared", splits: [{ category: "Groceries", memo: "Food shop", amount: -89.18 }, { category: "Gifts", memo: "Birthday card", amount: -5 }] },
  { id: "t12", date: "20 Aug", payee: "Apple", account: "Rewards Card", group: "Bills", category: "Subscriptions", amount: -8.99, memo: "iCloud+ family plan", tags: ["Subscription"], status: "cleared", splits: [] },
  { id: "t13", date: "19 Aug", payee: "HMRC", account: "Current Account", group: "Income", category: "Ready to Assign", amount: 126.4, memo: "Tax refund", tags: ["Tax"], status: "reconciled", splits: [] },
  { id: "t14", date: "18 Aug", payee: "Thames Water", account: "Joint Account", group: "Bills", category: "Water", amount: -42.16, memo: "Quarterly direct debit", tags: ["Household"], status: "reconciled", splits: [] },
  { id: "t15", date: "17 Aug", payee: "Amazon", account: "Rewards Card", group: "Home", category: "Household goods", amount: -31.48, memo: "Light bulbs and picture hooks", tags: ["Home-Repair"], status: "cleared", splits: [] },
  { id: "t16", date: "16 Aug", payee: "Workshop Coffee", account: "Current Account", group: "Everyday", category: "Dining out", amount: -4.2, memo: "Coffee before the train", tags: ["Work"], status: "cleared", splits: [] },
  { id: "t17", date: "15 Aug", payee: "Admiral", account: "Current Account", group: "Bills", category: "Insurance", amount: -61.24, memo: "Car insurance monthly premium", tags: [], status: "reconciled", splits: [] },
  { id: "t18", date: "14 Aug", payee: "Cash withdrawal", account: "Current Account", group: "Everyday", category: "Cash", amount: -40, memo: "Market and parking", tags: [], status: "uncleared", splits: [] },
  { id: "t19", date: "13 Aug", payee: "Shell", account: "Rewards Card", group: "Transport", category: "Fuel", amount: -68.31, memo: "Full tank before Cornwall", tags: ["Holiday"], status: "cleared", splits: [] },
  { id: "t20", date: "12 Aug", payee: "Interest", account: "Easy Access Savings", group: "Income", category: "Ready to Assign", amount: 38.12, memo: "Monthly interest", tags: [], status: "reconciled", splits: [] },
  { id: "t21", date: "11 Aug", payee: "National Trust", account: "Rewards Card", group: "Quality of life", category: "Days out", amount: -15, memo: "Parking at Lanhydrock", tags: ["Holiday"], status: "cleared", splits: [] },
  { id: "t22", date: "10 Aug", payee: "John Lewis", account: "Joint Account", group: "Home", category: "Household goods", amount: -86, memo: "Replacement bedding", tags: ["Household"], status: "uncleared", splits: [] },
];

const accounts = [
  { name: "All accounts", balance: 13642.67, count: 2418 },
  { name: "Current Account", balance: 2184.22, count: 834 },
  { name: "Joint Account", balance: 1360.84, count: 512 },
  { name: "Rewards Card", balance: -742.08, count: 679 },
  { name: "Easy Access Savings", balance: 10779.69, count: 361 },
  { name: "Cash", balance: 60, count: 32 },
];

const variants = {
  A: { name: "Compact register", tone: "forest", render: renderCompactRegister },
  B: { name: "Search workbench", tone: "spruce", render: renderSearchWorkbench },
  C: { name: "Register + inspector", tone: "fern", render: renderInspectorWorkspace },
};

const state = {
  selected: new Set(["t1", "t3", "t6"]), query: "", account: "All accounts", group: "All groups", status: "all",
  tagFilter: null, tag: "Home-Repair", variant: getVariant(), step: 1, inspected: "t1",
  lastAction: "None — refresh resets sample data", appliedTags: new Map(), undoSnapshot: null,
};

const app = document.querySelector("#app");
const dialog = document.querySelector("#preview-dialog");
const dialogContent = document.querySelector("#preview-content");
const toast = document.querySelector("#undo-toast");
const switcher = document.querySelector("#prototype-switcher");

function getVariant() {
  const candidate = new URLSearchParams(window.location.search).get("variant")?.toUpperCase();
  return ["A", "B", "C"].includes(candidate) ? candidate : "A";
}

function esc(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function formatAmount(amount) { return money.format(amount); }
function normalizedTag(value) { return value.trim().replace(/^#/, "").replace(/\s+/g, "-"); }
function currentTags(transaction) { return state.appliedTags.get(transaction.id) ?? transaction.tags; }
function hasTag(transaction, tag) { return currentTags(transaction).some((existing) => existing.toLowerCase() === tag.toLowerCase()); }
function selectedTransactions() { return transactions.filter((transaction) => state.selected.has(transaction.id)); }

function filteredTransactions() {
  const query = state.query.trim().toLowerCase();
  return transactions.filter((transaction) => {
    const tags = currentTags(transaction);
    const matchesAccount = state.account === "All accounts" || transaction.account === state.account;
    const matchesGroup = state.group === "All groups" || transaction.group === state.group;
    const matchesStatus = state.status === "all" || transaction.status === state.status;
    const matchesTag = !state.tagFilter || tags.some((tag) => tag.toLowerCase() === state.tagFilter.toLowerCase());
    const haystack = [transaction.payee, transaction.account, transaction.group, transaction.category, transaction.memo, ...tags, ...transaction.splits.flatMap((split) => [split.category, split.memo])].join(" ").toLowerCase();
    return matchesAccount && matchesGroup && matchesStatus && matchesTag && (!query || haystack.includes(query));
  });
}

function statusMarkup(status, compact = false) {
  const values = { reconciled: ["R", "Reconciled"], cleared: ["C", "Cleared"], uncleared: ["U", "Uncleared"] };
  const [symbol, label] = values[status];
  return `<span class="status status-${status}" title="${label}" aria-label="${label}"><span>${symbol}</span>${compact ? "" : label}</span>`;
}

function tagMarkup(transaction, { clickable = true } = {}) {
  const tags = currentTags(transaction);
  if (!tags.length) return '<span class="no-tags">No tags</span>';
  return tags.map((tag) => {
    const active = state.tagFilter?.toLowerCase() === tag.toLowerCase();
    return clickable ? `<button class="tag ${active ? "active" : ""}" data-filter-tag="${esc(tag)}" aria-pressed="${active}">#${esc(tag)}</button>` : `<span class="tag">#${esc(tag)}</span>`;
  }).join("");
}

function filterSummary() {
  const filters = [];
  if (state.account !== "All accounts") filters.push(state.account);
  if (state.group !== "All groups") filters.push(state.group);
  if (state.status !== "all") filters.push(state.status);
  if (state.tagFilter) filters.push(`#${state.tagFilter}`);
  if (state.query) filters.push(`“${state.query}”`);
  return filters;
}

function header() {
  return `<div class="prototype-banner"><strong>Throwaway prototype · issue #4 · round 2</strong><span>22 realistic rows standing in for 2,418 transactions · no YNAB calls</span></div>
    <header class="app-header"><div class="brand"><span class="brand-mark">Y</span><span><strong>Ynot</strong><small>Personal budget</small></span></div><div class="session-state"><span></span>Connected for this tab · locks in 12:41</div></header>`;
}

function stepper() {
  return `<nav class="journey" aria-label="Batch tagging steps">${[[1, "Find"], [2, "Review"], [3, "Apply"]].map(([number, label]) => `<button class="journey-step ${state.step === number ? "active" : ""}" data-step="${number}" ${number > 1 && !state.selected.size ? "disabled" : ""}><span>${number}</span>${label}</button>`).join("")}</nav>`;
}

function stateBar() {
  const visible = filteredTransactions();
  const selected = selectedTransactions();
  const selectedTotal = selected.reduce((total, item) => total + item.amount, 0);
  return `<div class="state-bar" aria-label="Current prototype state"><span><strong>${visible.length}</strong> matching sample rows</span><span><strong>${selected.length}</strong> selected</span><span><strong>${formatAmount(selectedTotal)}</strong> signed total</span><span>Apply <strong>#${esc(normalizedTag(state.tag) || "—")}</strong></span><span>Last <strong>${esc(state.lastAction)}</strong></span>${filterSummary().length ? `<button data-clear-filters>Clear ${filterSummary().length} filter${filterSummary().length === 1 ? "" : "s"}</button>` : ""}</div>`;
}

function accountRail() {
  return `<aside class="account-rail" aria-label="Budget accounts"><div class="rail-title"><strong>Accounts</strong><span>2,418 transactions</span></div>${accounts.map((account) => `<button class="account-link ${state.account === account.name ? "active" : ""}" data-account="${esc(account.name)}"><span><strong>${esc(account.name)}</strong><small>${account.count.toLocaleString("en-GB")} transactions</small></span><span class="mono ${account.balance < 0 ? "negative" : ""}">${formatAmount(account.balance)}</span></button>`).join("")}<div class="rail-note"><strong>Account behaviour to test</strong><span>Does this rail change the active account, or add an account filter?</span></div></aside>`;
}

function pageIntro(kicker, title, copy) {
  return `<section class="page-intro"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p>${copy}</p></div>${stepper()}</section>`;
}

function findControls({ facets = false } = {}) {
  const groups = ["All groups", ...new Set(transactions.map((item) => item.group))];
  return `<div class="find-controls ${facets ? "faceted" : ""}"><label class="search-box"><span>⌕</span><input type="search" data-query value="${esc(state.query)}" placeholder="Search payee, account, category, memo or tag" /></label><label><span>Category group</span><select data-group>${groups.map((group) => `<option ${state.group === group ? "selected" : ""}>${esc(group)}</option>`).join("")}</select></label><label><span>Status</span><select data-status><option value="all" ${state.status === "all" ? "selected" : ""}>Any status</option><option value="uncleared" ${state.status === "uncleared" ? "selected" : ""}>Uncleared</option><option value="cleared" ${state.status === "cleared" ? "selected" : ""}>Cleared</option><option value="reconciled" ${state.status === "reconciled" ? "selected" : ""}>Reconciled</option></select></label>${state.tagFilter ? `<button class="active-filter" data-filter-tag="${esc(state.tagFilter)}">#${esc(state.tagFilter)} <span>×</span></button>` : ""}</div>`;
}

function render() {
  document.body.dataset.tone = variants[state.variant].tone;
  app.innerHTML = variants[state.variant].render();
  bindControls();
  renderSwitcher();
}

function renderCompactRegister() {
  return `${header()}<div class="app-layout">${accountRail()}<main class="main-workspace">${pageIntro("A · Forest register", "Find quickly. Review deliberately.", "A YNAB-like account rail and an eight-column compact register prioritise scanning thousands of transactions without hiding memo context.")}${stateBar()}${state.step === 1 ? compactFind() : sharedDecisionStage("register-stage")}</main></div>`;
}

function compactFind() {
  const visible = filteredTransactions();
  return `<section class="surface register-surface">${findControls()}<div class="register-actions"><span>Selection persists as you filter.</span><button class="quiet-button" data-select-visible>${visible.length && visible.every((item) => state.selected.has(item.id)) ? "Clear matching" : "Select matching"}</button></div><div class="table-scroll"><table class="dense-table"><thead><tr><th></th><th>Date</th><th>Payee</th><th>Account</th><th>Category group › category</th><th>Memo (non-tag text)</th><th>Tags</th><th>Status</th><th>Amount</th></tr></thead><tbody>${visible.map(denseTableRow).join("")}</tbody></table></div>${visible.length ? "" : emptyState()}</section>${batchFooter("Continue to review")}`;
}

function denseTableRow(transaction) {
  const selected = state.selected.has(transaction.id);
  return `<tr class="${selected ? "selected" : ""}"><td><input type="checkbox" data-select="${transaction.id}" aria-label="Select ${esc(transaction.payee)}" ${selected ? "checked" : ""} /></td><td class="mono nowrap">${transaction.date}</td><td><strong>${esc(transaction.payee)}</strong>${transaction.splits.length ? `<small>${transaction.splits.length} splits · parent only</small>` : ""}</td><td>${esc(transaction.account)}</td><td><span class="category-path"><small>${esc(transaction.group)}</small>${esc(transaction.category)}</span></td><td class="memo-cell">${esc(transaction.memo)}</td><td><div class="tag-list">${tagMarkup(transaction)}</div></td><td>${statusMarkup(transaction.status, true)}</td><td class="amount ${transaction.amount > 0 ? "positive" : ""}">${formatAmount(transaction.amount)}</td></tr>`;
}

function renderSearchWorkbench() {
  return `${header()}<main class="search-page">${pageIntro("B · Spruce search workbench", "Search first, then build the batch.", "Accounts become facets instead of navigation, leaving more width for memo text. A persistent batch tray keeps the guided flow visible alongside dense results.")}${stateBar()}${state.step === 1 ? workbenchFind() : sharedDecisionStage("wide-stage")}</main>`;
}

function workbenchFind() {
  const visible = filteredTransactions();
  const groups = [...new Set(transactions.map((item) => item.group))];
  return `<div class="search-workbench"><aside class="facet-panel surface"><div class="facet-title"><strong>Refine</strong><button data-clear-filters>Reset</button></div><div class="facet-block"><span>Accounts</span>${accounts.map((account) => `<button class="facet ${state.account === account.name ? "active" : ""}" data-account="${esc(account.name)}"><span>${esc(account.name)}</span><small>${account.count.toLocaleString("en-GB")}</small></button>`).join("")}</div><div class="facet-block"><span>Category groups</span>${groups.map((group) => `<button class="facet ${state.group === group ? "active" : ""}" data-group-button="${esc(group)}"><span>${esc(group)}</span><small>${transactions.filter((item) => item.group === group).length}</small></button>`).join("")}</div><div class="facet-block"><span>Reconciliation</span>${["uncleared", "cleared", "reconciled"].map((status) => `<button class="facet ${state.status === status ? "active" : ""}" data-status-button="${status}"><span>${statusMarkup(status)}</span><small>${transactions.filter((item) => item.status === status).length}</small></button>`).join("")}</div></aside><section class="result-panel surface">${findControls({ facets: true })}<div class="result-head"><span>${visible.length} matching rows</span><button class="quiet-button" data-select-visible>${visible.length && visible.every((item) => state.selected.has(item.id)) ? "Clear matching" : "Select matching"}</button></div><div class="compact-results">${visible.map(compactResultRow).join("")}</div>${visible.length ? "" : emptyState()}</section>${batchTray()}</div>`;
}

function compactResultRow(transaction) {
  const selected = state.selected.has(transaction.id);
  return `<article class="compact-row ${selected ? "selected" : ""}"><input type="checkbox" data-select="${transaction.id}" aria-label="Select ${esc(transaction.payee)}" ${selected ? "checked" : ""} /><div class="row-primary"><strong>${esc(transaction.payee)}</strong><span>${esc(transaction.memo)}</span></div><div class="row-category"><strong>${esc(transaction.category)}</strong><span>${esc(transaction.group)} · ${esc(transaction.account)}</span></div><div class="tag-list">${tagMarkup(transaction)}</div>${statusMarkup(transaction.status, true)}<div class="row-date mono">${transaction.date}</div><div class="amount ${transaction.amount > 0 ? "positive" : ""}">${formatAmount(transaction.amount)}</div></article>`;
}

function batchTray() {
  const selected = selectedTransactions();
  return `<aside class="batch-tray surface"><div><p class="eyebrow">Current batch</p><h2>${selected.length} selected</h2><p>Filters never remove items already selected.</p></div><div class="tray-list">${selected.slice(0, 5).map((item) => `<div><span><strong>${esc(item.payee)}</strong><small>${esc(item.account)}</small></span><button data-select="${item.id}" aria-label="Remove ${esc(item.payee)}">×</button></div>`).join("")}${selected.length > 5 ? `<small>+ ${selected.length - 5} more</small>` : ""}</div><label class="tag-field"><span>Tag to apply</span><input data-tag-input value="${esc(state.tag)}" /></label><button class="primary-button" data-step="2" ${selected.length ? "" : "disabled"}>Review batch →</button></aside>`;
}

function renderInspectorWorkspace() {
  return `${header()}<div class="app-layout inspector-layout">${accountRail()}<main class="main-workspace">${pageIntro("C · Fern register + inspector", "Keep the list dense. Reveal detail on demand.", "The middle column remains compact while an inspector exposes full memo text, category hierarchy, tags, status, and split context for one focused parent.")}${stateBar()}${state.step === 1 ? inspectorFind() : sharedDecisionStage("inspector-stage")}</main></div>`;
}

function inspectorFind() {
  const visible = filteredTransactions();
  const inspected = transactions.find((item) => item.id === state.inspected) ?? visible[0];
  return `<div class="inspector-workspace"><section class="surface list-panel">${findControls()}<div class="result-head"><span>${visible.length} matching rows</span><button class="quiet-button" data-select-visible>${visible.length && visible.every((item) => state.selected.has(item.id)) ? "Clear matching" : "Select matching"}</button></div><div class="inspector-list">${visible.map((transaction) => inspectorRow(transaction, inspected?.id)).join("")}</div>${visible.length ? "" : emptyState()}</section>${inspected ? inspectorPanel(inspected) : '<aside class="surface detail-panel"><p>No transaction focused.</p></aside>'}</div>${batchFooter("Review selected parents")}`;
}

function inspectorRow(transaction, inspectedId) {
  const selected = state.selected.has(transaction.id);
  return `<article class="inspector-row ${selected ? "selected" : ""} ${inspectedId === transaction.id ? "focused" : ""}"><input type="checkbox" data-select="${transaction.id}" aria-label="Select ${esc(transaction.payee)}" ${selected ? "checked" : ""} /><button class="inspect-target" data-inspect="${transaction.id}"><span class="mono">${transaction.date}</span><strong>${esc(transaction.payee)}</strong><span>${esc(transaction.category)}</span><span>${esc(transaction.account)}</span>${statusMarkup(transaction.status, true)}<span class="amount ${transaction.amount > 0 ? "positive" : ""}">${formatAmount(transaction.amount)}</span></button></article>`;
}

function inspectorPanel(transaction) {
  return `<aside class="surface detail-panel"><div class="detail-head"><div><p class="eyebrow">Focused parent</p><h2>${esc(transaction.payee)}</h2></div>${statusMarkup(transaction.status)}</div><dl><div><dt>Account</dt><dd>${esc(transaction.account)}</dd></div><div><dt>Category</dt><dd>${esc(transaction.group)} <span>›</span> ${esc(transaction.category)}</dd></div><div><dt>Amount</dt><dd class="amount ${transaction.amount > 0 ? "positive" : ""}">${formatAmount(transaction.amount)}</dd></div><div class="memo-detail"><dt>Memo without tags</dt><dd>${esc(transaction.memo)}</dd></div><div><dt>Tags in memo</dt><dd class="tag-list">${tagMarkup(transaction)}</dd></div></dl>${transaction.splits.length ? `<div class="split-context"><strong>${transaction.splits.length} split lines · context only</strong>${transaction.splits.map((split) => `<div><span>${esc(split.category)}<small>${esc(split.memo)}</small></span><span class="amount">${formatAmount(split.amount)}</span></div>`).join("")}<p>The tag still applies to the full ${formatAmount(transaction.amount)} parent memo.</p></div>` : ""}<button class="${state.selected.has(transaction.id) ? "secondary-button" : "primary-button"}" data-select="${transaction.id}">${state.selected.has(transaction.id) ? "Remove from batch" : "Add parent to batch"}</button></aside>`;
}

function batchFooter(label) {
  const selected = selectedTransactions();
  return `<section class="batch-footer surface"><div><strong>${selected.length} selected</strong><span>${selected.filter((item) => item.splits.length).length} with split context · ${formatAmount(selected.reduce((total, item) => total + item.amount, 0))}</span></div><label class="tag-field"><span>Tag</span><input data-tag-input value="${esc(state.tag)}" /></label><button class="primary-button" data-step="2" ${selected.length ? "" : "disabled"}>${label} →</button></section>`;
}

function sharedDecisionStage(stageClass) { return state.step === 2 ? reviewStage(stageClass) : applyStage(stageClass); }

function reviewStage(stageClass) {
  const selected = selectedTransactions();
  return `<section class="surface decision-stage ${stageClass}"><div class="decision-head"><div><p class="eyebrow">Step 2 of 3 · Review</p><h2>Review ${selected.length} parent transactions.</h2><p>Filters stay intact. Split lines are context; tags describe the signed parent amount.</p></div><label class="tag-field"><span>Tag to apply</span><input data-tag-input value="${esc(state.tag)}" /></label></div><div class="review-table"><div class="review-table-head"><span>Parent transaction</span><span>Account</span><span>Category</span><span>Memo (non-tag text)</span><span>Status</span><span>Amount</span><span></span></div>${selected.map(reviewRow).join("")}</div><footer><button class="secondary-button" data-step="1">← Back to find</button><button class="primary-button" data-step="3" ${state.tag.trim() ? "" : "disabled"}>Preview impact →</button></footer></section>`;
}

function reviewRow(transaction) {
  return `<div class="review-table-row"><span><strong>${esc(transaction.payee)}</strong>${transaction.splits.length ? `<small>${transaction.splits.length} splits · parent only</small>` : `<div class="tag-list">${tagMarkup(transaction)}</div>`}</span><span>${esc(transaction.account)}</span><span>${esc(transaction.group)} › ${esc(transaction.category)}</span><span>${esc(transaction.memo)}</span><span>${statusMarkup(transaction.status, true)}</span><span class="amount ${transaction.amount > 0 ? "positive" : ""}">${formatAmount(transaction.amount)}</span><button data-select="${transaction.id}" aria-label="Remove ${esc(transaction.payee)}">×</button></div>`;
}

function applyStage(stageClass) {
  const selected = selectedTransactions();
  const tag = normalizedTag(state.tag);
  const changing = selected.filter((item) => !hasTag(item, tag));
  const unchanged = selected.length - changing.length;
  return `<section class="surface decision-stage ${stageClass}"><div class="decision-head"><div><p class="eyebrow">Step 3 of 3 · Apply</p><h2>Apply #${esc(tag || "—")}?</h2><p>This is the last screen before parent memos would change. Existing non-tag memo text and every split memo remain untouched.</p></div></div><div class="impact-grid"><div><strong>${changing.length}</strong><span>will change</span></div><div><strong>${unchanged}</strong><span>already tagged</span></div><div><strong>${selected.filter((item) => item.splits.length).length}</strong><span>parents with splits</span></div><div><strong>${formatAmount(selected.reduce((total, item) => total + item.amount, 0))}</strong><span>signed parent total</span></div></div><div class="impact-list">${selected.map((item) => impactRow(item, tag)).join("")}</div><footer><button class="secondary-button" data-step="2">← Back to review</button><button class="primary-button" data-apply ${changing.length ? "" : "disabled"}>Apply to ${changing.length} parent${changing.length === 1 ? "" : "s"}</button></footer></section>`;
}

function impactRow(transaction, tag) {
  const changes = !hasTag(transaction, tag);
  return `<div><span><strong>${esc(transaction.payee)}</strong><small>${esc(transaction.account)} · ${esc(transaction.memo)}${transaction.splits.length ? ` · ${transaction.splits.length} split lines` : ""}</small></span><span class="tag-list">${tagMarkup(transaction, { clickable: false })}</span><span class="impact-result ${changes ? "" : "muted"}">${changes ? `Add #${esc(tag)}` : "Already tagged"}</span><span class="amount ${transaction.amount > 0 ? "positive" : ""}">${formatAmount(transaction.amount)}</span></div>`;
}

function emptyState() { return '<div class="empty-state"><strong>No sample rows match.</strong><span>Clear one or more filters to widen this budget search.</span></div>'; }

function bindControls() {
  document.querySelectorAll("[data-query]").forEach((input) => input.addEventListener("input", (event) => { state.query = event.target.value; render(); const next = document.querySelector("[data-query]"); next?.focus(); next?.setSelectionRange(state.query.length, state.query.length); }));
  document.querySelectorAll("[data-account]").forEach((button) => button.addEventListener("click", () => { state.account = button.dataset.account; state.step = 1; render(); }));
  document.querySelectorAll("[data-group]").forEach((select) => select.addEventListener("change", () => { state.group = select.value; render(); }));
  document.querySelectorAll("[data-group-button]").forEach((button) => button.addEventListener("click", () => { state.group = state.group === button.dataset.groupButton ? "All groups" : button.dataset.groupButton; render(); }));
  document.querySelectorAll("[data-status]").forEach((select) => select.addEventListener("change", () => { state.status = select.value; render(); }));
  document.querySelectorAll("[data-status-button]").forEach((button) => button.addEventListener("click", () => { state.status = state.status === button.dataset.statusButton ? "all" : button.dataset.statusButton; render(); }));
  document.querySelectorAll("[data-filter-tag]").forEach((button) => button.addEventListener("click", () => { const tag = button.dataset.filterTag; state.tagFilter = state.tagFilter?.toLowerCase() === tag.toLowerCase() ? null : tag; state.step = 1; render(); }));
  document.querySelectorAll("[data-clear-filters]").forEach((button) => button.addEventListener("click", () => { state.query = ""; state.account = "All accounts"; state.group = "All groups"; state.status = "all"; state.tagFilter = null; render(); }));
  document.querySelectorAll("[data-select]").forEach((control) => control.addEventListener("click", () => { const id = control.dataset.select; state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id); if (!state.selected.size) state.step = 1; render(); }));
  document.querySelectorAll("[data-select-visible]").forEach((button) => button.addEventListener("click", () => { const visible = filteredTransactions(); const allSelected = visible.length && visible.every((item) => state.selected.has(item.id)); visible.forEach((item) => allSelected ? state.selected.delete(item.id) : state.selected.add(item.id)); render(); }));
  document.querySelectorAll("[data-inspect]").forEach((button) => button.addEventListener("click", () => { state.inspected = button.dataset.inspect; render(); }));
  document.querySelectorAll("[data-tag-input]").forEach((input) => input.addEventListener("input", () => { state.tag = input.value.replace(/^#/, ""); }));
  document.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => { const next = Number(button.dataset.step); if (next > 1 && !state.selected.size) return; if (next === 3 && !state.tag.trim()) return; state.step = next; render(); }));
  document.querySelector("[data-apply]")?.addEventListener("click", openApplyPreview);
}

function openApplyPreview() {
  const selected = selectedTransactions();
  const tag = normalizedTag(state.tag);
  const changing = selected.filter((item) => !hasTag(item, tag));
  dialogContent.innerHTML = `<div class="dialog-head"><p class="eyebrow">Simulated write confirmation</p><h2 id="preview-title">Apply #${esc(tag)} to ${changing.length} parents?</h2><p>Non-tag memo text is preserved. Split memos are not changed.</p></div><div class="dialog-body"><div class="impact-list">${selected.map((item) => impactRow(item, tag)).join("")}</div></div><div class="dialog-actions"><button class="secondary-button" data-cancel>Cancel</button><button class="primary-button" data-confirm ${changing.length ? "" : "disabled"}>Apply to ${changing.length}</button></div>`;
  dialogContent.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
  dialogContent.querySelector("[data-confirm]").addEventListener("click", () => simulateApply(changing, tag));
  dialog.showModal();
}

function simulateApply(changing, tag) {
  state.undoSnapshot = new Map(state.appliedTags);
  changing.forEach((transaction) => state.appliedTags.set(transaction.id, [...currentTags(transaction), tag]));
  dialogContent.innerHTML = `<div class="dialog-head"><p class="eyebrow">Simulated write</p><h2 id="preview-title">Updating parent memos…</h2><p>Reconciling ${changing.length} responses before completion.</p></div><div class="dialog-body"><div class="progress-track"><span></span></div><p class="muted-copy">This prototype never contacts YNAB.</p></div>`;
  window.setTimeout(() => { state.lastAction = `Applied #${tag} to ${changing.length} parents`; dialog.close(); toast.innerHTML = `<span>${esc(state.lastAction)}. Undo exists only in this tab.</span><button data-undo>Undo</button>`; toast.classList.add("visible"); toast.querySelector("[data-undo]").addEventListener("click", () => { state.appliedTags = new Map(state.undoSnapshot); state.lastAction = "Undid previous batch"; toast.classList.remove("visible"); render(); }); render(); }, 750);
}

function renderSwitcher() {
  const order = Object.keys(variants);
  const index = order.indexOf(state.variant);
  const prototypeMode = ["localhost", "127.0.0.1"].includes(location.hostname) || new URLSearchParams(location.search).get("prototype") === "1";
  switcher.innerHTML = `<button data-cycle="-1" aria-label="Previous variant">←</button><span>${state.variant} — ${esc(variants[state.variant].name)}</span><button data-cycle="1" aria-label="Next variant">→</button>`;
  switcher.hidden = !prototypeMode;
  switcher.querySelectorAll("[data-cycle]").forEach((button) => button.addEventListener("click", () => cycleVariant(Number(button.dataset.cycle))));
  switcher.dataset.index = index;
}

function cycleVariant(direction) {
  const order = Object.keys(variants);
  const index = order.indexOf(state.variant);
  state.variant = order[(index + direction + order.length) % order.length];
  state.step = 1;
  const url = new URL(location.href);
  url.searchParams.set("variant", state.variant);
  history.replaceState({}, "", url);
  render();
}

window.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key) || event.target.matches("input, textarea, select, [contenteditable='true']")) return;
  cycleVariant(event.key === "ArrowLeft" ? -1 : 1);
});
window.addEventListener("popstate", () => { state.variant = getVariant(); render(); });
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
render();
