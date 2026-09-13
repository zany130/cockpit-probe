import React from 'react';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
    DEVICE_FAILED_DISK,
    VALID_DEVICES_FIXTURE,
    VALID_HOST_FIXTURE,
} from './fixtures/inventory-fixtures';
import { DriveStatusView } from './drive-status-view';
import { normalizeInventory } from './inventory-normalizer';

afterEach(() => {
    cleanup();
});

describe('DriveStatusView', () => {
    it('shows disk status without calling it a health score', () => {
        const result = normalizeInventory(VALID_HOST_FIXTURE, VALID_DEVICES_FIXTURE);
        if (!result.ok)
            throw new Error('fixture must normalize');
        render(<DriveStatusView summary={result.summary} />);
        expect(screen.getByText('Drive status')).toBeInTheDocument();
        expect(screen.getByText(/SMART was collected/)).toBeInTheDocument();
        expect(screen.getByText(/not a SMART attribute dashboard/)).toBeInTheDocument();
        expect(screen.getByText(/not a health score/)).toBeInTheDocument();
        expect(screen.getAllByText(/ST4000VN006 4TB/).length).toBeGreaterThanOrEqual(1);
        expect(screen.queryByText(/healthy/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/%/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /check|smartctl|repair/i })).not.toBeInTheDocument();
        expect(screen.queryByText(/sudo/i)).not.toBeInTheDocument();
    });

    it('explains the Flatpak SMART gap without requesting extra permissions', () => {
        const result = normalizeInventory(VALID_HOST_FIXTURE, VALID_DEVICES_FIXTURE);
        if (!result.ok)
            throw new Error('fixture must normalize');
        render(<DriveStatusView summary={result.summary} backend="flatpak" />);
        expect(screen.getByText(/Flatpak probes may not include drive health/)).toBeInTheDocument();
        expect(screen.getByText(/does not change Flatpak permissions/)).toBeInTheDocument();
        expect(screen.queryByText(/flatpak override/i)).not.toBeInTheDocument();
    });

    it('lists a failed disk without inventing SMART attributes', () => {
        const result = normalizeInventory(VALID_HOST_FIXTURE, DEVICE_FAILED_DISK + '\n');
        if (!result.ok)
            throw new Error('failed disk must normalize');
        render(<DriveStatusView summary={result.summary} />);
        expect(screen.getByText(/ST1000DM003 1TB/)).toBeInTheDocument();
        expect(screen.getByText(/hw-probe status: Failed/)).toBeInTheDocument();
        expect(screen.queryByText(/Reallocated_Sector/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/temperature/i)).not.toBeInTheDocument();
    });
});
