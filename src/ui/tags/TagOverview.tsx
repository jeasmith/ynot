import { useMemo, useState } from 'react';
import {
  Cell,
  Column,
  Row,
  Table,
  TableBody,
  TableHeader,
  type Key,
  type SortDescriptor,
} from 'react-aria-components';
import type { TagIdentity } from '../../domain/grammar/identity.ts';
import { compareCodePoints, type TagEntry } from '../../domain/tags/tagIndex.ts';
import type { BudgetSessionSnapshot } from '../../session/store.ts';
import { useFocusOnMount } from '../useFocusOnMount.ts';
import { formatMilliunits } from './format.ts';
import { TagMarkerList, markerSpecs } from './TagMarkers.tsx';
import styles from './TagOverview.module.css';

/** Req 11.6: the Overview is never narrowed by account, search, filters or dates. */
export const OVERVIEW_SCOPE_LABEL = 'all accounts · all time';

type ColumnId = 'tag' | 'net' | 'outflow' | 'inflow' | 'count' | 'markers';

const COLUMNS: readonly { id: ColumnId; name: string; numeric: boolean }[] = [
  { id: 'tag', name: 'Tag', numeric: false },
  { id: 'net', name: 'Net', numeric: true },
  { id: 'outflow', name: 'Outflow', numeric: true },
  { id: 'inflow', name: 'Inflow', numeric: true },
  { id: 'count', name: 'Transactions', numeric: true },
  { id: 'markers', name: 'Markers', numeric: false },
];

export function sortValue(
  column: ColumnId,
  entry: TagEntry,
  markerRank: (identity: TagIdentity) => number,
): number | string {
  switch (column) {
    case 'tag':
      return entry.identity;
    case 'net':
      return entry.total.netMilliunits;
    case 'outflow':
      return entry.total.outflowMilliunits;
    case 'inflow':
      return entry.total.inflowMilliunits;
    case 'count':
      return entry.total.memberCount;
    case 'markers':
      return markerRank(entry.identity);
  }
}

function compareValues(x: number | string, y: number | string): number {
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  return compareCodePoints(String(x), String(y));
}

export function TagOverview({
  budget,
  onOpenTag,
  focusHeading = false,
}: {
  budget: BudgetSessionSnapshot;
  onOpenTag: (identity: TagIdentity) => void;
  /** Take focus on mount, after returning from a tag's reader. */
  focusHeading?: boolean;
}) {
  const headingRef = useFocusOnMount<HTMLHeadingElement>([], focusHeading);
  const { index } = budget.domain;
  const [sort, setSort] = useState<SortDescriptor>({ column: 'tag', direction: 'ascending' });

  const rows = useMemo(() => {
    // Near-duplicate outranks single-use (Req 14.3), so it sorts as the larger rank.
    const markerRank = (identity: TagIdentity): number => {
      const markers = budget.markers.get(identity);
      if (markers === undefined) return 0;
      return (markers.nearDuplicateOf.length > 0 ? 2 : 0) + (markers.singleUse ? 1 : 0);
    };
    const column = String(sort.column ?? 'tag') as ColumnId;
    const sign = sort.direction === 'descending' ? -1 : 1;
    return [...index.byIdentity.values()].sort(
      (a, b) =>
        sign * compareValues(sortValue(column, a, markerRank), sortValue(column, b, markerRank)) ||
        compareCodePoints(a.identity, b.identity),
    );
  }, [index, budget.markers, sort]);

  const money = (milliunits: number) => formatMilliunits(milliunits, budget.plan.currencyFormat);

  if (index.byIdentity.size === 0) {
    return (
      <section className={styles.root} aria-labelledby="tag-overview-heading">
        <h2 id="tag-overview-heading" ref={headingRef} tabIndex={-1} className={styles.heading}>
          Tag Overview
        </h2>
        <p className={styles.scope}>{OVERVIEW_SCOPE_LABEL}</p>
        <p role="status" className={styles.empty}>
          No tags in this budget yet. A tag is a word after a # in a transaction memo, such as
          #holiday.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.root} aria-labelledby="tag-overview-heading">
      <h2 id="tag-overview-heading" ref={headingRef} tabIndex={-1} className={styles.heading}>
        Tag Overview
      </h2>
      <p id="tag-overview-scope" className={styles.scope}>
        {OVERVIEW_SCOPE_LABEL}
      </p>
      <div className={styles.tableWrap}>
        <Table
          aria-label="Tag Overview, all accounts · all time"
          aria-describedby="tag-overview-scope"
          className={styles.table}
          sortDescriptor={sort}
          onSortChange={setSort}
          onRowAction={(key: Key) => onOpenTag(String(key) as TagIdentity)}
        >
          <TableHeader>
            {COLUMNS.map((column) => (
              <Column
                key={column.id}
                id={column.id}
                isRowHeader={column.id === 'tag'}
                allowsSorting
                className={`${styles.column} ${column.numeric ? styles.numeric : ''}`}
              >
                {({ sortDirection }) => (
                  <span className={styles.columnContent}>
                    {column.name}
                    <span aria-hidden="true" className={styles.sortArrow}>
                      {sortDirection === 'ascending'
                        ? '▲'
                        : sortDirection === 'descending'
                          ? '▼'
                          : ''}
                    </span>
                  </span>
                )}
              </Column>
            ))}
          </TableHeader>
          <TableBody items={rows}>
            {(entry) => (
              <Row
                id={entry.identity}
                textValue={`#${entry.canonicalSpelling}`}
                className={styles.row}
              >
                <Cell className={styles.cell}>
                  <span className={styles.tagName}>#{entry.canonicalSpelling}</span>
                </Cell>
                <Cell className={`${styles.cell} ${styles.numeric}`}>
                  {money(entry.total.netMilliunits)}
                </Cell>
                <Cell className={`${styles.cell} ${styles.numeric}`}>
                  {money(entry.total.outflowMilliunits)}
                </Cell>
                <Cell className={`${styles.cell} ${styles.numeric}`}>
                  {money(entry.total.inflowMilliunits)}
                </Cell>
                <Cell className={`${styles.cell} ${styles.numeric}`}>
                  {entry.total.memberCount}
                </Cell>
                <Cell className={styles.cell}>
                  <TagMarkerList
                    index={index}
                    markers={budget.markers.get(entry.identity)}
                    variant="label"
                  />
                  {markerSpecs(index, budget.markers.get(entry.identity)).length === 0 && (
                    <span className={styles.none}>None</span>
                  )}
                </Cell>
              </Row>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
