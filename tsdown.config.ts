import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  clean: true,

  hooks(hooks) {
    hooks.hook('build:prepare', () => {
      console.log('🔧 Preparing build and generating schema.json...');
    });

    hooks.hook('build:done', async () => {
      // Run the generate-schema script after building
      const { execSync } = await import('child_process');
      try {
        console.log('🔧 Generating schema.json in dist/ directory...');
        execSync('bun run src/generate-schema.ts', {
          stdio: 'inherit',
          cwd: process.cwd()
        });
        console.log('✅ Schema generated successfully in dist/schema.json');
      } catch (error) {
        console.error('❌ Failed to generate schema:', error);
        throw error;
      }
    });
  },
});