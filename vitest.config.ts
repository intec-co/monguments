import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['test/**/*.test.ts'],
		testTimeout: 30000,
		hookTimeout: 30000,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['lib/**/*.ts'],
			exclude: ['lib/interfaces.ts', 'lib/tools.ts', 'lib/index.ts']
		}
	}
});
