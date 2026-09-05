// THROWAWAY PROTOTYPE: three ways to scope history inside one dense,
// guided Find → Review → Apply experience. Switch with ?variant=A|B|C.

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  signDisplay: "auto",
});

function makeTransaction(id, date, recent, payee, account, group, category, amount, memo, tags, status, splits = []) {
  return { id, date, recent, payee, account, group, category, amount, memo, tags, status, splits };
}

const transactions = [
  makeTransaction("t1", "31 Aug 26", true, "Tesco", "Current Account", "Everyday", "Groceries", -72.43, "Weekly shop · Clubcard voucher used", ["Household"], "cleared", [
    { category: "Groceries", group: "Everyday", memo: "Food", amount: -55.18 },
    { category: "Household goods", group: "Home", memo: "Cleaning supplies", amount: -17.25 },
  ]),
  makeTransaction("t2", "30 Aug 26", true, "Acme Ltd", "Current Account", "Income", "Ready to Assign", 3240, "August payroll", [], "reconciled"),
  makeTransaction("t3", "29 Aug 26", true, "IKEA", "Rewards Card", "Home", "Home improvement", -184.99, "Shelving and fixings for utility room", ["Home-Repair"], "cleared"),
  makeTransaction("t4", "28 Aug 26", true, "Trainline", "Rewards Card", "Work", "Work travel", -86.4, "Client visit to Leeds · reclaim in September", ["Work", "Reimburse"], "reconciled"),
  makeTransaction("t5", "27 Aug 26", true, "IKEA refund", "Rewards Card", "Home", "Home improvement", 42.5, "Returned spare brackets", ["Home-Repair"], "uncleared"),
  makeTransaction("t6", "26 Aug 26", true, "The Fox & Hounds", "Joint Account", "Everyday", "Dining out", -96.8, "Dinner with Alex and Sam · I covered the table", ["Social", "Dinner-Fox-2026-08-26"], "cleared", [
    { category: "Dining out", group: "Everyday", memo: "My share", amount: -46.2 },
    { category: "Reimbursements", group: "Income", memo: "Alex owes", amount: -32.1, owedBy: "Alex" },
    { category: "Reimbursements", group: "Income", memo: "Sam owes", amount: -18.5, owedBy: "Sam" },
  ]),
  makeTransaction("t7", "25 Aug 26", true, "Octopus Energy", "Joint Account", "Bills", "Energy", -118.74, "August electricity and gas", ["Household"], "reconciled"),
  makeTransaction("t8", "24 Aug 26", true, "Transfer to savings", "Current Account", "Transfers", "Transfer", -500, "Emergency fund top-up", ["Monthly-Move"], "reconciled"),
  makeTransaction("t9", "23 Aug 26", true, "Boots Pharmacy", "Current Account", "Quality of life", "Health", -23.75, "Prescription · collect repeat next month", [], "cleared"),
  makeTransaction("t10", "22 Aug 26", true, "Landlord", "Joint Account", "Bills", "Rent", -1450, "September rent", ["Household"], "reconciled"),
  makeTransaction("t11", "21 Aug 26", true, "Sainsbury's", "Joint Account", "Everyday", "Groceries", -94.18, "Food shop and birthday card", ["Household", "Birthday"], "cleared", [
    { category: "Groceries", group: "Everyday", memo: "Food shop", amount: -89.18 },
    { category: "Gifts", group: "Quality of life", memo: "Birthday card", amount: -5 },
  ]),
  makeTransaction("t12", "20 Aug 26", true, "Apple", "Rewards Card", "Bills", "Subscriptions", -8.99, "iCloud+ family plan", ["Subscription"], "cleared"),
  makeTransaction("t13", "19 Aug 26", true, "HMRC", "Current Account", "Income", "Ready to Assign", 126.4, "Tax refund", ["Tax"], "reconciled"),
  makeTransaction("t14", "18 Aug 26", true, "Thames Water", "Joint Account", "Bills", "Water", -42.16, "Quarterly direct debit", ["Household"], "reconciled"),
  makeTransaction("t15", "17 Aug 26", true, "Amazon", "Rewards Card", "Home", "Household goods", -31.48, "Light bulbs and picture hooks", ["Home-Repair"], "cleared"),
  makeTransaction("t16", "16 Aug 26", true, "Workshop Coffee", "Current Account", "Everyday", "Dining out", -4.2, "Coffee before the train", ["Work"], "cleared"),
  makeTransaction("t17", "15 Aug 26", true, "Admiral", "Current Account", "Bills", "Insurance", -61.24, "Car insurance monthly premium", [], "reconciled"),
  makeTransaction("t18", "14 Aug 26", true, "Cash withdrawal", "Current Account", "Everyday", "Cash", -40, "Market and parking", [], "uncleared"),
  makeTransaction("t19", "13 Aug 26", true, "Shell", "Rewards Card", "Transport", "Fuel", -68.31, "Full tank before Cornwall", ["Cornwall-2026"], "cleared"),
  makeTransaction("t20", "12 Aug 26", true, "Interest", "Easy Access Savings", "Income", "Ready to Assign", 38.12, "Monthly interest", [], "reconciled"),
  makeTransaction("t21", "11 Aug 26", true, "National Trust", "Rewards Card", "Quality of life", "Holiday", -15, "Parking at Lanhydrock", ["Cornwall-2026"], "cleared"),
  makeTransaction("t22", "10 Aug 26", true, "John Lewis", "Joint Account", "Home", "Household goods", -86, "Replacement bedding", ["Household"], "uncleared"),
  makeTransaction("t23", "09 Aug 26", true, "Sea View Inn", "Rewards Card", "Quality of life", "Holiday", -328, "Three nights in St Ives", ["Cornwall-2026"], "reconciled"),
  makeTransaction("t24", "08 Aug 26", true, "Eden Project", "Rewards Card", "Quality of life", "Holiday", -71.5, "Admission and parking", ["Cornwall-2026"], "cleared"),
  makeTransaction("t25", "27 Aug 26", true, "Alex Morgan", "Current Account", "Income", "Reimbursements", 32.1, "Fox and Hounds dinner reimbursement", ["Dinner-Fox-2026-08-26"], "cleared"),
  makeTransaction("t26", "31 Aug 26", true, "Sam Patel", "Current Account", "Income", "Reimbursements", 18.5, "Fox and Hounds dinner · pending transfer", ["Dinner-Fox-2026-08-26"], "uncleared"),
  makeTransaction("t27", "12 Apr 26", false, "British Airways", "Rewards Card", "Quality of life", "Holiday", -410, "Flights booked for Cornwall", ["Cornwall-2026"], "reconciled"),
  makeTransaction("t28", "18 Jan 26", false, "John Lewis", "Joint Account", "Home", "Household goods", -114.5, "Winter duvet", ["Household"], "reconciled"),
  makeTransaction("t29", "03 Nov 25", false, "The Crown", "Current Account", "Everyday", "Dining out", -82.4, "Birthday dinner", ["Birthday-2025"], "reconciled"),
  makeTransaction("t30", "16 Jun 24", false, "Cornwall Council", "Current Account", "Quality of life", "Holiday", -6.5, "Beach parking", ["Cornwall-2024"], "reconciled"),
];

