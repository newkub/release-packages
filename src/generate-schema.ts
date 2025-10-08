import { zodToJsonSchema } from 'zod-to-json-schema';
import { ReleasePackageSchema } from './types';
import { writeFileSync } from 'fs';
import { join } from 'path';

// Convert ReleasePackageSchema to JSON Schema
const jsonSchema = zodToJsonSchema(ReleasePackageSchema, {
  name: 'ReleasePackage',
  target: 'jsonSchema7',
});

// Ensure proper structure for the schema
const finalSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  ...jsonSchema,
  type: 'object',
  properties: (jsonSchema as any).properties || (jsonSchema as any).definitions?.ReleasePackage,
  definitions: (jsonSchema as any).definitions
};

// Write schema to dist/schema.json file
const schemaPath = join(process.cwd(), 'dist', 'schema.json');
writeFileSync(schemaPath, JSON.stringify(finalSchema, null, 2), 'utf-8');

console.log('✅ Successfully created schema.json at:', schemaPath);
console.log('Generated schema structure:', JSON.stringify(finalSchema, null, 2));
