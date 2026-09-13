/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import React from 'react';

import {
    Alert,
    Button,
    DescriptionList,
    DescriptionListDescription,
    DescriptionListGroup,
    DescriptionListTerm,
    EmptyState,
    EmptyStateBody,
    Flex,
    FlexItem,
    Spinner,
} from '@patternfly/react-core';
import { CubesIcon } from '@patternfly/react-icons';

import cockpit from 'cockpit';

import type { HwProbeCapability } from './model';

const _ = cockpit.gettext;

export type CapabilityViewStatus =
    | { phase: "loading" }
    | { phase: "ready"; capability: HwProbeCapability };

interface CapabilityViewProps {
    status: CapabilityViewStatus;
    onRefresh: () => void;
}

export const CapabilityView = ({ status, onRefresh }: CapabilityViewProps) => {
    const loading = status.phase === "loading";

    return (
        <div className="hw-probe-status">
            <Flex
                    className="hw-probe-actions"
                    justifyContent={{ default: 'justifyContentFlexEnd' }}
                    flexWrap={{ default: 'wrap' }}
            >
                <FlexItem>
                    <Button
                            variant="secondary"
                            onClick={onRefresh}
                            isDisabled={loading}
                            aria-label={_("Refresh hardware probe detection")}
                    >
                        {_("Refresh")}
                    </Button>
                </FlexItem>
            </Flex>
            {loading && <LoadingStatus />}
            {status.phase === "ready" && <ReadyStatus capability={status.capability} onRefresh={onRefresh} />}
        </div>
    );
};

const LoadingStatus = () => (
    <EmptyState titleText={_("Detecting hw-probe")} headingLevel="h2" icon={Spinner}>
        <EmptyStateBody>
            {_("Checking whether hw-probe is installed and usable on this host.")}
        </EmptyStateBody>
    </EmptyState>
);

const ReadyStatus = ({
    capability,
    onRefresh,
}: {
    capability: HwProbeCapability;
    onRefresh: () => void;
}) => {
    switch (capability.state) {
    case "available":
        return <AvailableStatus version={capability.version ?? null} />;
    case "unavailable":
        return <UnavailableStatus />;
    case "permission-denied":
        return <PermissionDeniedStatus />;
    case "timeout":
        return (
            <RetryableStatus
                    title={_("The hw-probe version query timed out")}
                    body={_("Detection stopped before a result was returned. Refresh to try again. This does not run a hardware probe.")}
                    variant="warning"
                    onRefresh={onRefresh}
            />
        );
    case "error":
    default:
        return (
            <RetryableStatus
                    title={_("hw-probe could not be detected")}
                    body={errorBody(capability)}
                    variant="danger"
                    onRefresh={onRefresh}
            />
        );
    }
};

function errorBody(capability: HwProbeCapability): string {
    if (capability.error?.kind === "malformed-output")
        return _("hw-probe ran, but its version output was not a usable version string.");
    if (capability.error?.kind === "command-failed")
        return _("hw-probe exited unsuccessfully while reporting its version.");
    return _("An unexpected error occurred while detecting hw-probe.");
}

const AvailableStatus = ({ version }: { version: string | null }) => (
    <EmptyState titleText={_("hw-probe is available")} headingLevel="h2">
        <EmptyStateBody>
            <p>{_("Hardware probing is ready on this system.")}</p>
            {version !== null && (
                <DescriptionList isHorizontal className="hw-probe-version">
                    <DescriptionListGroup>
                        <DescriptionListTerm>{_("Version")}</DescriptionListTerm>
                        <DescriptionListDescription>{version}</DescriptionListDescription>
                    </DescriptionListGroup>
                </DescriptionList>
            )}
            <p>
                {_("Local hardware probing will be available in the next implementation milestone.")}
            </p>
        </EmptyStateBody>
    </EmptyState>
);

const UnavailableStatus = () => (
    <EmptyState
            titleText={_("hw-probe is not installed or cannot be found")}
            headingLevel="h2"
            icon={CubesIcon}
    >
        <EmptyStateBody>
            {_("Install hw-probe on this host before hardware probing can be used.")}
        </EmptyStateBody>
    </EmptyState>
);

const PermissionDeniedStatus = () => (
    <Alert
            variant="warning"
            isInline
            title={_("hw-probe is present but could not be executed with the current permissions")}
    >
        {_("This page did not request extra privileges and did not run a hardware probe.")}
    </Alert>
);

const RetryableStatus = ({
    title,
    body,
    variant,
    onRefresh,
}: {
    title: string;
    body: string;
    variant: "warning" | "danger";
    onRefresh: () => void;
}) => (
    <Alert
            variant={variant}
            isInline
            title={title}
            actionLinks={
                <Button
                        variant="link"
                        isInline
                        onClick={onRefresh}
                        aria-label={_("Retry hardware probe detection")}
                >
                    {_("Retry")}
                </Button>
            }
    >
        {body}
    </Alert>
);
