/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 */

import type {
    CpuSummary,
    DeviceCategoryGroup,
    DeviceCategoryId,
    HardwareDevice,
    HardwareSummary,
    HostSummary,
} from './model';
import { parseDevicesFile } from './device-parser';
import { parseHostFile, parseOptionalInt } from './host-parser';
import { formatRamFromKiB, parseRamTotalKiB } from './ram';

const OVERVIEW_TYPES: Record<string, DeviceCategoryId> = {
    cpu: "cpu",
    memory: "memory",
    "graphics card": "graphics",
    disk: "storage",
    network: "network",
};

const SECONDARY_TYPES: Record<string, DeviceCategoryId> = {
    storage: "storage-controller",
    sound: "sound",
    monitor: "display",
    "human interface": "input",
    keyboard: "input",
    mouse: "input",
    "usb controller": "usb",
    hub: "usb",
    bluetooth: "bluetooth",
    motherboard: "motherboard",
    bios: "firmware",
};

const CATEGORY_ORDER: DeviceCategoryId[] = [
    "cpu",
    "memory",
    "graphics",
    "storage",
    "network",
    "sound",
    "display",
    "storage-controller",
    "motherboard",
    "firmware",
    "input",
    "usb",
    "bluetooth",
    "other",
];

export type InventoryNormalizeResult =
    | { ok: true; summary: HardwareSummary }
    | { ok: false; error: "malformed-host" | "malformed-devices" };

function categoryFor(type: string): DeviceCategoryId {
    return OVERVIEW_TYPES[type] ?? SECONDARY_TYPES[type] ?? "other";
}

function prominenceFor(id: DeviceCategoryId): "overview" | "secondary" {
    if (id === "cpu" || id === "memory" || id === "graphics" || id === "storage" || id === "network")
        return "overview";
    return "secondary";
}

function groupCpuDevices(devices: HardwareDevice[]): CpuSummary | null {
    const cpus = devices.filter(device => device.type === "cpu");
    if (cpus.length === 0)
        return null;

    const first = cpus[0];
    const sameModel = cpus.filter(cpu => cpu.vendor === first.vendor && cpu.device === first.device);
    const summary: CpuSummary = {
        model: first.device || first.vendor || "CPU",
        logicalEntryCount: sameModel.length,
    };
    if (first.vendor)
        summary.vendor = first.vendor;
    return summary;
}

function hostFromFields(fields: Record<string, string>, devices: HardwareDevice[]): HostSummary {
    const host: HostSummary = {};
    if (fields.arch)
        host.architecture = fields.arch;
    if (fields.boot_mode)
        host.bootMode = fields.boot_mode;
    const cores = parseOptionalInt(fields.cores);
    if (cores !== undefined)
        host.physicalCoreCount = cores;
    if (fields.kernel)
        host.kernel = fields.kernel;
    if (fields.model)
        host.model = fields.model;
    if (fields.type)
        host.systemType = fields.type;
    if (fields.vendor)
        host.vendor = fields.vendor;
    const ram = parseRamTotalKiB(fields.ram_total);
    if (ram !== undefined) {
        host.ramTotalKiB = ram;
        host.ramTotalLabel = formatRamFromKiB(ram);
    }
    const monitors = parseOptionalInt(fields.monitors);
    if (monitors !== undefined)
        host.monitorCount = monitors;
    const nics = parseOptionalInt(fields.nics);
    if (nics !== undefined)
        host.nicCount = nics;
    if (fields.probe_ver)
        host.probeVersion = fields.probe_ver;

    if (host.vendor == null) {
        const board = devices.find(device => device.type === "motherboard" && device.vendor);
        if (board?.vendor)
            host.vendor = board.vendor;
    }

    return host;
}

export function buildSystemTitle(host: HostSummary): string | undefined {
    if (host.vendor && host.model) {
        if (host.model.toLowerCase().includes(host.vendor.toLowerCase()))
            return host.model;
        return host.vendor + " " + host.model;
    }
    return host.model ?? host.vendor;
}

function collectCategories(devices: HardwareDevice[]): DeviceCategoryGroup[] {
    const buckets = new Map<DeviceCategoryId, HardwareDevice[]>();
    for (const device of devices) {
        const id = categoryFor(device.type);
        const list = buckets.get(id) ?? [];
        list.push(device);
        buckets.set(id, list);
    }

    const groups: DeviceCategoryGroup[] = [];
    for (const id of CATEGORY_ORDER) {
        const list = buckets.get(id);
        if (!list || list.length === 0)
            continue;
        groups.push({
            id,
            prominence: prominenceFor(id),
            devices: list,
        });
    }
    return groups;
}

export function normalizeInventory(hostText: string, devicesText: string): InventoryNormalizeResult {
    const hostParsed = parseHostFile(hostText);
    if (!hostParsed.ok)
        return { ok: false, error: "malformed-host" };

    const devicesParsed = parseDevicesFile(devicesText);
    if (!devicesParsed.ok)
        return { ok: false, error: "malformed-devices" };

    const devices = devicesParsed.devices;
    const host = hostFromFields(hostParsed.fields, devices);
    const cpu = groupCpuDevices(devices);
    if (cpu && host.physicalCoreCount !== undefined)
        cpu.physicalCoreCount = host.physicalCoreCount;

    const memoryModules = devices.filter(device => device.type === "memory");
    const graphics = devices.filter(device => device.type === "graphics card");
    const disks = devices.filter(device => device.type === "disk");
    const network = devices.filter(device => device.type === "network");

    const memory: HardwareSummary["memory"] = {
        moduleCount: memoryModules.length,
        modules: memoryModules,
    };
    if (host.ramTotalLabel)
        memory.totalLabel = host.ramTotalLabel;

    return {
        ok: true,
        summary: {
            host,
            cpu,
            memory,
            graphics,
            disks,
            network,
            categories: collectCategories(devices),
            deviceCount: devices.length,
        },
    };
}
