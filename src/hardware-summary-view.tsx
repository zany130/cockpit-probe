/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import React from 'react';

import {
    Alert,
    Button,
    Card,
    CardBody,
    CardTitle,
    DescriptionList,
    DescriptionListDescription,
    DescriptionListGroup,
    DescriptionListTerm,
    EmptyState,
    EmptyStateActions,
    EmptyStateBody,
    EmptyStateFooter,
    ExpandableSection,
    Gallery,
    GalleryItem,
    Spinner,
} from '@patternfly/react-core';

import cockpit from 'cockpit';

import type {
    DeviceCategoryId,
    HardwareDevice,
    HardwareSummary,
    InventoryError,
    InventoryState,
    UploadState,
} from './model';
import { deviceLabel, formatDeviceStatus } from './device-display';
import { HardwareFindingsView } from './hardware-findings-view';
import { buildSystemTitle } from './inventory-normalizer';
import { ShareProbeView } from './share-probe-view';

const _ = cockpit.gettext;

interface HardwareSummaryViewProps {
    inventory: InventoryState;
    onRunProbe?: (() => void) | undefined;
    probeRunning?: boolean | undefined;
    upload?: UploadState | undefined;
    onRequestUpload?: (() => void) | undefined;
    onCancelUpload?: (() => void) | undefined;
    uploadBackend?: "native" | "flatpak" | undefined;
}

export const HardwareSummaryView = ({
    inventory,
    onRunProbe,
    probeRunning = false,
    upload,
    onRequestUpload,
    onCancelUpload,
    uploadBackend = "native",
}: HardwareSummaryViewProps) => {
    switch (inventory.status) {
    case "loading":
        return (
            <EmptyState titleText={_("Reading hardware inventory")} headingLevel="h2" icon={Spinner}>
                <EmptyStateBody>
                    {_("Loading the local hardware summary. This does not run a new probe.")}
                </EmptyStateBody>
            </EmptyState>
        );
    case "empty":
        return (
            <>
                <EmptyInventory onRunProbe={onRunProbe} probeRunning={probeRunning} />
                {onRequestUpload && onCancelUpload && upload && (
                    <ShareProbeView
                            canUpload={false}
                            backend={uploadBackend}
                            upload={upload}
                            probeRunning={probeRunning}
                            onRequestUpload={onRequestUpload}
                            onCancelUpload={onCancelUpload}
                    />
                )}
            </>
        );
    case "failed":
        return <FailedInventory error={inventory.error} onRunProbe={onRunProbe} />;
    case "ready":
        return (
            <ReadyInventory
                    summary={inventory.summary}
                    upload={upload}
                    onRequestUpload={onRequestUpload}
                    onCancelUpload={onCancelUpload}
                    probeRunning={probeRunning}
                    uploadBackend={uploadBackend}
            />
        );
    case "idle":
    default:
        return null;
    }
};

const EmptyInventory = ({
    onRunProbe,
    probeRunning,
}: {
    onRunProbe?: (() => void) | undefined;
    probeRunning: boolean;
}) => (
    <EmptyState titleText={_("No local hardware probe is available yet")} headingLevel="h2">
        <EmptyStateBody>
            {_("Run a local hardware probe to build a hardware summary. Nothing is uploaded.")}
        </EmptyStateBody>
        {onRunProbe && !probeRunning && (
            <EmptyStateFooter>
                <EmptyStateActions>
                    <Button
                            variant="primary"
                            onClick={onRunProbe}
                            aria-label={_("Run hardware probe")}
                    >
                        {_("Run Hardware Probe")}
                    </Button>
                </EmptyStateActions>
            </EmptyStateFooter>
        )}
    </EmptyState>
);

const FailedInventory = ({
    error,
    onRunProbe,
}: {
    error: InventoryError;
    onRunProbe?: (() => void) | undefined;
}) => (
    <Alert
            variant={error.kind === "administrative-access-required" ? "warning" : "danger"}
            isInline
            title={inventoryErrorTitle(error)}
            actionLinks={onRunProbe && (
                <Button
                        variant="link"
                        isInline
                        onClick={onRunProbe}
                        aria-label={_("Run hardware probe")}
                >
                    {_("Run Hardware Probe")}
                </Button>
            )}
    >
        {inventoryErrorBody(error)}
    </Alert>
);

