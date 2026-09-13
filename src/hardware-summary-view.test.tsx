import React from 'react';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FAKE_HWADDR, VALID_DEVICES_FIXTURE, VALID_HOST_FIXTURE } from './fixtures/inventory-fixtures';
import { HardwareSummaryView } from './hardware-summary-view';
import { normalizeInventory } from './inventory-normalizer';

afterEach(() => {
    cleanup();
});

function readySummary() {
    const result = normalizeInventory(VALID_HOST_FIXTURE, VALID_DEVICES_FIXTURE);
    if (!result.ok)
        throw new Error('fixture must normalize');
    return result.summary;
}

describe('HardwareSummaryView', () => {
    it('renders an existing probe summary', () => {
        render(<HardwareSummaryView inventory={{ status: 'ready', summary: readySummary() }} />);
        expect(screen.getByText('Hardware Summary')).toBeInTheDocument();
        expect(screen.getAllByText(/ASRock B650M Pro RS WiFi/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('x86_64')).toBeInTheDocument();
        expect(screen.getByText('EFI')).toBeInTheDocument();
        expect(screen.getByText(/7\.2\.3-ogc3\.1\.fc44\.x86_64/)).toBeInTheDocument();
        expect(screen.getAllByText(/AMD Ryzen 5 7600X 6-Core Processor/)).toHaveLength(2);
        expect(screen.getByText('6 cores')).toBeInTheDocument();
        expect(screen.queryByText(/12 CPU/)).not.toBeInTheDocument();
        expect(screen.getByText('30.9 GiB')).toBeInTheDocument();
        expect(screen.getByText('2 modules')).toBeInTheDocument();
        expect(screen.getAllByText(/VGA compatible controller/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/Driver: amdgpu/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/Driver: nouveau/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/ST4000VN006 4TB/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/SNV3S1000G 1TB/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/NVMe SSD Drive 1TB/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/NVMe SSD Drive 2TB/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/RTL8125/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/MT7922/).length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText(FAKE_HWADDR)).not.toBeInTheDocument();
        expect(screen.queryByText(/hwaddr/i)).not.toBeInTheDocument();
        expect(screen.queryByText('Health score')).not.toBeInTheDocument();
        expect(screen.queryByText(/Problems detected/)).not.toBeInTheDocument();
        expect(screen.queryByText('Critical')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
        expect(screen.getByText(/not a health score/)).toBeInTheDocument();
        expect(screen.queryByText(/pci:1002/)).not.toBeInTheDocument();
        expect(screen.queryByText(/1002-744c/)).not.toBeInTheDocument();
        expect(screen.getByText('Hardware Findings')).toBeInTheDocument();
        expect(screen.getByText(/No problems are reported in the available hw-probe data/)).toBeInTheDocument();
        expect(screen.queryByText('Share Probe')).not.toBeInTheDocument();
    });

    it('shows a loading state without running a probe', () => {
        render(<HardwareSummaryView inventory={{ status: 'loading' }} />);
        expect(screen.getByText('Reading hardware inventory')).toBeInTheDocument();
        expect(screen.getByText(/does not run a new probe/)).toBeInTheDocument();
    });

    it('does not count storage controllers as disks in the overview', () => {
        render(<HardwareSummaryView inventory={{ status: 'ready', summary: readySummary() }} />);
        const storageCard = screen.getByText('Storage').closest('.pf-v6-c-card');
        expect(storageCard).toBeTruthy();
        expect(storageCard?.textContent).not.toMatch(/SATA controller/);
        expect(storageCard?.textContent).not.toMatch(/Non-Volatile memory controller/);
    });

    it('shows grouped detailed inventory including secondary categories', () => {
        render(<HardwareSummaryView inventory={{ status: 'ready', summary: readySummary() }} />);
        expect(screen.getByText('Devices')).toBeInTheDocument();
        expect(screen.getByText('Other devices')).toBeInTheDocument();
        screen.getByRole('button', { name: 'Other devices' }).click();
        expect(screen.getByText('Storage controllers')).toBeInTheDocument();
        expect(screen.getByText(/SATA controller/)).toBeInTheDocument();
        expect(screen.getAllByText(/flux capacitor|ACME Model Q/).length).toBeGreaterThanOrEqual(1);
    });

    it('shows the empty state with Run Hardware Probe', () => {
        const onRun = vi.fn();
        render(
            <HardwareSummaryView
                    inventory={{ status: 'empty' }}
                    onRunProbe={onRun}
            />
        );
        expect(screen.getByText(/No local hardware probe is available yet/)).toBeInTheDocument();
        screen.getByRole('button', { name: 'Run hardware probe' }).click();
        expect(onRun).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
        expect(screen.getByText(/Nothing is uploaded/)).toBeInTheDocument();
    });

    it('distinguishes inventory parse failure from a probe command failure', () => {
        render(
            <HardwareSummaryView
                    inventory={{
                        status: 'failed',
                        error: {
                            kind: 'malformed-devices',
                            message: 'The local devices inventory could not be parsed',
                        },
                    }}
            />
        );
        expect(screen.getByText('The hardware inventory could not be read')).toBeInTheDocument();
        expect(screen.getByText(/could not be parsed/)).toBeInTheDocument();
        expect(screen.queryByText(/hardware probe command failed/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Hardware probe failed/)).not.toBeInTheDocument();
    });

    it('does not crash when optional summary fields are missing', () => {
        const summary = readySummary();
        summary.host = { architecture: 'x86_64' };
        summary.cpu = null;
        summary.graphics = [];
        summary.disks = [];
        summary.network = [];
        summary.memory = { moduleCount: 0, modules: [] };
        render(<HardwareSummaryView inventory={{ status: 'ready', summary }} />);
        expect(screen.getByText('Hardware Summary')).toBeInTheDocument();
        expect(screen.getByText(/No CPU was reported/)).toBeInTheDocument();
    });

    it('keeps Share Probe below findings and does not upload on render', () => {
        const onRequestUpload = vi.fn();
        render(
            <HardwareSummaryView
                    inventory={{ status: 'ready', summary: readySummary() }}
                    upload={{ status: 'idle' }}
                    onRequestUpload={onRequestUpload}
                    onCancelUpload={() => {}}
            />
        );
        const summary = screen.getByText('Hardware Summary');
        const findings = screen.getByText('Hardware Findings');
        const share = screen.getByText('Share Probe');
        expect(summary.compareDocumentPosition(findings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(findings.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(onRequestUpload).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Upload probe to linux-hardware.org' }).className).toContain('pf-m-secondary');
    });
});
