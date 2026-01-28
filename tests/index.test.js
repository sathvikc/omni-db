/**
 * Placeholder test file
 */

import { describe, it, expect } from 'vitest';

describe('omni-db', () => {
    it('should be importable', async () => {
        const module = await import('../src/index.js');
        expect(module).toBeDefined();
    });
});
