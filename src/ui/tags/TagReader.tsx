import { Button } from 'react-aria-components';
import type { TagIdentity } from '../../domain/grammar/identity.ts';
import type { Transaction, TransactionId } from '../../domain/model.ts';
import { compareCodePoints, type Member } from '../../domain/tags/tagIndex.ts';
import type { BudgetSessionSnapshot } from '../../session/store.ts';
import { useFocusOnMount } from '../useFocusOnMount.ts';
import { formatMilliunits } from './format.ts';
import { OVERVIEW_SCOPE_LABEL } from './TagOverview.tsx';
import { ReadOnlySplitMarker, TagMarkerList } from './TagMarkers.tsx';
import styles from './TagReader.module.css';

/**
 * Reads one Tag across the whole Budget (Req 11.2, 11.4). Slice 1 has no Register scope, so the
 * outside-account count (Req 10.7) is deliberately absent; it arrives with the Register in slice 2.
 * The header carries no management actions yet: rename, merge and delete arrive in slice 3.
 */
export function TagReader({
  budget,
  identity,
  onBack,
}: {
  budget: BudgetSessionSnapshot;
  identity: TagIdentity;
  onBack: () => void;
}) {
  const { domain } = budget;
  const headingRef = useFocusOnMount<HTMLHeadingElement>([identity]);
  const entry = domain.index.byIdentity.get(identity);
  const money = (milliunits: number) => formatMilliunits(milliunits, budget.plan.currencyFormat);

  const back = (
    <Button className={styles.back} onPress={onBack}>
      Back to all tags
    </Button>
  );

  if (entry === undefined) {
    const vocabularyEmpty = domain.index.byIdentity.size === 0;
    return (
      <section className={styles.root} aria-label="Tag reader">
        {back}
        <p role="status" className={styles.empty}>
          {vocabularyEmpty
            ? 'No tags in this budget yet. A tag is a word after a # in a transaction memo, such as #holiday.'
            : 'This tag is no longer in the budget. It may have been removed by a refresh.'}
        </p>
      </section>
    );
  }

  const label = `#${entry.canonicalSpelling}`;
  const describe = (id: TransactionId): string => {
    const tx = domain.transactions.get(id);
    if (tx === undefined) return id;
    return `${tx.date} ${tx.payeeName ?? 'No payee'}, ${accountName(budget, tx)}, ${money(tx.amount)}`;
  };

  const members = [...entry.members].sort((a, b) => {
    const dateA = domain.transactions.get(a.transactionId)?.date ?? '';
    const dateB = domain.transactions.get(b.transactionId)?.date ?? '';
    return compareCodePoints(dateB, dateA) || compareCodePoints(a.transactionId, b.transactionId);
  });

  const { total } = entry;
  const pairs = total.transferPairs;

  return (
    <section className={styles.root} aria-labelledby="tag-reader-heading">
      <div className={styles.header}>
        {back}
        <h2 id="tag-reader-heading" ref={headingRef} tabIndex={-1} className={styles.heading}>
          {label}
        </h2>
        <p className={styles.scope}>{OVERVIEW_SCOPE_LABEL}</p>
        <TagMarkerList
          index={domain.index}
          markers={budget.markers.get(entry.identity)}
          variant="label"
        />
      </div>

      <section className={styles.panel} aria-labelledby="tag-composition-heading">
        <h3 id="tag-composition-heading" className={styles.subheading}>
          Total composition
        </h3>
        <dl className={styles.stats}>
          <Stat term="Net" value={money(total.netMilliunits)} />
          <Stat term="Outflow" value={money(total.outflowMilliunits)} />
          <Stat term="Inflow" value={money(total.inflowMilliunits)} />
          <Stat term="Transactions" value={String(total.memberCount)} />
          <Stat term="Transfer pairs" value={String(pairs.length)} />
        </dl>
        {pairs.length > 0 && (
          <div>
            <ul aria-label="Transfer pairs" className={styles.plainList}>
              {pairs.map((pair) => (
                <li key={`${pair.a}|${pair.b}`}>
                  {describe(pair.a)} is paired with {describe(pair.b)}
                </li>
              ))}
            </ul>
            <p className={styles.note}>
              Pairs are named for reference only. Paired transactions do not necessarily cancel to
              zero.
            </p>
          </div>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="tag-members-heading">
        <h3 id="tag-members-heading" className={styles.subheading}>
          Member transactions
        </h3>
        <ul aria-label="Member transactions" className={styles.members}>
          {members.map((member) => (
            <MemberRow key={member.transactionId} member={member} budget={budget} label={label} />
          ))}
        </ul>
      </section>
    </section>
  );
}

function accountName(budget: BudgetSessionSnapshot, tx: Transaction): string {
  return budget.domain.accounts.get(tx.accountId)?.name ?? 'Unknown account';
}

function Stat({ term, value }: { term: string; value: string }) {
  return (
    <div className={styles.stat}>
      <dt>{term}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function MemberRow({
  member,
  budget,
  label,
}: {
  member: Member;
  budget: BudgetSessionSnapshot;
  label: string;
}) {
  const tx = budget.domain.transactions.get(member.transactionId);
  if (tx === undefined) return null;
  const money = (milliunits: number) => formatMilliunits(milliunits, budget.plan.currencyFormat);
  const isSplit = member.source === 'splits';
  const lines = member.contributingAmounts.map((contribution) => ({
    contribution,
    sub: tx.subtransactions.find((sub) => sub.id === contribution.subtransactionId),
  }));

  return (
    <li className={styles.member}>
      <div className={styles.memberRow}>
        <span className={styles.date}>{tx.date}</span>
        <span className={styles.payee}>{tx.payeeName ?? 'No payee'}</span>
        <span className={styles.account}>{accountName(budget, tx)}</span>
        <span className={styles.amount}>{money(member.contribution)}</span>
      </div>
      {isSplit && (
        <div className={styles.splitContext}>
          <ReadOnlySplitMarker label={label} />
          <span className={styles.note}>
            Transaction total {money(tx.amount)}; only the tagged split lines count.
          </span>
          <ul aria-label="Contributing split lines" className={styles.plainList}>
            {lines.map(({ contribution, sub }) => (
              <li key={contribution.subtransactionId ?? 'parent'} className={styles.splitLine}>
                <span className={styles.lineMemo}>{sub?.memo ?? 'No memo'}</span>
                <span className={styles.amount}>{money(contribution.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
