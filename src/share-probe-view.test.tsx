import React from 'react';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ShareProbeView } from './share-probe-view';
import type { UploadState } from './model';

afterEach(() => {
    cleanup();
});

const idle: UploadState = { status: 'idle' };

describe('ShareProbeView', () => {
    it('does not upload merely by rendering', () => {
        const onRequestUpload = vi.fn();
        render(
            <ShareProbeView
                    canUpload
                    upload={idle}
                    onRequestUpload={onRequestUpload}
                    onCancelUpload={() => {}}
            />
        );
        expect(screen.getByText('Share Probe')).toBeInTheDocument();
        expect(onRequestUpload).not.toHaveBeenCalled();
        expect(screen.queryByText(/completely anonymous/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('requires a local probe before offering upload', () => {
        const onRequestUpload = vi.fn();
        render(
            <ShareProbeView
                    canUpload={false}
                    upload={idle}
                    onRequestUpload={onRequestUpload}
                    onCancelUpload={() => {}}
            />
        );
        expect(screen.getByText(/Run a hardware probe before uploading/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Upload probe to linux-hardware.org' })).not.toBeInTheDocument();
        expect(onRequestUpload).not.toHaveBeenCalled();
    });

    it('opens confirmation without uploading, and cancel performs no command', () => {
        const onRequestUpload = vi.fn();
        render(
            <ShareProbeView
                    canUpload
                    collectedAt="2026-09-13 12:00:00 UTC"
                    upload={idle}
                    onRequestUpload={onRequestUpload}
                    onCancelUpload={() => {}}
            />
        );
        fireEvent.click(screen.getByRole('button', { name: 'Upload probe to linux-hardware.org' }));
        const dialog = screen.getByRole('dialog', { name: 'Upload this probe to linux-hardware.org' });
        expect(dialog).toBeInTheDocument();
        expect(dialog.textContent).toMatch(/linux-hardware.org/);
        expect(dialog.textContent).toMatch(/public hardware database/);
        expect(dialog.textContent).toMatch(/32-byte prefix/);
        expect(dialog.textContent).toMatch(/optional/i);
        expect(dialog.textContent).not.toMatch(/completely anonymous/i);
        expect(dialog.textContent).toMatch(/2026-09-13 12:00:00 UTC/);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel upload' }));
        expect(onRequestUpload).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes confirmation with Escape without uploading', () => {
        const onRequestUpload = vi.fn();
        render(
            <ShareProbeView
                    canUpload
                    upload={idle}
                    onRequestUpload={onRequestUpload}
                    onCancelUpload={() => {}}
            />
        );
        fireEvent.click(screen.getByRole('button', { name: 'Upload probe to linux-hardware.org' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onRequestUpload).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('confirms exactly once', () => {
        const onRequestUpload = vi.fn();
        render(
            <ShareProbeView
                    canUpload
                    upload={idle}
                    onRequestUpload={onRequestUpload}
                    onCancelUpload={() => {}}
            />
        );
        fireEvent.click(screen.getByRole('button', { name: 'Upload probe to linux-hardware.org' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm upload probe' }));
        expect(onRequestUpload).toHaveBeenCalledTimes(1);
    });

    it('does not spawn another upload from the page button while uploading', () => {
        const onRequestUpload = vi.fn();
        render(
            <ShareProbeView
                    canUpload
                    upload={{ status: 'uploading', startedAt: 1 }}
                    onRequestUpload={onRequestUpload}
                    onCancelUpload={() => {}}
            />
        );
        expect(screen.getByText(/Uploading the local probe to linux-hardware.org/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Upload probe to linux-hardware.org' })).not.toBeInTheDocument();
        expect(onRequestUpload).not.toHaveBeenCalled();
    });

    it('requires another confirmation to retry', () => {
        const onRequestUpload = vi.fn();
        render(
            <ShareProbeView
                    canUpload
                    upload={{
                        status: 'failed',
                        error: { kind: 'network-unavailable', message: 'unreachable' },
                    }}
                    onRequestUpload={onRequestUpload}
                    onCancelUpload={() => {}}
            />
        );
        fireEvent.click(screen.getByRole('button', { name: 'Try uploading again' }));
        expect(onRequestUpload).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog', { name: 'Upload this probe to linux-hardware.org' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Confirm upload probe' }));
        expect(onRequestUpload).toHaveBeenCalledTimes(1);
    });

    it('shows a validated external probe link after success', () => {
        render(
            <ShareProbeView
                    canUpload
                    upload={{
                        status: 'succeeded',
                        result: { url: 'https://linux-hardware.org/?probe=b394035f90', probeId: 'b394035f90' },
                    }}
                    onRequestUpload={() => {}}
                    onCancelUpload={() => {}}
            />
        );
        const link = screen.getByRole('link', { name: /View uploaded probe/ });
        expect(link).toHaveAttribute('href', 'https://linux-hardware.org/?probe=b394035f90');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('does not claim perfect anonymity after a successful upload', () => {
        render(
            <ShareProbeView
                    canUpload
                    upload={{
                        status: 'succeeded',
                        result: { url: 'https://linux-hardware.org/?probe=b394035f90', probeId: 'b394035f90' },
                    }}
                    onRequestUpload={() => {}}
                    onCancelUpload={() => {}}
            />
        );
        expect(screen.queryByText(/published anonymously/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/completely anonymous/i)).not.toBeInTheDocument();
        const link = screen.getByRole('link', { name: /View uploaded probe/ });
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('href', 'https://linux-hardware.org/?probe=b394035f90');
    });

    it('does not invent a link when metadata is missing', () => {
        render(
            <ShareProbeView
                    canUpload
                    upload={{ status: 'succeeded', result: {} }}
                    onRequestUpload={() => {}}
                    onCancelUpload={() => {}}
            />
        );
        expect(screen.getByText('Probe uploaded successfully')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /View uploaded probe/ })).not.toBeInTheDocument();
        expect(screen.getByText(/address could not be read/)).toBeInTheDocument();
    });
});
