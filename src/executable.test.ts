import { describe, expect, it } from 'vitest';

import { cockpitUserHome, userLocalHwProbePath } from './executable';

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

describe('cockpitUserHome', () => {
    it('reads the authenticated user home from cockpit.info after init', async () => {
        await expect(cockpitUserHome()).resolves.toBe('/home/testuser');
    });
});
