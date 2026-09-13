/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Native inventory uses cockpit.file with superuser: "require" on two
 * trusted paths. That is Cockpit's documented privileged file API.
 */

import cockpit from 'cockpit';

import type { HwProbeInvocation } from './executable';
import { cockpitUserHome, normalizeAuthenticatedHome } from './executable';
import {
    flatpakDevicesPath,
    flatpakHostPath,
    NATIVE_DEVICES_PATH,
    NATIVE_HOST_PATH,
} from './inventory-paths';
import { normalizeInventory } from './inventory-normalizer';
import type { InventoryError, InventoryState, ProbeExecutionState } from './model';
import { NATIVE_PROBE_SUPERUSER } from './spawn';

export const INVENTORY_MAX_READ_SIZE = 1024 * 1024;

export interface InventoryFileReadError {
    problem?: string | null | undefined;
    message?: string | undefined;
}

export type InventoryFileReader = (
    path: string,
    options?: { superuser?: "require" }
) => Promise<string | null>;

type PathPair = { host: string; devices: string; privileged: boolean };

function isReadError(error: unknown): error is InventoryFileReadError {
    return typeof error === "object" && error !== null && "problem" in error;
}

function inventoryError(kind: InventoryError["kind"], message: string): InventoryError {
    return { kind, message };
}

function classifyReadError(error: unknown): InventoryError {
    if (isReadError(error) && error.problem === "access-denied") {
        return inventoryError(
            "administrative-access-required",
            "Administrative access is required to read the local hardware inventory"
        );
    }
    if (isReadError(error) && error.problem === "not-found")
        return inventoryError("missing", "No local hardware probe is available yet");
    if (isReadError(error) && error.problem === "too-large") {
        return inventoryError(
            "read-failed",
            "The hardware inventory is larger than this page will read"
        );
    }
    return inventoryError("read-failed", "The local hardware inventory could not be read");
}

async function readOne(
    readFile: InventoryFileReader,
    path: string,
    privileged: boolean
): Promise<{ content: string | null } | { error: InventoryError }> {
    try {
        const options = privileged ? { superuser: NATIVE_PROBE_SUPERUSER } : undefined;
        const content = await readFile(path, options);
        return { content };
    } catch (error) {
        if (isReadError(error) && error.problem === "not-found")
            return { content: null };
        return { error: classifyReadError(error) };
    }
}

export function nativeInventoryPaths(): PathPair {
    return {
        host: NATIVE_HOST_PATH,
        devices: NATIVE_DEVICES_PATH,
        privileged: true,
    };
}

export function flatpakInventoryPaths(home: string): PathPair {
    return {
        host: flatpakHostPath(home),
        devices: flatpakDevicesPath(home),
        privileged: false,
    };
}

export async function loadHardwareInventory(
    invocation: HwProbeInvocation,
    options?: {
        readFile?: InventoryFileReader;
        getUserHome?: () => Promise<string>;
    }
): Promise<InventoryState> {
    const readFile = options?.readFile ?? cockpitInventoryFileReader();

    let paths: PathPair;
    if (invocation.kind === "flatpak") {
        try {
            const home = normalizeAuthenticatedHome(await (options?.getUserHome ?? cockpitUserHome)());
            if (home == null)
                throw new Error("authenticated user home directory is unavailable");
            paths = flatpakInventoryPaths(home);
        } catch {
            return {
                status: "failed",
                error: inventoryError(
                    "inventory-unavailable",
                    "The Flatpak hardware inventory location is not available"
                ),
            };
        }
    } else {
        paths = nativeInventoryPaths();
    }

    const hostResult = await readOne(readFile, paths.host, paths.privileged);
    if ("error" in hostResult)
        return { status: "failed", error: hostResult.error };

    const devicesResult = await readOne(readFile, paths.devices, paths.privileged);
    if ("error" in devicesResult)
        return { status: "failed", error: devicesResult.error };

    const hostMissing = hostResult.content == null || hostResult.content === "";
    const devicesMissing = devicesResult.content == null || devicesResult.content === "";

    if (hostMissing && devicesMissing)
        return { status: "empty" };

    if (hostMissing) {
        return {
            status: "failed",
            error: inventoryError("host-missing", "The local host inventory file is missing"),
        };
    }

    if (devicesMissing) {
        return {
            status: "failed",
            error: inventoryError("devices-missing", "The local devices inventory file is missing"),
        };
    }

    const normalized = normalizeInventory(hostResult.content as string, devicesResult.content as string);
    if (!normalized.ok) {
        return {
            status: "failed",
            error: inventoryError(
                normalized.error,
                normalized.error === "malformed-host"
                    ? "The local host inventory could not be parsed"
                    : "The local devices inventory could not be parsed"
            ),
        };
    }

    return { status: "ready", summary: normalized.summary };
}

