/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Page, PageSection } from '@patternfly/react-core/dist/esm/components/Page/index.js';
import { Title } from '@patternfly/react-core/dist/esm/components/Title/index.js';

import cockpit from 'cockpit';

import { resolveHwProbe } from './capability-provider';
import { CapabilityView, type CapabilityViewStatus } from './capability-view';
import type { HwProbeInvocation } from './executable';
import type { HwProbeCapability, ProbeExecutionState } from './model';
import { createProbeController } from './probe-provider';
import { SectionErrorBoundary } from './section-error-boundary';

const _ = cockpit.gettext;

export const Application = () => {
    const [status, setStatus] = useState<CapabilityViewStatus>({ phase: "loading" });
    const [execution, setExecution] = useState<ProbeExecutionState>({ status: "idle" });
    const [refreshNonce, setRefreshNonce] = useState(0);
    const invocationRef = useRef<HwProbeInvocation | null>(null);
    const controllerRef = useRef(createProbeController());

    const refresh = useCallback(() => {
        setRefreshNonce(nonce => nonce + 1);
    }, []);

    const runProbe = useCallback(() => {
        const invocation = invocationRef.current;
        if (invocation == null)
            return;
        controllerRef.current.run(invocation).then(() => undefined, () => undefined);
    }, []);

    const cancelProbe = useCallback(() => {
        controllerRef.current.cancel();
    }, []);

    useEffect(() => {
        return controllerRef.current.subscribe(setExecution);
    }, []);

    useEffect(() => {
        let ignore = false;
        setStatus({ phase: "loading" });

        resolveHwProbe().then(resolved => {
            if (ignore)
                return;
            invocationRef.current = resolved.invocation;
            setStatus({ phase: "ready", capability: resolved.capability });
        }, () => {
            if (ignore)
                return;
            invocationRef.current = null;
            const capability: HwProbeCapability = {
                state: "error",
                error: {
                    kind: "unknown",
                    message: "hw-probe version query failed",
                },
            };
            setStatus({ phase: "ready", capability });
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
                        <CapabilityView
                                status={status}
                                onRefresh={refresh}
                                execution={execution}
                                onRunProbe={runProbe}
                                onCancelProbe={cancelProbe}
                        />
                    </SectionErrorBoundary>
                </div>
            </PageSection>
        </Page>
    );
};
