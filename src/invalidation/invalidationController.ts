export type InvalidationReason =
  | 'state'
  | 'camera'
  | 'timeline'
  | 'animation'
  | 'audio'
  | 'video'
  | 'shader'
  | 'layout'
  | 'user-input'
  | 'external';

export interface InvalidationController {
  invalidate(reason: InvalidationReason, payload?: unknown): void;
  consume(): InvalidationReason[];
  hasInvalidation(): boolean;
  subscribe(listener: (reasons: InvalidationReason[]) => void): () => void;
}

export function createInvalidationController(): InvalidationController {
  const reasons = new Set<InvalidationReason>();
  const listeners = new Set<(reasons: InvalidationReason[]) => void>();

  return {
    invalidate(reason) {
      reasons.add(reason);
      const snapshot = [...reasons];
      for (const listener of listeners) listener(snapshot);
    },
    consume() {
      const snapshot = [...reasons];
      reasons.clear();
      return snapshot;
    },
    hasInvalidation() {
      return reasons.size > 0;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
