import React from 'react';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ProbeCompletenessNote } from './probe-completeness-note';

afterEach(() => {
    cleanup();
});

describe('ProbeCompletenessNote', () => {
    it('explains native privilege without exposing paths or sudo', () => {
        render(<ProbeCompletenessNote backend="native" />);
        expect(screen.getByText(/Administrative access was used only for this native probe/)).toBeInTheDocument();
        expect(screen.getByText(/Version detection stays unprivileged/)).toBeInTheDocument();
        expect(screen.queryByText(/sudo/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/\/root\/HW_PROBE/)).not.toBeInTheDocument();
        expect(screen.queryByText(/pkexec/)).not.toBeInTheDocument();
    });

    it('explains the Flatpak completeness gap without offering extra permissions', () => {
        render(<ProbeCompletenessNote backend="flatpak" />);
        expect(screen.getByText(/unprivileged Flatpak probe/)).toBeInTheDocument();
        expect(screen.getByText(/SMART drive health/)).toBeInTheDocument();
        expect(screen.getByText(/does not grant extra Flatpak permissions/)).toBeInTheDocument();
        expect(screen.queryByText(/flatpak override/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /run as root|elevate/i })).not.toBeInTheDocument();
    });
});
