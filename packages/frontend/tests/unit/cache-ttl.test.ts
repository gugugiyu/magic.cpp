/**
 * Unit tests for TTLCache and ReactiveTTLMap.
 *
 * Tests cover: get/set, expiration, eviction, pruning,
 * max entries enforcement, custom TTL, onEvict callbacks,
 * touch, has, delete, clear, keys.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TTLCache, ReactiveTTLMap } from '$lib/utils/cache-ttl';

// const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

// ─────────────────────────────────────────────
// TTLCache
// ─────────────────────────────────────────────

describe('TTLCache', () => {
	describe('get / set', () => {
		it('stores and retrieves a value', () => {
			const cache = new TTLCache<string, number>();
			cache.set('one', 1);
			expect(cache.get('one')).toBe(1);
		});

		it('returns null for missing key', () => {
			const cache = new TTLCache<string, string>();
			expect(cache.get('missing')).toBeNull();
		});

		it('overwrites existing key', () => {
			const cache = new TTLCache<string, number>();
			cache.set('key', 1);
			cache.set('key', 2);
			expect(cache.get('key')).toBe(2);
		});

		it('stores complex objects', () => {
			const cache = new TTLCache<string, { name: string; count: number }>();
			const data = { name: 'test', count: 42 };
			cache.set('complex', data);
			expect(cache.get('complex')).toEqual(data);
		});

		it('stores and retrieves with explicit customTtlMs', () => {
			const cache = new TTLCache<string, string>({ ttlMs: 1000 });
			cache.set('key', 'value', 5000); // custom TTL of 5s
			vi.advanceTimersByTime(2000);
			expect(cache.get('key')).toBe('value');
			vi.advanceTimersByTime(3001); // total 5001ms, expired
			expect(cache.get('key')).toBeNull();
		});
	});

	describe('expiration', () => {
		it('returns null after TTL expires', () => {
			const cache = new TTLCache<string, string>({ ttlMs: 1000 });
			cache.set('key', 'value');
			vi.advanceTimersByTime(1001);
			expect(cache.get('key')).toBeNull();
		});

		it('still returns value just before TTL expires', () => {
			const cache = new TTLCache<string, string>({ ttlMs: 1000 });
			cache.set('key', 'value');
			vi.advanceTimersByTime(999);
			expect(cache.get('key')).toBe('value');
		});

		it('deletes expired entry on get', () => {
			const cache = new TTLCache<string, string>({ ttlMs: 1000 });
			cache.set('key', 'value');
			vi.advanceTimersByTime(1001);
			cache.get('key'); // triggers internal delete
			expect(cache.size).toBe(0);
		});
	});

	describe('has', () => {
		it('returns true for valid key', () => {
			const cache = new TTLCache<string, number>();
			cache.set('key', 42);
			expect(cache.has('key')).toBe(true);
		});

		it('returns false for missing key', () => {
			const cache = new TTLCache<string, number>();
			expect(cache.has('missing')).toBe(false);
		});

		it('returns false for expired key', () => {
			const cache = new TTLCache<string, number>({ ttlMs: 100 });
			cache.set('key', 42);
			vi.advanceTimersByTime(101);
			expect(cache.has('key')).toBe(false);
		});

		it('deletes expired entry when has returns false', () => {
			const cache = new TTLCache<string, string>({ ttlMs: 100 });
			cache.set('key', 'val');
			vi.advanceTimersByTime(101);
			cache.has('key');
			expect(cache.size).toBe(0);
		});
	});

	describe('delete', () => {
		it('removes a key and returns true', () => {
			const cache = new TTLCache<string, number>();
			cache.set('key', 42);
			expect(cache.delete('key')).toBe(true);
			expect(cache.get('key')).toBeNull();
		});

		it('returns false for missing key', () => {
			const cache = new TTLCache<string, number>();
			expect(cache.delete('missing')).toBe(false);
		});

		it('calls onEvict callback', () => {
			const onEvict = vi.fn();
			const cache = new TTLCache<string, number>({ onEvict });
			cache.set('key', 42);
			cache.delete('key');
			expect(onEvict).toHaveBeenCalledWith('key', 42);
		});
	});

	describe('clear', () => {
		it('removes all entries', () => {
			const cache = new TTLCache<string, number>();
			cache.set('a', 1);
			cache.set('b', 2);
			cache.set('c', 3);
			cache.clear();
			expect(cache.size).toBe(0);
			expect(cache.get('a')).toBeNull();
			expect(cache.get('b')).toBeNull();
		});

		it('calls onEvict for all entries', () => {
			const onEvict = vi.fn();
			const cache = new TTLCache<string, number>({ onEvict });
			cache.set('a', 1);
			cache.set('b', 2);
			cache.clear();
			expect(onEvict).toHaveBeenCalledTimes(2);
		});
	});

	describe('prune', () => {
		it('removes expired entries and returns count', () => {
			const cache = new TTLCache<string, number>({ ttlMs: 100 });
			cache.set('a', 1);
			vi.advanceTimersByTime(50);
			cache.set('b', 2);
			vi.advanceTimersByTime(51); // 'a' expired, 'b' not yet

			const pruned = cache.prune();
			expect(pruned).toBe(1);
			expect(cache.get('a')).toBeNull();
			expect(cache.get('b')).toBe(2);
		});

		it('returns 0 when no entries are expired', () => {
			const cache = new TTLCache<string, number>({ ttlMs: 10000 });
			cache.set('a', 1);
			cache.set('b', 2);
			vi.advanceTimersByTime(100);

			expect(cache.prune()).toBe(0);
			expect(cache.size).toBe(2);
		});
	});

	describe('keys', () => {
		it('returns only valid (non-expired) keys', () => {
			const cache = new TTLCache<string, number>({ ttlMs: 100 });
			cache.set('a', 1);
			vi.advanceTimersByTime(50);
			cache.set('b', 2);
			vi.advanceTimersByTime(51); // 'a' expired

			const validKeys = cache.keys();
			expect(validKeys).toContain('b');
			expect(validKeys).not.toContain('a');
		});

		it('returns empty array for empty cache', () => {
			const cache = new TTLCache<string, number>();
			expect(cache.keys()).toEqual([]);
		});

		it('does not remove expired keys (read-only)', () => {
			const cache = new TTLCache<string, number>({ ttlMs: 100 });
			cache.set('expired', 1);
			vi.advanceTimersByTime(101);

			cache.keys(); // should not delete
			// Note: keys() does NOT delete expired entries, unlike get/has
			expect(cache.size).toBe(1);
		});
	});

	describe('maxEntries / eviction', () => {
		it('evicts oldest entry when at capacity', () => {
			const cache = new TTLCache<string, number>({ maxEntries: 2 });
			cache.set('a', 1);
			vi.advanceTimersByTime(10);
			cache.set('b', 2);
			vi.advanceTimersByTime(10);
			// Adding third should evict 'a' (oldest lastAccessed)
			cache.set('c', 3);

			expect(cache.get('a')).toBeNull();
			expect(cache.get('b')).toBe(2);
			expect(cache.get('c')).toBe(3);
		});

		it('does not evict when overwriting existing key', () => {
			const cache = new TTLCache<string, number>({ maxEntries: 2 });
			cache.set('a', 1);
			cache.set('b', 2);
			// Overwrite 'a' — should not trigger eviction
			cache.set('a', 100);
			expect(cache.get('a')).toBe(100);
			expect(cache.get('b')).toBe(2);
		});

		it('evicts least recently accessed entry', () => {
			const cache = new TTLCache<string, number>({ maxEntries: 2, ttlMs: 100000 });
			cache.set('a', 1);
			cache.set('b', 2);
			vi.advanceTimersByTime(50);
			// Access 'a' to update its lastAccessed
			cache.get('a');
			vi.advanceTimersByTime(50);
			// Adding 'c' should evict 'b' (older lastAccessed)
			cache.set('c', 3);

			expect(cache.get('a')).toBe(1);
			expect(cache.get('b')).toBeNull();
			expect(cache.get('c')).toBe(3);
		});
	});

	describe('touch', () => {
		it('refreshes TTL for existing key', () => {
			const cache = new TTLCache<string, number>({ ttlMs: 100 });
			cache.set('key', 42);
			vi.advanceTimersByTime(90); // almost expired

			expect(cache.touch('key')).toBe(true);
			vi.advanceTimersByTime(90); // would have been expired, but touch refreshed
			expect(cache.get('key')).toBe(42);
		});

		it('returns false for non-existent key', () => {
			const cache = new TTLCache<string, number>({ ttlMs: 100 });
			expect(cache.touch('missing')).toBe(false);
		});

		it('returns false and deletes already expired key', () => {
			const cache = new TTLCache<string, number>({ ttlMs: 100 });
			cache.set('key', 42);
			vi.advanceTimersByTime(101);
			expect(cache.touch('key')).toBe(false);
			expect(cache.get('key')).toBeNull();
		});
	});

	describe('size', () => {
		it('returns correct count', () => {
			const cache = new TTLCache<string, number>();
			expect(cache.size).toBe(0);
			cache.set('a', 1);
			cache.set('b', 2);
			expect(cache.size).toBe(2);
			cache.delete('a');
			expect(cache.size).toBe(1);
		});

		it('includes expired entries in count', () => {
			const cache = new TTLCache<string, number>({ ttlMs: 100 });
			cache.set('key', 42);
			vi.advanceTimersByTime(101);
			// size counts all Map entries, including expired
			expect(cache.size).toBe(1);
		});
	});

	describe('onEvict', () => {
		it('is called when entry expires on get', () => {
			const onEvict = vi.fn();
			const cache = new TTLCache<string, number>({ ttlMs: 100, onEvict });
			cache.set('key', 42);
			vi.advanceTimersByTime(101);
			cache.get('key'); // triggers delete + onEvict
			expect(onEvict).toHaveBeenCalledWith('key', 42);
		});

		it('is called during eviction due to maxEntries', () => {
			const onEvict = vi.fn();
			const cache = new TTLCache<string, number>({ maxEntries: 1, onEvict });
			cache.set('a', 1);
			cache.set('b', 2); // evicts 'a'
			expect(onEvict).toHaveBeenCalledWith('a', 1);
		});

		it('is called for each entry during clear', () => {
			const onEvict = vi.fn();
			const cache = new TTLCache<string, number>({ onEvict });
			cache.set('a', 1);
			cache.set('b', 2);
			cache.clear();
			expect(onEvict).toHaveBeenCalledTimes(2);
		});
	});

	describe('defaults', () => {
		it('uses default TTL when not specified', () => {
			const cache = new TTLCache<string, string>();
			cache.set('key', 'value');
			// Advance by less than default TTL (5 minutes)
			vi.advanceTimersByTime(4 * 60 * 1000);
			expect(cache.get('key')).toBe('value');
		});

		it('uses default maxEntries (100)', () => {
			const cache = new TTLCache<string, number>();
			// Fill up to default max
			for (let i = 0; i < 100; i++) {
				cache.set(`key-${i}`, i);
			}
			expect(cache.size).toBe(100);
			// Adding one more should evict
			cache.set('overflow', 999);
			expect(cache.size).toBe(100); // maxEntries enforced
		});
	});
});

// ─────────────────────────────────────────────
// ReactiveTTLMap
// ─────────────────────────────────────────────

describe('ReactiveTTLMap', () => {
	it('stores and retrieves values', () => {
		const map = new ReactiveTTLMap<string, number>({ ttlMs: 10000 });
		map.set('key', 42);
		expect(map.get('key')).toBe(42);
	});

	it('returns null for missing key', () => {
		const map = new ReactiveTTLMap<string, number>();
		expect(map.get('missing')).toBeNull();
	});

	it('expires after TTL', () => {
		const map = new ReactiveTTLMap<string, string>({ ttlMs: 100 });
		map.set('key', 'value');
		vi.advanceTimersByTime(101);
		expect(map.get('key')).toBeNull();
	});

	it('has returns true for valid key', () => {
		const map = new ReactiveTTLMap<string, number>({ ttlMs: 1000 });
		map.set('key', 42);
		expect(map.has('key')).toBe(true);
	});

	it('has returns false for expired key', () => {
		const map = new ReactiveTTLMap<string, number>({ ttlMs: 100 });
		map.set('key', 42);
		vi.advanceTimersByTime(101);
		expect(map.has('key')).toBe(false);
	});

	it('delete removes entry', () => {
		const map = new ReactiveTTLMap<string, number>();
		map.set('key', 42);
		map.delete('key');
		expect(map.get('key')).toBeNull();
	});

	it('clear removes all entries', () => {
		const map = new ReactiveTTLMap<string, number>();
		map.set('a', 1);
		map.set('b', 2);
		map.clear();
		expect(map.size).toBe(0);
	});

	it('returns correct size', () => {
		const map = new ReactiveTTLMap<string, number>();
		map.set('a', 1);
		map.set('b', 2);
		expect(map.size).toBe(2);
	});

	it('prunes expired entries', () => {
		const map = new ReactiveTTLMap<string, number>({ ttlMs: 100 });
		map.set('a', 1);
		vi.advanceTimersByTime(50);
		map.set('b', 2);
		vi.advanceTimersByTime(51);

		const pruned = map.prune();
		expect(pruned).toBe(1);
		expect(map.get('a')).toBeNull();
	});

	it('evicts oldest when at maxEntries', () => {
		const map = new ReactiveTTLMap<string, number>({ maxEntries: 2, ttlMs: 100000 });
		map.set('a', 1);
		vi.advanceTimersByTime(10);
		map.set('b', 2);
		vi.advanceTimersByTime(10);
		map.set('c', 3);

		expect(map.size).toBe(2);
	});

	it('supports custom TTL per set', () => {
		const map = new ReactiveTTLMap<string, string>({ ttlMs: 1000 });
		map.set('key', 'value', 5000);
		vi.advanceTimersByTime(2000);
		expect(map.get('key')).toBe('value');
		vi.advanceTimersByTime(3001);
		expect(map.get('key')).toBeNull();
	});
});
