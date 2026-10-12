// fast-check arbitraries shared by the property tests (design: Testing Strategy).
//
// Two families:
//  - memo text, drawn from a weighted alphabet that is hostile to the hashtag grammar;
//  - transactions with splits, tagged split lines and transfers, built on src/domain/model.ts.
import fc from 'fast-check';
import type {
  AccountId,
  CategoryId,
  IsoDate,
  SubTransaction,
  Transaction,
  TransactionId,
} from '../src/domain/model.ts';

// ---------------------------------------------------------------------------
// Memo text
// ---------------------------------------------------------------------------

/** Every Unicode `White_Space` code point. */
export const WHITE_SPACE_CODE_POINTS: readonly string[] = [
  '\u0009',
  '\u000A',
  '\u000B',
  '\u000C',
  '\u000D',
  ' ',
  '\u0085',
  '\u00A0',
  '\u1680',
  '\u2000',
  '\u2001',
  '\u2002',
  '\u2003',
  '\u2004',
  '\u2005',
  '\u2006',
  '\u2007',
  '\u2008',
  '\u2009',
  '\u200A',
  '\u2028',
  '\u2029',
  '\u202F',
  '\u205F',
  '\u3000',
];

const ASCII_LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const ASCII_DIGITS = '0123456789'.split('');
const LATIN_1 = ['é', 'É', 'ü', 'Ü', 'ß', 'ñ', 'ç', 'ÿ', 'µ', 'ª', '²', '½'];
const CJK = ['家', '計', '買', 'い', '物', '漢', '字', 'あ'];
/** Combining marks (`M*`): acute, diaeresis, dot above, voiced sound mark. */
const COMBINING = ['́', '̈', '̇', '゙'];
/** `Po`, `Pe`, `Pf` (and the `Pi` opener, which is not trimmed). */
const TRAILING_PUNCTUATION = [
  '.',
  ',',
  ';',
  ':',
  '!',
  '?',
  '"',
  "'",
  ')',
  ']',
  '}',
  '。',
  '」',
  '”',
  '’',
  '»',
  '\\',
  '#',
];
const OTHER_PUNCTUATION = ['(', '[', '{', '“', '«', '/', '&', '@', '*', '·', '%'];
/** `Pd` and `Pc`: never trimmed. */
const DASHES_AND_CONNECTORS = ['-', '–', '—', '_', '‿'];
/** Decimal digits outside ASCII, plus `Nl` and `No` look-alikes that are not `Nd`. */
const OTHER_DIGITS = ['٣', '３', '𝟘', '٠', 'Ⅻ', '①'];
/** Astral letters and symbols, so code point handling is exercised. */
const ASTRAL = ['😀', '𝒜', '𠮷'];

const char = (set: readonly string[]): fc.Arbitrary<string> => fc.constantFrom(...set);

/**
 * One code point of memo text. Weighted towards the characters that decide the grammar:
 * letters, digits, `#`, `\`, whitespace, and punctuation.
 */
export const memoCharArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 12, arbitrary: char(ASCII_LETTERS) },
  { weight: 6, arbitrary: char(ASCII_DIGITS) },
  { weight: 10, arbitrary: fc.constant('#') },
  { weight: 5, arbitrary: fc.constant('\\') },
  { weight: 8, arbitrary: fc.constant(' ') },
  { weight: 4, arbitrary: char(WHITE_SPACE_CODE_POINTS) },
  { weight: 6, arbitrary: char(TRAILING_PUNCTUATION) },
  { weight: 2, arbitrary: char(OTHER_PUNCTUATION) },
  { weight: 4, arbitrary: char(DASHES_AND_CONNECTORS) },
  { weight: 3, arbitrary: char(LATIN_1) },
  { weight: 3, arbitrary: char(CJK) },
  { weight: 3, arbitrary: char(COMBINING) },
  { weight: 2, arbitrary: char(OTHER_DIGITS) },
  { weight: 1, arbitrary: char(ASTRAL) },
);

/** A memo string of any shape, including the empty string. */
export const memoArb: fc.Arbitrary<string> = fc.string({
  unit: memoCharArb,
  minLength: 0,
  maxLength: 40,
});

/** A raw memo as stored on a transaction: `null` or a non-empty string. */
export const nullableMemoArb: fc.Arbitrary<string | null> = fc.oneof(
  { weight: 1, arbitrary: fc.constant(null) },
  { weight: 5, arbitrary: memoArb.filter((memo) => memo !== '') },
);

/** Tag text with no `White_Space` and no `#`: what a user would type after the marker. */
export const tagTextArb: fc.Arbitrary<string> = fc.string({
  unit: memoCharArb.filter((c) => c !== '#' && !WHITE_SPACE_CODE_POINTS.includes(c)),
  minLength: 1,
  maxLength: 12,
});