export function inventoryErrorTitle(error: InventoryError): string {
    if (error.kind === "administrative-access-required")
        return _("Administrative access is required");
    if (error.kind === "malformed-host" || error.kind === "malformed-devices")
        return _("The hardware inventory could not be read");
    if (error.kind === "missing")
        return _("The hardware inventory could not be read");
    if (error.kind === "inventory-unavailable")
        return _("Hardware inventory is not available");
    return _("The hardware inventory could not be read");
}

export function inventoryErrorBody(error: InventoryError): string {
    if (error.kind === "administrative-access-required")
        return _("Administrative access is required to read a native hardware inventory. This is not a hardware probe failure. Nothing was uploaded.");
    if (error.kind === "malformed-host" || error.kind === "malformed-devices")
        return _("The hardware probe data is present, but it could not be parsed. This is not a hardware probe command failure. Nothing was uploaded.");
    if (error.kind === "missing")
        return _("The hardware probe completed, but its inventory could not be read. This is not a hardware probe command failure. Nothing was uploaded.");
    if (error.kind === "inventory-unavailable")
        return _("This installation cannot expose a local hardware inventory yet. Nothing was uploaded.");
    return _("The local hardware summary is unavailable. Nothing was uploaded.");
}

const ReadyInventory = ({
    summary,
    upload,
    onRequestUpload,
    onCancelUpload,
    probeRunning,
    uploadBackend,
}: {
    summary: HardwareSummary;
    upload?: UploadState | undefined;
    onRequestUpload?: (() => void) | undefined;
    onCancelUpload?: (() => void) | undefined;
    probeRunning: boolean;
    uploadBackend: "native" | "flatpak";
}) => (
    <div className="hw-probe-summary">
        <h2 className="hw-probe-summary-heading">{_("Hardware Summary")}</h2>
        <p className="hw-probe-summary-note">
            {_("Device status is what hw-probe reported. It is not a health score.")}
        </p>
        <Gallery hasGutter minWidths={{ default: "16rem" }} className="hw-probe-overview">
            <GalleryItem>
                <OverviewCard title={_("System")}>
                    <SystemBlock summary={summary} />
                </OverviewCard>
            </GalleryItem>
            <GalleryItem>
                <OverviewCard title={_("CPU")}>
                    <CpuBlock summary={summary} />
                </OverviewCard>
            </GalleryItem>
            <GalleryItem>
                <OverviewCard title={_("Memory")}>
                    <MemoryBlock summary={summary} />
                </OverviewCard>
            </GalleryItem>
            <GalleryItem>
                <OverviewCard title={_("Graphics")}>
                    <DeviceLines devices={summary.graphics} empty={_("No graphics devices were reported.")} />
                </OverviewCard>
            </GalleryItem>
            <GalleryItem>
                <OverviewCard title={_("Storage")}>
                    <DeviceLines devices={summary.disks} empty={_("No disks were reported.")} />
                </OverviewCard>
            </GalleryItem>
            <GalleryItem>
                <OverviewCard title={_("Network")}>
                    <DeviceLines devices={summary.network} empty={_("No network devices were reported.")} />
                </OverviewCard>
            </GalleryItem>
        </Gallery>
        <HardwareFindingsView summary={summary} />
        <DeviceInventory summary={summary} />
        {onRequestUpload && onCancelUpload && upload && (
            <ShareProbeView
                    canUpload
                    collectedAt={summary.host.collectedAt}
                    backend={uploadBackend}
                    upload={upload}
                    probeRunning={probeRunning}
                    onRequestUpload={onRequestUpload}
                    onCancelUpload={onCancelUpload}
            />
        )}
    </div>
);

const OverviewCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <Card isCompact>
        <CardTitle>{title}</CardTitle>
        <CardBody>{children}</CardBody>
    </Card>
);

const SystemBlock = ({ summary }: { summary: HardwareSummary }) => {
    const title = buildSystemTitle(summary.host);
    return (
        <DescriptionList isCompact>
            {title && <Item term={_("Model")} value={title} />}
            {summary.host.architecture && <Item term={_("Architecture")} value={summary.host.architecture} />}
            {summary.host.bootMode && <Item term={_("Boot mode")} value={summary.host.bootMode} />}
            {summary.host.kernel && <Item term={_("Kernel")} value={summary.host.kernel} />}
            {summary.host.systemType && <Item term={_("System type")} value={summary.host.systemType} />}
        </DescriptionList>
    );
};

