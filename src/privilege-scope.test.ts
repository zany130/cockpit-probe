import { describe, expect, it } from 'vitest';

import { FLATPAK_INVOCATION, PATH_DUMPVERSION_INVOCATION } from './executable';
import { NATIVE_DEVICES_PATH, NATIVE_HOST_PATH } from './inventory-paths';
import { buildUploadSpawnOptions } from './upload-provider';
import { buildProbeSpawnOptions } from './probe-provider';
import capabilitySource from './capability-provider.ts?raw';
import inventorySource from './inventory-provider.ts?raw';
import inventoryPathsSource from './inventory-paths.ts?raw';
import driveStatusSource from './drive-status.ts?raw';
import findingsSource from './findings-normalizer.ts?raw';

describe('privilege scope', () => {
    it('requests administrative access only for native probe and native upload', () => {
        expect(buildProbeSpawnOptions(PATH_DUMPVERSION_INVOCATION)).toEqual({ superuser: 'require' });
        expect(buildUploadSpawnOptions(PATH_DUMPVERSION_INVOCATION)).toEqual({ superuser: 'require' });
        expect(buildProbeSpawnOptions(FLATPAK_INVOCATION)).toEqual({});
        expect(buildUploadSpawnOptions(FLATPAK_INVOCATION)).toEqual({});
    });

    it('does not add a second privileged probe flag or SMART command', () => {
        expect(inventoryPathsSource).not.toMatch(/smartctl/);
        expect(inventoryPathsSource).not.toMatch(/\/logs\//);
        expect(NATIVE_HOST_PATH).toBe('/root/HW_PROBE/LATEST/hw.info/host');
        expect(NATIVE_DEVICES_PATH).toBe('/root/HW_PROBE/LATEST/hw.info/devices');
        expect(NATIVE_HOST_PATH).not.toContain('logs');
        expect(NATIVE_DEVICES_PATH).not.toContain('smartctl');
        expect(driveStatusSource).not.toMatch(/["']-check["']/);
        expect(findingsSource).not.toMatch(/["']-check["']/);
        expect(capabilitySource).not.toMatch(/superuser/);
        expect(inventorySource).not.toMatch(/smartctl/);
        expect(inventorySource).not.toMatch(/\/logs\//);
    });
});