const accounts = [
  { name: "All accounts", balance: 13642.67, total: 2418 },
  { name: "Current Account", balance: 2184.22, total: 834 },
  { name: "Joint Account", balance: 1360.84, total: 512 },
  { name: "Rewards Card", balance: -742.08, total: 679 },
  { name: "Easy Access Savings", balance: 10779.69, total: 361 },
  { name: "Cash", balance: 60, total: 32 },
];

const groupTotals = { Everyday: 421, Income: 174, Home: 286, Work: 94, Bills: 503, Transfers: 188, "Quality of life": 319, Transport: 210 };
const statusTotals = { uncleared: 143, cleared: 842, reconciled: 1433 };
const tagTotals = { Household: 184, "Home-Repair": 41, Work: 76, Reimburse: 22, "Cornwall-2026": 9, "Dinner-Fox-2026-08-26": 4 };

const variants = {
  A: { name: "Recent window", scope: "recent", defaultAccount: "All accounts", render: renderRecentWindow },
  B: { name: "Active account register", scope: "account", defaultAccount: "Current Account", render: renderAccountRegister },
  C: { name: "Entire history", scope: "history", defaultAccount: "All accounts", render: renderEntireHistory },
};

const state = {
  variant: getVariant(),
  step: 1,
  account: "All accounts",
  query: "",
  group: "All groups",
  status: "all",
  tagFilters: new Set(),
  tagOperator: "and",
  tagToApply: "Cornwall-2026",
  selected: new Set(["t19", "t21", "t23", "t24"]),
  inspected: "t19",
  inspectorTab: "parent",
  focusTag: "Cornwall-2026",
  windowDays: "90",
  accountYear: "all",
  historyAnchor: "all",
  reduceTransparency: false,
  appliedTags: new Map(),
  undoSnapshot: null,
  lastAction: "None — refresh resets sample data",
};
state.account = variants[state.variant].defaultAccount;
if (state.variant === "B") {
  state.selected = new Set(["t25", "t26"]);
  state.tagToApply = "Dinner-Fox-2026-08-26";
  state.focusTag = "Dinner-Fox-2026-08-26";
  state.inspected = "t25";
}
if (state.variant === "C") state.selected.add("t27");

const app = document.querySelector("#app");
const dialog = document.querySelector("#preview-dialog");
const dialogContent = document.querySelector("#preview-content");
const toast = document.querySelector("#undo-toast");
const switcher = document.querySelector("#prototype-switcher");

function getVariant() {
  const value = new URLSearchParams(location.search).get("variant")?.toUpperCase();
  return ["A", "B", "C"].includes(value) ? value : "A";
}

