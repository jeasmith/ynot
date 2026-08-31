// THROWAWAY PROTOTYPE: three variants of parent-only transaction selection,
// switchable with ?variant=A|B|C on one route.

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  signDisplay: "auto",
});

const originalTransactions = [
  {
    id: "t1",
    date: "27 Aug",
    payee: "Tesco",
    category: "Groceries",
    amount: -72.43,
    memo: "Weekly shop",
    tags: ["Household"],
    splits: [
      { label: "Groceries", memo: "Food", amount: -55.18 },
      { label: "Household", memo: "Cleaning supplies", amount: -17.25 },
    ],
  },
  {
    id: "t2",
    date: "25 Aug",
    payee: "Acme Ltd",
    category: "Ready to Assign",
    amount: 3240,
    memo: "Salary",
    tags: [],
    splits: [],
  },
  {
    id: "t3",
    date: "23 Aug",
    payee: "IKEA",
    category: "Home improvement",
    amount: -184.99,
    memo: "Shelving and fixings",
    tags: ["Home-Repair"],
    splits: [],
  },
  {
    id: "t4",
    date: "22 Aug",
    payee: "Trainline",
    category: "Travel",
    amount: -86.4,
    memo: "Client visit",
    tags: ["Work"],
    splits: [],
  },
  {
    id: "t5",
    date: "20 Aug",
    payee: "IKEA refund",
    category: "Home improvement",
    amount: 42.5,
    memo: "Returned brackets",
    tags: ["Home-Repair"],
    splits: [],
  },
  {
    id: "t6",
    date: "18 Aug",
    payee: "The Fox & Hounds",
    category: "Dining out",
    amount: -64.2,
    memo: "Dinner with Alex",
    tags: [],
    splits: [
      { label: "Dining out", memo: "My share", amount: -32.1 },
      { label: "Reimbursements", memo: "Alex's share", amount: -32.1 },
    ],
  },
  {
    id: "t7",
    date: "15 Aug",
    payee: "Octopus Energy",
    category: "Utilities",
    amount: -118.74,
    memo: "Monthly bill",
    tags: ["Household"],
    splits: [],
  },
  {
    id: "t8",
    date: "14 Aug",
    payee: "Transfer to savings",
    category: "Transfer",
    amount: -500,
    memo: "Emergency fund",
    tags: [],
    splits: [],
  },
  {
    id: "t9",
    date: "12 Aug",
    payee: "Boots Pharmacy",
    category: "Health",
    amount: -23.75,
    memo: "Prescription",
    tags: [],
    splits: [],
  },
];

const state = {
  transactions: structuredClone(originalTransactions),
  selected: new Set(["t1", "t3"]),
  expanded: new Set(["t1"]),
  query: "",
  scope: "all",
  tag: "Home-Repair",
  variant: getVariant(),
  flowStep: 1,
  pendingOperation: null,
  lastAction: "None — refresh resets all data",
  undoSnapshot: null,
};

