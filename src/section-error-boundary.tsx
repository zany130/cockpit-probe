/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import React from 'react';

interface SectionErrorBoundaryProps {
    children: React.ReactNode;
    heading: string;
}

interface SectionErrorBoundaryState {
    failed: boolean;
}

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
                    {this.props.heading} could not be displayed.
                </p>
            );
        }

        return this.props.children;
    }
}
