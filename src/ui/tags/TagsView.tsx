import { useEffect, useRef, useState } from 'react';
import { Button } from 'react-aria-components';
import type { TagIdentity } from '../../domain/grammar/identity.ts';
import type { BudgetSessionSnapshot } from '../../session/store.ts';
import { TagOverview } from './TagOverview.tsx';
import { TagRail } from './TagRail.tsx';
import { TagReader } from './TagReader.tsx';
import styles from './TagsView.module.css';

/**
 * The Tags tab: the tag rail beside either the Tag Overview or the open Tag's reader. At 1024px
 * and wider the rail is a column; below that it becomes a drawer opened from a button.
 */
export function TagsView({
  budget,
  onOpenTag,
}: {
  budget: BudgetSessionSnapshot;
  onOpenTag: (identity: TagIdentity | null) => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Set by Back, so the Overview takes focus when it replaces the reader.
  const [returnedFromReader, setReturnedFromReader] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const open = (identity: TagIdentity | null) => {
    setDrawerOpen(false);
    setReturnedFromReader(identity === null);
    onOpenTag(identity);
  };

  // Focus moves into the drawer when it opens. Escape closes it from anywhere on the page.
  useEffect(() => {
    if (!drawerOpen) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setDrawerOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    toggleRef.current?.focus();
  };

  return (
    <div className={styles.layout}>
      <Button
        ref={toggleRef}
        className={styles.drawerToggle}
        aria-expanded={drawerOpen}
        aria-controls="tag-rail"
        onPress={() => setDrawerOpen((current) => !current)}
      >
        Browse tags
      </Button>
      <nav
        id="tag-rail"
        aria-label="Tag list"
        className={`${styles.rail} ${drawerOpen ? styles.railOpen : ''}`}
      >
        <Button ref={closeRef} className={styles.drawerClose} onPress={closeDrawer}>
          Close tag list
        </Button>
        <TagRail budget={budget} onOpenTag={open} />
      </nav>
      <div className={styles.main}>
        {budget.openTag === null ? (
          <TagOverview budget={budget} onOpenTag={open} focusHeading={returnedFromReader} />
        ) : (
          <TagReader budget={budget} identity={budget.openTag} onBack={() => open(null)} />
        )}
      </div>
    </div>
  );
}