const variants = {
  A: { name: "Register + action dock", render: renderRegister },
  B: { name: "Selection cart", render: renderWorkbench },
  C: { name: "Guided batch flow", render: renderGuidedFlow },
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

function formatAmount(amount) {
  return money.format(amount);
}

function filteredTransactions() {
  const query = state.query.trim().toLowerCase();
  return state.transactions.filter((transaction) => {
    const matchesScope =
      state.scope === "all" ||
      (state.scope === "outflows" && transaction.amount < 0) ||
      (state.scope === "inflows" && transaction.amount > 0) ||
      (state.scope === "untagged" && transaction.tags.length === 0);
    const haystack = [
      transaction.payee,
      transaction.category,
      transaction.memo,
      ...transaction.tags,
      ...transaction.splits.flatMap((split) => [split.label, split.memo]),
    ]
      .join(" ")
      .toLowerCase();
    return matchesScope && (!query || haystack.includes(query));
  });
}

function selectedTransactions() {
  return state.transactions.filter((transaction) => state.selected.has(transaction.id));
}

function tagMarkup(tags) {
  if (!tags.length) return '<span class="tag empty">No tags</span>';
  return tags.map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shell(content, title, lede) {
  const visible = filteredTransactions();
  return `
    <div class="prototype-banner">
      <strong>Throwaway prototype · issue #4</strong>
      <span>In-memory sample data · no YNAB calls</span>
    </div>
    <header class="app-header">
      <div class="brand">
        <div class="brand-mark">Y</div>
        <div class="brand-copy"><strong>Ynot</strong><span>One budget · Personal</span></div>
      </div>
      <div class="header-status"><span class="status-dot"></span> Connected for this tab · locks in 12:41</div>
    </header>
    <main class="page-shell">
      <section class="page-intro">
        <div>
          <p class="eyebrow">${escapeHtml(variants[state.variant].name)}</p>
          <h1>${title}</h1>
          <p class="lede">${lede}</p>
        </div>
      </section>
      <ul class="state-strip" aria-label="Current prototype state">
        <li><strong>${visible.length}</strong> visible</li>
        <li><strong>${state.selected.size}</strong> selected</li>
        <li><strong>${selectedTransactions().filter((item) => item.splits.length).length}</strong> selected with splits</li>
        <li>Tag <strong>#${escapeHtml(state.tag || "—")}</strong></li>
        <li>Last action <strong>${escapeHtml(state.lastAction)}</strong></li>
      </ul>
      ${content}
    </main>
  `;
}

function render() {
  app.innerHTML = variants[state.variant].render();
  renderSwitcher();
  bindCommonControls();
  if (state.variant === "A") bindRegisterControls();
  if (state.variant === "B") bindWorkbenchControls();
  if (state.variant === "C") bindFlowControls();
}

function filterToolbar() {
  return `
    <div class="toolbar">
      <label class="search-field">
        <span aria-hidden="true">⌕</span>
        <input type="search" data-query placeholder="Search payee, memo, category or split context" value="${escapeHtml(state.query)}" />
      </label>
      <select class="control-select" data-scope aria-label="Transaction scope">
        ${[
          ["all", "All transactions"],
          ["outflows", "Outflows"],
          ["inflows", "Inflows & refunds"],
          ["untagged", "Untagged"],
        ]
          .map(([value, label]) => `<option value="${value}" ${state.scope === value ? "selected" : ""}>${label}</option>`)
          .join("")}
      </select>
    </div>
  `;
}

function renderRegister() {
  const transactions = filteredTransactions();
  const rows = transactions
    .map((transaction) => {
      const selected = state.selected.has(transaction.id);
      const expanded = state.expanded.has(transaction.id);
      return `
        <tr class="transaction-row ${selected ? "selected" : ""}" data-row="${transaction.id}">
          <td><input class="checkbox" type="checkbox" data-select="${transaction.id}" aria-label="Select ${escapeHtml(transaction.payee)}" ${selected ? "checked" : ""} /></td>
          <td>${transaction.date}</td>
          <td>
            <span class="merchant">${escapeHtml(transaction.payee)}</span>
            <span class="subline">${escapeHtml(transaction.memo)} · ${escapeHtml(transaction.category)}</span>
            ${transaction.splits.length ? `<button class="split-toggle" data-expand="${transaction.id}">${expanded ? "Hide" : "Show"} ${transaction.splits.length} split lines</button>` : ""}
          </td>
          <td><div class="tag-list">${tagMarkup(transaction.tags)}</div></td>
          <td class="amount ${transaction.amount > 0 ? "inflow" : ""}">${formatAmount(transaction.amount)}</td>
        </tr>
        ${expanded ? splitDetailRow(transaction) : ""}
      `;
    })
    .join("");

  const selected = selectedTransactions();
  const allVisibleSelected = transactions.length > 0 && transactions.every((item) => state.selected.has(item.id));
  return shell(
    `
      <section class="panel">
        ${filterToolbar()}
        <div class="toolbar">
          <button class="button secondary small" data-select-visible>${allVisibleSelected ? "Clear visible" : "Select all visible"}</button>
          <span class="subline">Selection persists while filters change.</span>
        </div>
        ${transactions.length ? `
          <table class="transaction-table">
            <thead><tr><th></th><th>Date</th><th>Transaction</th><th>Tags</th><th style="text-align:right">Amount</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        ` : '<div class="empty-state">No transactions match these filters.</div>'}
      </section>
      ${selected.length ? `
        <section class="action-dock" aria-label="Bulk tag actions">
          <div class="dock-count">${selected.length} selected</div>
          <input class="tag-field" data-tag-input value="${escapeHtml(state.tag)}" aria-label="Tag name" />
          <button class="button" data-preview="apply">Preview apply</button>
          <button class="button secondary" data-preview="remove">Preview remove</button>
        </section>
      ` : ""}
    `,
    "Select in the register. Act from one dock.",
    "A familiar dense ledger keeps scanning and selection together. Split lines expand beneath their parent as read-only context; the checkbox always selects the whole transaction.",
  );
}

function splitDetailRow(transaction) {
  return `
    <tr class="split-detail">
      <td colspan="5">
        <div class="split-box">
          <span class="context-note">Split lines are context only. Any tag applies to the full ${formatAmount(transaction.amount)} parent.</span>
          ${transaction.splits
            .map(
              (split) => `
                <div class="split-line">
                  <span>${escapeHtml(split.label)} · ${escapeHtml(split.memo)}</span>
                  <strong>${formatAmount(split.amount)}</strong>
                </div>`,
            )
            .join("")}
        </div>
      </td>
    </tr>`;
}

function renderWorkbench() {
  const candidates = filteredTransactions();
  const selected = selectedTransactions();
  const selectedTotal = selected.reduce((sum, item) => sum + item.amount, 0);
  return shell(
    `
      <div class="workbench">
        <section class="panel">
          <div class="workbench-head">
            <h2>Available transactions</h2>
            <p>Build a deliberate batch. Filtering never removes items already placed in the cart.</p>
          </div>
          ${filterToolbar()}
          <div class="candidate-list">
            ${candidates.length ? candidates.map(candidateCard).join("") : '<div class="empty-state">No candidates match.</div>'}
          </div>
        </section>
        <aside class="panel cart-panel">
          <div class="cart-head">
            <h2>Selection cart</h2>
            <p>A separate reviewable batch before any write.</p>
          </div>
          <div class="cart-summary"><span>${selected.length} transactions</span><strong>${formatAmount(selectedTotal)}</strong></div>
          <div class="cart-list">
            ${selected.length ? selected.map(cartItem).join("") : '<div class="cart-empty">Add transactions from the candidate list.</div>'}
          </div>
          <div class="cart-actions">
            <input class="tag-field" data-tag-input value="${escapeHtml(state.tag)}" aria-label="Tag name" />
            <button class="button" data-preview="apply" ${selected.length ? "" : "disabled"}>Review apply</button>
            <button class="button danger" data-preview="remove" ${selected.length ? "" : "disabled"}>Review removal</button>
          </div>
        </aside>
      </div>
    `,
    "Build a batch in a selection cart.",
    "The candidate list answers “what could I include?” while the cart answers “what am I about to change?” On a phone, the cart follows the list as a review section.",
  );
}

function candidateCard(transaction) {
  const selected = state.selected.has(transaction.id);
  return `
    <article class="candidate ${selected ? "is-selected" : ""}">
      <div>
        <span class="merchant">${escapeHtml(transaction.payee)}</span>
        <div class="candidate-meta">
          <span>${transaction.date}</span><span>${escapeHtml(transaction.category)}</span>
          ${transaction.splits.length ? `<span>${transaction.splits.length} splits · parent only</span>` : ""}
        </div>
        <div class="tag-list" style="margin-top:8px">${tagMarkup(transaction.tags)}</div>
      </div>
      <div class="amount ${transaction.amount > 0 ? "inflow" : ""}">${formatAmount(transaction.amount)}</div>
      <button class="button ${selected ? "secondary" : ""} small" data-cart-toggle="${transaction.id}">${selected ? "Remove" : "Add to cart"}</button>
    </article>`;
}

function cartItem(transaction) {
  return `
    <div class="cart-item">
      <div><span class="merchant">${escapeHtml(transaction.payee)}</span><span class="subline">${transaction.date} · ${transaction.splits.length ? `${transaction.splits.length} splits` : transaction.category}</span></div>
      <button class="button ghost small" data-cart-toggle="${transaction.id}" aria-label="Remove ${escapeHtml(transaction.payee)}">Remove</button>
    </div>`;
}

function renderGuidedFlow() {
  const steps = [
    [1, "Find"],
    [2, "Review"],
    [3, "Apply"],
  ];
  const content = state.flowStep === 1 ? flowFind() : state.flowStep === 2 ? flowReview() : flowApply();
  return shell(
    `
      <div class="flow-shell">
        <nav class="panel stepper" aria-label="Batch tagging steps">
          ${steps
            .map(
              ([number, label]) => `
                <button class="step ${state.flowStep === number ? "active" : ""}" data-step="${number}">
                  <span class="step-number">${number}</span>${label}
                </button>`,
            )
            .join("")}
        </nav>
        <section class="panel flow-card">${content}</section>
      </div>
    `,
    "Make one safe decision at a time.",
    "A guided flow trades density for confidence: find the scope, review the exact parents, then inspect the impact before writing. It is naturally linear on a phone.",
  );
}

function flowFind() {
  const transactions = filteredTransactions();
  return `
    <div class="flow-section">
      <p class="eyebrow">Step 1 of 3</p>
      <h2>Which transactions belong in this batch?</h2>
      <p>Choose parent transactions. Split details can help you decide, but they are never selected independently.</p>
      <div class="flow-filters">
        <label class="search-field"><span>⌕</span><input type="search" data-query value="${escapeHtml(state.query)}" placeholder="Search this budget" /></label>
        <select class="control-select" data-scope>
          <option value="all" ${state.scope === "all" ? "selected" : ""}>All transactions</option>
          <option value="outflows" ${state.scope === "outflows" ? "selected" : ""}>Outflows</option>
          <option value="inflows" ${state.scope === "inflows" ? "selected" : ""}>Inflows & refunds</option>
          <option value="untagged" ${state.scope === "untagged" ? "selected" : ""}>Untagged</option>
        </select>
      </div>
      <div class="choice-grid">${transactions.map(choiceCard).join("")}</div>
    </div>
    <footer class="flow-footer">
      <button class="button secondary" data-clear-selection>Clear</button>
      <button class="button" data-step="2" ${state.selected.size ? "" : "disabled"}>Review ${state.selected.size || ""} selected →</button>
    </footer>`;
}

function choiceCard(transaction) {
  const selected = state.selected.has(transaction.id);
  return `
    <button class="choice-card ${selected ? "selected" : ""}" data-flow-toggle="${transaction.id}" aria-pressed="${selected}">
      <span class="choice-indicator">${selected ? "✓" : ""}</span>
      <span>
        <span class="merchant">${escapeHtml(transaction.payee)}</span>
        <span class="subline">${transaction.date} · ${escapeHtml(transaction.category)}${transaction.splits.length ? ` · ${transaction.splits.length} split lines` : ""}</span>
        <span class="tag-list" style="margin-top:8px">${tagMarkup(transaction.tags)}</span>
      </span>
      <span class="amount ${transaction.amount > 0 ? "inflow" : ""}">${formatAmount(transaction.amount)}</span>
    </button>`;
}

function flowReview() {
  const selected = selectedTransactions();
  return `
    <div class="flow-section">
      <p class="eyebrow">Step 2 of 3</p>
      <h2>Review the parent transactions.</h2>
      <p>Removing an item here does not change your filters. Transactions with splits show the full parent amount that the tag will describe.</p>
      <div class="review-list">
        ${selected.length ? selected.map(reviewItem).join("") : '<div class="empty-state">Your batch is empty.</div>'}
      </div>
      <label>
        <span class="merchant">Tag</span>
        <span class="subline" style="margin-bottom:7px">Case-insensitive identity; canonical spelling shown here.</span>
        <input class="tag-field" data-tag-input value="${escapeHtml(state.tag)}" />
      </label>
    </div>
    <footer class="flow-footer">
      <button class="button secondary" data-step="1">← Back</button>
      <button class="button" data-step="3" ${selected.length && state.tag.trim() ? "" : "disabled"}>Preview impact →</button>
    </footer>`;
}

function reviewItem(transaction) {
  return `
    <div class="review-item">
      <div><span class="merchant">${escapeHtml(transaction.payee)}</span><span class="subline">${transaction.splits.length ? `${transaction.splits.length} splits · full parent counts` : transaction.category}</span></div>
      <strong class="amount ${transaction.amount > 0 ? "inflow" : ""}">${formatAmount(transaction.amount)}</strong>
      <button class="button ghost small" data-flow-toggle="${transaction.id}">Remove</button>
    </div>`;
}

function flowApply() {
  const selected = selectedTransactions();
  const normalized = normalizeTag(state.tag);
  const changed = selected.filter((item) => !hasTag(item, normalized));
  const unchanged = selected.length - changed.length;
  const fullAmount = selected.reduce((sum, item) => sum + item.amount, 0);
  return `
    <div class="flow-section">
      <p class="eyebrow">Step 3 of 3</p>
      <h2>Apply #${escapeHtml(normalized || "—")}?</h2>
      <p>This is the last screen before Ynot would write parent memos. No split memo is touched.</p>
      <div class="impact-card">
        <div class="impact-stat"><strong>${changed.length}</strong><span>will change</span></div>
        <div class="impact-stat"><strong>${unchanged}</strong><span>already tagged</span></div>
        <div class="impact-stat"><strong>${formatAmount(fullAmount)}</strong><span>signed parent total</span></div>
      </div>
      <div class="preview-list">${selected.map((item) => previewRow(item, "apply", normalized)).join("")}</div>
    </div>
    <footer class="flow-footer">
      <button class="button secondary" data-step="2">← Back</button>
      <button class="button" data-run-inline="apply" ${changed.length ? "" : "disabled"}>Apply to ${changed.length} parent${changed.length === 1 ? "" : "s"}</button>
    </footer>`;
}

function previewRow(transaction, operation, tag) {
  const alreadyHas = hasTag(transaction, tag);
  const willChange = operation === "apply" ? !alreadyHas : alreadyHas;
  const label = willChange ? (operation === "apply" ? `Add #${tag}` : `Remove #${tag}`) : operation === "apply" ? "Already tagged" : "Tag absent";
  return `
    <div class="preview-row">
      <div>
        <span class="merchant">${escapeHtml(transaction.payee)}</span>
        <span class="subline">${transaction.splits.length ? `${transaction.splits.length} split lines · full parent ${formatAmount(transaction.amount)}` : `${transaction.category} · ${formatAmount(transaction.amount)}`}</span>
      </div>
      <span class="preview-result ${willChange ? "" : "skip"}">${escapeHtml(label)}</span>
    </div>`;
}

function bindCommonControls() {
  document.querySelectorAll("[data-query]").forEach((input) => {
    input.addEventListener("input", (event) => {
      state.query = event.target.value;
      render();
      const next = document.querySelector("[data-query]");
      next?.focus();
      next?.setSelectionRange(state.query.length, state.query.length);
    });
  });

  document.querySelectorAll("[data-scope]").forEach((select) => {
    select.addEventListener("change", (event) => {
      state.scope = event.target.value;
      render();
    });
  });

  document.querySelectorAll("[data-tag-input]").forEach((input) => {
    input.addEventListener("input", (event) => {
      state.tag = event.target.value.replace(/^#/, "");
    });
  });

  document.querySelectorAll("[data-preview]").forEach((button) => {
    button.addEventListener("click", () => openPreview(button.dataset.preview));
  });
}

function bindRegisterControls() {
  document.querySelectorAll("[data-select]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => toggleSelected(checkbox.dataset.select));
  });
  document.querySelectorAll("[data-expand]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.expand;
      state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
      render();
    });
  });
  document.querySelector("[data-select-visible]")?.addEventListener("click", () => {
    const visible = filteredTransactions();
    const allSelected = visible.every((item) => state.selected.has(item.id));
    visible.forEach((item) => (allSelected ? state.selected.delete(item.id) : state.selected.add(item.id)));
    render();
  });
}

