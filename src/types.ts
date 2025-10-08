import { z } from 'zod';

const PackageJsonSchema = z.object({
  name: z.string().min(1, 'Package name is required'),
  version: z.string().regex(
    /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9-]+))?(?:\+([a-zA-Z0-9-]+))?$/,
    'Version must be in semantic versioning format (e.g., 1.2.3)'
  ),
  scripts: z.record(z.string(), z.string()).optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});

type PackageJson = z.infer<typeof PackageJsonSchema>;

type VersionType = 'patch' | 'minor' | 'major';

const NpmPlatformSchema = z.object({
  publish: z.boolean().default(true),
  registry: z.string().url().optional(),
  access: z.enum(['public', 'restricted']).default('public'),
  tag: z.string().default('latest'),
  publishConfig: z.object({
    access: z.enum(['public', 'restricted']).optional(),
    registry: z.string().url().optional(),
  }).optional(),
}).strict();

const GithubPlatformSchema = z.object({
  publish: z.boolean().default(true),
  repository: z.string().min(1, 'Repository is required (format: owner/repo)'),
  branch: z.string().default('main'),
  createRelease: z.boolean().default(true),
  releaseName: z.string().default(`Release \${version}`),
  generateNotes: z.boolean().default(true),
  assets: z.array(z.string()).default(['dist/**', 'package.json', 'README.md']),
  draft: z.boolean().default(false),
  prerelease: z.boolean().default(false),
}).strict();

const GitConfigSchema = z.object({
  commitMessage: z.string().default(`chore: release \${version}`),
  tagPrefix: z.string().default('v'),
  requireCleanWorkingDirectory: z.boolean().default(true),
  requireUpToDate: z.boolean().default(true),
  push: z.boolean().default(true),
  pushTags: z.boolean().default(true),
}).strict();

const ReleasePackageSchema = z.object({
  $schema: z.string().optional(),
  name: z.string().min(1, 'Package name is required'),
  version: z.string().regex(
    /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9-]+))?(?:\+([a-zA-Z0-9-]+))?$/,
    'Version must be in semantic versioning format (e.g., 1.2.3)'
  ).optional(),
  platforms: z.object({
    npm: NpmPlatformSchema.optional(),
    github: GithubPlatformSchema.optional(),
  }).optional(),
  git: GitConfigSchema.optional(),
  hooks: z.object({
    beforeRelease: z.string().optional(),
    afterRelease: z.string().optional(),
    beforePublish: z.string().optional(),
    afterPublish: z.string().optional(),
  }).optional(),
});

function createPlatformSchema<T extends z.ZodRawShape>(
  _platformName: string,
  baseSchema: T
): z.ZodObject<T> {
  return z.object(baseSchema);
}

function toJSONSchema(schemaName?: string) {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      $schema: { type: 'string' },
      name: { type: 'string', minLength: 1 },
      version: {
        type: 'string',
        pattern: '^(\\d+)\\.(\\d+)\\.(\\d+)(?:-([a-zA-Z0-9-]+))?(?:\\+([a-zA-Z0-9-]+))?$'
      },
      platforms: {
        type: 'object',
        properties: {
          npm: {
            type: 'object',
            properties: {
              publish: { type: 'boolean', default: true },
              registry: { type: 'string', format: 'uri' },
              access: { type: 'string', enum: ['public', 'restricted'], default: 'public' },
              tag: { type: 'string', default: 'latest' },
              publishConfig: {
                type: 'object',
                properties: {
                  access: { type: 'string', enum: ['public', 'restricted'] },
                  registry: { type: 'string', format: 'uri' }
                }
              }
            },
            additionalProperties: false
          },
          github: {
            type: 'object',
            properties: {
              publish: { type: 'boolean', default: true },
              repository: { type: 'string', minLength: 1 },
              branch: { type: 'string', default: 'main' },
              createRelease: { type: 'boolean', default: true },
              releaseName: { type: 'string', default: 'Release ${version}' },
              generateNotes: { type: 'boolean', default: true },
              assets: {
                type: 'array',
                items: { type: 'string' },
                default: ['dist/**', 'package.json', 'README.md']
              },
              draft: { type: 'boolean', default: false },
              prerelease: { type: 'boolean', default: false }
            },
            additionalProperties: false
          }
        }
      },
      git: {
        type: 'object',
        properties: {
          commitMessage: { type: 'string', default: 'chore: release ${version}' },
          tagPrefix: { type: 'string', default: 'v' },
          requireCleanWorkingDirectory: { type: 'boolean', default: true },
          requireUpToDate: { type: 'boolean', default: true },
          push: { type: 'boolean', default: true },
          pushTags: { type: 'boolean', default: true }
        },
        additionalProperties: false
      },
      hooks: {
        type: 'object',
        properties: {
          beforeRelease: { type: 'string' },
          afterRelease: { type: 'string' },
          beforePublish: { type: 'string' },
          afterPublish: { type: 'string' }
        }
      }
    },
    required: ['name'],
    title: schemaName || 'ReleasePackage'
  };
}

function validateReleasePackageConfig(config: unknown): ReleasePackage {
  const result = ReleasePackageSchema.safeParse(config);

  if (!result.success) {
    const errorMessages = result.error.issues
      .map(issue => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${errorMessages}`);
  }

  return result.data;
}

function createDefaultReleasePackageConfig(name: string): ReleasePackage {
  return {
    name,
    platforms: {
      npm: {
        publish: true,
        registry: "https://registry.npmjs.org/",
        access: "public",
        tag: "latest",
        publishConfig: {
          access: "public",
        },
      },
      github: {
        publish: true,
        repository: "owner/repo",
        branch: "main",
        createRelease: true,
        releaseName: 'Release ${version}',
        generateNotes: true,
        assets: ["dist/**", "package.json", "README.md"],
        draft: false,
        prerelease: false,
      },
    },
    git: {
      commitMessage: 'chore: release ${version}',
      tagPrefix: "v",
      requireCleanWorkingDirectory: true,
      requireUpToDate: true,
      push: true,
      pushTags: true,
    },
  };
}

type ReleasePackage = z.infer<typeof ReleasePackageSchema>;

export {
  PackageJsonSchema,
  type PackageJson,
  type VersionType,
  ReleasePackageSchema,
  createPlatformSchema,
  toJSONSchema,
  validateReleasePackageConfig,
  createDefaultReleasePackageConfig,
  type ReleasePackage,
};
