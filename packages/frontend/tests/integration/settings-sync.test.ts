/**
 * Integration tests: ParameterSyncService
 *
 * ParameterSyncService is pure TypeScript with no browser or Svelte dependencies.
 * These tests exercise the full extract → merge → diff pipeline that runs when
 * the UI loads server props and reconciles them with user overrides.
 */

import { describe, it, expect, vi } from 'vitest';

// Prevent lucide icon .svelte files from being compiled in Node env
// ($lib/utils barrel includes mcp.ts which imports @lucide/svelte icons)
vi.mock('@lucide/svelte', () => ({}));

// Prevent $app/paths from triggering SvelteKit's root.svelte compilation
// ($lib/utils barrel includes api-fetch.ts which imports { base } from '$app/paths')
vi.mock('$app/paths', () => ({ base: '' }));

import { ParameterSyncService } from '$lib/services/parameter-sync.service';
import { ParameterSource } from '$lib/enums';

// ─────────────────────────────────────────────────────────────────────────────
// extractServerDefaults
// ─────────────────────────────────────────────────────────────────────────────

describe('extractServerDefaults', () => {
	it('extracts numeric generation parameters from server props', () => {
		const serverParams = {
			temperature: 0.8,
			top_k: 40,
			top_p: 0.95,
			min_p: 0.05,
			repeat_penalty: 1.1,
			max_tokens: 2048
		} as Parameters<typeof ParameterSyncService.extractServerDefaults>[0];

		const result = ParameterSyncService.extractServerDefaults(serverParams);

		expect(result.temperature).toBe(0.8);
		expect(result.top_k).toBe(40);
		expect(result.top_p).toBe(0.95);
		expect(result.min_p).toBe(0.05);
		expect(result.repeat_penalty).toBe(1.1);
		expect(result.max_tokens).toBe(2048);
	});

	it('converts samplers array to semicolon-delimited string', () => {
		const serverParams = {
			samplers: ['top_k', 'top_p', 'temperature']
		} as Parameters<typeof ParameterSyncService.extractServerDefaults>[0];

		const result = ParameterSyncService.extractServerDefaults(serverParams);
		expect(result.samplers).toBe('top_k;top_p;temperature');
	});

	it('extracts boolean webui settings from webuiSettings', () => {
		const result = ParameterSyncService.extractServerDefaults(null, {
			showThoughtInProgress: true,
			keepStatsVisible: false,
			pdfAsImage: true
		});

		expect(result.showThoughtInProgress).toBe(true);
		expect(result.keepStatsVisible).toBe(false);
		expect(result.pdfAsImage).toBe(true);
	});

	it('extracts string webui settings', () => {
		const result = ParameterSyncService.extractServerDefaults(null, {
			systemMessage: 'You are helpful.',
			theme: 'dark'
		});

		expect(result.systemMessage).toBe('You are helpful.');
		expect(result.theme).toBe('dark');
	});

	it('handles null serverParams gracefully', () => {
		const result = ParameterSyncService.extractServerDefaults(null);
		expect(result).toEqual({});
	});

	it('ignores unknown server keys not in SYNCABLE_PARAMETERS', () => {
		const serverParams = {
			temperature: 0.7,
			unknown_field: 'ignored',
			another_unknown: 99
		} as Parameters<typeof ParameterSyncService.extractServerDefaults>[0];

		const result = ParameterSyncService.extractServerDefaults(serverParams);
		expect(result).not.toHaveProperty('unknown_field');
		expect(result).not.toHaveProperty('another_unknown');
		expect(result.temperature).toBe(0.7);
	});

	it('normalizes floating-point precision', () => {
		// 0.1 + 0.2 = 0.30000000000000004 in JS; should be normalized
		const serverParams = {
			temperature: 0.30000000000000004
		} as Parameters<typeof ParameterSyncService.extractServerDefaults>[0];

		const result = ParameterSyncService.extractServerDefaults(serverParams);
		expect(result.temperature).toBe(0.3);
	});

	it('merges both serverParams and webuiSettings in one call', () => {
		const serverParams = {
			temperature: 0.9,
			top_p: 0.95
		} as Parameters<typeof ParameterSyncService.extractServerDefaults>[0];

		const result = ParameterSyncService.extractServerDefaults(serverParams, {
			theme: 'light',
			showMessageStats: true
		});

		expect(result.temperature).toBe(0.9);
		expect(result.top_p).toBe(0.95);
		expect(result.theme).toBe('light');
		expect(result.showMessageStats).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// mergeWithServerDefaults
// ─────────────────────────────────────────────────────────────────────────────

describe('mergeWithServerDefaults', () => {
	it('applies server defaults to empty current settings', () => {
		const serverDefaults = { temperature: 0.8, top_k: 40 };
		const result = ParameterSyncService.mergeWithServerDefaults({}, serverDefaults);

		expect(result.temperature).toBe(0.8);
		expect(result.top_k).toBe(40);
	});

	it('preserves user overrides and does not overwrite them', () => {
		const current = { temperature: 0.5 };
		const serverDefaults = { temperature: 0.8, top_k: 40 };
		const userOverrides = new Set(['temperature']);

		const result = ParameterSyncService.mergeWithServerDefaults(
			current,
			serverDefaults,
			userOverrides
		);

		// User's temperature override must be preserved
		expect(result.temperature).toBe(0.5);
		// Server value for non-overridden key is applied
		expect(result.top_k).toBe(40);
	});

	it('applies all server defaults when no user overrides exist', () => {
		const current = {};
		const serverDefaults = { temperature: 0.7, top_p: 0.9, max_tokens: 1024 };

		const result = ParameterSyncService.mergeWithServerDefaults(current, serverDefaults);

		expect(result.temperature).toBe(0.7);
		expect(result.top_p).toBe(0.9);
		expect(result.max_tokens).toBe(1024);
	});

	it('does not modify the original current settings object', () => {
		const current = { temperature: 0.5 };
		const serverDefaults = { temperature: 0.8 };

		ParameterSyncService.mergeWithServerDefaults(current, serverDefaults);

		expect(current.temperature).toBe(0.5);
	});

	it('multiple user overrides each individually preserved', () => {
		const current = { temperature: 0.3, top_k: 10 };
		const serverDefaults = { temperature: 0.9, top_k: 50, max_tokens: 512 };
		const overrides = new Set(['temperature', 'top_k']);

		const result = ParameterSyncService.mergeWithServerDefaults(current, serverDefaults, overrides);

		expect(result.temperature).toBe(0.3);
		expect(result.top_k).toBe(10);
		expect(result.max_tokens).toBe(512);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Full pipeline: extract → merge → diff
// ─────────────────────────────────────────────────────────────────────────────

describe('full pipeline: extract → merge → diff', () => {
	it('pipeline produces accurate diff after user overrides one parameter', () => {
		// Step 1: extract server defaults
		const serverParams = {
			temperature: 0.8,
			top_k: 40,
			top_p: 0.95
		} as Parameters<typeof ParameterSyncService.extractServerDefaults>[0];

		const serverDefaults = ParameterSyncService.extractServerDefaults(serverParams);

		// Step 2: user overrides temperature
		const userSettings = { temperature: 0.3 };
		const overrides = new Set(['temperature']);

		const merged = ParameterSyncService.mergeWithServerDefaults(
			userSettings,
			serverDefaults,
			overrides
		);

		// Step 3: diff
		const diff = ParameterSyncService.createParameterDiff(merged, serverDefaults);

		// temperature differs (user override)
		expect(diff.temperature?.differs).toBe(true);
		expect(diff.temperature?.current).toBe(0.3);
		expect(diff.temperature?.server).toBe(0.8);

		// top_k matches server default (no override)
		expect(diff.top_k?.differs).toBe(false);
		expect(diff.top_k?.current).toBe(40);
	});

	it('pipeline with no overrides: all diff entries show differs=false', () => {
		const serverParams = {
			temperature: 0.7,
			top_p: 0.9,
			max_tokens: 2048
		} as Parameters<typeof ParameterSyncService.extractServerDefaults>[0];

		const serverDefaults = ParameterSyncService.extractServerDefaults(serverParams);
		const merged = ParameterSyncService.mergeWithServerDefaults({}, serverDefaults);
		const diff = ParameterSyncService.createParameterDiff(merged, serverDefaults);

		expect(diff.temperature?.differs).toBe(false);
		expect(diff.top_p?.differs).toBe(false);
		expect(diff.max_tokens?.differs).toBe(false);
	});

	it('pipeline with all overrides: all diff entries show differs=true', () => {
		const serverDefaults = { temperature: 0.8, top_k: 40 };
		const userSettings = { temperature: 0.1, top_k: 5 };
		const overrides = new Set(['temperature', 'top_k']);

		const merged = ParameterSyncService.mergeWithServerDefaults(
			userSettings,
			serverDefaults,
			overrides
		);
		const diff = ParameterSyncService.createParameterDiff(merged, serverDefaults);

		expect(diff.temperature?.differs).toBe(true);
		expect(diff.top_k?.differs).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// validateServerParameter
// ─────────────────────────────────────────────────────────────────────────────

describe('validateServerParameter', () => {
	it('validates numeric parameters correctly', () => {
		expect(ParameterSyncService.validateServerParameter('temperature', 0.8)).toBe(true);
		expect(ParameterSyncService.validateServerParameter('temperature', 'hot')).toBe(false);
		expect(ParameterSyncService.validateServerParameter('temperature', true)).toBe(false);
		expect(ParameterSyncService.validateServerParameter('temperature', NaN)).toBe(false);
	});

	it('validates boolean parameters correctly', () => {
		expect(ParameterSyncService.validateServerParameter('showThoughtInProgress', true)).toBe(true);
		expect(ParameterSyncService.validateServerParameter('showThoughtInProgress', false)).toBe(true);
		expect(ParameterSyncService.validateServerParameter('showThoughtInProgress', 1)).toBe(false);
		expect(ParameterSyncService.validateServerParameter('showThoughtInProgress', 'yes')).toBe(
			false
		);
	});

	it('validates string parameters correctly', () => {
		expect(ParameterSyncService.validateServerParameter('systemMessage', 'hello')).toBe(true);
		expect(ParameterSyncService.validateServerParameter('systemMessage', '')).toBe(true);
		expect(ParameterSyncService.validateServerParameter('systemMessage', 42)).toBe(false);
		expect(ParameterSyncService.validateServerParameter('systemMessage', true)).toBe(false);
	});

	it('returns false for unknown parameter keys', () => {
		expect(ParameterSyncService.validateServerParameter('nonExistentParam', 'value')).toBe(false);
		expect(ParameterSyncService.validateServerParameter('', 0)).toBe(false);
	});

	it('validates top_k as number', () => {
		expect(ParameterSyncService.validateServerParameter('top_k', 40)).toBe(true);
		expect(ParameterSyncService.validateServerParameter('top_k', 40.5)).toBe(true);
		expect(ParameterSyncService.validateServerParameter('top_k', '40')).toBe(false);
	});

	it('validates samplers as string', () => {
		expect(ParameterSyncService.validateServerParameter('samplers', 'top_k;top_p')).toBe(true);
		expect(ParameterSyncService.validateServerParameter('samplers', 42)).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// getParameterInfo
// ─────────────────────────────────────────────────────────────────────────────

describe('getParameterInfo', () => {
	it('returns DEFAULT source when parameter is not in userOverrides', () => {
		const propsDefaults = { temperature: 0.8 };
		const userOverrides = new Set<string>();

		const info = ParameterSyncService.getParameterInfo(
			'temperature',
			0.8,
			propsDefaults,
			userOverrides
		);

		expect(info.source).toBe(ParameterSource.DEFAULT);
		expect(info.serverDefault).toBe(0.8);
		expect(info.userOverride).toBeUndefined();
	});

	it('returns CUSTOM source when parameter is in userOverrides', () => {
		const propsDefaults = { temperature: 0.8 };
		const userOverrides = new Set(['temperature']);

		const info = ParameterSyncService.getParameterInfo(
			'temperature',
			0.3,
			propsDefaults,
			userOverrides
		);

		expect(info.source).toBe(ParameterSource.CUSTOM);
		expect(info.userOverride).toBe(0.3);
		expect(info.serverDefault).toBe(0.8);
	});

	it('returns undefined serverDefault when parameter has no props default', () => {
		const propsDefaults = {};
		const userOverrides = new Set<string>();

		const info = ParameterSyncService.getParameterInfo(
			'temperature',
			0.5,
			propsDefaults,
			userOverrides
		);

		expect(info.serverDefault).toBeUndefined();
	});

	it('current value is always included in info', () => {
		const info = ParameterSyncService.getParameterInfo(
			'temperature',
			0.42,
			{ temperature: 0.8 },
			new Set<string>()
		);
		expect(info.value).toBe(0.42);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// canSyncParameter / getSyncableParameterKeys
// ─────────────────────────────────────────────────────────────────────────────

describe('canSyncParameter and getSyncableParameterKeys', () => {
	it('returns true for known syncable parameters', () => {
		expect(ParameterSyncService.canSyncParameter('temperature')).toBe(true);
		expect(ParameterSyncService.canSyncParameter('top_k')).toBe(true);
		expect(ParameterSyncService.canSyncParameter('systemMessage')).toBe(true);
		expect(ParameterSyncService.canSyncParameter('theme')).toBe(true);
		expect(ParameterSyncService.canSyncParameter('mcpServers')).toBe(true);
	});

	it('returns false for unknown parameters', () => {
		expect(ParameterSyncService.canSyncParameter('unknownParam')).toBe(false);
		expect(ParameterSyncService.canSyncParameter('')).toBe(false);
	});

	it('getSyncableParameterKeys returns a non-empty array', () => {
		const keys = ParameterSyncService.getSyncableParameterKeys();
		expect(keys.length).toBeGreaterThan(0);
		expect(keys).toContain('temperature');
		expect(keys).toContain('systemMessage');
		expect(keys).toContain('theme');
	});

	it('all keys from getSyncableParameterKeys pass canSyncParameter', () => {
		const keys = ParameterSyncService.getSyncableParameterKeys();
		for (const key of keys) {
			expect(ParameterSyncService.canSyncParameter(key)).toBe(true);
		}
	});
});
