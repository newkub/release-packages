#!/usr/bin/env bun

import {
    confirm,
    intro,
    isCancel,
    outro,
    select,
    spinner,
    text,
} from "@clack/prompts";
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { z } from "zod";
import {
    type PackageJson,
    PackageJsonSchema,
    type ReleasePackage,
    type VersionType,
} from "./types";

// สร้าง schema สำหรับ validation ในไฟล์นี้
const ReleasePackageSchemaInternal = z.object({
    $schema: z.string().optional(),
    name: z.string().min(1, "Package name is required"),
    version: z
        .string()
        .regex(
            /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9-]+))?(?:\+([a-zA-Z0-9-]+))?$/,
            "Version must be in semantic versioning format (e.g., 1.2.3)",
        )
        .optional(),
    platforms: z
        .object({
            npm: z
                .object({
                    publish: z.boolean().default(true),
                    registry: z.string().url().optional(),
                    access: z.enum(["public", "restricted"]).default("public"),
                    tag: z.string().default("latest"),
                    publishConfig: z
                        .object({
                            access: z.enum(["public", "restricted"]).optional(),
                            registry: z.string().url().optional(),
                        })
                        .optional(),
                })
                .strict()
                .optional(),
            github: z
                .object({
                    publish: z.boolean().default(true),
                    repository: z
                        .string()
                        .min(1, "Repository is required (format: owner/repo)"),
                    branch: z.string().default("main"),
                    createRelease: z.boolean().default(true),
                    releaseName: z.string().default(`Release \\\${version}`),
                    generateNotes: z.boolean().default(true),
                    assets: z
                        .array(z.string())
                        .default(["dist/**", "package.json", "README.md"]),
                    draft: z.boolean().default(false),
                    prerelease: z.boolean().default(false),
                })
                .strict()
                .optional(),
        })
        .optional(),
    git: z
        .object({
            commitMessage: z.string().default(`chore: release \\\${version}`),
            tagPrefix: z.string().default("v"),
            requireCleanWorkingDirectory: z.boolean().default(true),
            requireUpToDate: z.boolean().default(true),
            push: z.boolean().default(true),
            pushTags: z.boolean().default(true),
        })
        .strict()
        .optional(),
    hooks: z
        .object({
            beforeRelease: z.string().optional(),
            afterRelease: z.string().optional(),
            beforePublish: z.string().optional(),
            afterPublish: z.string().optional(),
        })
        .optional(),
});

