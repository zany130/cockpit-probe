/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import React from 'react';

import { Alert } from '@patternfly/react-core';

import cockpit from 'cockpit';

const _ = cockpit.gettext;

export const ProbeCompletenessNote = ({
    backend,
}: {
    backend: "native" | "flatpak";
}) => {
    if (backend === "flatpak") {
        return (
            <Alert
                    variant="info"
                    isInline
                    title={_("This summary is from an unprivileged Flatpak probe")}
            >
                {_("hw-probe itself requires root for a complete native probe, including SMART drive health. This Flatpak action runs as the signed-in user and does not request Cockpit administrative access. PCI and other visible devices can still appear. Drive health and some logs may be missing. This plugin does not grant extra Flatpak permissions.")}
            </Alert>
        );
    }

    return (
        <Alert
                variant="info"
                isInline
                title={_("Administrative access was used only for this native probe")}
        >
            {_("hw-probe exits unless it runs as root, so Cockpit administrative access is required to run a native probe and to read its privileged inventory. Version detection stays unprivileged. Drive Works or Failed can include SMART results from that privileged probe. Full SMART attributes are not shown.")}
        </Alert>
    );
};
