/*
 * SPDX-License-Identifier: LGPL-2.1-or-later
 *
 * Render caps for large inventories. Parsing still keeps the full
 * typed model for counts and findings; the UI only lists this many
 * rows in each device or finding group.
 */

export const MAX_RENDERED_DEVICES_PER_CATEGORY = 80;

export function takeVisibleItems<T>(items: T[]): { visible: T[]; hiddenCount: number } {
    if (items.length <= MAX_RENDERED_DEVICES_PER_CATEGORY)
        return { visible: items, hiddenCount: 0 };
    return {
        visible: items.slice(0, MAX_RENDERED_DEVICES_PER_CATEGORY),
        hiddenCount: items.length - MAX_RENDERED_DEVICES_PER_CATEGORY,
    };
}