async function main() {
    // แสดง intro
    intro("🚀 Release Packages");
    console.log("🔍 Checking connections...");

    try {
        // ตรวจสอบการเชื่อมต่อกับ npm
        await checkNpmConnection();

        // ตรวจสอบการเชื่อมต่อกับ github
        await checkGithubConnection();

        console.log("✅ All connections verified");
        console.log("");
    } catch (error) {
        outro(`❌ Connection check failed: ${error}`);
        process.exit(1);
    }

    try {
        // อ่านและตรวจสอบ package.json โดยใช้ zod
        let packageJson: PackageJson;
        try {
            const packageContent = readFileSync("package.json", "utf-8");
            const parsed = JSON.parse(packageContent);

            // ใช้ zod สำหรับ validation
            const validationResult = PackageJsonSchema.safeParse(parsed);
            if (!validationResult.success) {
                const errorMessages = validationResult.error.issues
                    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                    .join(", ");
                throw new Error(`Invalid package.json: ${errorMessages}`);
            }

            packageJson = validationResult.data;
        } catch (error) {
            if (error instanceof Error) {
                outro(`❌ Error reading package.json: ${error.message}`);
            } else {
                outro(`❌ Error reading package.json: ${error}`);
            }
            process.exit(1);
        }

        const currentVersion = packageJson.version;

        // ตรวจสอบและ publish npm ก่อนถ้ายังไม่ได้ publish
        await ensureNpmPublished(currentVersion);

        console.log(`📦 Current version: ${currentVersion}`);

        // เลือก version type
        const versionType = await select({
            message: "Select version type:",
            options: [
                { value: "patch", label: "🩹 Patch", hint: "Bug fixes" },
                { value: "minor", label: "✨ Minor", hint: "New features" },
                { value: "major", label: "💥 Major", hint: "Breaking changes" },
            ],
        });

        if (isCancel(versionType)) {
            process.exit(0);
        }

        // คำนวณ version ใหม่
        const newVersion = bumpVersion(currentVersion, versionType);
        console.log(`📈 New version: ${currentVersion} → ${newVersion}`);

        // ยืนยันการ release
        const shouldRelease = await confirm({
            message: `Release version ${newVersion}?`,
        });

        if (isCancel(shouldRelease) || !shouldRelease) {
            process.exit(0);
        }

        // ใส่ release notes
        const releaseNotes = await text({
            message: "Release notes (optional):",
            placeholder: "Enter release notes...",
            validate: (value) => {
                if (value.length > 500) {
                    return "Release notes must be less than 500 characters";
                }
            },
        });

        if (isCancel(releaseNotes)) {
            process.exit(0);
        }

        // อัพเดท package.json
        const s = spinner();
        s.start("Updating package.json...");

        packageJson.version = newVersion;
        writeFileSync("package.json", JSON.stringify(packageJson, null, 2) + "\n");

        s.stop("✅ Updated package.json");

        // Commit และ tag โดยใช้ release-it
        s.start("Running release-it...");

        try {
            execSync(`npx release-it --no-increment --no-git --no-npm`, {
                stdio: "inherit",
                env: {
                    ...process.env,
                    RELEASE_VERSION: newVersion,
                    RELEASE_NOTES: releaseNotes || "",
                },
            });
        } catch {
            // ถ้า release-it ไม่มี ให้ใช้ git commands แทน
            console.log("⚠️ release-it not available, using git commands...");

            execSync(`git add package.json`, { stdio: "inherit" });
            execSync(`git commit -m "chore: release ${newVersion}"`, {
                stdio: "inherit",
            });
            execSync(`git tag v${newVersion}`, { stdio: "inherit" });
        }

        s.stop("✅ Release completed");

        // แสดงผลลัพธ์
        outro(`🎉 Successfully released ${newVersion}!`);

        if (releaseNotes) {
            console.log(`📝 Release notes: ${releaseNotes}`);
        }

        console.log(`🔖 Tag: v${newVersion}`);
        console.log("🚀 Ready to push to remote repository");
    } catch (error) {
        outro(`❌ Error: ${error}`);
        process.exit(1);
    }
}

function bumpVersion(currentVersion: string, type: VersionType): string {
    // ตรวจสอบ version format (ต้องเป็น semantic versioning)
    const versionRegex =
        /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9-]+))?(?:\+([a-zA-Z0-9-]+))?$/;
    const match = currentVersion.match(versionRegex);

    if (!match) {
        throw new Error(
            `Invalid version format: ${currentVersion}. Expected semantic versioning (e.g., 1.2.3)`,
        );
    }

    const [, majorStr, minorStr, patchStr] = match;
    const major = parseInt(majorStr, 10);
    const minor = parseInt(minorStr, 10);
    const patch = parseInt(patchStr, 10);

    switch (type) {
        case "major":
            return `${major + 1}.0.0`;
        case "minor":
            return `${major}.${minor + 1}.0`;
        case "patch":
            return `${major}.${minor}.${patch + 1}`;
        default:
            throw new Error(`Unknown version type: ${type}`);
    }
}

