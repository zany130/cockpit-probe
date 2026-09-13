/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import React, { useCallback, useEffect, useState } from 'react';

import { Page, PageSection } from '@patternfly/react-core/dist/esm/components/Page/index.js';
import { Title } from '@patternfly/react-core/dist/esm/components/Title/index.js';

import cockpit from 'cockpit';

import { detectHwProbeCapability } from './capability-provider';
import { CapabilityView, type CapabilityViewStatus } from './capability-view';
import type { HwProbeCapability } from './model';
import { SectionErrorBoundary } from './section-error-boundary';

const _ = cockpit.gettext;

export const Application = () => {
    const [status, setStatus] = useState<CapabilityViewStatus>({ phase: "loading" });
    const [refreshNonce, setRefreshNonce] = useState(0);

    const refresh = useCallback(() => {
        setRefreshNonce(nonce => nonce + 1);
    }, []);

    useEffect(() => {
        let ignore = false;
        setStatus({ phase: "loading" });

        detectHwProbeCapability().then((capability: HwProbeCapability) => {
            if (!ignore)
                setStatus({ phase: "ready", capability });
        }, () => {
            if (!ignore) {
                setStatus({
                    phase: "ready",
                    capability: {
                        state: "error",
                        error: {
                            kind: "unknown",
                            message: "hw-probe version query failed",
                        },
                    },
                });
            }
        });

        return () => {
            ignore = true;
        };
    }, [refreshNonce]);

    return (
        <Page className="pf-m-no-sidebar no-masthead-sidebar">
            <PageSection>
                <div className="hw-probe-page">
                    <Title headingLevel="h1" size="2xl">
                        {_("Hardware Probe")}
                    </Title>
                    <SectionErrorBoundary heading={_("Hardware probe status")}>
                        <CapabilityView status={status} onRefresh={refresh} />
                    </SectionErrorBoundary>
                </div>
            </PageSection>
        </Page>
    );
};
