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
    ExpandableSection,
} from '@patternfly/react-core';

import cockpit from 'cockpit';

import { deviceLabel, formatDeviceStatus } from './device-display';
import { deriveFindingsFromSummary } from './findings-normalizer';
import type { HardwareFinding, HardwareFindingsSummary, HardwareSummary } from './model';

const _ = cockpit.gettext;

interface HardwareFindingsViewProps {
    summary?: HardwareSummary | undefined;
    findings?: HardwareFindingsSummary | undefined;
}

export const HardwareFindingsView = ({
    summary,
    findings,
}: HardwareFindingsViewProps) => {
    try {
        const resolved = findings ?? (summary ? deriveFindingsFromSummary(summary) : null);
        if (resolved == null)
            return null;
        return <FindingsBody findings={resolved} />;
    } catch {
        return (
            <Alert
                    variant="warning"
                    isInline
                    title={_("Hardware findings could not be derived")}
            >
                {_("The hardware inventory is available, but findings could not be derived from it. This is not a hardware probe command failure.")}
            </Alert>
        );
    }
};

const FindingsBody = ({ findings }: { findings: HardwareFindingsSummary }) => (
    <section className="hw-probe-findings">
        <h2 className="hw-probe-summary-heading">{_("Hardware Findings")}</h2>
        <p className="hw-probe-summary-note">
            {_("These are statuses hw-probe recorded on the local probe. They are not a hardware health score, and missing problem reports are not proof that every device works.")}
        </p>
        {findings.problems.length === 0 && (
            <Alert
                    variant="info"
                    isInline
                    title={_("No problems are reported in the available hw-probe data")}
            >
                {_("hw-probe did not assign failed or malfunc to any device in this inventory. That is not a claim that the machine is healthy.")}
            </Alert>
        )}
        {findings.problems.length > 0 && (
            <Alert
                    variant="danger"
                    isInline
                    title={_("Devices with reported problems")}
            >
                {_("hw-probe assigned a problem status. The wording below is the upstream meaning, not a diagnosis from this plugin.")}
            </Alert>
        )}
        <Card isCompact className="hw-probe-findings-counts">
            <CardBody>
                <DescriptionList isCompact isHorizontal>
                    <CountItem term={_("Works")} value={findings.counts.works} />
                    <CountItem term={_("Detected")} value={findings.counts.detected} />
                    {findings.counts.failed > 0 && <CountItem term={_("Failed")} value={findings.counts.failed} />}
                    {findings.counts.malfunc > 0 && <CountItem term={_("Malfunction")} value={findings.counts.malfunc} />}
                    {findings.counts.limited > 0 && <CountItem term={_("Limited")} value={findings.counts.limited} />}
                    {findings.counts.fixed > 0 && <CountItem term={_("Fixed")} value={findings.counts.fixed} />}
                    {findings.counts.other > 0 && <CountItem term={_("Other")} value={findings.counts.other} />}
                </DescriptionList>
            </CardBody>
        </Card>
        {findings.problems.length > 0 && (
            <FindingList findings={findings.problems} />
        )}
        {findings.unconfirmed.length > 0 && (
            <FindingList
                    heading={_("Devices without confirmed operability")}
                    findings={findings.unconfirmed}
            />
        )}
        {findings.unknown.length > 0 && (
            <FindingList
                    heading={_("Devices with an unrecognized hw-probe status")}
                    findings={findings.unknown}
            />
        )}
        {findings.secondaryUnconfirmed.length > 0 && (
            <ExpandableSection toggleText={_("Low-level devices without confirmed operability")}>
                <p className="hw-probe-summary-note">
                    {_("These are typically bridges, hubs, and controllers. hw-probe status Detected is not a malfunction report.")}
                </p>
                <FindingList findings={findings.secondaryUnconfirmed} />
            </ExpandableSection>
        )}
    </section>
);

const CountItem = ({ term, value }: { term: string; value: number }) => (
    <DescriptionListGroup>
        <DescriptionListTerm>{term}</DescriptionListTerm>
        <DescriptionListDescription>{String(value)}</DescriptionListDescription>
    </DescriptionListGroup>
);

const FindingList = ({
    heading,
    findings,
}: {
    heading?: string | undefined;
    findings: HardwareFinding[];
}) => (
    <div className="hw-probe-finding-list">
        {heading && <h3>{heading}</h3>}
        <ul className="hw-probe-device-lines">
            {findings.map((finding, index) => (
                <li key={findingKey(finding, index)}>
                    <div>{findingLabel(finding)}</div>
                    <div className="hw-probe-device-meta">
                        {cockpit.format(_("hw-probe status: $0"), formatDeviceStatus(finding.upstreamStatus))}
                    </div>
                    <div className="hw-probe-device-meta">{finding.summary}</div>
                    {finding.detail && <div className="hw-probe-device-meta">{finding.detail}</div>}
                    {finding.device?.driver && (
                        <div className="hw-probe-device-meta">
                            {cockpit.format(_("Driver: $0"), finding.device.driver)}
                        </div>
                    )}
                </li>
            ))}
        </ul>
    </div>
);

function findingKey(finding: HardwareFinding, index: number): string {
    if (finding.device?.id)
        return finding.device.id + ":" + finding.upstreamStatus;
    return "unassociated:" + finding.upstreamStatus + ":" + String(index);
}

export function findingLabel(finding: HardwareFinding): string {
    if (finding.device == null)
        return _("Unassociated finding");
    return deviceLabel(finding.device);
}
