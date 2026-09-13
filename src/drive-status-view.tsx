/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import React from 'react';

import {
    Alert,
    Card,
    CardBody,
    DescriptionList,
    DescriptionListDescription,
    DescriptionListGroup,
    DescriptionListTerm,
} from '@patternfly/react-core';

import cockpit from 'cockpit';

import { deviceLabel, formatDeviceStatus } from './device-display';
import { deriveDriveStatusFromSummary } from './drive-status';
import type { DriveStatusSummary, HardwareSummary } from './model';

const _ = cockpit.gettext;

interface DriveStatusViewProps {
    summary: HardwareSummary;
    backend?: "native" | "flatpak" | undefined;
}

export const DriveStatusView = ({
    summary,
    backend = "native",
}: DriveStatusViewProps) => {
    const drives = deriveDriveStatusFromSummary(summary);
    return <DriveStatusBody drives={drives} backend={backend} />;
};

const DriveStatusBody = ({
    drives,
    backend,
}: {
    drives: DriveStatusSummary;
    backend: "native" | "flatpak";
}) => (
    <section className="hw-probe-drive-status">
        <h2 className="hw-probe-summary-heading">{_("Drive status")}</h2>
        <p className="hw-probe-summary-note">
            {_("This is the hw-probe Status field for disks. When SMART was collected during a privileged probe, PASSED or SMART Health Status OK becomes Works, and FAILED becomes Failed. Missing SMART stays Detected. This is not a SMART attribute dashboard and not a health score.")}
        </p>
        {backend === "flatpak" && (
            <Alert
                    variant="info"
                    isInline
                    title={_("Flatpak probes may not include drive health")}
            >
                {_("hw-probe collects SMART only as administrator. This Flatpak probe did not request administrative access, and the sandbox may hide block devices. Drive Works or Failed can therefore be incomplete. This plugin does not change Flatpak permissions.")}
            </Alert>
        )}
        {drives.counts.total === 0
            ? <p>{_("No disks were reported.")}</p>
            : (
                <>
                    <Card isCompact className="hw-probe-findings-counts">
                        <CardBody>
                            <DescriptionList isCompact isHorizontal>
                                <CountItem term={_("Works")} value={drives.counts.works} />
                                <CountItem term={_("Detected")} value={drives.counts.detected} />
                                {drives.counts.failed > 0 && <CountItem term={_("Failed")} value={drives.counts.failed} />}
                                {drives.counts.other > 0 && <CountItem term={_("Other")} value={drives.counts.other} />}
                            </DescriptionList>
                        </CardBody>
                    </Card>
                    <ul className="hw-probe-device-lines">
                        {drives.disks.map(disk => (
                            <li key={disk.id}>
                                <div>{deviceLabel(disk)}</div>
                                <div className="hw-probe-device-meta">
                                    {cockpit.format(_("hw-probe status: $0"), formatDeviceStatus(disk.status))}
                                </div>
                            </li>
                        ))}
                    </ul>
                </>
            )}
    </section>
);

const CountItem = ({ term, value }: { term: string; value: number }) => (
    <DescriptionListGroup>
        <DescriptionListTerm>{term}</DescriptionListTerm>
        <DescriptionListDescription>{String(value)}</DescriptionListDescription>
    </DescriptionListGroup>
);
