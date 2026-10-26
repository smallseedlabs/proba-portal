import { isApiError } from '../api/errors';
import type { CallOptions } from '../api/port';
import type { MemoryApi } from './port';
import type { MemoryLinkRecord, MemoryRecord } from './schemas';

/** A chain longer than this is cut: it keeps the screen readable and the number of requests bounded. */
export const MAX_CHAIN_STEPS = 8;

export interface ChainEntry {
  id: string;
  /** Known when the memory could be read. */
  memory: MemoryRecord | null;
}

export interface SupersedesChain {
  /** Replaced memories, nearest first (the memory this one replaced is first). */
  earlier: ChainEntry[];
  /** Memories that replaced this one, nearest first. */
  later: ChainEntry[];
  /** True when the chain was cut at MAX_CHAIN_STEPS. */
  truncated: boolean;
  /** True when some memory in the chain could not be read (for example, older versions are for administrators). */
  incomplete: boolean;
}

/** `supersedes` links point from the newer memory to the one it replaced. */
export function replacedBy(memoryId: string, links: MemoryLinkRecord[]): string | undefined {
  return links.find((l) => l.relation === 'supersedes' && l.toId === memoryId)?.fromId;
}

async function read(api: MemoryApi, id: string, options?: CallOptions): Promise<{ memory: MemoryRecord; links: MemoryLinkRecord[] } | null> {
  try {
    return await api.getMemory(id, options);
  } catch (error) {
    if (isApiError(error) && (error.kind === 'forbidden' || error.kind === 'not_found')) return null;
    throw error;
  }
}

/**
 * Follows the supersedes chain of a memory both ways from what the service returns for it: backwards through
 * `supersedesId`, forwards through `supersedes` links. Stops at a missing or forbidden memory, at a repeat (a cycle)
 * and after MAX_CHAIN_STEPS.
 */
export async function loadSupersedesChain(
  api: MemoryApi,
  memory: MemoryRecord,
  links: MemoryLinkRecord[],
  options?: CallOptions
): Promise<SupersedesChain> {
  const seen = new Set([memory.id]);
  const earlier: ChainEntry[] = [];
  const later: ChainEntry[] = [];
  let truncated = false;
  let incomplete = false;

  let nextId = memory.supersedesId;
  while (nextId) {
    if (seen.has(nextId)) break;
    if (earlier.length >= MAX_CHAIN_STEPS) {
      truncated = true;
      break;
    }
    seen.add(nextId);
    const found = await read(api, nextId, options);
    earlier.push({ id: nextId, memory: found?.memory ?? null });
    if (!found) {
      incomplete = true;
      break;
    }
    nextId = found.memory.supersedesId;
  }

  let forwardId = replacedBy(memory.id, links);
  while (forwardId) {
    if (seen.has(forwardId)) break;
    if (later.length >= MAX_CHAIN_STEPS) {
      truncated = true;
      break;
    }
    seen.add(forwardId);
    const found = await read(api, forwardId, options);
    later.push({ id: forwardId, memory: found?.memory ?? null });
    if (!found) {
      incomplete = true;
      break;
    }
    forwardId = replacedBy(forwardId, found.links);
  }

  return { earlier, later, truncated, incomplete };
}
