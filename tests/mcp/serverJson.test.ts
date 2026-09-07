import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

interface McpServerJson {
  name: string;
  description: string;
  version: string;
  packages: Array<{ identifier: string; version: string }>;
}

/**
 * server.json is hand-maintained and this repo has no version-bump script,
 * so nothing else keeps it in sync with package.json. This test is the
 * tripwire: it fails the moment a release bumps the version in one place
 * and not the other.
 */
describe('server.json', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    name: string;
    version: string;
    mcpName: string;
  };
  const serverJson = JSON.parse(readFileSync(`${repoRoot}server.json`, 'utf8')) as McpServerJson;

  it('parses as valid JSON', () => {
    expect(serverJson).toBeTypeOf('object');
  });

  it('names the server with the reverse-DNS mcpName from package.json', () => {
    expect(serverJson.name).toBe(packageJson.mcpName);
  });

  it('keeps the top-level version and the package version in sync with package.json', () => {
    expect(serverJson.version).toBe(packageJson.version);
    expect(serverJson.packages[0]?.version).toBe(packageJson.version);
  });

  it('identifies the npm package by the package.json name', () => {
    expect(serverJson.packages[0]?.identifier).toBe(packageJson.name);
  });

  it('keeps the description within the registry limit', () => {
    expect(serverJson.description.length).toBeLessThanOrEqual(100);
  });
});