const CpuBlock = ({ summary }: { summary: HardwareSummary }) => {
    if (summary.cpu == null)
        return <p>{_("No CPU was reported.")}</p>;
    return (
        <DescriptionList isCompact>
            <Item term={_("Processor")} value={summary.cpu.model} />
            {summary.cpu.physicalCoreCount !== undefined && (
                <Item
                        term={_("Cores")}
                        value={cockpit.format(_("$0 cores"), String(summary.cpu.physicalCoreCount))}
                />
            )}
        </DescriptionList>
    );
};

const MemoryBlock = ({ summary }: { summary: HardwareSummary }) => (
    <DescriptionList isCompact>
        {summary.memory.totalLabel && <Item term={_("Total")} value={summary.memory.totalLabel} />}
        <Item
                term={_("Modules")}
                value={cockpit.format(_("$0 modules"), String(summary.memory.moduleCount))}
        />
    </DescriptionList>
);

const DeviceLines = ({ devices, empty }: { devices: HardwareDevice[]; empty: string }) => {
    if (devices.length === 0)
        return <p>{empty}</p>;
    return (
        <ul className="hw-probe-device-lines">
            {devices.map((device, index) => (
                <li key={device.id + ":" + String(index)}>
                    <div>{deviceLabel(device)}</div>
                    {device.driver && (
                        <div className="hw-probe-device-meta">
                            {cockpit.format(_("Driver: $0"), device.driver)}
                        </div>
                    )}
                    <div className="hw-probe-device-meta">{formatDeviceStatus(device.status)}</div>
                </li>
            ))}
        </ul>
    );
};

const DeviceInventory = ({ summary }: { summary: HardwareSummary }) => {
    const overview = summary.categories.filter(group => group.prominence === "overview");
    const secondary = summary.categories.filter(group => group.prominence === "secondary");
    return (
        <div className="hw-probe-inventory">
            <h2 className="hw-probe-summary-heading">{_("Devices")}</h2>
            {overview.map(group => (
                <CategoryBlock key={group.id} id={group.id} devices={group.devices} />
            ))}
            {secondary.length > 0 && (
                <ExpandableSection toggleText={_("Other devices")}>
                    {secondary.map(group => (
                        <CategoryBlock key={group.id} id={group.id} devices={group.devices} />
                    ))}
                </ExpandableSection>
            )}
        </div>
    );
};

function devicesForDisplay(id: DeviceCategoryId, devices: HardwareDevice[]): HardwareDevice[] {
    if (id !== "cpu")
        return devices;
    const seen = new Set<string>();
    const unique: HardwareDevice[] = [];
    for (const device of devices) {
        const key = device.vendor + "\0" + device.device;
        if (seen.has(key))
            continue;
        seen.add(key);
        unique.push(device);
    }
    return unique;
}

const CategoryBlock = ({ id, devices }: { id: DeviceCategoryId; devices: HardwareDevice[] }) => (
    <section className="hw-probe-category">
        <h3>{categoryLabel(id)}</h3>
        <ul className="hw-probe-device-lines">
            {devicesForDisplay(id, devices).map((device, index) => (
                <li key={device.id + ":" + String(index)}>
                    <div>{deviceLabel(device)}</div>
                    <div className="hw-probe-device-meta">
                        {device.driver
                            ? cockpit.format(_("Driver: $0 · $1"), device.driver, formatDeviceStatus(device.status))
                            : formatDeviceStatus(device.status)}
                    </div>
                </li>
            ))}
        </ul>
    </section>
);

const Item = ({ term, value }: { term: string; value: string }) => (
    <DescriptionListGroup>
        <DescriptionListTerm>{term}</DescriptionListTerm>
        <DescriptionListDescription>{value}</DescriptionListDescription>
    </DescriptionListGroup>
);

export { deviceLabel, formatDeviceStatus } from './device-display';

export function categoryLabel(id: DeviceCategoryId): string {
    switch (id) {
    case "cpu":
        return _("CPU");
    case "memory":
        return _("Memory");
    case "graphics":
        return _("Graphics");
    case "storage":
        return _("Disks");
    case "storage-controller":
        return _("Storage controllers");
    case "network":
        return _("Network");
    case "sound":
        return _("Sound");
    case "display":
        return _("Displays");
    case "input":
        return _("Input");
    case "usb":
        return _("USB");
    case "bluetooth":
        return _("Bluetooth");
    case "motherboard":
        return _("Motherboard");
    case "firmware":
        return _("Firmware");
    default:
        return _("Other");
    }
}
