#!/usr/bin/env bun

import { intro, outro, select, confirm, text, spinner, isCancel } from '@clack/prompts';
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

interface PackageJson {
  name: string;
  version: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

async function main() {
  // แสดง intro
  intro('🚀 Release Packages');

  try {
    // อ่าน package.json
    const packageJson: PackageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
    const currentVersion = packageJson.version;
    console.log(`📦 Current version: ${currentVersion}`);

    // เลือก version type
    const versionType = await select({
      message: 'Select version type:',
      options: [
        { value: 'patch', label: '🩹 Patch', hint: 'Bug fixes' },
        { value: 'minor', label: '✨ Minor', hint: 'New features' },
        { value: 'major', label: '💥 Major', hint: 'Breaking changes' },
      ],
    });

    if (isCancel(versionType)) {
      outro('❌ Release cancelled');
      return;
    }

    // คำนวณ version ใหม่
    const newVersion = bumpVersion(currentVersion, versionType);
    console.log(`📈 New version: ${currentVersion} → ${newVersion}`);

    // ยืนยันการ release
    const shouldRelease = await confirm({
      message: `Release version ${newVersion}?`,
    });

    if (isCancel(shouldRelease) || !shouldRelease) {
      outro('❌ Release cancelled');
      return;
    }

    // ใส่ release notes
    const releaseNotes = await text({
      message: 'Release notes (optional):',
      placeholder: 'Enter release notes...',
      validate: (value) => {
        if (value.length > 500) {
          return 'Release notes must be less than 500 characters';
        }
      },
    });

    if (isCancel(releaseNotes)) {
      outro('❌ Release cancelled');
      return;
    }

    // อัพเดท package.json
    const s = spinner();
    s.start('Updating package.json...');

    packageJson.version = newVersion;
    writeFileSync('package.json', JSON.stringify(packageJson, null, 2) + '\n');

    s.stop('✅ Updated package.json');

    // Commit และ tag
    s.start('Committing changes...');

    execSync(`git add package.json`, { stdio: 'inherit' });
    execSync(`git commit -m "chore: release ${newVersion}"`, { stdio: 'inherit' });
    execSync(`git tag v${newVersion}`, { stdio: 'inherit' });

    s.stop('✅ Committed changes');

    // แสดงผลลัพธ์
    outro(`🎉 Successfully released ${newVersion}!`);

    if (releaseNotes) {
      console.log(`📝 Release notes: ${releaseNotes}`);
    }

    console.log(`🔖 Tag: v${newVersion}`);
    console.log('🚀 Ready to push to remote repository');

  } catch (error) {
    outro(`❌ Error: ${error}`);
    process.exit(1);
  }
}

function bumpVersion(currentVersion: string, type: string): string {
  const [major, minor, patch] = currentVersion.split('.').map(Number);

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      return currentVersion;
  }
}

main();