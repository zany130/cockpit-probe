/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import React, { useEffect, useState } from 'react';

import {
    Alert,
    Button,
    EmptyState,
    EmptyStateActions,
    EmptyStateBody,
    EmptyStateFooter,
    Spinner,
} from '@patternfly/react-core';

import cockpit from 'cockpit';

import type { ProbeExecutionError, ProbeExecutionState } from './model';

const _ = cockpit.gettext;

interface ProbeExecutionViewProps {
    execution: ProbeExecutionState;
    onRun: () => void;
    onCancel: () => void;
    backend?: "native" | "flatpak";
    compact?: boolean;
}

export const ProbeExecutionView = ({
    execution,
    onRun,
    onCancel,
    backend = "native",
    compact = false,
}: ProbeExecutionViewProps) => {
    switch (execution.status) {
    case "running":
        return <RunningProbe execution={execution} onCancel={onCancel} />;
    case "succeeded":
        return <SucceededProbe execution={execution} onRun={onRun} />;
    case "cancelled":
        return <CancelledProbe execution={execution} onRun={onRun} />;
    case "failed":
        return <FailedProbe execution={execution} onRun={onRun} />;
    case "idle":
    default:
        if (compact)
            return <CompactIdleProbe onRun={onRun} />;
        return <IdleProbe onRun={onRun} backend={backend} />;
    }
};

const CompactIdleProbe = ({ onRun }: { onRun: () => void }) => (
    <div className="hw-probe-compact-run">
        <Button
                variant="secondary"
                onClick={onRun}
                aria-label={_("Run hardware probe")}
        >
            {_("Run Hardware Probe")}
        </Button>
    </div>
);

const IdleProbe = ({
    onRun,
    backend,
}: {
    onRun: () => void;
    backend: "native" | "flatpak";
}) => (
    <EmptyState titleText={_("Run a local hardware probe")} headingLevel="h2">
        <EmptyStateBody>
            <p>{_("Run a local hardware probe on this system.")}</p>
            {backend === "flatpak"
                ? (
                    <p>
                        {_("This Flatpak probe runs as the signed-in Cockpit user. Sandboxing can reduce hardware visibility. No probe data is uploaded by this action.")}
                    </p>
                )
                : (
                    <p>
                        {_("Native hardware probes require Cockpit administrative access. No probe data is uploaded by this action.")}
                    </p>
                )}
        </EmptyStateBody>
        <EmptyStateFooter>
            <EmptyStateActions>
                <Button
                        variant="primary"
                        onClick={onRun}
                        aria-label={_("Run hardware probe")}
                >
                    {_("Run Hardware Probe")}
                </Button>
            </EmptyStateActions>
        </EmptyStateFooter>
    </EmptyState>
);

const RunningProbe = ({
    execution,
    onCancel,
}: {
    execution: Extract<ProbeExecutionState, { status: "running" }>;
    onCancel: () => void;
}) => {
    const elapsed = useElapsedLabel(execution.startedAt);
    return (
        <EmptyState titleText={_("Hardware probe is running…")} headingLevel="h2" icon={Spinner}>
            <EmptyStateBody>
                <p>{_("Collecting a local hardware probe. This does not upload anything.")}</p>
                <p>{cockpit.format(_("Elapsed: $0"), elapsed)}</p>
            </EmptyStateBody>
            <EmptyStateFooter>
                <EmptyStateActions>
                    <Button
                            variant="secondary"
                            onClick={onCancel}
                            aria-label={_("Cancel hardware probe")}
                    >
                        {_("Cancel")}
                    </Button>
                </EmptyStateActions>
            </EmptyStateFooter>
        </EmptyState>
    );
};

const SucceededProbe = ({
    execution,
    onRun,
}: {
    execution: Extract<ProbeExecutionState, { status: "succeeded" }>;
    onRun: () => void;
}) => (
    <Alert
            variant="success"
            isInline
            title={_("Local hardware probe completed successfully.")}
    >
        <p>{cockpit.format(_("Duration: $0"), formatDuration(execution.completedAt - execution.startedAt))}</p>
        <p>{_("No probe data was uploaded.")}</p>
        <Button
                variant="secondary"
                onClick={onRun}
                aria-label={_("Run hardware probe")}
        >
            {_("Run Hardware Probe")}
        </Button>
    </Alert>
);

const CancelledProbe = ({
    execution,
    onRun,
}: {
    execution: Extract<ProbeExecutionState, { status: "cancelled" }>;
    onRun: () => void;
}) => (
    <Alert
            variant="warning"
            isInline
            title={_("Hardware probe was cancelled")}
            actionLinks={
                <Button
                        variant="link"
                        isInline
                        onClick={onRun}
                        aria-label={_("Run hardware probe")}
                >
                    {_("Run Hardware Probe")}
                </Button>
            }
    >
        <p>{cockpit.format(_("Stopped after $0."), formatDuration(execution.completedAt - execution.startedAt))}</p>
        <p>{_("No upload was performed.")}</p>
    </Alert>
);

const FailedProbe = ({
    execution,
    onRun,
}: {
    execution: Extract<ProbeExecutionState, { status: "failed" }>;
    onRun: () => void;
}) => (
    <Alert
            variant={failureVariant(execution.error)}
            isInline
            title={failureTitle(execution.error)}
            actionLinks={
                <Button
                        variant="link"
                        isInline
                        onClick={onRun}
                        aria-label={_("Run hardware probe")}
                >
                    {_("Run Hardware Probe")}
                </Button>
            }
    >
        {failureBody(execution.error)}
    </Alert>
);

function failureVariant(error: ProbeExecutionError): "warning" | "danger" {
    if (error.kind === "timeout" || error.kind === "administrative-access-required")
        return "warning";
    return "danger";
}

function failureTitle(error: ProbeExecutionError): string {
    if (error.kind === "timeout")
        return _("The hardware probe timed out");
    if (error.kind === "administrative-access-required")
        return _("Administrative access is required");
    if (error.kind === "permission-denied")
        return _("The hardware probe could not be executed with the current permissions");
    if (error.kind === "command-not-found")
        return _("hw-probe could not be started");
    if (error.kind === "command-failed")
        return _("The hardware probe command failed");
    return _("The hardware probe failed");
}

function failureBody(error: ProbeExecutionError): string {
    if (error.kind === "timeout")
        return _("Detection stopped before the probe finished. You can run it again. This page did not upload anything.");
    if (error.kind === "administrative-access-required")
        return _("Administrative access is required to run a native hardware probe. Cockpit did not start hw-probe. This page did not upload anything.");
    if (error.kind === "permission-denied")
        return _("The current session could not execute hw-probe. This page did not upload anything.");
    if (error.kind === "command-not-found")
        return _("hw-probe was available earlier, but it could not be started now. Refresh detection or reinstall the tool. This page did not upload anything.");
    if (error.kind === "command-failed")
        return _("hw-probe exited before completing a local probe. This page did not upload anything.");
    return _("An unexpected error occurred while running the hardware probe. This page did not upload anything.");
}

function useElapsedLabel(startedAt: number): string {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [startedAt]);

    return formatDuration(now - startedAt);
}

export function formatDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0)
        return cockpit.format(_("$0 seconds"), String(seconds));
    return cockpit.format(_("$0 minutes $1 seconds"), String(minutes), String(seconds));
}
