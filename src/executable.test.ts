import { describe, expect, it } from 'vitest';

import {
    cockpitUserHome,
    dumpversionArgv,
    FLATPAK_INFO_ARGV,
    FLATPAK_INVOCATION,
    HW_PROBE_FLATPAK_APP_ID,
    HW_PROBE_LOCAL_PROBE_ARGUMENTS,
    PATH_DUMPVERSION_INVOCATION,
    buildLocalProbeArgv,
    isUploadArgument,
    normalizeAuthenticatedHome,
    userLocalHwProbePath,
    userLocalInvocation,
} from './executable';

describe('userLocalHwProbePath', () => {
    it('constructs the user-local executable path exactly', () => {
        expect(userLocalHwProbePath('/home/testuser')).toBe('/home/testuser/.local/bin/hw-probe');
    });

    it('trims a trailing slash on the home directory', () => {
        expect(userLocalHwProbePath('/home/testuser/')).toBe('/home/testuser/.local/bin/hw-probe');
    });

    it('keeps normal valid characters including spaces', () => {
        expect(userLocalHwProbePath('/home/test user')).toBe('/home/test user/.local/bin/hw-probe');
    });

    it('rejects a relative home directory', () => {
        expect(userLocalHwProbePath('home/testuser')).toBeNull();
        expect(userLocalHwProbePath('~')).toBeNull();
    });

    it('rejects path traversal components', () => {
        expect(userLocalHwProbePath('/home/testuser/../other')).toBeNull();
        expect(userLocalHwProbePath('/home/./testuser')).toBeNull();
    });

    it('rejects an empty home directory', () => {
        expect(userLocalHwProbePath('')).toBeNull();
        expect(userLocalHwProbePath('   ')).toBeNull();
    });
});

describe('normalizeAuthenticatedHome', () => {
    it('normalizes a trailing slash', () => {
        expect(normalizeAuthenticatedHome('/home/testuser/')).toBe('/home/testuser');
    });

    it('rejects traversal', () => {
        expect(normalizeAuthenticatedHome('/home/testuser/../other')).toBeNull();
    });
});

describe('userLocalInvocation', () => {
    it('builds a native invocation for the user-local executable', () => {
        expect(userLocalInvocation('/home/testuser')).toEqual({
            kind: 'native',
            executable: '/home/testuser/.local/bin/hw-probe',
            source: 'user-local',
        });
    });

    it('returns null when the home directory cannot be used', () => {
        expect(userLocalInvocation('../not-a-home')).toBeNull();
    });
});

describe('dumpversionArgv', () => {
    it('uses the native executable path plus -dumpversion', () => {
        expect(dumpversionArgv(PATH_DUMPVERSION_INVOCATION)).toEqual(['hw-probe', '-dumpversion']);
    });

    it('uses the user-local executable path plus -dumpversion', () => {
        expect(dumpversionArgv({
            kind: 'native',
            executable: '/home/testuser/.local/bin/hw-probe',
            source: 'user-local',
        })).toEqual([
            '/home/testuser/.local/bin/hw-probe',
            '-dumpversion',
        ]);
    });

    it('invokes the official Flatpak app through flatpak run, not as a filesystem path', () => {
        expect(dumpversionArgv(FLATPAK_INVOCATION)).toEqual([
            'flatpak',
            'run',
            HW_PROBE_FLATPAK_APP_ID,
            '-dumpversion',
        ]);
        expect(FLATPAK_INVOCATION.kind).toBe('flatpak');
        expect(FLATPAK_INVOCATION.executable).toBe('flatpak');
        expect(dumpversionArgv(FLATPAK_INVOCATION).join(' ')).not.toMatch(/\/org\.linux_hardware\.hw-probe/);
    });

    it('queries Flatpak installation with a machine-oriented argv', () => {
        expect([...FLATPAK_INFO_ARGV]).toEqual([
            'flatpak',
            'info',
            '--show-ref',
            HW_PROBE_FLATPAK_APP_ID,
        ]);
    });
});

describe('buildLocalProbeArgv', () => {
    it('uses documented -all for a native PATH invocation', () => {
        expect(buildLocalProbeArgv(PATH_DUMPVERSION_INVOCATION)).toEqual(['hw-probe', '-all']);
    });

    it('uses an absolute PATH install with -all', () => {
        expect(buildLocalProbeArgv({
            kind: 'native',
            executable: '/usr/bin/hw-probe',
            source: 'native-path',
        })).toEqual(['/usr/bin/hw-probe', '-all']);
    });

    it('uses the user-local executable with -all', () => {
        expect(buildLocalProbeArgv({
            kind: 'native',
            executable: '/home/testuser/.local/bin/hw-probe',
            source: 'user-local',
        })).toEqual(['/home/testuser/.local/bin/hw-probe', '-all']);
    });

    it('uses flatpak run for the official app, not a filesystem path', () => {
        expect(buildLocalProbeArgv(FLATPAK_INVOCATION)).toEqual([
            'flatpak',
            'run',
            HW_PROBE_FLATPAK_APP_ID,
            '-all',
        ]);
    });

    it('never includes an upload flag for any supported invocation', () => {
        const invocations = [
            PATH_DUMPVERSION_INVOCATION,
            {
                kind: 'native' as const,
                executable: '/home/testuser/.local/bin/hw-probe',
                source: 'user-local' as const,
            },
            FLATPAK_INVOCATION,
        ];
        expect([...HW_PROBE_LOCAL_PROBE_ARGUMENTS]).toEqual(['-all']);
        expect(HW_PROBE_LOCAL_PROBE_ARGUMENTS.some(isUploadArgument)).toBe(false);
        for (const invocation of invocations) {
            const argv = buildLocalProbeArgv(invocation);
            expect(argv.some(isUploadArgument)).toBe(false);
            expect(argv).not.toContain('-upload');
            expect(argv).not.toContain('--upload');
            expect(argv).not.toContain('-probe');
            expect(argv).not.toContain('-check');
            expect(argv).not.toContain('-check-extended');
            expect(argv.join('\0')).not.toMatch(/(^|\0)-upload(\0|$)/);
        }
    });
});

describe('cockpitUserHome', () => {
    it('reads the authenticated user home from cockpit.info after init', async () => {
        await expect(cockpitUserHome()).resolves.toBe('/home/testuser');
    });
});
