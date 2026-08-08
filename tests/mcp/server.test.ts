import { InMemoryTransport } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { UNTRUSTED_BANNER } from '../../src/mcp/limits.js';
import { toolError, toolResult } from '../../src/mcp/result.js';
import { createServer } from '../../src/mcp/server.js';

interface ListedTool {
  name: string;
  description?: string;
  inputSchema: { properties?: Record<string, unknown> };
  annotations?: { readOnlyHint?: boolean; openWorldHint?: boolean };
}

/**
 * Drives a real `tools/list` over a linked transport pair. The tool list
 * is the one part of this server that sits in a host's context for an
 * entire session, so its size and shape are the contract worth guarding.
 */
async function listTools(): Promise<ListedTool[]> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverSide);

  const responses: Record<string, unknown>[] = [];
  clientSide.onmessage = (message) => responses.push(message as Record<string, unknown>);
  await clientSide.start();

  await clientSide.send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
  });
  await clientSide.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  await clientSide.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

  // The in-memory pair delivers on the microtask queue.
  await new Promise((resolve) => setTimeout(resolve, 50));
  await clientSide.close();

  const listed = responses.find((message) => message.id === 2) as { result?: { tools?: ListedTool[] } } | undefined;
  return listed?.result?.tools ?? [];
}

describe('tool surface', () => {
  it('exposes exactly the read / search / render loop', async () => {
    const tools = await listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(['read_pdf', 'render_pdf', 'search_pdf']);
  });

  it('keeps the always-resident schema under 6 KB', async () => {
    const bytes = Buffer.byteLength(JSON.stringify(await listTools()), 'utf8');
    expect(bytes).toBeLessThan(6 * 1024);
  });

  it('marks every tool read-only and network-reaching', async () => {
    for (const tool of await listTools()) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.openWorldHint).toBe(true);
    }
  });

  it('never grows a format, include, or cache parameter', async () => {
    // Guards the design against drifting back toward CLI-flag parity.
    const banned = ['format', 'include', 'noCache', 'no_cache', 'renderScale', 'scale', 'clearCache'];
    for (const tool of await listTools()) {
      for (const name of Object.keys(tool.inputSchema.properties ?? {})) {
        expect(banned).not.toContain(name);
      }
    }
  });

  it('accepts one `source` that covers both a path and a URL', async () => {
    for (const tool of await listTools()) {
      const properties = Object.keys(tool.inputSchema.properties ?? {});
      expect(properties).toContain('source');
      expect(properties).not.toContain('url');
      expect(properties).not.toContain('remote');
    }
  });

  it('tells the model in read_pdf that an unscoped call is safe', async () => {
    const read = (await listTools()).find((tool) => tool.name === 'read_pdf');
    expect(read?.description).toContain('document map');
  });
});

describe('result helpers', () => {
  it('leads every successful payload with the untrusted-data boundary', () => {
    const result = toolResult('body');
    expect(result.content[0]).toEqual({ type: 'text', text: `${UNTRUSTED_BANNER}\n\nbody` });
    expect(result.isError).toBeUndefined();
  });

  it('appends extra blocks after the banner block', () => {
    const result = toolResult('body', [{ type: 'image', mimeType: 'image/png', data: 'AA' }]);
    expect(result.content).toHaveLength(2);
    expect(result.content[1]?.type).toBe('image');
  });

  it('marks errors in-band so the model can retry', () => {
    const result = toolError('File not found: /a.pdf');
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: 'text', text: 'pdfvision error: File not found: /a.pdf' });
  });
});
