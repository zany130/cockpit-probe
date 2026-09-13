import React from 'react';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
    DEVICE_DETECTED_BRIDGE,
    DEVICE_FAILED_NO_DRIVER,
    DEVICE_UNKNOWN_STATUS,
    FAKE_HWADDR,
    VALID_DEVICES_FIXTURE,
    VALID_HOST_FIXTURE,
    mixedFindingsDevices,
} from './fixtures/inventory-fixtures';
import { deriveFindings } from './findings-normalizer';
import { parseDeviceRow } from './device-parser';
import { HardwareFindingsView } from './hardware-findings-view';
import { normalizeInventory } from './inventory-normalizer';
import type { HardwareFinding, HardwareFindingsSummary } from './model';

afterEach(() => {
    cleanup();
});

function summaryFrom(devices: string) {
    const result = normalizeInventory('arch:x86_64\ncores:6\nram_total:32414356\n', devices);
    if (!result.ok)
        throw new Error('fixture must normalize');
    return result.summary;
}

describe('HardwareFindingsView', () => {
    it('shows no reported-problem state for the sanitized v0.3 fixture', () => {
        const result = normalizeInventory(VALID_HOST_FIXTURE, VALID_DEVICES_FIXTURE);
        if (!result.ok)
            throw new Error('fixture must normalize');
        render(<HardwareFindingsView summary={result.summary} />);
        expect(screen.getByText('Hardware Findings')).toBeInTheDocument();
        expect(screen.getByText(/No problems are reported in the available hw-probe data/)).toBeInTheDocument();
        expect(screen.getByText('Works')).toBeInTheDocument();
        expect(screen.getByText('Detected')).toBeInTheDocument();
        expect(screen.queryByText('Your hardware is healthy.')).not.toBeInTheDocument();
        expect(screen.queryByText(/Everything is working perfectly/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Hardware Health/)).not.toBeInTheDocument();
        expect(screen.queryByText(/%/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /repair|install driver|firmware/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /hardware check/i })).not.toBeInTheDocument();
        expect(screen.queryByText(FAKE_HWADDR)).not.toBeInTheDocument();
        expect(screen.getByText(/not a hardware health score/)).toBeInTheDocument();
        expect(screen.queryByText(/pci:1002/)).not.toBeInTheDocument();
        expect(screen.queryByText(/1002-744c/)).not.toBeInTheDocument();
        expect(screen.queryByText('Critical')).not.toBeInTheDocument();
        expect(screen.queryByText('Warning')).not.toBeInTheDocument();
    });

    it('lists an upstream failed device as a reported problem', () => {
        render(<HardwareFindingsView summary={summaryFrom(mixedFindingsDevices())} />);
        expect(screen.getByText('Devices with reported problems')).toBeInTheDocument();
        expect(screen.getAllByText(/Unbound GPU/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/hw-probe status: Failed/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/Battery 10 Wh/).length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText(/healthy/i)).not.toBeInTheDocument();
    });

    it('shows detected user-facing devices as unconfirmed, not broken', () => {
        render(<HardwareFindingsView summary={summaryFrom(mixedFindingsDevices())} />);
        expect(screen.getByText('Devices without confirmed operability')).toBeInTheDocument();
        expect(screen.getAllByText(/RTL8125/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/hw-probe status: Detected/).length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText('Critical')).not.toBeInTheDocument();
        expect(screen.queryByText(/WARNING: PCI BRIDGE/i)).not.toBeInTheDocument();
    });

    it('keeps a detected PCI bridge out of scary problem cards', () => {
        const row = parseDeviceRow(DEVICE_DETECTED_BRIDGE);
        if (row == null)
            throw new Error('bridge must parse');
        const findings = deriveFindings([row]);
        render(<HardwareFindingsView findings={findings} />);
        expect(screen.queryByText('Devices with reported problems')).not.toBeInTheDocument();
        expect(screen.getByText('Low-level devices without confirmed operability')).toBeInTheDocument();
        screen.getByRole('button', { name: 'Low-level devices without confirmed operability' }).click();
        expect(screen.getByText(/Navi 10 XL Upstream Port/)).toBeInTheDocument();
        expect(screen.queryByText(/may be broken/i)).not.toBeInTheDocument();
    });

    it('shows an unrecognized status without calling it a failure', () => {
        const row = parseDeviceRow(DEVICE_UNKNOWN_STATUS);
        if (row == null)
            throw new Error('row must parse');
        render(<HardwareFindingsView findings={deriveFindings([row])} />);
        expect(screen.getByText('Devices with an unrecognized hw-probe status')).toBeInTheDocument();
        expect(screen.getByText(/hw-probe status: Glitchy/)).toBeInTheDocument();
        expect(screen.queryByText('Devices with reported problems')).not.toBeInTheDocument();
    });

    it('renders an unassociated finding without attaching another device', () => {
        const failed = parseDeviceRow(DEVICE_FAILED_NO_DRIVER);
        if (failed == null)
            throw new Error('row must parse');
        const findings: HardwareFindingsSummary = deriveFindings([failed]);
        const extra: HardwareFinding = {
            device: null,
            upstreamStatus: 'failed',
            kind: 'reported-problem',
            summary: 'hw-probe reported failed',
            source: 'probe-status',
            prominence: 'noteworthy',
        };
        findings.problems.push(extra);
        render(<HardwareFindingsView findings={findings} />);
        expect(screen.getByText('Unassociated finding')).toBeInTheDocument();
        expect(screen.getAllByText(/Unbound GPU/).length).toBeGreaterThanOrEqual(1);
    });

    it('does not offer an automatic hardware check', () => {
        const result = normalizeInventory(VALID_HOST_FIXTURE, VALID_DEVICES_FIXTURE);
        if (!result.ok)
            throw new Error('fixture must normalize');
        render(<HardwareFindingsView summary={result.summary} />);
        expect(screen.queryByRole('button', { name: /check/i })).not.toBeInTheDocument();
        expect(screen.queryByText(/-check/)).not.toBeInTheDocument();
        expect(screen.queryByText(/check-extended/)).not.toBeInTheDocument();
    });

    it('keeps findings derivation failure distinct from a probe failure', () => {
        render(<HardwareFindingsView summary={{ categories: null } as never} />);
        expect(screen.getByText('Hardware findings could not be derived')).toBeInTheDocument();
        expect(screen.getByText(/not a hardware probe command failure/)).toBeInTheDocument();
        expect(screen.queryByText('Hardware probe failed')).not.toBeInTheDocument();
    });
});
