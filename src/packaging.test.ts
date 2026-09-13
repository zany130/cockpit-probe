import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const spec = readFileSync('packaging/cockpit-hardware-probe.spec.in', 'utf8');
const debBinary = readFileSync('packaging/debian/control.in', 'utf8');
const debSource = readFileSync('packaging/debian/control', 'utf8');

describe('package metadata', () => {
    it('recommends hw-probe instead of requiring it', () => {
        for (const text of [spec, debBinary, debSource]) {
            expect(text).toMatch(/Recommends:\s+hw-probe/);
            expect(text).not.toMatch(/Requires:\s+hw-probe/);
            expect(text).not.toMatch(/Depends:.*hw-probe/);
        }
    });

    it('depends on cockpit-bridge', () => {
        expect(spec).toMatch(/Requires:\s+cockpit-bridge/);
        expect(debBinary).toMatch(/Depends:\s+cockpit-bridge/);
        expect(debSource).toMatch(/cockpit-bridge/);
    });

    it('says a local probe does not upload', () => {
        for (const text of [spec, debBinary, debSource]) {
            expect(text).toMatch(/does not upload data/);
        }
    });
});