export function reconcileInventoryWithProbe(
    inventory: InventoryState,
    execution: ProbeExecutionState,
    options?: { localCopyConsumed?: boolean }
): InventoryState {
    if (inventory.status === "empty" && execution.status === "succeeded") {
        if (options?.localCopyConsumed) {
            // hw-probe -upload deletes LATEST after success. That is not a read failure.
            return { status: "empty" };
        }
        return {
            status: "failed",
            error: inventoryError(
                "missing",
                "The hardware probe completed, but its inventory could not be read"
            ),
        };
    }
    return inventory;
}

export type InventorySetter = (state: InventoryState) => void;

export type InventoryLoadFn = (
    invocation: HwProbeInvocation,
    options?: {
        readFile?: InventoryFileReader;
        getUserHome?: () => Promise<string>;
    }
) => Promise<InventoryState>;

export function createInventoryLoadSession(options?: {
    load?: InventoryLoadFn;
    readFile?: InventoryFileReader;
    getUserHome?: () => Promise<string>;
}) {
    let generation = 0;
    let last: InventoryState = { status: "idle" };
    const load = options?.load ?? loadHardwareInventory;

    const publish = (state: InventoryState, setInventory: InventorySetter) => {
        last = state;
        setInventory(state);
    };

    return {
        request(
            invocation: HwProbeInvocation,
            execution: ProbeExecutionState,
            setInventory: InventorySetter,
            requestOptions?: { keepPrevious?: boolean; localCopyConsumed?: boolean }
        ) {
            const token = ++generation;
            const keepPrevious = requestOptions?.keepPrevious === true;
            const localCopyConsumed = requestOptions?.localCopyConsumed === true;
            if (!(keepPrevious && last.status !== "idle" && last.status !== "loading"))
                publish({ status: "loading" }, setInventory);
            const loadOptions: {
                readFile?: InventoryFileReader;
                getUserHome?: () => Promise<string>;
            } = {};
            if (options?.readFile !== undefined)
                loadOptions.readFile = options.readFile;
            if (options?.getUserHome !== undefined)
                loadOptions.getUserHome = options.getUserHome;
            load(invocation, loadOptions).then(result => {
                if (token !== generation)
                    return;
                publish(
                    reconcileInventoryWithProbe(result, execution, { localCopyConsumed }),
                    setInventory
                );
            }, () => {
                if (token !== generation)
                    return;
                publish({
                    status: "failed",
                    error: inventoryError(
                        "unknown",
                        "The local hardware inventory could not be read"
                    ),
                }, setInventory);
            });
        },
        invalidate() {
            generation += 1;
        },
        replace(state: InventoryState, setInventory: InventorySetter) {
            generation += 1;
            publish(state, setInventory);
        },
    };
}

export function cockpitInventoryFileReader(): InventoryFileReader {
    return async (path, options) => {
        const fileOptions: { superuser?: "require"; max_read_size: number } = {
            max_read_size: INVENTORY_MAX_READ_SIZE,
        };
        if (options?.superuser === NATIVE_PROBE_SUPERUSER)
            fileOptions.superuser = NATIVE_PROBE_SUPERUSER;
        const handle = cockpit.file(path, fileOptions);
        try {
            const content = await handle.read();
            if (content == null)
                return null;
            if (typeof content !== "string")
                return String(content);
            return content;
        } finally {
            handle.close();
        }
    };
}
