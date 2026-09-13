import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseHwProbeVersion, normalizeSpawnFailure, parseLocalProbePath, normalizeProbeExecutionFailure } from './parser';
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

    it('accepts older and newer dumpversion strings without a compatibility matrix', () => {
        expect(parseHwProbeVersion('1.4\n')).toEqual({ ok: true, version: '1.4' });
        expect(parseHwProbeVersion('1.5.1')).toEqual({ ok: true, version: '1.5.1' });
        expect(parseHwProbeVersion('1.7')).toEqual({ ok: true, version: '1.7' });
        expect(parseHwProbeVersion('2.0.0-1')).toEqual({ ok: true, version: '2.0.0-1' });
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

describe('parseLocalProbePath', () => {
    it('reads an absolute local probe path from stdout', () => {
        expect(parseLocalProbePath(
            'Probe for hardware ... Ok\nReading logs ... Ok\nLocal probe path: /root/HW_PROBE/LATEST/hw.info\n'
        )).toBe('/root/HW_PROBE/LATEST/hw.info');
    });

    it('ignores stdout that does not print a local probe path', () => {
        expect(parseLocalProbePath('Probe for hardware ... Ok\n')).toBeUndefined();
    });

    it('rejects a relative or traversing path', () => {
        expect(parseLocalProbePath('Local probe path: ../HW_PROBE\n')).toBeUndefined();
        expect(parseLocalProbePath('Local probe path: /tmp/../etc/passwd\n')).toBeUndefined();
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

describe('normalizeProbeExecutionFailure', () => {
    function failure(partial: Partial<SpawnFailure>): SpawnFailure {
        return {
            problem: null,
            exit_status: null,
            exit_signal: null,
            message: '',
            ...partial,
        };
    }

    it('maps native not-found to command-not-found', () => {
        expect(normalizeProbeExecutionFailure(failure({ problem: 'not-found' }), { backend: 'native' })).toEqual({
            kind: 'command-not-found',
            message: 'hw-probe executable was not found',
        });
    });

    it('maps Flatpak not-found to a launch failure, not missing', () => {
        expect(normalizeProbeExecutionFailure(failure({ problem: 'not-found' }), { backend: 'flatpak' })).toEqual({
            kind: 'command-failed',
            message: 'hw-probe Flatpak is installed but failed to launch',
        });
    });

    it('maps native privileged access-denied to administrative-access-required', () => {
        expect(normalizeProbeExecutionFailure(failure({ problem: 'access-denied' }), { backend: 'native' })).toEqual({
            kind: 'administrative-access-required',
            message: 'Administrative access is required to run a native hardware probe',
        });
    });

    it('maps Flatpak access-denied to permission-denied, not a privilege error', () => {
        expect(normalizeProbeExecutionFailure(failure({ problem: 'access-denied' }), { backend: 'flatpak' })).toEqual({
            kind: 'permission-denied',
            message: 'execution of hw-probe was denied',
        });
    });

    it('maps a non-zero hw-probe exit to command-failed after privilege is granted', () => {
        expect(normalizeProbeExecutionFailure(
            failure({ problem: null, exit_status: 1 }),
            { backend: 'native' }
        )).toEqual({
            kind: 'command-failed',
            message: 'hw-probe exited with status 1',
        });
    });

    it('maps timeout to a probe timeout', () => {
        expect(normalizeProbeExecutionFailure(failure({ problem: 'timeout' }), { backend: 'native' })).toEqual({
            kind: 'timeout',
            message: 'hardware probe timed out',
        });
    });
});

afterEach(() => {
    vi.useRealTimers();
});