/** Any string at all, mixing the memo alphabet and arbitrary Unicode. Used for identity tests. */
export const anyTextArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: memoArb },
  { weight: 1, arbitrary: fc.string({ unit: 'binary', maxLength: 12 }) },
  { weight: 1, arbitrary: fc.string({ unit: 'grapheme', maxLength: 12 }) },
);

const WORD_CHARS = memoCharArb.filter((c) => c !== '#' && !WHITE_SPACE_CODE_POINTS.includes(c));

/** A run of prose with no `#` and no whitespace. */
export const proseWordArb: fc.Arbitrary<string> = fc.string({
  unit: WORD_CHARS,
  minLength: 1,
  maxLength: 8,
});

/** Case and spelling variants of a few tags, so generated transactions collide on identity. */
export const TAG_POOL: readonly string[] = [
  'Household',
  'household',
  'HOUSEHOLD',
  'Home-Repair',
  'Home_Repair',
  'HomeRepair',
  'owed-alice',
  'owed-bob',
  'owed-carol',
  'Café',
  'Café',
  'Cornwall-2026',
  '家計',
  'Tax',
];

export const poolTagArb: fc.Arbitrary<string> = fc.constantFrom(...TAG_POOL);

/**
 * A memo built from prose words and `#tag` tokens separated by single spaces.
 * Returns the memo together with the tags it was built from, in order.
 */
export const taggedMemoArb: fc.Arbitrary<{ memo: string; tags: string[] }> = fc
  .array(
    fc.oneof(
      { weight: 2, arbitrary: proseWordArb.map((word) => ({ kind: 'word' as const, text: word })) },
      { weight: 2, arbitrary: poolTagArb.map((tag) => ({ kind: 'tag' as const, text: tag })) },
    ),
    { minLength: 0, maxLength: 6 },
  )
  .map((parts) => ({
    memo: parts.map((p) => (p.kind === 'tag' ? `#${p.text}` : p.text)).join(' '),
    tags: parts.filter((p) => p.kind === 'tag').map((p) => p.text),
  }));

/** A memo for use on a generated transaction: often untagged, often tagged from the pool. */
const transactionMemoArb: fc.Arbitrary<string | null> = fc.oneof(
  { weight: 3, arbitrary: fc.constant(null) },
  { weight: 3, arbitrary: proseWordArb },
  {
    weight: 5,
    arbitrary: taggedMemoArb.map(({ memo }) => (memo === '' ? null : memo)),
  },
);

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export const ACCOUNT_IDS = ['acct-1', 'acct-2', 'acct-3'] as unknown as readonly AccountId[];
export const CATEGORY_IDS = ['cat-1', 'cat-2', 'cat-3'] as unknown as readonly CategoryId[];

const BASE_DAY = Date.UTC(2020, 0, 1);

export const isoDateArb: fc.Arbitrary<IsoDate> = fc
  .integer({ min: 0, max: 365 * 6 })
  .map((days) => new Date(BASE_DAY + days * 86_400_000).toISOString().slice(0, 10));

/** Signed milliunits, never zero. */
export const amountArb: fc.Arbitrary<number> = fc
  .integer({ min: -500_000, max: 500_000 })
  .filter((amount) => amount !== 0);

export const accountIdArb: fc.Arbitrary<AccountId> = fc.constantFrom(...ACCOUNT_IDS);
export const categoryIdArb: fc.Arbitrary<CategoryId | null> = fc.oneof(
  { weight: 1, arbitrary: fc.constant(null) },
  { weight: 3, arbitrary: fc.constantFrom(...CATEGORY_IDS) },
);

const PAYEES = ['Tesco', 'Alice', 'Landlord', 'Café Nero', null];
const payeeArb = fc.constantFrom(...PAYEES);

interface SubDraft {
  readonly amount: number;
  readonly memo: string | null;
  readonly categoryId: CategoryId | null;
  readonly payeeName: string | null;
}

const subDraftArb: fc.Arbitrary<SubDraft> = fc.record({
  amount: amountArb,
  memo: transactionMemoArb,
  categoryId: categoryIdArb,
  payeeName: payeeArb,
});

interface TransactionDraft {
  readonly date: IsoDate;
  readonly amount: number;
  readonly memo: string | null;
  readonly cleared: Transaction['cleared'];
  readonly approved: boolean;
  readonly accountId: AccountId;
  readonly payeeName: string | null;
  readonly categoryId: CategoryId | null;
  readonly subs: readonly SubDraft[];
}

const transactionDraftArb: fc.Arbitrary<TransactionDraft> = fc
  .record({
    date: isoDateArb,
    amount: amountArb,
    memo: transactionMemoArb,
    cleared: fc.constantFrom('uncleared', 'cleared', 'reconciled') as fc.Arbitrary<
      Transaction['cleared']
    >,
    approved: fc.boolean(),
    accountId: accountIdArb,
    payeeName: payeeArb,
    categoryId: categoryIdArb,
    // Most transactions are not split; splits carry two to four lines.
    subs: fc.oneof(
      { weight: 3, arbitrary: fc.constant<SubDraft[]>([]) },
      { weight: 2, arbitrary: fc.array(subDraftArb, { minLength: 2, maxLength: 4 }) },
    ),
  })
  .map((draft) =>
    // A split parent's amount is the sum of its lines, as in YNAB.
    draft.subs.length === 0
      ? draft
      : { ...draft, amount: draft.subs.reduce((sum, sub) => sum + sub.amount, 0) },
  );

