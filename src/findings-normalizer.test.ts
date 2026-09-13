import { describe, expect, it } from 'vitest';

import { parseDeviceRow, parseDevicesFile } from './device-parser';
import {
    DEVICE_DETECTED_BRIDGE,
    DEVICE_FAILED_NO_DRIVER,
    DEVICE_FIXED_INPUT,
    DEVICE_LIMITED_NETWORK,
    DEVICE_MALFORMED_ROW,
    DEVICE_MALFUNC_BATTERY,
    DEVICE_MISSING_STATUS,
    DEVICE_UNKNOWN_STATUS,
    FAKE_HWADDR,
    VALID_DEVICES_FIXTURE,
    VALID_HOST_FIXTURE,
    mixedFindingsDevices,
    repeatedCpuRows,
} from './fixtures/inventory-fixtures';
import {
    classifyUpstreamStatus,
    deriveFindings,
    devicesFromCategories,
    uniqueDevicesById,
    deriveFindingsFromSummary,
} from './findings-normalizer';
import { normalizeInventory } from './inventory-normalizer';
import { summaryContainsSensitiveValue } from './inventory-privacy';
import type { HardwareDevice } from './model';

function device(row: string): HardwareDevice {
    const parsed = parseDeviceRow(row);
    if (parsed == null)
        throw new Error('row must parse');
    return parsed;
}

describe('classifyUpstreamStatus', () => {
    it('maps the authoritative local vocabulary', () => {
        expect(classifyUpstreamStatus('works')).toBe('confirmed-working');
        expect(classifyUpstreamStatus('detected')).toBe('detected');
        expect(classifyUpstreamStatus('failed')).toBe('reported-problem');
        expect(classifyUpstreamStatus('malfunc')).toBe('reported-problem');
        expect(classifyUpstreamStatus('limited')).toBe('confirmed-working');
        expect(classifyUpstreamStatus('fixed')).toBe('confirmed-working');
    });

    it('treats a missing status like detected, not as failure', () => {
        expect(classifyUpstreamStatus('')).toBe('detected');
        expect(classifyUpstreamStatus('   ')).toBe('detected');
    });

    it('does not treat unknown future statuses as failure', () => {
        expect(classifyUpstreamStatus('future-new-status')).toBe('unknown');
        expect(classifyUpstreamStatus('glitchy')).toBe('unknown');
    });
});

