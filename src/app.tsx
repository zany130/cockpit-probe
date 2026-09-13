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
import type { HwProbeCapability, InventoryState, ProbeExecutionState, UploadState } from './model';
import { createProbeController } from './probe-provider';
import { createInventoryLoadSession, cockpitInventoryFileReader } from './inventory-provider';
import { createUploadController } from './upload-provider';
import { SectionErrorBoundary } from './section-error-boundary';

const _ = cockpit.gettext;

export const Application = () => {
    const [status, setStatus] = useState<CapabilityViewStatus>({ phase: "loading" });
    const [execution, setExecution] = useState<ProbeExecutionState>({ status: "idle" });
    const [inventory, setInventory] = useState<InventoryState>({ status: "idle" });
    const [upload, setUpload] = useState<UploadState>({ status: "idle" });
    const [refreshNonce, setRefreshNonce] = useState(0);
    const [detecting, setDetecting] = useState(true);
    const invocationRef = useRef<HwProbeInvocation | null>(null);
    const hasResolvedRef = useRef(false);
    const controllerRef = useRef(createProbeController());
    const uploadRef = useRef(createUploadController());
    const inventorySessionRef = useRef(createInventoryLoadSession({
        readFile: cockpitInventoryFileReader(),
    }));

    const refresh = useCallback(() => {
        setRefreshNonce(nonce => nonce + 1);
    }, []);

    const runProbe = useCallback(() => {
        if (uploadRef.current.getState().status === "uploading")
            return;
        const invocation = invocationRef.current;
        if (invocation == null)
            return;
        controllerRef.current.run(invocation).then(() => undefined, () => undefined);
    }, []);

    const cancelProbe = useCallback(() => {
        controllerRef.current.cancel();
    }, []);

    const requestUpload = useCallback(() => {
        if (controllerRef.current.getState().status === "running")
            return;
        const invocation = invocationRef.current;
        if (invocation == null)
            return;
        uploadRef.current.run(invocation).then(() => undefined, () => undefined);
    }, []);

    const cancelUpload = useCallback(() => {
        uploadRef.current.cancel();
    }, []);

    useEffect(() => {
        return controllerRef.current.subscribe(setExecution);
    }, []);

    useEffect(() => {
        return uploadRef.current.subscribe(setUpload);
    }, []);

    const loadInventory = useCallback((
        invocation: HwProbeInvocation,
        executionState: ProbeExecutionState,
        keepPrevious = false
    ) => {
        inventorySessionRef.current.request(
            invocation,
            executionState,
            setInventory,
            {
                keepPrevious,
                localCopyConsumed: uploadRef.current.getState().status === "succeeded",
            }
        );
    }, []);

    useEffect(() => {
        let ignore = false;
        setDetecting(true);
        if (!hasResolvedRef.current)
            setStatus({ phase: "loading" });

        resolveHwProbe().then(resolved => {
            if (ignore)
                return;
            hasResolvedRef.current = true;
            invocationRef.current = resolved.invocation;
            setStatus({ phase: "ready", capability: resolved.capability });
            setDetecting(false);
            if (resolved.invocation != null && resolved.capability.state === "available")
                loadInventory(resolved.invocation, controllerRef.current.getState(), true);
            else
                setInventory({ status: "idle" });
        }, () => {
            if (ignore)
                return;
            hasResolvedRef.current = true;
            invocationRef.current = null;
            const capability: HwProbeCapability = {
                state: "error",
                error: {
                    kind: "unknown",
                    message: "hw-probe version query failed",
                },
            };
            setStatus({ phase: "ready", capability });
            setDetecting(false);
        });

        return () => {
            ignore = true;
        };
    }, [refreshNonce, loadInventory]);

    useEffect(() => {
        if (execution.status !== "succeeded")
            return;
        const invocation = invocationRef.current;
        if (invocation == null)
            return;
        loadInventory(invocation, execution, true);
    }, [execution, loadInventory]);

    useEffect(() => {
        if (upload.status !== "succeeded")
            return;
        // hw-probe deletes LATEST after a successful -upload. Treat that as
        // no local probe, not as a missing-inventory read failure.
        inventorySessionRef.current.replace({ status: "empty" }, setInventory);
        controllerRef.current.reset();
    }, [upload]);

    useEffect(() => {
        const probe = controllerRef.current;
        const upload = uploadRef.current;
        const inventorySession = inventorySessionRef.current;
        return () => {
            inventorySession.invalidate();
            probe.cancel();
            upload.cancel();
        };
    }, []);

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
                                detecting={detecting}
                                onRefresh={refresh}
                                execution={execution}
                                onRunProbe={runProbe}
                                onCancelProbe={cancelProbe}
                                inventory={inventory}
                                upload={upload}
                                onRequestUpload={requestUpload}
                                onCancelUpload={cancelUpload}
                        />
                    </SectionErrorBoundary>
                </div>
            </PageSection>
        </Page>
    );
};
