#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const VERSION_BUMPS = new Set(['patch', 'minor', 'major']);

export class VersionError extends Error {}

export function parseVersion(version) {
  if (typeof version !== 'string') {
    throw new VersionError('package.json must contain a semantic version string');
  }

  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
      version,
    );
  if (!match) {
    throw new VersionError(`Invalid semantic version: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function bumpVersion(version, release = 'patch') {
  if (!VERSION_BUMPS.has(release)) {
    throw new VersionError(`Unknown version bump "${release}". Use patch, minor, or major.`);
  }

  const current = parseVersion(version);
  if (release === 'major') {
    return `${current.major + 1}.0.0`;
  }
  if (release === 'minor') {
    return `${current.major}.${current.minor + 1}.0`;
  }
  return `${current.major}.${current.minor}.${current.patch + 1}`;
}

export function updatePackageLock(lock, version) {
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) {
    throw new VersionError('package-lock.json must contain a JSON object');
  }

  const next = structuredClone(lock);
  next.version = version;
  if (next.packages?.[''] && typeof next.packages[''] === 'object') {
    next.packages[''].version = version;
  }
  return next;
}

function parseJson(source, file) {
  try {
    return JSON.parse(source.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new VersionError(`Invalid ${file}: ${error.message}`);
  }
}

export function formatJsonLike(source, value) {
  const indent = /^[ \t]+(?=")/m.exec(source)?.[0] ?? '  ';
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const trailingNewline = /\r?\n$/.test(source) ? newline : '';
  return `${JSON.stringify(value, null, indent).replace(/\n/g, newline)}${trailingNewline}`;
}

async function readJsonFile(file) {
  let source;
  try {
    source = await readFile(file, 'utf8');
  } catch {
    throw new VersionError(`${file} not found`);
  }
  return { source, value: parseJson(source, file) };
}

export async function bumpProjectVersion(cwd, release = 'patch', options = {}) {
  const packageFile = join(cwd, 'package.json');
  const packageDocument = await readJsonFile(packageFile);
  const currentVersion = packageDocument.value.version;
  const nextVersion = bumpVersion(currentVersion, release);
  const updates = [];

  updates.push({
    file: packageFile,
    content: formatJsonLike(packageDocument.source, {
      ...packageDocument.value,
      version: nextVersion,
    }),
  });

  const packageLockFile = join(cwd, 'package-lock.json');
  if (existsSync(packageLockFile)) {
    const lockDocument = await readJsonFile(packageLockFile);
    updates.push({
      file: packageLockFile,
      content: formatJsonLike(
        lockDocument.source,
        updatePackageLock(lockDocument.value, nextVersion),
      ),
    });
  }

  if (!options.dryRun) {
    for (const update of updates) {
      await writeFile(update.file, update.content, 'utf8');
    }
  }

  return {
    currentVersion,
    nextVersion,
    dryRun: Boolean(options.dryRun),
    files: updates.map((update) => update.file),
  };
}

export function parseArgs(argv) {
  const options = {
    cwd: process.cwd(),
    release: 'patch',
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument === '--dry-run') {
      options.dryRun = true;
    } else if (argument === '--cwd') {
      const value = argv[index + 1];
      if (!value) throw new VersionError('--cwd requires a directory');
      options.cwd = isAbsolute(value) ? value : resolve(process.cwd(), value);
      index += 1;
    } else if (argument === '--release' || argument === '--bump') {
      const value = argv[index + 1];
      if (!value) throw new VersionError(`${argument} requires a value`);
      options.release = value.toLowerCase();
      index += 1;
    } else if (argument.startsWith('--release=')) {
      options.release = argument.slice(argument.indexOf('=') + 1).toLowerCase();
    } else if (argument.startsWith('--bump=')) {
      options.release = argument.slice(argument.indexOf('=') + 1).toLowerCase();
    } else {
      throw new VersionError(`Unknown option: ${argument}`);
    }
  }

  if (!VERSION_BUMPS.has(options.release)) {
    throw new VersionError(
      `Unknown version bump "${options.release}". Use patch, minor, or major.`,
    );
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node bump-version.mjs [options]

Options:
  --cwd <dir>                         Target package directory (default: current directory)
  --release <patch|minor|major>       Version bump type (default: patch)
  --dry-run                           Print the version change without writing files
  -h, --help                          Show this help`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }

  const result = await bumpProjectVersion(options.cwd, options.release, {
    dryRun: options.dryRun,
  });
  const action = result.dryRun ? 'Would update' : 'Updated';
  console.log(
    `${action} version: ${result.currentVersion} -> ${result.nextVersion} (${options.release})`,
  );
  for (const file of result.files) {
    console.log(`${result.dryRun ? 'Would write' : 'Wrote'} ${file}`);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    await main();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}
