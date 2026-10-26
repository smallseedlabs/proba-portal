import { describe, it, expect } from 'vitest';
import { InMemoryMemoryApi } from './in-memory/in-memory-memory-api';
import { memoryId } from './in-memory/memory-seed';
import { loadSupersedesChain, replacedBy } from './supersedes';

const NOW = Date.parse('2026-10-26T12:30:00.000Z');
const make = (options = {}) => new InMemoryMemoryApi({ now: () => NOW, ...options });

describe('supersedes chain', () => {
  it('walks back through earlier versions and forward through newer ones', async () => {
    const api = make();
    const middle = await api.getMemory(memoryId(2));
    const chain = await loadSupersedesChain(api, middle.memory, middle.links);
    expect(chain.earlier.map((e) => e.id)).toEqual([memoryId(1)]);
    expect(chain.later.map((e) => e.id)).toEqual([memoryId(3)]);
    expect(chain.truncated || chain.incomplete).toBe(false);

    const newest = await api.getMemory(memoryId(3));
    const fromNewest = await loadSupersedesChain(api, newest.memory, newest.links);
    expect(fromNewest.earlier.map((e) => e.id)).toEqual([memoryId(2), memoryId(1)]);
    expect(fromNewest.later).toEqual([]);
  });

  it('reads the direction of a link: it points from the newer memory to the one it replaced', async () => {
    const api = make();
    const { links } = await api.getMemory(memoryId(2));
    expect(replacedBy(memoryId(2), links)).toBe(memoryId(3));
    expect(replacedBy(memoryId(3), links)).toBeUndefined();
  });

  it('stops where a memory cannot be read and says the history is incomplete', async () => {
    const admin = make();
    const newest = await admin.getMemory(memoryId(3));
    const viewer = make({ role: 'viewer' });
    // A viewer can read the newest (active) memory but not the replaced ones.
    const chain = await loadSupersedesChain(viewer, newest.memory, newest.links);
    expect(chain.earlier).toEqual([{ id: memoryId(2), memory: null }]);
    expect(chain.incomplete).toBe(true);
  });

  it('survives a cycle and a chain that is too long', async () => {
    const api = make();
    const a = (await api.getMemory(memoryId(3))).memory;
    const looping = make({
      memories: [{ ...a, id: 'a', supersedesId: 'b' }, { ...a, id: 'b', supersedesId: 'a' }],
      links: [],
    });
    const detail = await looping.getMemory('a');
    const chain = await loadSupersedesChain(looping, detail.memory, detail.links);
    expect(chain.earlier.map((e) => e.id)).toEqual(['b']);

    const long = Array.from({ length: 14 }, (_, i) => ({ ...a, id: `m${i}`, supersedesId: i < 13 ? `m${i + 1}` : null }));
    const api2 = make({ memories: long, links: [] });
    const first = await api2.getMemory('m0');
    const cut = await loadSupersedesChain(api2, first.memory, first.links);
    expect(cut.earlier).toHaveLength(8);
    expect(cut.truncated).toBe(true);
  });
});
