import React from 'react';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProbeExecutionView } from './probe-execution-view';

afterEach(() => {
    cleanup();
});

describe('ProbeExecutionView', () => {
    it('shows the idle run action and local-only wording', () => {
        const onRun = vi.fn();
        render(
            <ProbeExecutionView
                    execution={{ status: 'idle' }}
                    onRun={onRun}
                    onCancel={() => {}}
            />
        );
        expect(screen.getByText(/Run a local hardware probe on this system/)).toBeInTheDocument();
        expect(screen.getByText(/No hardware information will be uploaded/)).toBeInTheDocument();
        screen.getByRole('button', { name: 'Run hardware probe' }).click();
        expect(onRun).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument();
        expect(screen.queryByText(/device inventory/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/findings/i)).not.toBeInTheDocument();
    });

    it('disables a second run affordance while showing a running indicator and cancel', () => {
        const onRun = vi.fn();
        const onCancel = vi.fn();
        render(
            <ProbeExecutionView
                    execution={{ status: 'running', startedAt: Date.now() - 2000 }}
                    onRun={onRun}
                    onCancel={onCancel}
            />
        );
        expect(screen.getByRole('heading', { name: /Hardware probe is running/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Run hardware probe' })).not.toBeInTheDocument();
        expect(screen.getByText(/Elapsed:/)).toBeInTheDocument();
        screen.getByRole('button', { name: 'Cancel hardware probe' }).click();
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onRun).not.toHaveBeenCalled();
    });

    it('shows success without dumping stdout or inventory', () => {
        render(
            <ProbeExecutionView
                    execution={{
                        status: 'succeeded',
                        startedAt: 0,
                        completedAt: 4000,
                        artifactPath: '/root/HW_PROBE/LATEST/hw.info',
                    }}
                    onRun={() => {}}
                    onCancel={() => {}}
            />
        );
        expect(screen.getByText(/completed successfully/)).toBeInTheDocument();
        expect(screen.getByText(/4 seconds/)).toBeInTheDocument();
        expect(screen.queryByText('/root/HW_PROBE/LATEST/hw.info')).not.toBeInTheDocument();
        expect(screen.queryByText(/Probe for hardware/)).not.toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Run hardware probe' })).toBeInTheDocument();
    });

    it('shows a normalized command failure', () => {
        render(
            <ProbeExecutionView
                    execution={{
                        status: 'failed',
                        startedAt: 0,
                        completedAt: 1,
                        error: { kind: 'command-failed', message: 'hw-probe exited with status 1' },
                    }}
                    onRun={() => {}}
                    onCancel={() => {}}
            />
        );
        expect(screen.getByText(/hardware probe command failed/i)).toBeInTheDocument();
        expect(screen.queryByText(/stderr/i)).not.toBeInTheDocument();
    });

    it('shows a timeout failure', () => {
        render(
            <ProbeExecutionView
                    execution={{
                        status: 'failed',
                        startedAt: 0,
                        completedAt: 1,
                        error: { kind: 'timeout', message: 'hardware probe timed out' },
                    }}
                    onRun={() => {}}
                    onCancel={() => {}}
            />
        );
        expect(screen.getByText(/hardware probe timed out/i)).toBeInTheDocument();
    });

    it('shows a cancelled state', () => {
        render(
            <ProbeExecutionView
                    execution={{ status: 'cancelled', startedAt: 0, completedAt: 1500 }}
                    onRun={() => {}}
                    onCancel={() => {}}
            />
        );
        expect(screen.getByText(/was cancelled/)).toBeInTheDocument();
        expect(screen.getByText(/No upload was performed/)).toBeInTheDocument();
    });
});