describe('deriveFindings', () => {
    it('counts unique CPU logical rows once', () => {
        const devices = repeatedCpuRows(12).map(device);
        const findings = deriveFindings(devices);
        expect(findings.counts.total).toBe(1);
        expect(findings.counts.works).toBe(1);
        expect(uniqueDevicesById(devices)).toHaveLength(1);
    });

    it('does not treat detected as a reported problem', () => {
        expect(classifyUpstreamStatus('detected')).not.toBe('reported-problem');
        expect(classifyUpstreamStatus('detected')).not.toBe('confirmed-working');
        const findings = deriveFindings([
            device(DEVICE_DETECTED_BRIDGE),
            device('pci:10ec-8125;02-00;detected;network;r8169;Realtek;RTL8125'),
        ]);
        expect(findings.problems).toHaveLength(0);
        expect(findings.counts.detected).toBe(2);
        expect(findings.unconfirmed.some(item => item.device?.type === 'network')).toBe(true);
        expect(findings.secondaryUnconfirmed.some(item => item.device?.type === 'bridge')).toBe(true);
        expect(JSON.stringify(findings)).not.toMatch(/broken/i);
        expect(JSON.stringify(findings)).not.toMatch(/warning/i);
        expect(JSON.stringify(findings)).not.toMatch(/critical/i);
        expect(JSON.stringify(findings)).not.toMatch(/healthy/i);
    });

    it('does not turn a detected low-level bridge into a problem card', () => {
        const findings = deriveFindings([device(DEVICE_DETECTED_BRIDGE)]);
        expect(findings.problems).toHaveLength(0);
        expect(findings.unconfirmed).toHaveLength(0);
        expect(findings.secondaryUnconfirmed).toHaveLength(1);
        expect(findings.secondaryUnconfirmed[0].kind).toBe('detected');
        expect(findings.secondaryUnconfirmed[0].upstreamStatus).toBe('detected');
    });

    it('records failed and malfunc as reported problems', () => {
        const findings = deriveFindings([
            device(DEVICE_FAILED_NO_DRIVER),
            device(DEVICE_MALFUNC_BATTERY),
        ]);
        expect(findings.problems).toHaveLength(2);
        expect(findings.counts.failed).toBe(1);
        expect(findings.counts.malfunc).toBe(1);
        expect(findings.problems.every(item => item.kind === 'reported-problem')).toBe(true);
        expect(findings.problems.every(item => item.source === 'probe-status')).toBe(true);
        expect(findings.problems[0].device?.id).toBe(device(DEVICE_FAILED_NO_DRIVER).id);
    });

    it('keeps limited and fixed as confirmed-working, not problems', () => {
        const findings = deriveFindings([
            device(DEVICE_LIMITED_NETWORK),
            device(DEVICE_FIXED_INPUT),
        ]);
        expect(findings.problems).toHaveLength(0);
        expect(findings.counts.limited).toBe(1);
        expect(findings.counts.fixed).toBe(1);
        expect(classifyUpstreamStatus('limited')).toBe('confirmed-working');
        expect(classifyUpstreamStatus('fixed')).toBe('confirmed-working');
    });

    it('preserves an unknown future status without calling it a failure', () => {
        const findings = deriveFindings([device(DEVICE_UNKNOWN_STATUS)]);
        expect(findings.unknown).toHaveLength(1);
        expect(findings.unknown[0].kind).toBe('unknown');
        expect(findings.unknown[0].upstreamStatus).toBe('glitchy');
        expect(findings.problems).toHaveLength(0);
        expect(findings.counts.other).toBe(1);
    });

    it('correlates findings to the device id, not the display name', () => {
        const ramA = device('mem:slot-0;05-00;failed;memory;;Kingston;RAM Module 16GB DIMM 4800MT/s');
        const ramB = device('mem:slot-1;05-00;works;memory;;Kingston;RAM Module 16GB DIMM 4800MT/s');
        const findings = deriveFindings([ramA, ramB]);
        expect(findings.problems).toHaveLength(1);
        expect(findings.problems[0].device?.id).toBe('mem:slot-0');
        expect(findings.problems[0].device?.id).not.toBe('mem:slot-1');
        expect(findings.counts.works).toBe(1);
        expect(findings.counts.failed).toBe(1);
    });

    it('keeps an unassociated finding from attaching to another device', () => {
        const findings = deriveFindings([device(DEVICE_FAILED_NO_DRIVER)]);
        const unassociated = {
            device: null,
            upstreamStatus: 'failed',
            kind: 'reported-problem' as const,
            summary: 'hw-probe reported failed',
            source: 'probe-status' as const,
            prominence: 'noteworthy' as const,
        };
        expect(findings.problems[0].device?.id).toBe(device(DEVICE_FAILED_NO_DRIVER).id);
        expect(unassociated.device).toBeNull();
        expect(findings.problems[0].device).not.toBeNull();
    });

    it('returns empty counts for an empty inventory', () => {
        const findings = deriveFindings([]);
        expect(findings.counts.total).toBe(0);
        expect(findings.problems).toHaveLength(0);
        expect(findings.unconfirmed).toHaveLength(0);
    });

    it('derives findings from a mixed inventory after the v0.3 parser', () => {
        const parsed = parseDevicesFile(mixedFindingsDevices());
        expect(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const findings = deriveFindings(parsed.devices);
        expect(findings.counts.failed).toBe(1);
        expect(findings.counts.malfunc).toBe(1);
        expect(findings.counts.limited).toBe(1);
        expect(findings.counts.fixed).toBe(1);
        expect(findings.unknown).toHaveLength(1);
        expect(findings.problems).toHaveLength(2);
        expect(findings.counts.total).toBeLessThan(parsed.devices.length);
    });

    it('ignores a malformed row and still derives findings from the rest', () => {
        const parsed = parseDevicesFile(
            DEVICE_FAILED_NO_DRIVER + '\n' + DEVICE_MALFORMED_ROW + '\n' + DEVICE_DETECTED_BRIDGE + '\n'
        );
        expect(parsed.ok).toBe(true);
        if (!parsed.ok)
            return;
        const findings = deriveFindings(parsed.devices);
        expect(findings.problems).toHaveLength(1);
        expect(findings.secondaryUnconfirmed).toHaveLength(1);
    });

    it('builds findings from a v0.3 HardwareSummary', () => {
        const result = normalizeInventory(VALID_HOST_FIXTURE, VALID_DEVICES_FIXTURE);
        expect(result.ok).toBe(true);
        if (!result.ok)
            return;
        const findings = deriveFindingsFromSummary(result.summary);
        expect(findings.source).toBe('probe-status');
        expect(findings.problems).toHaveLength(0);
        expect(findings.counts.total).toBeGreaterThan(0);
    });

    it('does not reintroduce privacy-filtered host identifiers', () => {
        const result = normalizeInventory(VALID_HOST_FIXTURE, VALID_DEVICES_FIXTURE);
        expect(result.ok).toBe(true);
        if (!result.ok)
            return;
        const findings = deriveFindings(devicesFromCategories(result.summary.categories));
        expect(summaryContainsSensitiveValue(findings, FAKE_HWADDR)).toBe(false);
        expect(JSON.stringify(findings)).not.toContain('fake-test-hostname');
        expect(JSON.stringify(findings)).not.toMatch(/f{32}/);
    });

    it('treats a parser-defaulted missing status as detected', () => {
        const parsed = parseDeviceRow(DEVICE_MISSING_STATUS);
        expect(parsed?.status).toBe('detected');
        const findings = deriveFindings(parsed ? [parsed] : []);
        expect(findings.counts.detected).toBe(1);
        expect(findings.problems).toHaveLength(0);
    });

    it('keeps confirmed-working devices in counts only, not in problem lists', () => {
        const findings = deriveFindings([
            device('pci:1002-744c;03-00;works;graphics card;amdgpu;AMD;VGA compatible controller'),
        ]);
        expect(findings.counts.works).toBe(1);
        expect(findings.problems).toHaveLength(0);
        expect(findings.unconfirmed).toHaveLength(0);
        expect(findings.unknown).toHaveLength(0);
        expect(findings.secondaryUnconfirmed).toHaveLength(0);
    });
});
