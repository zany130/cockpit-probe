/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import React, { useEffect, useRef, useState } from 'react';

import {
    Alert,
    Button,
} from '@patternfly/react-core';
import { ExternalLinkAltIcon } from '@patternfly/react-icons';

import cockpit from 'cockpit';

import type { UploadError, UploadState } from './model';

const _ = cockpit.gettext;

export interface ShareProbeViewProps {
    canUpload: boolean;
    collectedAt?: string | undefined;
    backend?: "native" | "flatpak" | undefined;
    upload: UploadState;
    probeRunning?: boolean | undefined;
    onRequestUpload: () => void;
    onCancelUpload: () => void;
}

export const ShareProbeView = ({
    canUpload,
    collectedAt,
    backend = "native",
    upload,
    probeRunning = false,
    onRequestUpload,
    onCancelUpload,
}: ShareProbeViewProps) => {
    const [confirming, setConfirming] = useState(false);
    const confirmRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const busy = upload.status === "uploading" || probeRunning;

    useEffect(() => {
        if (confirming)
            confirmRef.current?.focus();
    }, [confirming]);

    useEffect(() => {
        if (!confirming)
            return undefined;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape")
                return;
            event.preventDefault();
            if (upload.status === "uploading")
                return;
            setConfirming(false);
            window.setTimeout(() => triggerRef.current?.focus(), 0);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [confirming, upload.status]);

    const openConfirmation = () => {
        if (!canUpload || busy)
            return;
        setConfirming(true);
    };

    const closeConfirmation = () => {
        if (upload.status === "uploading")
            return;
        setConfirming(false);
        window.setTimeout(() => triggerRef.current?.focus(), 0);
    };

    const confirmUpload = () => {
        if (!canUpload || upload.status === "uploading")
            return;
        setConfirming(false);
        onRequestUpload();
    };

    const retry = () => {
        if (upload.status === "uploading")
            return;
        setConfirming(true);
    };

    return (
        <section className="hw-probe-share">
            <h2 className="hw-probe-summary-heading">{_("Share Probe")}</h2>
            <p className="hw-probe-summary-note">
                {_("Sharing with linux-hardware.org is optional and separate from the local hardware summary.")}
            </p>
            {!canUpload && (
                <Alert
                        variant="info"
                        isInline
                        title={_("Run a hardware probe before uploading")}
                >
                    {_("There is no current local probe to share. Use Run Hardware Probe first. Opening this section does not upload anything.")}
                </Alert>
            )}
            {canUpload && upload.status === "idle" && !confirming && (
                <Button
                        innerRef={triggerRef}
                        variant="secondary"
                        onClick={openConfirmation}
                        isDisabled={busy}
                        aria-label={_("Upload probe to linux-hardware.org")}
                >
                    {_("Upload Probe")}
                </Button>
            )}
            {upload.status === "uploading" && (
                <Alert
                        variant="info"
                        isInline
                        title={_("Uploading the local probe to linux-hardware.org")}
                        actionLinks={
                            <Button
                                    variant="link"
                                    isInline
                                    onClick={onCancelUpload}
                                    aria-label={_("Cancel probe upload")}
                            >
                                {_("Cancel")}
                            </Button>
                        }
                >
                    {_("hw-probe is sending the existing local probe. This page is not running a new hardware scan.")}
                </Alert>
            )}
            {upload.status === "succeeded" && (
                <SuccessAlert result={upload.result} />
            )}
            {upload.status === "failed" && (
                <FailureAlert
                        error={upload.error}
                        onRetry={retry}
                />
            )}
            {confirming && (
                <div
                        ref={confirmRef}
                        className="hw-probe-upload-confirm"
                        role="dialog"
                        aria-modal="false"
                        aria-label={_("Upload this probe to linux-hardware.org")}
                        aria-describedby="hw-probe-upload-body"
                        tabIndex={-1}
                >
                    <Alert
                            variant="info"
                            isInline
                            title={_("Upload this probe to linux-hardware.org")}
                            component="h3"
                    >
                        <div id="hw-probe-upload-body">
                            <ConfirmationCopy collectedAt={collectedAt} backend={backend} />
                        </div>
                        <div className="hw-probe-upload-actions">
                            <Button
                                    variant="primary"
                                    onClick={confirmUpload}
                                    aria-label={_("Confirm upload probe")}
                            >
                                {_("Upload Probe")}
                            </Button>
                            <Button
                                    variant="link"
                                    onClick={closeConfirmation}
                                    aria-label={_("Cancel upload")}
                            >
                                {_("Cancel")}
                            </Button>
                        </div>
                    </Alert>
                </div>
            )}
        </section>
    );
};

const ConfirmationCopy = ({
    collectedAt,
    backend,
}: {
    collectedAt?: string | undefined;
    backend: "native" | "flatpak";
}) => (
    <div className="hw-probe-upload-copy">
        {collectedAt && (
            <p>{cockpit.format(_("hw-probe recorded this local probe at $0."), collectedAt)}</p>
        )}
        <p>
            {_("This sends the current local hw-probe result to linux-hardware.org, the public hardware database. It uses the probe already collected on this host. It does not run a new hardware scan.")}
        </p>
        <p>
            {_("hw-probe applies its own privacy filtering before upload. Upstream says usernames, hostnames, IP addresses, MAC addresses, UUIDs, and serial numbers are not uploaded directly. A 32-byte prefix of a salted SHA512 hash of MAC addresses and serial numbers is still uploaded so the database can tell computers and drives apart. UUIDs are transformed the same way. Upstream warns that filtering can fail in some edge cases.")}
        </p>
        <p>
            {_("Hardware and system details in the probe become part of that external database. A public probe page with a permanent URL may be created. This Cockpit plugin cannot undo the upload.")}
        </p>
        <p>
            {_("Network access is required. This plugin does not contact linux-hardware.org itself; hw-probe performs the upload.")}
        </p>
        {backend === "native"
            ? (
                <p>
                    {_("Native upload needs Cockpit administrative access so hw-probe can read the local privileged probe.")}
                </p>
            )
            : (
                <p>
                    {_("This Flatpak upload runs as the signed-in Cockpit user. Sandboxing can limit what gets uploaded compared with a native privileged probe.")}
                </p>
            )}
        <p>
            {_("After a successful upload, hw-probe removes its local LATEST probe copy. This page keeps the summary already shown until you refresh or run a new probe.")}
        </p>
        <p>
            {_("Upload is optional. Cancel leaves the local probe on this page and does not send anything.")}
        </p>
    </div>
);

const SuccessAlert = ({
    result,
}: {
    result: { url?: string | undefined; probeId?: string | undefined };
}) => (
    <Alert
            variant="success"
            isInline
            title={_("Probe uploaded successfully")}
    >
        {result.url
            ? (
                <p>
                    <a
                            className="pf-v6-c-button pf-m-link pf-m-inline"
                            href={result.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            referrerPolicy="no-referrer"
                            aria-label={_("View uploaded probe on linux-hardware.org (opens an external website)")}
                    >
                        {_("View uploaded probe")}
                        <ExternalLinkAltIcon className="pf-v6-c-button__icon pf-m-end" />
                    </a>
                </p>
            )
            : (
                <p>
                    {_("The linux-hardware.org address could not be read from hw-probe output. The upload command completed successfully.")}
                </p>
            )}
    </Alert>
);

const FailureAlert = ({
    error,
    onRetry,
}: {
    error: UploadError;
    onRetry: () => void;
}) => (
    <Alert
            variant={error.kind === "cancelled" || error.kind === "administrative-access-required" || error.kind === "timeout" ? "warning" : "danger"}
            isInline
            title={uploadErrorTitle(error)}
            actionLinks={
                <Button
                        variant="link"
                        isInline
                        onClick={onRetry}
                        aria-label={_("Try uploading again")}
                >
                    {_("Try again")}
                </Button>
            }
    >
        {uploadErrorBody(error)}
    </Alert>
);

export function uploadErrorTitle(error: UploadError): string {
    if (error.kind === "administrative-access-required")
        return _("Administrative access is required");
    if (error.kind === "no-local-probe")
        return _("No local probe is available to upload");
    if (error.kind === "network-unavailable")
        return _("linux-hardware.org could not be reached");
    if (error.kind === "upstream-rejected")
        return _("linux-hardware.org rejected the upload");
    if (error.kind === "timeout")
        return _("The probe upload timed out");
    if (error.kind === "cancelled")
        return _("Probe upload was cancelled");
    if (error.kind === "command-failed")
        return _("The upload command failed");
    return _("The probe upload failed");
}

export function uploadErrorBody(error: UploadError): string {
    if (error.kind === "administrative-access-required")
        return _("Administrative access is required to upload a native hardware probe. Cockpit did not start hw-probe. The local summary is unchanged.");
    if (error.kind === "no-local-probe")
        return _("hw-probe reported that there is no local probe to upload. Run a hardware probe first. The local summary is unchanged.");
    if (error.kind === "network-unavailable")
        return _("hw-probe could not reach linux-hardware.org. Nothing was stored in the public database. The local summary is unchanged.");
    if (error.kind === "upstream-rejected")
        return _("linux-hardware.org did not accept the upload. The local summary is unchanged.");
    if (error.kind === "timeout")
        return _("The upload stopped before hw-probe finished. The local summary is unchanged.");
    if (error.kind === "cancelled")
        return _("The upload was cancelled. The local summary is unchanged.");
    if (error.kind === "command-failed")
        return _("hw-probe exited before completing the upload. The local summary is unchanged.");
    return _("The upload did not complete. The local summary is unchanged.");
}
