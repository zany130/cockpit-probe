/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import React from 'react';

import cockpit from 'cockpit';

interface SectionErrorBoundaryProps {
    children: React.ReactNode;
    heading: string;
}

interface SectionErrorBoundaryState {
    failed: boolean;
}

const _ = cockpit.gettext;

export class SectionErrorBoundary extends React.Component<
    SectionErrorBoundaryProps,
    SectionErrorBoundaryState
> {
    constructor(props: SectionErrorBoundaryProps) {
        super(props);
        this.state = { failed: false };
    }

    static getDerivedStateFromError(): SectionErrorBoundaryState {
        return { failed: true };
    }

    render() {
        if (this.state.failed) {
            return (
                <p role="alert">
                    {cockpit.format(_("$0 could not be displayed."), this.props.heading)}
                </p>
            );
        }

        return this.props.children;
    }
}
