import React from 'react';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CapabilityView } from './capability-view';

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

    it('shows the available state and version as text', () => {
        render(
            <CapabilityView
                    status={{ phase: 'ready', capability: { state: 'available', version: '1.6.6' } }}
                    onRefresh={() => {}}
            />
        );
        expect(screen.getByRole('heading', { name: 'hw-probe is available' })).toBeInTheDocument();
        expect(screen.getByText('Version')).toBeInTheDocument();
        expect(screen.getByText('1.6.6')).toBeInTheDocument();
        expect(screen.getByText(/next implementation milestone/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /run probe/i })).not.toBeInTheDocument();
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
            />
        );
        expect(screen.getByText('1.6')).toBeInTheDocument();
        expect(screen.queryByText(/org\.linux_hardware\.hw-probe/)).not.toBeInTheDocument();
        expect(screen.queryByText(/\.local\/bin\/hw-probe/)).not.toBeInTheDocument();
        expect(screen.queryByText(/\/usr\/bin\/hw-probe/)).not.toBeInTheDocument();
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
});