function bindWorkbenchControls() {
  document.querySelectorAll("[data-cart-toggle]").forEach((button) => {
    button.addEventListener("click", () => toggleSelected(button.dataset.cartToggle));
  });
}

function bindFlowControls() {
  document.querySelectorAll("[data-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = Number(button.dataset.step);
      if (next === 3 && (!state.selected.size || !state.tag.trim())) return;
      state.flowStep = next;
      render();
    });
  });
  document.querySelectorAll("[data-flow-toggle]").forEach((button) => {
    button.addEventListener("click", () => toggleSelected(button.dataset.flowToggle));
  });
  document.querySelector("[data-clear-selection]")?.addEventListener("click", () => {
    state.selected.clear();
    render();
  });
  document.querySelector("[data-run-inline]")?.addEventListener("click", (event) => openPreview(event.currentTarget.dataset.runInline));
}

function toggleSelected(id) {
  state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
  if (state.flowStep > 1 && state.selected.size === 0) state.flowStep = 1;
  render();
}

function normalizeTag(tag) {
  return tag.trim().replace(/^#/, "").replace(/\s+/g, "-");
}

function hasTag(transaction, tag) {
  return transaction.tags.some((existing) => existing.toLowerCase() === tag.toLowerCase());
}

function openPreview(operation) {
  const tag = normalizeTag(state.tag);
  if (!tag || !state.selected.size) return;
  state.tag = tag;
  state.pendingOperation = operation;
  const selected = selectedTransactions();
  const changing = selected.filter((item) => (operation === "apply" ? !hasTag(item, tag) : hasTag(item, tag)));
  const verb = operation === "apply" ? "Apply" : "Remove";
  dialogContent.innerHTML = `
    <div class="dialog-head">
      <p class="eyebrow">Impact preview</p>
      <h2 id="preview-title">${verb} #${escapeHtml(tag)}?</h2>
      <p>${changing.length} of ${selected.length} selected parent transactions will change. Split memos remain untouched.</p>
    </div>
    <div class="dialog-body">
      <div class="preview-list">${selected.map((item) => previewRow(item, operation, tag)).join("")}</div>
    </div>
    <div class="dialog-actions">
      <button class="button secondary" data-dialog-cancel>Cancel</button>
      <button class="button ${operation === "remove" ? "danger" : ""}" data-dialog-confirm ${changing.length ? "" : "disabled"}>${verb} on ${changing.length}</button>
    </div>`;
  dialogContent.querySelector("[data-dialog-cancel]").addEventListener("click", () => dialog.close());
  dialogContent.querySelector("[data-dialog-confirm]").addEventListener("click", () => runOperation(operation, tag, changing));
  dialog.showModal();
}

function runOperation(operation, tag, changing) {
  state.undoSnapshot = structuredClone(state.transactions);
  let completed = 0;
  dialogContent.innerHTML = `
    <div class="dialog-head">
      <p class="eyebrow">Simulated write</p>
      <h2 id="preview-title">Updating parent memos…</h2>
      <p data-progress-copy>0 of ${changing.length} confirmed</p>
    </div>
    <div class="dialog-body">
      <div class="progress-track"><div class="progress-bar" data-progress-bar style="width:0%"></div></div>
      <p class="subline">In production, each result would be reconciled before being marked complete.</p>
    </div>`;

  const finish = () => {
    state.transactions = state.transactions.map((transaction) => {
      if (!changing.some((item) => item.id === transaction.id)) return transaction;
      const tags = operation === "apply"
        ? [...transaction.tags, tag]
        : transaction.tags.filter((existing) => existing.toLowerCase() !== tag.toLowerCase());
      return { ...transaction, tags };
    });
    state.lastAction = `${operation === "apply" ? "Applied" : "Removed"} #${tag} on ${changing.length}`;
    state.pendingOperation = null;
    window.setTimeout(() => {
      dialog.close();
      showUndo(`${state.lastAction}. Undo is available only in this tab.`);
      render();
    }, 350);
  };

  if (!changing.length) return finish();
  const timer = window.setInterval(() => {
    completed += 1;
    const percentage = Math.round((completed / changing.length) * 100);
    dialogContent.querySelector("[data-progress-bar]").style.width = `${percentage}%`;
    dialogContent.querySelector("[data-progress-copy]").textContent = `${completed} of ${changing.length} confirmed`;
    if (completed >= changing.length) {
      window.clearInterval(timer);
      finish();
    }
  }, 420);
}

function showUndo(message) {
  toast.innerHTML = `<span>${escapeHtml(message)}</span><button data-undo>Undo</button>`;
  toast.classList.add("visible");
  toast.querySelector("[data-undo]").addEventListener("click", () => {
    if (!state.undoSnapshot) return;
    state.transactions = structuredClone(state.undoSnapshot);
    state.undoSnapshot = null;
    state.lastAction = "Undid previous batch";
    toast.classList.remove("visible");
    render();
  });
}

function renderSwitcher() {
  const order = Object.keys(variants);
  const index = order.indexOf(state.variant);
  const prototypeMode =
    ["localhost", "127.0.0.1"].includes(window.location.hostname) ||
    new URLSearchParams(window.location.search).get("prototype") === "1";
  switcher.innerHTML = `
    <button data-cycle="-1" aria-label="Previous variant">←</button>
    <span class="variant-label">${state.variant} — ${escapeHtml(variants[state.variant].name)}</span>
    <button data-cycle="1" aria-label="Next variant">→</button>`;
  switcher.querySelectorAll("[data-cycle]").forEach((button) => {
    button.addEventListener("click", () => cycleVariant(Number(button.dataset.cycle)));
  });
  switcher.hidden = !prototypeMode;
  switcher.dataset.index = index;
}

function cycleVariant(direction) {
  const order = Object.keys(variants);
  const index = order.indexOf(state.variant);
  state.variant = order[(index + direction + order.length) % order.length];
  state.flowStep = 1;
  const url = new URL(window.location.href);
  url.searchParams.set("variant", state.variant);
  window.history.replaceState({}, "", url);
  render();
}

window.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  const target = event.target;
  if (target.matches("input, textarea, select, [contenteditable='true']")) return;
  cycleVariant(event.key === "ArrowLeft" ? -1 : 1);
});

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

window.addEventListener("popstate", () => {
  state.variant = getVariant();
  render();
});

render();
