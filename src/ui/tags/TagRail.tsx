import { ListBox, ListBoxItem, type Selection } from 'react-aria-components';
import type { TagIdentity } from '../../domain/grammar/identity.ts';
import { compareCodePoints } from '../../domain/tags/tagIndex.ts';
import type { BudgetSessionSnapshot } from '../../session/store.ts';
import { TagMarkerList } from './TagMarkers.tsx';
import styles from './TagRail.module.css';

/** Exclusive tag navigation: at most one Tag is open at a time (Req 11.1). */
export function TagRail({
  budget,
  onOpenTag,
}: {
  budget: BudgetSessionSnapshot;
  onOpenTag: (identity: TagIdentity) => void;
}) {
  const { index } = budget.domain;
  const entries = [...index.byIdentity.values()].sort((a, b) =>
    compareCodePoints(a.identity, b.identity),
  );

  if (entries.length === 0) {
    return (
      <p role="status" className={styles.empty}>
        No tags in this budget.
      </p>
    );
  }

  const selected: Selection = new Set(budget.openTag === null ? [] : [budget.openTag]);

  return (
    <ListBox
      aria-label="Tags"
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={selected}
      onSelectionChange={(keys) => {
        if (keys === 'all') return;
        const [first] = keys;
        if (first !== undefined) onOpenTag(String(first) as TagIdentity);
      }}
      items={entries}
      className={styles.list}
    >
      {(entry) => (
        <ListBoxItem
          id={entry.identity}
          textValue={`#${entry.canonicalSpelling}`}
          className={styles.item}
        >
          <span className={styles.name}>#{entry.canonicalSpelling}</span>
          <TagMarkerList
            index={index}
            markers={budget.markers.get(entry.identity)}
            variant="label"
          />
        </ListBoxItem>
      )}
    </ListBox>
  );
}
