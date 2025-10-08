import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toJSONSchema } from './types';

const jsonSchema = toJSONSchema('ReleasePackage');

// Extract properties and definitions from jsonSchema properly
const { $schema, properties, definitions, ...restSchema } = jsonSchema as {
  $schema?: string;
  properties?: Record<string, unknown>;
  definitions?: Record<string, unknown>;
  [key: string]: unknown;
};

const finalSchema = {
  $schema: $schema || 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: properties || {},
  definitions: definitions || {},
  ...restSchema,
};

// Write schema to dist/schema.json file
const schemaPath = join(process.cwd(), 'dist', 'schema.json');
writeFileSync(schemaPath, JSON.stringify(finalSchema, null, 2), 'utf-8');

console.log('✅ Successfully created schema.json at:', schemaPath);
console.log('Generated schema structure:', JSON.stringify(finalSchema, null, 2));
