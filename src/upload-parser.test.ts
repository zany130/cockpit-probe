import { describe, expect, it } from 'vitest';

import {
    classifyUploadStderr,
    linuxHardwareProbeUrl,
    parseUploadStdout,
    validateLinuxHardwareProbeUrl,
} from './upload-parser';

describe('validateLinuxHardwareProbeUrl', () => {
    it('accepts the documented HTTPS probe URL', () => {
        expect(validateLinuxHardwareProbeUrl('https://linux-hardware.org/?probe=b394035f90'))
                .toBe('https://linux-hardware.org/?probe=b394035f90');
    });

    it('rejects http, unexpected hosts, and non-URL schemes', () => {
        expect(validateLinuxHardwareProbeUrl('http://linux-hardware.org/?probe=b394035f90')).toBeUndefined();
        expect(validateLinuxHardwareProbeUrl('https://evil.example/?probe=b394035f90')).toBeUndefined();
        expect(validateLinuxHardwareProbeUrl('javascript:alert(1)')).toBeUndefined();
        expect(validateLinuxHardwareProbeUrl('file:///etc/passwd')).toBeUndefined();
        expect(validateLinuxHardwareProbeUrl('data:text/html,hi')).toBeUndefined();
        expect(validateLinuxHardwareProbeUrl('https://linux-hardware.org/not-a-probe')).toBeUndefined();
        expect(validateLinuxHardwareProbeUrl('https://www.linux-hardware.org/?probe=b394035f90')).toBeUndefined();
        expect(validateLinuxHardwareProbeUrl('https://linux-hardware.org/?probe=b394035f90&other=1')).toBeUndefined();
        expect(validateLinuxHardwareProbeUrl('https://user:pass@linux-hardware.org/?probe=b394035f90')).toBeUndefined();
    });
});

describe('parseUploadStdout', () => {
    it('parses a Probe URL line', () => {
        const parsed = parseUploadStdout('Probe URL: https://linux-hardware.org/?probe=b394035f90\n');
        expect(parsed.metadataRecognized).toBe(true);
        expect(parsed.result.url).toBe('https://linux-hardware.org/?probe=b394035f90');
        expect(parsed.result.probeId).toBe('b394035f90');
    });

    it('builds the documented URL from a probe= token', () => {
        const parsed = parseUploadStdout('Uploaded probe=abcdef1234 for review\n');
        expect(parsed.result.url).toBe(linuxHardwareProbeUrl('abcdef1234'));
        expect(parsed.result.probeId).toBe('abcdef1234');
    });

    it('treats command-success-shaped output without a probe id as unrecognized metadata', () => {
        const parsed = parseUploadStdout('Ok\n');
        expect(parsed.metadataRecognized).toBe(false);
        expect(parsed.result.url).toBeUndefined();
        expect(parsed.result.probeId).toBeUndefined();
    });

    it('does not accept a foreign HTTPS domain as a probe link', () => {
        const parsed = parseUploadStdout('https://evil.example/?probe=b394035f90\n');
        expect(parsed.result.url).toBeUndefined();
    });

    it('does not promote an http linux-hardware URL', () => {
        const parsed = parseUploadStdout('http://linux-hardware.org/?probe=b394035f90\n');
        expect(parsed.result.url).toBeUndefined();
    });

    it('does not treat a javascript or data URL as a probe link', () => {
        expect(parseUploadStdout('javascript:alert(1)\n').result.url).toBeUndefined();
        expect(parseUploadStdout('data:text/html,hi\n').result.url).toBeUndefined();
        expect(parseUploadStdout('file:///tmp/probe\n').result.url).toBeUndefined();
    });
});

describe('classifyUploadStderr', () => {
    it('maps missing local probe text', () => {
        expect(classifyUploadStderr("ERROR: can't access '/root/HW_PROBE/LATEST/hw.info', please make probe first"))
                .toBe('no-local-probe');
    });

    it('maps curl network failures', () => {
        expect(classifyUploadStderr('failed to upload data, curl error code "6"')).toBe('network-unavailable');
        expect(classifyUploadStderr('failed to upload data, curl error code "7"')).toBe('network-unavailable');
        expect(classifyUploadStderr('failed to upload data, curl error code "28"')).toBe('network-unavailable');
    });

    it('maps HTTP rejection', () => {
        expect(classifyUploadStderr('failed to upload data, curl error code "22"')).toBe('upstream-rejected');
    });
});
