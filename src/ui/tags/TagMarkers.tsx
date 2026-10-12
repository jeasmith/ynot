import type { TagIdentity } from '../../domain/grammar/identity.ts';
import type { TagMarkers as DerivedMarkers } from '../../domain/tags/markers.ts';
import type { TagIndex } from '../../domain/tags/tagIndex.ts';
import styles from './TagMarkers.module.css';

/** The displayed form of a Tag: `#` plus its Canonical Spelling. */
export function tagLabel(index: TagIndex, identity: TagIdentity): string {
  return `#${index.byIdentity.get(identity)?.canonicalSpelling ?? identity}`;
}

interface MarkerSpec {
  readonly kind: 'nearDuplicate' | 'singleUse';
  readonly glyph: string;
  readonly name: string;
  readonly text: string;
}

/** The near-duplicate marker always comes before the single-use marker (Req 14.3). */
export function markerSpecs(index: TagIndex, markers: DerivedMarkers | undefined): MarkerSpec[] {
  if (markers === undefined) return [];
  const specs: MarkerSpec[] = [];
  if (markers.nearDuplicateOf.length > 0) {
    const others = markers.nearDuplicateOf.map((other) => tagLabel(index, other)).join(', ');
    specs.push({
      kind: 'nearDuplicate',
      glyph: '≈',
      name: `Near-duplicate of ${others}`,
      text: `Near-duplicate of ${others}`,
    });
  }
  if (markers.singleUse) {
    specs.push({
      kind: 'singleUse',
      glyph: '①',
      name: 'Single use, one transaction',
      text: 'Single use',
    });
  }
  return specs;
}

/**
 * Advisory vocabulary markers. `icon` shows a glyph only (rail, table); `label` adds the text.
 * Either way the marker has an accessible name, and the glyph shape differs, so nothing depends
 * on colour alone (Req 20.2, 20.5).
 */
export function TagMarkerList({
  index,
  markers,
  variant,
}: {
  index: TagIndex;
  markers: DerivedMarkers | undefined;
  variant: 'icon' | 'label';
}) {
  const specs = markerSpecs(index, markers);
  if (specs.length === 0) return null;
  return (
    <span className={variant === 'label' ? styles.labelled : styles.icons}>
      {specs.map((spec) => (
        <span
          key={spec.kind}
          role="img"
          aria-label={spec.name}
          title={spec.name}
          className={`${styles.marker} ${spec.kind === 'nearDuplicate' ? styles.warning : styles.muted}`}
        >
          <span aria-hidden="true">{spec.glyph}</span>
          {variant === 'label' && <span aria-hidden="true"> {spec.text}</span>}
        </span>
      ))}
    </span>
  );
}

/** Marker for a member whose Contribution comes only from split lines (not writable). */
export function ReadOnlySplitMarker({ label }: { label: string }) {
  const name = `${label} read-only, in a split`;
  return (
    <span role="img" aria-label={name} title={name} className={`${styles.marker} ${styles.muted}`}>
      <span aria-hidden="true">{'\u{1F512}︎'} read-only, in a split</span>
    </span>
  );
}