function esc(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function formatAmount(value) { return money.format(value); }
function normalizeTag(value) { return value.trim().replace(/^#/, "").replace(/\s+/g, "-"); }
function tagsFor(transaction) { return state.appliedTags.get(transaction.id) ?? transaction.tags; }
function hasTag(transaction, tag) { return tagsFor(transaction).some((item) => item.toLowerCase() === tag.toLowerCase()); }
function selectedTransactions() { return transactions.filter((item) => state.selected.has(item.id)); }

function inVariantScope(transaction) {
  if (variants[state.variant].scope === "recent" && state.windowDays !== "all") return transaction.recent;
  if (variants[state.variant].scope === "account" && state.accountYear !== "all") return transaction.date.endsWith(state.accountYear.slice(-2));
  if (variants[state.variant].scope === "history" && state.historyAnchor === "Earlier") return !transaction.date.endsWith("26") && !transaction.date.endsWith("25") && !transaction.date.endsWith("24") && !transaction.date.endsWith("23");
  if (variants[state.variant].scope === "history" && state.historyAnchor !== "all") return transaction.date.endsWith(state.historyAnchor.slice(-2));
  return true;
}

function filteredTransactions({ ignore = null } = {}) {
  const query = state.query.trim().toLowerCase();
  return transactions.filter((transaction) => {
    if (!inVariantScope(transaction)) return false;
    const tags = tagsFor(transaction);
    const accountMatch = ignore === "account" || state.account === "All accounts" || transaction.account === state.account;
    const groupMatch = ignore === "group" || state.group === "All groups" || transaction.group === state.group || transaction.splits.some((split) => split.group === state.group);
    const statusMatch = ignore === "status" || state.status === "all" || transaction.status === state.status;
    const tagMatches = [...state.tagFilters].map((tag) => tags.some((item) => item.toLowerCase() === tag.toLowerCase()));
    const tagMatch = ignore === "tags" || !tagMatches.length || (state.tagOperator === "and" ? tagMatches.every(Boolean) : tagMatches.some(Boolean));
    const searchText = [transaction.payee, transaction.account, transaction.group, transaction.category, transaction.memo, ...tags, ...transaction.splits.flatMap((split) => [split.group, split.category, split.memo])].join(" ").toLowerCase();
    return accountMatch && groupMatch && statusMatch && tagMatch && (!query || searchText.includes(query));
  });
}

function statusMarkup(status, withLabel = false) {
  const labels = { uncleared: "Uncleared", cleared: "Cleared", reconciled: "Reconciled" };
  const symbol = status === "reconciled" ? '<span class="status-symbol lock" aria-hidden="true"></span>' : `<span class="status-symbol">C</span>`;
  return `<span class="status status-${status}" title="${labels[status]}" aria-label="${labels[status]}">${symbol}${withLabel ? `<span class="status-label">${labels[status]}</span>` : ""}</span>`;
}

function tagMarkup(transaction, { interactive = true } = {}) {
  const tags = tagsFor(transaction);
  if (!tags.length) return '<span class="no-tags">No tags</span>';
  return tags.map((tag) => {
    const active = [...state.tagFilters].some((item) => item.toLowerCase() === tag.toLowerCase());
    return interactive
      ? `<button class="tag ${active ? "active" : ""}" data-tag-filter="${esc(tag)}" aria-pressed="${active}">#${esc(tag)}</button>`
      : `<span class="tag">#${esc(tag)}</span>`;
  }).join("");
}

function splitCategoryMarkup(transaction) {
  if (!transaction.splits.length) return `<span class="category-path"><small>${esc(transaction.group)}</small>${esc(transaction.category)}</span>`;
  const categories = [...new Set(transaction.splits.map((split) => split.category))];
  return `<span class="category-path split-categories"><small>Split · ${categories.length} categories</small>${categories.map(esc).join(" · ")}</span>`;
}

function activeFilterCount() {
  return Number(state.account !== "All accounts") + Number(state.group !== "All groups") + Number(state.status !== "all") + state.tagFilters.size + Number(Boolean(state.query));
}

function shell(content, kicker, title, copy) {
  const visible = filteredTransactions();
  const selected = selectedTransactions();
  return `
    <div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
    <div class="prototype-banner"><strong>Throwaway prototype · issue #4 · round 3</strong><span>History-scope comparison · in-memory sample data · no YNAB calls</span></div>
    <header class="glass app-header"><div class="brand"><span class="brand-mark">Y</span><span><strong>Ynot</strong><small>Personal budget</small></span></div><div class="header-actions"><button class="transparency-toggle" data-transparency aria-pressed="${state.reduceTransparency}">${state.reduceTransparency ? "Enable glass" : "Reduce transparency"}</button><div class="session-state"><span></span>Connected for this tab · locks in 12:41</div></div></header>
    <div class="glass-layout">
      ${facetRail()}
      <main class="main-workspace">
        <section class="page-intro"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p>${copy}</p></div>${journey()}</section>
        <div class="state-bar"><span><strong>${visible.length}</strong> matching sample rows</span><span><strong>${selected.length}</strong> selected</span><span><strong>${formatAmount(selected.reduce((sum, item) => sum + item.amount, 0))}</strong> signed total</span><span>Tags <strong>${state.tagFilters.size ? [...state.tagFilters].map((tag) => `#${tag}`).join(` ${state.tagOperator.toUpperCase()} `) : "Any"}</strong></span><span>Last <strong>${esc(state.lastAction)}</strong></span>${activeFilterCount() ? `<button data-clear-filters>Clear ${activeFilterCount()} filters</button>` : ""}</div>
        ${content}
      </main>
    </div>`;
}

function journey() {
  return `<nav class="glass journey" aria-label="Batch tagging steps">${[[1, "Find"], [2, "Review"], [3, "Apply"]].map(([number, label]) => `<button class="journey-step ${state.step === number ? "active" : ""}" data-step="${number}" ${number > 1 && !state.selected.size ? "disabled" : ""}><span>${number}</span>${label}</button>`).join("")}</nav>`;
}

function facetCount(field, value) {
  return filteredTransactions({ ignore: field }).filter((transaction) => {
    if (field === "account") return value === "All accounts" || transaction.account === value;
    if (field === "group") return transaction.group === value || transaction.splits.some((split) => split.group === value);
    if (field === "status") return transaction.status === value;
    if (field === "tags") return hasTag(transaction, value);
    return true;
  }).length;
}

function facetButton(field, value, label, total, active, content = esc(label)) {
  const matching = facetCount(field, value);
  return `<button class="facet ${active ? "active" : ""}" data-facet="${field}" data-value="${esc(value)}" aria-label="${esc(label)} ${matching} of ${total.toLocaleString("en-GB")}" aria-pressed="${active}"><span>${content}</span><small><strong>${matching}</strong> of ${total.toLocaleString("en-GB")}</small></button>`;
}

function facetRail() {
  const popularTags = Object.entries(tagTotals);
  return `<aside class="glass floating-rail" aria-label="Accounts and transaction filters">
    <div class="rail-scroll">
      <section class="rail-section"><div class="rail-heading"><strong>Account</strong><span>One active</span></div>${accounts.map((account) => facetButton("account", account.name, account.name, account.total, state.account === account.name, `<span class="account-name">${esc(account.name)}</span><span class="account-balance ${account.balance < 0 ? "negative" : ""}">${formatAmount(account.balance)}</span>`)).join("")}</section>
      <section class="rail-section"><div class="rail-heading"><strong>Category groups</strong><span>Matches of total</span></div>${Object.entries(groupTotals).map(([group, total]) => facetButton("group", group, group, total, state.group === group)).join("")}</section>
      <section class="rail-section"><div class="rail-heading"><strong>Status</strong><span>Matches of total</span></div>${Object.entries(statusTotals).map(([status, total]) => facetButton("status", status, status, total, state.status === status, `${statusMarkup(status, true)}`)).join("")}</section>
      <section class="rail-section"><div class="rail-heading"><strong>Tags</strong><span>Multi-select</span></div><div class="tag-operator"><button data-tag-operator="and" class="${state.tagOperator === "and" ? "active" : ""}">Match all</button><button data-tag-operator="or" class="${state.tagOperator === "or" ? "active" : ""}">Match any</button></div>${popularTags.map(([tag, total]) => facetButton("tags", tag, tag, total, state.tagFilters.has(tag), `<span class="tag">#${esc(tag)}</span>`)).join("")}</section>
    </div>
  </aside>`;
}

function searchControls(extra = "") {
  return `<div class="glass search-controls"><label class="search-box"><span>⌕</span><input type="search" data-query value="${esc(state.query)}" placeholder="Search payee, account, category, memo or tag" /></label>${extra}</div>`;
}

function renderRecentWindow() {
  const content = state.step === 1 ? recentFind() : decisionStage();
  return shell(content, "A · Rolling recent window", "Start with what just happened.", "A bounded window keeps the first load small and calm. Older history is an explicit expansion, not an invisible omission.");
}

function recentFind() {
  const visible = filteredTransactions();
  const scopeControl = `<div class="scope-segment" aria-label="Recent date window"><button data-window="90" class="${state.windowDays === "90" ? "active" : ""}">Recent 90 days</button><button data-window="all" class="${state.windowDays === "all" ? "active" : ""}">Include all history</button></div>`;
  return `${searchControls(scopeControl)}<div class="results-inspector"><section class="content-panel activity-panel"><div class="scope-explainer"><div><p class="eyebrow">Current scope</p><h2>${state.windowDays === "all" ? "All loaded history" : `Last ${state.windowDays} days`}</h2><p>${visible.length} matching sample rows · approximately ${state.windowDays === "30" ? "312" : state.windowDays === "90" ? "728" : state.windowDays === "365" ? "1,846" : "2,418"} transactions in the real budget scope.</p></div>${state.windowDays !== "all" ? '<button class="secondary-button" data-window="all">Include older history</button>' : ""}</div><div class="activity-list">${visible.map(activityRow).join("")}</div>${visible.length ? "" : emptyState()}</section>${inspector()}</div>${batchBar("Review recent selection")}`;
}

function activityRow(transaction) {
  const selected = state.selected.has(transaction.id);
  return `<article class="activity-row ${selected ? "selected" : ""} ${state.inspected === transaction.id ? "focused" : ""}"><input type="checkbox" data-select="${transaction.id}" aria-label="Select ${esc(transaction.payee)}" ${selected ? "checked" : ""}/><div class="row-focus" data-inspect="${transaction.id}" role="button" tabindex="0"><span class="date mono">${transaction.date}</span><span class="payee"><strong>${esc(transaction.payee)}</strong><small>${esc(transaction.memo)}</small></span><span class="category">${splitCategoryMarkup(transaction)}</span><span class="account">${esc(transaction.account)}</span><span class="tag-list">${tagMarkup(transaction)}</span>${statusMarkup(transaction.status)}<span class="amount ${transaction.amount > 0 ? "positive" : ""}">${formatAmount(transaction.amount)}</span></div></article>`;
}

function renderAccountRegister() {
  const account = accounts.find((item) => item.name === state.account) ?? accounts[1];
  const content = state.step === 1 ? accountFind(account) : decisionStage();
  return shell(content, "B · Complete active-account register", "Open one account. See its whole register.", "The selected account owns the context. Search and facets narrow its complete register without changing accounts or hiding the history boundary.");
}

function accountFind(account) {
  const visible = filteredTransactions();
  const yearControl = `<label class="year-select"><span>Register year</span><select data-account-year><option value="all" ${state.accountYear === "all" ? "selected" : ""}>All years</option><option value="2026" ${state.accountYear === "2026" ? "selected" : ""}>2026</option><option value="2025" ${state.accountYear === "2025" ? "selected" : ""}>2025</option><option value="2024" ${state.accountYear === "2024" ? "selected" : ""}>2024</option></select></label>`;
  return `<section class="content-panel account-summary"><div><p class="eyebrow">Active account</p><h2>${esc(account.name)}</h2><span>${account.total.toLocaleString("en-GB")} transactions across the complete register</span></div><div><small>Cleared balance</small><strong class="amount ${account.balance < 0 ? "negative" : ""}">${formatAmount(account.balance)}</strong></div></section>${searchControls(yearControl)}<div class="results-inspector"><section class="content-panel register-panel"><div class="register-head"><span>${visible.length} matching sample rows</span><button class="quiet-button" data-select-visible>${visible.length && visible.every((item) => state.selected.has(item.id)) ? "Clear matching" : "Select matching"}</button></div><div class="table-scroll"><table class="dense-table"><thead><tr><th></th><th>Date</th><th>Payee</th><th>Category / split categories</th><th>Memo without tags</th><th>Tags</th><th>Status</th><th>Amount</th></tr></thead><tbody>${visible.map(tableRow).join("")}</tbody></table></div>${visible.length ? "" : emptyState()}</section>${inspector()}</div>${batchBar("Review account selection")}`;
}

function tableRow(transaction) {
  const selected = state.selected.has(transaction.id);
  return `<tr class="${selected ? "selected" : ""} ${state.inspected === transaction.id ? "focused" : ""}"><td><input type="checkbox" data-select="${transaction.id}" aria-label="Select ${esc(transaction.payee)}" ${selected ? "checked" : ""}/></td><td class="mono">${transaction.date}</td><td><button data-inspect="${transaction.id}"><strong>${esc(transaction.payee)}</strong>${transaction.splits.length ? `<small>${transaction.splits.length} splits · parent only</small>` : ""}</button></td><td>${splitCategoryMarkup(transaction)}</td><td class="memo-cell">${esc(transaction.memo)}</td><td><div class="tag-list">${tagMarkup(transaction)}</div></td><td>${statusMarkup(transaction.status)}</td><td class="amount ${transaction.amount > 0 ? "positive" : ""}">${formatAmount(transaction.amount)}</td></tr>`;
}

function renderEntireHistory() {
  const content = state.step === 1 ? historyFind() : decisionStage();
  return shell(content, "C · Entire history navigator", "Search the whole budget through time.", "A virtualised history keeps the global search honest: the time navigator shows where you are, how much is loaded, and what remains outside the rendered window.");
}

function historyFind() {
  const visible = filteredTransactions();
  const years = ["2026", "2025", "2024", "2023", "Earlier", "all"];
  return `${searchControls(`<div class="history-status"><strong>${visible.length}</strong><span>rendered of 2,418</span></div>`)}<div class="history-grid"><nav class="glass time-rail" aria-label="History position"><p class="eyebrow">Jump through time</p>${years.map((year) => `<button data-history-anchor="${year}" class="${state.historyAnchor === year ? "active" : ""}"><span>${year === "all" ? "All years" : year}</span><small>${year === "2026" ? "1,104" : year === "2025" ? "688" : year === "2024" ? "402" : year === "2023" ? "157" : year === "Earlier" ? "67" : "2,418"}</small></button>`).join("")}<div class="virtual-note"><strong>Virtual window</strong><span>Only rows near this time position would be mounted. Search still covers all 2,418 transactions.</span></div></nav><section class="content-panel virtual-panel"><div class="register-head"><span>Showing ${visible.length} sample rows around ${state.historyAnchor === "all" ? "all years" : state.historyAnchor}</span><button class="quiet-button" data-select-visible>${visible.length && visible.every((item) => state.selected.has(item.id)) ? "Clear matching" : "Select matching"}</button></div><div class="virtual-results">${visible.map(activityRow).join("")}</div>${visible.length ? "" : emptyState()}<div class="virtual-sentinel"><span></span><strong>Older rows load as the viewport approaches</strong><small>Position 1–${visible.length} of 2,418</small></div></section>${inspector()}</div>${batchBar("Review history selection")}`;
}

function inspector() {
  const transaction = transactions.find((item) => item.id === state.inspected) ?? filteredTransactions()[0];
  if (!transaction) return '<aside class="inspector"><div class="empty-state"><strong>No focused transaction</strong><span>Widen the current filters.</span></div></aside>';
  const focusTag = state.focusTag || tagsFor(transaction)[0] || normalizeTag(state.tagToApply);
  return `<aside class="inspector"><div class="glass inspector-tabs"><button data-inspector-tab="parent" class="${state.inspectorTab === "parent" ? "active" : ""}">Parent</button><button data-inspector-tab="tag" class="${state.inspectorTab === "tag" ? "active" : ""}">Tag</button></div>${state.inspectorTab === "parent" ? parentInspector(transaction) : tagInspector(focusTag)}</aside>`;
}

function parentInspector(transaction) {
  return `<div class="inspector-content"><div class="detail-head"><div><p class="eyebrow">Focused parent</p><h2>${esc(transaction.payee)}</h2></div>${statusMarkup(transaction.status, true)}</div><dl><div><dt>Account</dt><dd>${esc(transaction.account)}</dd></div><div><dt>Category</dt><dd>${splitCategoryMarkup(transaction)}</dd></div><div><dt>Amount</dt><dd class="amount ${transaction.amount > 0 ? "positive" : ""}">${formatAmount(transaction.amount)}</dd></div><div class="memo-detail"><dt>Memo without tags</dt><dd>${esc(transaction.memo)}</dd></div><div><dt>Tags in memo</dt><dd class="tag-list">${tagMarkup(transaction)}</dd></div></dl>${transaction.splits.length ? `<div class="split-context"><strong>${transaction.splits.length} split lines · context only</strong>${transaction.splits.map((split) => `<div><span><strong>${esc(split.group)} › ${esc(split.category)}</strong><small>${esc(split.memo)}${split.owedBy ? ` · owed by ${esc(split.owedBy)}` : ""}</small></span><span class="amount">${formatAmount(split.amount)}</span></div>`).join("")}<p>Tags apply to the full ${formatAmount(transaction.amount)} parent. Split memos remain untouched.</p></div>` : ""}<button class="${state.selected.has(transaction.id) ? "secondary-button" : "primary-button"}" data-select="${transaction.id}">${state.selected.has(transaction.id) ? "Remove from batch" : "Add parent to batch"}</button></div>`;
}

function tagInspector(tag) {
  const matches = transactions.filter((item) => hasTag(item, tag));
  const inflows = matches.filter((item) => item.amount > 0);
  const outflows = matches.filter((item) => item.amount < 0);
  const totalIn = inflows.reduce((sum, item) => sum + item.amount, 0);
  const totalOut = Math.abs(outflows.reduce((sum, item) => sum + item.amount, 0));
  const clearedMovement = matches.filter((item) => item.status !== "uncleared").reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const unclearedMovement = matches.filter((item) => item.status === "uncleared").reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const expected = matches.flatMap((item) => item.splits).filter((split) => split.owedBy).reduce((sum, split) => sum + Math.abs(split.amount), 0);
  const receivedCleared = inflows.filter((item) => item.status !== "uncleared").reduce((sum, item) => sum + item.amount, 0);
  const pending = inflows.filter((item) => item.status === "uncleared").reduce((sum, item) => sum + item.amount, 0);
  return `<div class="inspector-content tag-inspector"><div class="tag-focus-head"><p class="eyebrow">Tag usage across all accounts</p><h2>#${esc(tag)}</h2><span>${matches.length} transactions · independent of the current account and history window</span></div><div class="tag-metrics"><div><small>Total in</small><strong class="positive">${formatAmount(totalIn)}</strong></div><div><small>Total out</small><strong>${formatAmount(totalOut)}</strong></div><div><small>Net</small><strong>${formatAmount(totalIn - totalOut)}</strong></div><div><small>Average spend</small><strong>${formatAmount(outflows.length ? totalOut / outflows.length : 0)}</strong></div><div><small>Cleared + reconciled</small><strong>${formatAmount(clearedMovement)}</strong></div><div><small>Uncleared movement</small><strong>${formatAmount(unclearedMovement)}</strong></div></div>${expected ? `<div class="reimbursement-card"><div><span>Expected reimbursements</span><strong>${formatAmount(expected)}</strong></div><div><span>Received and cleared</span><strong>${formatAmount(receivedCleared)}</strong></div><div><span>Pending</span><strong>${formatAmount(pending)}</strong></div><div class="outstanding"><span>Still due until cleared</span><strong>${formatAmount(Math.max(0, expected - receivedCleared))}</strong></div></div>` : ""}<div class="tag-usage-list">${matches.map((item) => `<button data-inspect="${item.id}" data-parent-tab><span><strong>${esc(item.payee)}</strong><small>${item.date} · ${esc(item.memo)}</small></span>${statusMarkup(item.status)}<span class="amount ${item.amount > 0 ? "positive" : ""}">${formatAmount(item.amount)}</span></button>`).join("")}</div></div>`;
}

function batchBar(label) {
  const selected = selectedTransactions();
  return `<section class="glass batch-bar"><div><strong>${selected.length} selected</strong><span>${selected.filter((item) => item.splits.length).length} with split context · ${formatAmount(selected.reduce((sum, item) => sum + item.amount, 0))}</span></div><label><span>Tag to apply</span><input data-tag-input value="${esc(state.tagToApply)}"/></label><button class="primary-button" data-step="2" ${selected.length ? "" : "disabled"}>${label} →</button></section>`;
}

function decisionStage() { return state.step === 2 ? reviewStage() : applyStage(); }

function reviewStage() {
  const selected = selectedTransactions();
  return `<section class="content-panel decision-stage"><div class="decision-head"><div><p class="eyebrow">Step 2 of 3 · Review</p><h2>Review ${selected.length} parent transactions.</h2><p>The Find state stays intact. Non-tag memo text is visually separated and preserved; split lines are context only.</p></div><label><span>Tag to apply</span><input data-tag-input value="${esc(state.tagToApply)}"/></label></div><div class="review-list">${selected.map((item) => `<article><span><strong>${esc(item.payee)}</strong><small>${item.date} · ${esc(item.account)}</small></span><span>${splitCategoryMarkup(item)}</span><span class="memo-cell">${esc(item.memo)}</span><span class="tag-list">${tagMarkup(item)}</span>${statusMarkup(item.status)}<span class="amount ${item.amount > 0 ? "positive" : ""}">${formatAmount(item.amount)}</span><button data-select="${item.id}" aria-label="Remove ${esc(item.payee)}">×</button></article>`).join("")}</div><footer><button class="secondary-button" data-step="1">← Back to find</button><button class="primary-button" data-step="3" ${state.tagToApply.trim() ? "" : "disabled"}>Preview impact →</button></footer></section>`;
}

function applyStage() {
  const selected = selectedTransactions();
  const tag = normalizeTag(state.tagToApply);
  const changing = selected.filter((item) => !hasTag(item, tag));
  return `<section class="content-panel decision-stage"><div class="decision-head"><div><p class="eyebrow">Step 3 of 3 · Apply</p><h2>Apply #${esc(tag)}?</h2><p>Only parent memo tag tokens change. Human memo text and every split memo remain untouched.</p></div></div><div class="impact-grid"><div><strong>${changing.length}</strong><span>will change</span></div><div><strong>${selected.length - changing.length}</strong><span>already tagged</span></div><div><strong>${selected.filter((item) => item.splits.length).length}</strong><span>parents with splits</span></div><div><strong>${formatAmount(selected.reduce((sum, item) => sum + item.amount, 0))}</strong><span>signed parent total</span></div></div><div class="impact-list">${selected.map((item) => `<div><span><strong>${esc(item.payee)}</strong><small>${esc(item.memo)}${item.splits.length ? ` · ${item.splits.length} split lines` : ""}</small></span><span class="tag-list">${tagMarkup(item, { interactive: false })}</span><span class="impact-result ${hasTag(item, tag) ? "muted" : ""}">${hasTag(item, tag) ? "Already tagged" : `Add #${esc(tag)}`}</span><span class="amount ${item.amount > 0 ? "positive" : ""}">${formatAmount(item.amount)}</span></div>`).join("")}</div><footer><button class="secondary-button" data-step="2">← Back to review</button><button class="primary-button" data-apply ${changing.length ? "" : "disabled"}>Apply to ${changing.length} parents</button></footer></section>`;
}

function emptyState() { return '<div class="empty-state"><strong>No transactions match.</strong><span>Clear or loosen a facet to widen this view.</span></div>'; }

function clearFilters() {
  state.query = "";
  state.account = variants[state.variant].defaultAccount;
  state.group = "All groups";
  state.status = "all";
  state.tagFilters.clear();
}

function bindControls() {
  document.querySelectorAll("[data-query]").forEach((input) => input.addEventListener("input", () => { state.query = input.value; render(true); }));
  document.querySelectorAll("[data-facet]").forEach((button) => button.addEventListener("click", () => {
    const { facet, value } = button.dataset;
    if (facet === "account") state.account = value;
    if (facet === "group") state.group = state.group === value ? "All groups" : value;
    if (facet === "status") state.status = state.status === value ? "all" : value;
    if (facet === "tags") state.tagFilters.has(value) ? state.tagFilters.delete(value) : state.tagFilters.add(value);
    render();
  }));
  document.querySelectorAll("[data-tag-filter]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); const tag = button.dataset.tagFilter; state.tagFilters.has(tag) ? state.tagFilters.delete(tag) : state.tagFilters.add(tag); state.focusTag = tag; render(); }));
  document.querySelectorAll("[data-tag-operator]").forEach((button) => button.addEventListener("click", () => { state.tagOperator = button.dataset.tagOperator; render(); }));
  document.querySelectorAll("[data-clear-filters]").forEach((button) => button.addEventListener("click", () => { clearFilters(); render(); }));
  document.querySelectorAll("[data-select]").forEach((control) => control.addEventListener("click", (event) => { event.stopPropagation(); const id = control.dataset.select; state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id); if (!state.selected.size) state.step = 1; render(); }));
  document.querySelectorAll("[data-select-visible]").forEach((button) => button.addEventListener("click", () => { const visible = filteredTransactions(); const all = visible.length && visible.every((item) => state.selected.has(item.id)); visible.forEach((item) => all ? state.selected.delete(item.id) : state.selected.add(item.id)); render(); }));
  document.querySelectorAll("[data-inspect]").forEach((button) => button.addEventListener("click", () => { state.inspected = button.dataset.inspect; if (button.hasAttribute("data-parent-tab")) state.inspectorTab = "parent"; render(); }));
  document.querySelectorAll("[data-inspect][role='button']").forEach((row) => row.addEventListener("keydown", (event) => { if (!["Enter", " "].includes(event.key)) return; event.preventDefault(); state.inspected = row.dataset.inspect; render(); }));
  document.querySelectorAll("[data-inspector-tab]").forEach((button) => button.addEventListener("click", () => { state.inspectorTab = button.dataset.inspectorTab; if (state.inspectorTab === "tag") { const transaction = transactions.find((item) => item.id === state.inspected); state.focusTag = [...state.tagFilters][0] || tagsFor(transaction)[0] || normalizeTag(state.tagToApply); } render(); }));
  document.querySelectorAll("[data-window]").forEach((button) => button.addEventListener("click", () => { state.windowDays = button.dataset.window; render(); }));
  document.querySelectorAll("[data-account-year]").forEach((select) => select.addEventListener("change", () => { state.accountYear = select.value; render(); }));
  document.querySelectorAll("[data-history-anchor]").forEach((button) => button.addEventListener("click", () => { state.historyAnchor = button.dataset.historyAnchor; render(); }));
  document.querySelectorAll("[data-transparency]").forEach((button) => button.addEventListener("click", () => { state.reduceTransparency = !state.reduceTransparency; render(); }));
  document.querySelectorAll("[data-tag-input]").forEach((input) => input.addEventListener("input", () => { state.tagToApply = input.value.replace(/^#/, ""); }));
  document.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => { const next = Number(button.dataset.step); if (next > 1 && !state.selected.size) return; if (next === 3 && !state.tagToApply.trim()) return; state.step = next; render(); }));
  document.querySelector("[data-apply]")?.addEventListener("click", openApplyPreview);
}

function render(preserveSearchFocus = false) {
  document.body.classList.toggle("reduce-transparency", state.reduceTransparency);
  app.innerHTML = variants[state.variant].render();
  bindControls();
  renderSwitcher();
  if (preserveSearchFocus) { const input = document.querySelector("[data-query]"); input?.focus(); input?.setSelectionRange(state.query.length, state.query.length); }
}

function openApplyPreview() {
  const selected = selectedTransactions();
  const tag = normalizeTag(state.tagToApply);
  const changing = selected.filter((item) => !hasTag(item, tag));
  dialogContent.innerHTML = `<div class="dialog-head"><p class="eyebrow">Simulated write confirmation</p><h2 id="preview-title">Apply #${esc(tag)} to ${changing.length} parents?</h2><p>Human memo text is preserved exactly. Split memos are not changed.</p></div><div class="dialog-body"><div class="impact-list">${selected.map((item) => `<div><span><strong>${esc(item.payee)}</strong><small>${esc(item.memo)}</small></span><span class="tag-list">${tagMarkup(item, { interactive: false })}</span><span class="impact-result ${hasTag(item, tag) ? "muted" : ""}">${hasTag(item, tag) ? "Already tagged" : `Add #${esc(tag)}`}</span><span class="amount">${formatAmount(item.amount)}</span></div>`).join("")}</div></div><div class="dialog-actions"><button class="secondary-button" data-cancel>Cancel</button><button class="primary-button" data-confirm ${changing.length ? "" : "disabled"}>Apply to ${changing.length}</button></div>`;
  dialogContent.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
  dialogContent.querySelector("[data-confirm]").addEventListener("click", () => simulateApply(changing, tag));
  dialog.showModal();
}

function simulateApply(changing, tag) {
  state.undoSnapshot = new Map(state.appliedTags);
  changing.forEach((transaction) => state.appliedTags.set(transaction.id, [...tagsFor(transaction), tag]));
  dialogContent.innerHTML = `<div class="dialog-head"><p class="eyebrow">Simulated write</p><h2 id="preview-title">Updating parent memos…</h2><p>Reconciling ${changing.length} responses before completion.</p></div><div class="dialog-body"><div class="progress-track"><span></span></div><p class="muted-copy">This prototype never contacts YNAB.</p></div>`;
  setTimeout(() => {
    state.lastAction = `Applied #${tag} to ${changing.length} parents`;
    dialog.close();
    toast.innerHTML = `<span>${esc(state.lastAction)}. Undo exists only in this tab.</span><button data-undo>Undo</button>`;
    toast.classList.add("visible");
    toast.querySelector("[data-undo]").addEventListener("click", () => { state.appliedTags = new Map(state.undoSnapshot); state.lastAction = "Undid previous batch"; toast.classList.remove("visible"); render(); });
    render();
  }, 720);
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
  state.account = variants[state.variant].defaultAccount;
  state.step = 1;
  state.query = "";
  state.group = "All groups";
  state.status = "all";
  state.tagFilters.clear();
  if (state.variant === "A") {
    state.selected = new Set(["t19", "t21", "t23", "t24"]);
    state.tagToApply = "Cornwall-2026";
    state.focusTag = "Cornwall-2026";
    state.inspected = "t19";
  }
  if (state.variant === "B") {
    state.selected = new Set(["t25", "t26"]);
    state.tagToApply = "Dinner-Fox-2026-08-26";
    state.focusTag = "Dinner-Fox-2026-08-26";
    state.inspected = "t25";
  }
  if (state.variant === "C") {
    state.selected = new Set(["t19", "t21", "t23", "t24", "t27"]);
    state.tagToApply = "Cornwall-2026";
    state.focusTag = "Cornwall-2026";
    state.inspected = "t19";
  }
  const url = new URL(location.href);
  url.searchParams.set("variant", state.variant);
  history.replaceState({}, "", url);
  render();
}

window.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key) || event.target.matches("input, textarea, select, [contenteditable='true']")) return;
  cycleVariant(event.key === "ArrowLeft" ? -1 : 1);
});
window.addEventListener("popstate", () => { state.variant = getVariant(); state.account = variants[state.variant].defaultAccount; render(); });
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
render();
