import { deepEqual, valueHash } from './canonical';

export const RING_SIZE = 64;

/** Minimal key-value store (backed by ExtensionContext.globalState). */
export interface StateStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

const RING_KEY = 'colorManager.ownedHashes';

export class OwnershipRecord {
  constructor(private readonly state: StateStore) {}

  ring(): string[] {
    return this.state.get<string[]>(RING_KEY) ?? [];
  }

  async remember(value: unknown): Promise<void> {
    const h = valueHash(value);
    const ring = this.ring().filter((x) => x !== h);
    ring.push(h);
    await this.state.update(RING_KEY, ring.slice(-RING_SIZE));
  }

  async clear(): Promise<void> {
    await this.state.update(RING_KEY, []);
  }

  /**
   * Plan 9.3: a value under the theme key belongs to ColorManager if it is
   * absent, equals the payload about to be written, was written recently, or
   * equals the payload of some slot under the current settings.
   */
  isOwned(current: unknown, payload: unknown, slotHashes: () => ReadonlySet<string>): boolean {
    if (current === undefined) return true;
    if (deepEqual(current, payload)) return true;
    const h = valueHash(current);
    return this.ring().includes(h) || slotHashes().has(h);
  }
}