/** Where one end of a transfer link lives: the parent transaction, or one of its split lines. */
type Endpoint = { readonly txIndex: number; readonly subIndex: number | null };

const endpointIdOf = (
  txs: readonly { id: string; subs: readonly { id: string }[] }[],
  e: Endpoint,
): string => {
  const tx = txs[e.txIndex]!;
  return e.subIndex === null ? tx.id : tx.subs[e.subIndex]!.id;
};

/**
 * A set of transactions, 0 to `maxTransactions` of them, with unique IDs.
 *
 * - split parents have 2 to 4 lines whose amounts sum to the parent amount;
 * - tag-bearing memos draw from {@link TAG_POOL}, so identities collide across transactions;
 * - some pairs are linked as transfers in both directions. An end of a link is either the parent
 *   (a plain transaction) or a split line, matching YNAB, where a split line can itself be a
 *   transfer. Each end carries the other end's ID.
 */
export function transactionSetArb(
  options: { readonly minTransactions?: number; readonly maxTransactions?: number } = {},
): fc.Arbitrary<Transaction[]> {
  const max = options.maxTransactions ?? 8;
  return fc
    .array(transactionDraftArb, { minLength: options.minTransactions ?? 0, maxLength: max })
    .chain((drafts) => {
      const withIds = drafts.map((draft, i) => ({
        ...draft,
        id: `tx-${i}`,
        subs: draft.subs.map((sub, k) => ({ ...sub, id: `tx-${i}-sub-${k}` })),
      }));
      const endpoints: Endpoint[] = withIds.flatMap((draft, txIndex): Endpoint[] =>
        draft.subs.length === 0
          ? [{ txIndex, subIndex: null }]
          : draft.subs.map((_, subIndex) => ({ txIndex, subIndex })),
      );
      const pairArb =
        // A pair needs endpoints on two different transactions, or the filter below never accepts.
        new Set(endpoints.map((e) => e.txIndex)).size < 2
          ? fc.constant<[number, number][]>([])
          : fc.array(
              fc
                .tuple(
                  fc.integer({ min: 0, max: endpoints.length - 1 }),
                  fc.integer({ min: 0, max: endpoints.length - 1 }),
                )
                .filter(([a, b]) => endpoints[a]!.txIndex !== endpoints[b]!.txIndex),
              { maxLength: 3 },
            );
      return pairArb.map((pairs) => {
        // endpoint key -> id of the endpoint it transfers to. First link wins; no endpoint is reused.
        const links = new Map<string, string>();
        const key = (e: Endpoint) => `${e.txIndex}:${e.subIndex ?? 'p'}`;
        for (const [ai, bi] of pairs) {
          const a = endpoints[ai]!;
          const b = endpoints[bi]!;
          if (links.has(key(a)) || links.has(key(b))) continue;
          links.set(key(a), endpointIdOf(withIds, b));
          links.set(key(b), endpointIdOf(withIds, a));
        }
        return withIds.map((draft, txIndex): Transaction => {
          const subtransactions: SubTransaction[] = draft.subs.map((sub, subIndex) => ({
            id: sub.id,
            amount: sub.amount,
            memo: sub.memo,
            categoryId: sub.categoryId,
            payeeName: sub.payeeName,
            transferTransactionId: links.get(key({ txIndex, subIndex })) ?? null,
          }));
          return {
            id: draft.id as TransactionId,
            date: draft.date,
            amount: draft.amount,
            memo: draft.memo,
            cleared: draft.cleared,
            approved: draft.approved,
            accountId: draft.accountId,
            payeeName: draft.payeeName,
            categoryId: subtransactions.length > 0 ? null : draft.categoryId,
            transferTransactionId:
              subtransactions.length > 0
                ? null
                : (links.get(key({ txIndex, subIndex: null })) ?? null),
            subtransactions,
          };
        });
      });
    });
}

/** The same transactions as the `ReadonlyMap` that `DomainState` and `buildTagIndex` take. */
export function transactionMapArb(
  options: { readonly minTransactions?: number; readonly maxTransactions?: number } = {},
): fc.Arbitrary<Map<TransactionId, Transaction>> {
  return transactionSetArb(options).map((txs) => new Map(txs.map((tx) => [tx.id, tx])));
}

/** A single transaction, which may be split. */
export const transactionArb: fc.Arbitrary<Transaction> = transactionSetArb({
  minTransactions: 1,
  maxTransactions: 1,
}).map((txs) => txs[0]!);