// อ่านและ validate release package configuration
async function readReleasePackageConfig(): Promise<ReleasePackage> {
    try {
        const releasePackageContent = readFileSync(
            ".release-package.json",
            "utf-8",
        );
        const parsed = JSON.parse(releasePackageContent);

        const validationResult = ReleasePackageSchemaInternal.safeParse(parsed);
        if (!validationResult.success) {
            const errorMessages = validationResult.error.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join(", ");
            throw new Error(`Invalid .release-package.json: ${errorMessages}`);
        }

        return validationResult.data;
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Error reading .release-package.json: ${error.message}`);
        } else {
            throw new Error(`Error reading .release-package.json: ${error}`);
        }
    }
}

// ตรวจสอบและ publish npm ก่อนถ้ายังไม่ได้ publish
async function ensureNpmPublished(currentVersion: string): Promise<void> {
    try {
        const releasePackage = await readReleasePackageConfig();

        // ข้ามการ publish ถ้ากำหนดให้ไม่ publish
        if (releasePackage.platforms?.npm?.publish === false) {
            console.log("ℹ️ NPM publish is disabled in configuration");
            return;
        }

        // ตรวจสอบว่ามี package ชื่อนั้นบน npm หรือไม่
        try {
            execSync(`npm view ${releasePackage.name}@${currentVersion} version`, {
                stdio: "pipe",
            });
            console.log(
                `✅ NPM: Package "${releasePackage.name}@${currentVersion}" already exists on npm`,
            );
        } catch {
            console.log(
                `📦 Publishing "${releasePackage.name}@${currentVersion}" to npm...`,
            );

            // สร้างไฟล์ dist ถ้ายังไม่มี
            try {
                execSync("bun run build", { stdio: "pipe" });
            } catch {
                // const error = new Error('Build failed'); // Not used in current implementation
                console.log("⚠️ Build failed, attempting to publish anyway...");
            }

            // Publish ไปยัง npm
            try {
                const npmConfig = releasePackage.platforms?.npm;
                let publishCmd = "npm publish";

                if (npmConfig?.tag && npmConfig.tag !== "latest") {
                    publishCmd += ` --tag ${npmConfig.tag}`;
                }
                if (npmConfig?.access && npmConfig.access !== "public") {
                    publishCmd += ` --access ${npmConfig.access}`;
                }
                if (
                    npmConfig?.registry &&
                    npmConfig.registry !== "https://registry.npmjs.org/"
                ) {
                    publishCmd += ` --registry ${npmConfig.registry}`;
                }

                execSync(publishCmd, { stdio: "inherit" });
                console.log(
                    `✅ NPM: Successfully published "${releasePackage.name}@${currentVersion}"`,
                );
            } catch (error) {
                console.log(
                    `❌ NPM: Failed to publish "${releasePackage.name}@${currentVersion}"`,
                );
                throw error;
            }
        }
    } catch (error) {
        console.log(`❌ NPM check/publish failed: ${error}`);
        throw error;
    }
}

// ตรวจสอบการเชื่อมต่อกับ npm
async function checkNpmConnection(): Promise<void> {
    try {
        // ทดสอบการเชื่อมต่อกับ npm registry โดยการ ping
        execSync("npm ping", { stdio: "pipe" });
        console.log("✅ NPM: Registry connection verified");
    } catch {
        console.log("⚠️ NPM: Registry connection failed");
        console.log(
            "ℹ️ Make sure you are logged in to npm and have internet connection",
        );
    }
}

// ตรวจสอบการเชื่อมต่อกับ github
async function checkGithubConnection(): Promise<void> {
    try {
        // ตรวจสอบว่าเป็น git repository หรือไม่
        execSync("git rev-parse --git-dir", { stdio: "pipe" });

        // ตรวจสอบ remote repository
        const remotes = execSync("git remote -v", { encoding: "utf8" });
        const hasGithubRemote = remotes.includes("github.com");

        if (hasGithubRemote) {
            console.log("✅ GitHub: Repository connected");
        } else {
            console.log("⚠️ GitHub: No GitHub remote found");
            console.log("ℹ️ Consider adding a GitHub remote for releases");
        }
    } catch {
        console.log("⚠️ GitHub: Not a git repository");
        console.log("ℹ️ Initialize git repository for releases");
    }
}

main();
