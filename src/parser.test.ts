import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseHwProbeVersion, normalizeSpawnFailure } from './parser';
import type { SpawnFailure } from './spawn';

describe('parseHwProbeVersion', () => {
    it('accepts a dotted version', () => {
        expect(parseHwProbeVersion('1.6.6')).toEqual({ ok: true, version: '1.6.6' });
    });

    it('accepts a version with a trailing newline', () => {
        expect(parseHwProbeVersion('1.6.6\n')).toEqual({ ok: true, version: '1.6.6' });
    });

    it('trims surrounding whitespace', () => {
        expect(parseHwProbeVersion('  1.6.6  \n')).toEqual({ ok: true, version: '1.6.6' });
    });

    it('accepts the current upstream dumpversion value 1.6', () => {
        expect(parseHwProbeVersion('1.6\n')).toEqual({ ok: true, version: '1.6' });
    });

    it('accepts a Fedora-style three-part version', () => {
        expect(parseHwProbeVersion('1.6.5')).toEqual({ ok: true, version: '1.6.5' });
    });

    it('accepts an AppImage-style release suffix', () => {
        expect(parseHwProbeVersion('1.6.5-189\n')).toEqual({ ok: true, version: '1.6.5-189' });
    });

    it('rejects empty output', () => {
        expect(parseHwProbeVersion('')).toEqual({
            ok: false,
            error: { kind: 'malformed-output', message: 'hw-probe version output was malformed' },
        });
    });

    it('rejects whitespace-only output', () => {
        expect(parseHwProbeVersion('\n   \n')).toMatchObject({
            ok: false,
            error: { kind: 'malformed-output' },
        });
    });

    it('rejects multiline diagnostic text', () => {
        expect(parseHwProbeVersion('Hardware Probe 1.6\nA tool to probe for hardware\n')).toMatchObject({
            ok: false,
            error: { kind: 'malformed-output' },
        });
    });

    it('rejects obviously malformed garbage', () => {
        expect(parseHwProbeVersion('not a version')).toMatchObject({
            ok: false,
            error: { kind: 'malformed-output' },
        });
    });

    it('rejects binary control characters', () => {
        expect(parseHwProbeVersion('1.6.6\u0000')).toMatchObject({
            ok: false,
            error: { kind: 'malformed-output' },
        });
    });
});

describe('normalizeSpawnFailure', () => {
    function failure(partial: Partial<SpawnFailure>): SpawnFailure {
        return {
            problem: null,
            exit_status: null,
            exit_signal: null,
            message: '',
            ...partial,
        };
    }

    it('maps Cockpit not-found to command-not-found', () => {
        expect(normalizeSpawnFailure(failure({ problem: 'not-found' }))).toEqual({
            kind: 'command-not-found',
            message: 'hw-probe executable was not found',
        });
    });

    it('maps Cockpit access-denied to permission-denied', () => {
        expect(normalizeSpawnFailure(failure({ problem: 'access-denied' }))).toEqual({
            kind: 'permission-denied',
            message: 'execution of hw-probe was denied',
        });
    });

    it('maps Cockpit timeout to timeout', () => {
        expect(normalizeSpawnFailure(failure({ problem: 'timeout' }))).toEqual({
            kind: 'timeout',
            message: 'hw-probe version query timed out',
        });
    });

    it('maps a non-zero exit status to command-failed', () => {
        expect(normalizeSpawnFailure(failure({ problem: null, exit_status: 2 }))).toEqual({
            kind: 'command-failed',
            message: 'hw-probe exited with status 2',
        });
    });

    it('does not classify English stderr as missing software', () => {
        const result = normalizeSpawnFailure(failure({
            problem: null,
            exit_status: 127,
            message: 'command not found',
        }));
        expect(result.kind).toBe('command-failed');
    });

    it('maps unknown objects to unknown', () => {
        expect(normalizeSpawnFailure(new Error('boom'))).toEqual({
            kind: 'unknown',
            message: 'hw-probe version query failed',
        });
    });
});

afterEach(() => {
    vi.useRealTimers();
});
