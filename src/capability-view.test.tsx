import React from 'react';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CapabilityView } from './capability-view';
import { VALID_DEVICES_FIXTURE, VALID_HOST_FIXTURE } from './fixtures/inventory-fixtures';
import { normalizeInventory } from './inventory-normalizer';

afterEach(() => {
    cleanup();
});

describe('CapabilityView', () => {
    it('shows a loading state with text', () => {
        render(<CapabilityView status={{ phase: 'loading' }} onRefresh={() => {}} />);
        expect(screen.getByRole('heading', { name: 'Detecting hw-probe' })).toBeInTheDocument();
        expect(screen.getByText(/installed and usable/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Refresh hardware probe detection' })).toBeDisabled();
    });

    it('shows the available state, version, and local probe action', () => {
        const onRunProbe = vi.fn();
        render(
            <CapabilityView
                    status={{ phase: 'ready', capability: { state: 'available', version: '1.6.6' } }}
                    onRefresh={() => {}}
                    execution={{ status: 'idle' }}
                    onRunProbe={onRunProbe}
                    onCancelProbe={() => {}}
            />
        );
        expect(screen.getByText('1.6.6')).toBeInTheDocument();
        expect(screen.getAllByText(/hw-probe/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/Native hardware probes require Cockpit administrative access/)).toBeInTheDocument();
        expect(screen.getByText(/No probe data is uploaded by this action/)).toBeInTheDocument();
        expect(screen.queryByText(/sudo/i)).not.toBeInTheDocument();
        screen.getByRole('button', { name: 'Run hardware probe' }).click();
        expect(onRunProbe).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('keeps the run action when a native probe is available', () => {
        render(
            <CapabilityView
                    status={{
                        phase: 'ready',
                        capability: { state: 'available', version: '1.6', source: 'user-local' },
                    }}
                    onRefresh={() => {}}
                    execution={{ status: 'idle' }}
                    onRunProbe={() => {}}
                    onCancelProbe={() => {}}
            />
        );
        expect(screen.getByRole('button', { name: 'Run hardware probe' })).toBeInTheDocument();
        expect(screen.getByText(/Native hardware probes require Cockpit administrative access because hw-probe itself requires root/)).toBeInTheDocument();
    });

    it('does not expose filesystem paths or Flatpak app ids in the available UI', () => {
        render(
            <CapabilityView
                    status={{
                        phase: 'ready',
                        capability: {
                            state: 'available',
                            version: '1.6',
                            source: 'flatpak',
                        },
                    }}
                    onRefresh={() => {}}
                    execution={{
                        status: 'succeeded',
                        startedAt: 0,
                        completedAt: 1,
                        artifactPath: '/home/testuser/.var/app/org.linux_hardware.hw-probe/data/HW_PROBE/LATEST/hw.info',
                    }}
                    onRunProbe={() => {}}
                    onCancelProbe={() => {}}
            />
        );
        expect(screen.getByText('1.6')).toBeInTheDocument();
        expect(screen.queryByText(/org\.linux_hardware\.hw-probe/)).not.toBeInTheDocument();
        expect(screen.queryByText(/\.local\/bin\/hw-probe/)).not.toBeInTheDocument();
        expect(screen.queryByText(/\/usr\/bin\/hw-probe/)).not.toBeInTheDocument();
        expect(screen.queryByText(/HW_PROBE\/LATEST/)).not.toBeInTheDocument();
    });

    it('shows the unavailable state without an install action', () => {
        render(
            <CapabilityView
                    status={{
                        phase: 'ready',
                        capability: {
                            state: 'unavailable',
                            error: { kind: 'command-not-found', message: 'hw-probe executable was not found' },
                        },
                    }}
                    onRefresh={() => {}}
            />
        );
        expect(screen.getByRole('heading', { name: /not installed or cannot be found/ })).toBeInTheDocument();
        expect(screen.getByText(/Install hw-probe on this host/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Run hardware probe' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
    });

    it('shows a permission-denied warning as text', () => {
        render(
            <CapabilityView
                    status={{
                        phase: 'ready',
                        capability: {
                            state: 'permission-denied',
                            error: { kind: 'permission-denied', message: 'execution of hw-probe was denied' },
                        },
                    }}
                    onRefresh={() => {}}
            />
        );
        expect(screen.getByText(/could not be executed with the current permissions/)).toBeInTheDocument();
    });

    it('shows a timeout state with a retry action', () => {
        const onRefresh = vi.fn();
        render(
            <CapabilityView
                    status={{
                        phase: 'ready',
                        capability: {
                            state: 'timeout',
                            error: { kind: 'timeout', message: 'hw-probe version query timed out' },
                        },
                    }}
                    onRefresh={onRefresh}
            />
        );
        expect(screen.getByText(/version query timed out/)).toBeInTheDocument();
        screen.getByRole('button', { name: 'Retry hardware probe detection' }).click();
        expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('shows a generic error state with retry', () => {
        render(
            <CapabilityView
                    status={{
                        phase: 'ready',
                        capability: {
                            state: 'error',
                            error: { kind: 'command-failed', message: 'hw-probe exited with status 1' },
                        },
                    }}
                    onRefresh={() => {}}
            />
        );
        expect(screen.getByText('hw-probe could not be detected')).toBeInTheDocument();
        expect(screen.getByText(/exited unsuccessfully/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry hardware probe detection' })).toBeInTheDocument();
    });

    it('disables refresh and run while a probe is running', () => {
        render(
            <CapabilityView
                    status={{ phase: 'ready', capability: { state: 'available', version: '1.6' } }}
                    onRefresh={() => {}}
                    execution={{ status: 'running', startedAt: Date.now() }}
                    onRunProbe={() => {}}
                    onCancelProbe={() => {}}
            />
        );
        expect(screen.getByRole('button', { name: 'Refresh hardware probe detection' })).toBeDisabled();
        expect(screen.queryByRole('button', { name: 'Run hardware probe' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel hardware probe' })).toBeInTheDocument();
    });

    it('does not render raw HTML from a version string', () => {
        render(
            <CapabilityView
                    status={{
                        phase: 'ready',
                        capability: { state: 'available', version: '<img src=x onerror=alert(1)>' },
                    }}
                    onRefresh={() => {}}
            />
        );
        expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
        expect(document.querySelector('img')).toBeNull();
    });

    it('shows the empty inventory state', () => {
        render(
            <CapabilityView
                    status={{ phase: 'ready', capability: { state: 'available', version: '1.6' } }}
                    onRefresh={() => {}}
                    execution={{ status: 'idle' }}
                    onRunProbe={() => {}}
                    onCancelProbe={() => {}}
                    inventory={{ status: 'empty' }}
            />
        );
        expect(screen.getByText(/No local hardware probe is available yet/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Run hardware probe' })).toBeInTheDocument();
        expect(screen.queryByText(/health score/i)).not.toBeInTheDocument();
    });

    it('does not upload from the empty inventory view', () => {
        const onRequestUpload = vi.fn();
        render(
            <CapabilityView
                    status={{ phase: 'ready', capability: { state: 'available', version: '1.6' } }}
                    onRefresh={() => {}}
                    execution={{ status: 'idle' }}
                    onRunProbe={() => {}}
                    onCancelProbe={() => {}}
                    inventory={{ status: 'empty' }}
                    upload={{ status: 'idle' }}
                    onRequestUpload={onRequestUpload}
                    onCancelUpload={() => {}}
            />
        );
        expect(screen.getByText(/Run a hardware probe before uploading/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Upload probe to linux-hardware.org' })).not.toBeInTheDocument();
        expect(onRequestUpload).not.toHaveBeenCalled();
        screen.getByRole('button', { name: 'Run hardware probe' }).click();
        expect(onRequestUpload).not.toHaveBeenCalled();
    });

    it('shows a parsed summary and keeps probe success distinct from parse failure', () => {
        const result = normalizeInventory(VALID_HOST_FIXTURE, VALID_DEVICES_FIXTURE);
        if (!result.ok)
            throw new Error('fixture must normalize');
        render(
            <CapabilityView
                    status={{ phase: 'ready', capability: { state: 'available', version: '1.6' } }}
                    onRefresh={() => {}}
                    execution={{ status: 'succeeded', startedAt: 0, completedAt: 1 }}
                    onRunProbe={() => {}}
                    onCancelProbe={() => {}}
                    inventory={{ status: 'ready', summary: result.summary }}
            />
        );
        expect(screen.getByText('Hardware Summary')).toBeInTheDocument();
        expect(screen.getByText('Drive status')).toBeInTheDocument();
        expect(screen.getByText('Hardware Findings')).toBeInTheDocument();
        expect(screen.getByText(/completed successfully/)).toBeInTheDocument();
        expect(screen.queryByText(/hardware probe command failed/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
    });

    it('keeps upload idle when a local summary is shown', () => {
        const result = normalizeInventory(VALID_HOST_FIXTURE, VALID_DEVICES_FIXTURE);
        if (!result.ok)
            throw new Error('fixture must normalize');
        const onRequestUpload = vi.fn();
        render(
            <CapabilityView
                    status={{ phase: 'ready', capability: { state: 'available', version: '1.6' } }}
                    onRefresh={() => {}}
                    execution={{ status: 'succeeded', startedAt: 0, completedAt: 1 }}
                    onRunProbe={() => {}}
                    onCancelProbe={() => {}}
                    inventory={{ status: 'ready', summary: result.summary }}
                    upload={{ status: 'idle' }}
                    onRequestUpload={onRequestUpload}
                    onCancelUpload={() => {}}
            />
        );
        expect(screen.getByText('Share Probe')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Upload probe to linux-hardware.org' })).toBeInTheDocument();
        expect(onRequestUpload).not.toHaveBeenCalled();
        expect(screen.getByText(/completed successfully/)).toBeInTheDocument();
        expect(screen.getByText('Hardware Findings')).toBeInTheDocument();
        screen.getByRole('button', { name: 'Run hardware probe' }).click();
        expect(onRequestUpload).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('keeps hardware findings when an upload has failed', () => {
        const result = normalizeInventory(VALID_HOST_FIXTURE, VALID_DEVICES_FIXTURE);
        if (!result.ok)
            throw new Error('fixture must normalize');
        render(
            <CapabilityView
                    status={{ phase: 'ready', capability: { state: 'available', version: '1.6' } }}
                    onRefresh={() => {}}
                    execution={{ status: 'succeeded', startedAt: 0, completedAt: 1 }}
                    onRunProbe={() => {}}
                    onCancelProbe={() => {}}
                    inventory={{ status: 'ready', summary: result.summary }}
                    upload={{
                        status: 'failed',
                        error: { kind: 'network-unavailable', message: 'unreachable' },
                    }}
                    onRequestUpload={() => {}}
                    onCancelUpload={() => {}}
            />
        );
        expect(screen.getByText('Hardware Findings')).toBeInTheDocument();
        expect(screen.getByText(/completed successfully/)).toBeInTheDocument();
        expect(screen.getByText('linux-hardware.org could not be reached')).toBeInTheDocument();
    });

    it('refreshes from the empty state into a summary after a successful probe', () => {
        const result = normalizeInventory(VALID_HOST_FIXTURE, VALID_DEVICES_FIXTURE);
        if (!result.ok)
            throw new Error('fixture must normalize');
        const onRunProbe = vi.fn();
        const { rerender } = render(
            <CapabilityView
                    status={{ phase: 'ready', capability: { state: 'available', version: '1.6' } }}
                    onRefresh={() => {}}
                    execution={{ status: 'idle' }}
                    onRunProbe={onRunProbe}
                    onCancelProbe={() => {}}
                    inventory={{ status: 'empty' }}
            />
        );
        expect(screen.getByText(/No local hardware probe is available yet/)).toBeInTheDocument();
        screen.getByRole('button', { name: 'Run hardware probe' }).click();
        expect(onRunProbe).toHaveBeenCalledTimes(1);
        rerender(
            <CapabilityView
                    status={{ phase: 'ready', capability: { state: 'available', version: '1.6' } }}
                    onRefresh={() => {}}
                    execution={{ status: 'succeeded', startedAt: 0, completedAt: 1 }}
                    onRunProbe={onRunProbe}
                    onCancelProbe={() => {}}
                    inventory={{ status: 'ready', summary: result.summary }}
            />
        );
        expect(screen.getByText('Hardware Summary')).toBeInTheDocument();
        expect(screen.getByText('6 cores')).toBeInTheDocument();
        expect(screen.getByText(/completed successfully/)).toBeInTheDocument();
        expect(screen.queryByText(/No local hardware probe is available yet/)).not.toBeInTheDocument();
    });

    it('shows inventory parse failure beside a successful probe', () => {
        render(
            <CapabilityView
                    status={{ phase: 'ready', capability: { state: 'available', version: '1.6' } }}
                    onRefresh={() => {}}
                    execution={{ status: 'succeeded', startedAt: 0, completedAt: 1 }}
                    onRunProbe={() => {}}
                    onCancelProbe={() => {}}
                    inventory={{
                        status: 'failed',
                        error: {
                            kind: 'malformed-host',
                            message: 'The local host inventory could not be parsed',
                        },
                    }}
            />
        );
        expect(screen.getByText(/completed successfully/)).toBeInTheDocument();
        expect(screen.getByText('The hardware inventory could not be read')).toBeInTheDocument();
        expect(screen.queryByText(/hardware probe command failed/i)).not.toBeInTheDocument();
    });
});
