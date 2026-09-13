/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

export type HwProbeState =
    | "available"
    | "unavailable"
    | "permission-denied"
    | "timeout"
    | "error";

export type HwProbeErrorKind =
    | "command-not-found"
    | "permission-denied"
    | "timeout"
    | "malformed-output"
    | "command-failed"
    | "unknown";

export interface HwProbeError {
    kind: HwProbeErrorKind;
    message: string;
}

export type HwProbeSource =
    | "native-path"
    | "user-local"
    | "flatpak";

export interface HwProbeCapability {
    state: HwProbeState;
    version?: string;
    source?: HwProbeSource;
    error?: HwProbeError;
}

export type ProbeExecutionErrorKind =
    | "command-not-found"
    | "permission-denied"
    | "administrative-access-required"
    | "timeout"
    | "command-failed"
    | "unknown";

export interface ProbeExecutionError {
    kind: ProbeExecutionErrorKind;
    message: string;
}

export type ProbeExecutionState =
    | { status: "idle" }
    | { status: "running"; startedAt: number }
    | {
        status: "succeeded";
        startedAt: number;
        completedAt: number;
        artifactPath?: string;
    }
    | { status: "cancelled"; startedAt: number; completedAt: number }
    | {
        status: "failed";
        startedAt: number;
        completedAt: number;
        error: ProbeExecutionError;
    };

export type InventoryErrorKind =
    | "missing"
    | "host-missing"
    | "devices-missing"
    | "administrative-access-required"
    | "malformed-host"
    | "malformed-devices"
    | "read-failed"
    | "inventory-unavailable"
    | "unknown";

export interface InventoryError {
    kind: InventoryErrorKind;
    message: string;
}

export interface HostSummary {
    architecture?: string | undefined;
    bootMode?: string | undefined;
    physicalCoreCount?: number | undefined;
    kernel?: string | undefined;
    vendor?: string | undefined;
    model?: string | undefined;
    systemType?: string | undefined;
    ramTotalKiB?: number | undefined;
    ramTotalLabel?: string | undefined;
    monitorCount?: number | undefined;
    nicCount?: number | undefined;
    probeVersion?: string | undefined;
}

export interface HardwareDevice {
    bus: string;
    id: string;
    className: string;
    status: string;
    type: string;
    driver: string | null;
    vendor: string;
    device: string;
    subvendor?: string | undefined;
    subdevice?: string | undefined;
}

export type DeviceCategoryId =
    | "cpu"
    | "memory"
    | "graphics"
    | "storage"
    | "storage-controller"
    | "network"
    | "sound"
    | "display"
    | "input"
    | "usb"
    | "bluetooth"
    | "motherboard"
    | "firmware"
    | "other";

export interface DeviceCategoryGroup {
    id: DeviceCategoryId;
    prominence: "overview" | "secondary";
    devices: HardwareDevice[];
}

export interface CpuSummary {
    model: string;
    vendor?: string | undefined;
    physicalCoreCount?: number | undefined;
    logicalEntryCount: number;
}

export interface MemorySummary {
    totalLabel?: string | undefined;
    moduleCount: number;
    modules: HardwareDevice[];
}

export interface HardwareSummary {
    host: HostSummary;
    cpu: CpuSummary | null;
    memory: MemorySummary;
    graphics: HardwareDevice[];
    disks: HardwareDevice[];
    network: HardwareDevice[];
    categories: DeviceCategoryGroup[];
    deviceCount: number;
}

export type InventoryState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "empty" }
    | { status: "ready"; summary: HardwareSummary }
    | { status: "failed"; error: InventoryError };
