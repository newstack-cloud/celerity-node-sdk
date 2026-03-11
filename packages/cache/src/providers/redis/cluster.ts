import { CacheError } from "../../errors";

/**
 * Calculates the Redis hash slot for a key. Uses the hash tag ({...}) if present,
 * otherwise hashes the full key. Implements the CRC16 CCITT algorithm used by
 * Redis Cluster (16384 slots).
 */
export function hashSlot(key: string): number {
  const tagStart = key.indexOf("{");
  if (tagStart !== -1) {
    const tagEnd = key.indexOf("}", tagStart + 1);
    if (tagEnd !== -1 && tagEnd !== tagStart + 1) {
      return crc16(key.slice(tagStart + 1, tagEnd)) % 16384;
    }
  }
  return crc16(key) % 16384;
}

/**
 * Groups keys by their hash slot. Returns a map of slot → indices into the
 * original keys array, preserving order for result reassembly.
 */
export function groupBySlot(keys: string[]): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  for (let i = 0; i < keys.length; i++) {
    const slot = hashSlot(keys[i]);
    const indices = groups.get(slot);
    if (indices) {
      indices.push(i);
    } else {
      groups.set(slot, [i]);
    }
  }
  return groups;
}

/**
 * Validates that all keys resolve to the same hash slot. Throws CacheError
 * if keys span multiple slots.
 */
export function assertSameSlot(keys: string[], operation: string, cacheName: string): void {
  if (keys.length <= 1) return;

  const expectedSlot = hashSlot(keys[0]);
  for (let i = 1; i < keys.length; i++) {
    if (hashSlot(keys[i]) !== expectedSlot) {
      throw new CacheError(
        `${operation} requires all keys to share a hash slot in cluster mode. ` +
          `Use hash tags (e.g., {tag}key1, {tag}key2) to co-locate related keys.`,
        cacheName,
      );
    }
  }
}

// ----------------------------------------------------
// CRC16 implementation for Redis Cluster,
// see https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/#appendix
// ----------------------------------------------------

// CRC16 CCITT lookup table
const CRC16_TABLE = buildCrc16Table();

function buildCrc16Table(): Uint16Array {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
    table[i] = crc & 0xffff;
  }
  return table;
}

function crc16(str: string): number {
  let crc = 0;
  for (let i = 0; i < str.length; i++) {
    crc = ((crc << 8) ^ CRC16_TABLE[((crc >> 8) ^ str.charCodeAt(i)) & 0xff]) & 0xffff;
  }
  return crc;
}
