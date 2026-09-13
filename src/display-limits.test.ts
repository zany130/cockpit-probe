import { describe, expect, it } from 'vitest';

import { MAX_RENDERED_DEVICES_PER_CATEGORY, takeVisibleItems } from './display-limits';

describe('takeVisibleItems', () => {
    it('keeps short lists intact', () => {
        expect(takeVisibleItems(['a', 'b'])).toEqual({ visible: ['a', 'b'], hiddenCount: 0 });
    });

    it('caps long lists at the display limit', () => {
        const items = Array.from({ length: MAX_RENDERED_DEVICES_PER_CATEGORY + 5 }, (_, index) => index);
        const taken = takeVisibleItems(items);
        expect(taken.visible).toHaveLength(MAX_RENDERED_DEVICES_PER_CATEGORY);
        expect(taken.hiddenCount).toBe(5);
        expect(taken.visible[0]).toBe(0);
        expect(taken.visible[taken.visible.length - 1]).toBe(MAX_RENDERED_DEVICES_PER_CATEGORY - 1);
    });
});
