// Vocabulary markers: near-duplicate and single-use. Advisory only; they never change identity,
// membership or totals (design: `src/domain/tags/markers.ts`, Req 14, 15).
import type { TagIdentity } from '../grammar/identity.ts';
import { compareCodePoints, type TagIndex } from './tagIndex.ts';

export interface TagMarkers {
  /** Other identities sharing this identity's near-duplicate key, sorted by code point. */
  readonly nearDuplicateOf: readonly TagIdentity[];
  readonly singleUse: boolean;
}

/** Remove literal '-' and '_'. */
export function nearDuplicateKey(identity: TagIdentity): string {
  return identity.replace(/[-_]/g, '');
}

export function deriveMarkers(index: TagIndex): ReadonlyMap<TagIdentity, TagMarkers> {
  const groups = new Map<string, TagIdentity[]>();
  for (const identity of index.byIdentity.keys()) {
    const key = nearDuplicateKey(identity);
    if (key === '') continue;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [identity]);
    else group.push(identity);
  }

  const markers = new Map<TagIdentity, TagMarkers>();
  for (const [identity, entry] of index.byIdentity) {
    const key = nearDuplicateKey(identity);
    const nearDuplicateOf =
      key === ''
        ? []
        : (groups.get(key) ?? []).filter((other) => other !== identity).sort(compareCodePoints);
    markers.set(identity, { nearDuplicateOf, singleUse: entry.total.memberCount === 1 });
  }
  return markers;
}
