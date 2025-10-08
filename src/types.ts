import { z } from 'zod';

// PackageJson schema สำหรับ validation
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

// Type ที่ได้จาก schema
type PackageJson = z.infer<typeof PackageJsonSchema>;

// Version type สำหรับ bump operation
type VersionType = 'patch' | 'minor' | 'major';

// NPM platform configuration
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

// GitHub platform configuration
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

// Git configuration
const GitConfigSchema = z.object({
  commitMessage: z.string().default(`chore: release \${version}`),
  tagPrefix: z.string().default('v'),
  requireCleanWorkingDirectory: z.boolean().default(true),
  requireUpToDate: z.boolean().default(true),
  push: z.boolean().default(true),
  pushTags: z.boolean().default(true),
}).strict();

// ReleasePackage schema สำหรับการตั้งค่า release
const ReleasePackageSchema = z.object({
  $schema: z.string().optional(), // เพิ่ม $schema field สำหรับ JSON Schema reference
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
}); // ลบ .strict() เพื่อให้รองรับ $schema field

// Utility function สำหรับการสร้าง schema แบบ dynamic (ตัวอย่างการใช้งาน)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createPlatformSchema<T extends z.ZodRawShape>(
  _platformName: string,
  baseSchema: T
): z.ZodObject<T> {
  // สามารถนำไปใช้สร้าง schema สำหรับ platform ใหม่ได้
  // ตัวอย่าง: return z.object({ publish: z.boolean().default(true), ...baseSchema });
  return z.object(baseSchema);
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

// Utility function สำหรับการสร้าง default configuration
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
        releaseName: `Release \${version}`,
        generateNotes: true,
        assets: ["dist/**", "package.json", "README.md"],
        draft: false,
        prerelease: false,
      },
    },
    git: {
      commitMessage: `chore: release \${version}`,
      tagPrefix: "v",
      requireCleanWorkingDirectory: true,
      requireUpToDate: true,
      push: true,
      pushTags: true,
    },
  };
}

// Type ที่ได้จาก schema
type ReleasePackage = z.infer<typeof ReleasePackageSchema>;

// Exports - ทั้งหมดอยู่ด้านล่างนี้
export {
  PackageJsonSchema,
  type PackageJson,
  type VersionType,
  ReleasePackageSchema,
  createPlatformSchema,
  validateReleasePackageConfig,
  createDefaultReleasePackageConfig,
  type ReleasePackage,
};
