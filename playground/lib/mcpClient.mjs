// A minimal MCP client over stdio. The project depends only on the server
// half of the SDK, and the playground needs exactly three requests
// (initialize, tools/call, shutdown), so newline-delimited JSON-RPC over the
// child's pipes is cheaper than another devDependency.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export async function startMcpServer({ cwd, env }) {
  const child = spawn(process.execPath, ['dist/bin/pdfvision.mjs', 'mcp'], {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const pending = new Map();
  let nextId = 1;
  const failAll = (error) => {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  };
  child.on('exit', (code) => {
    failAll(new Error(`pdfvision mcp exited with code ${code}${stderr ? `:\n${stderr}` : ''}`));
  });
  child.on('error', failAll);

  createInterface({ input: child.stdout }).on('line', (line) => {
    if (line.trim().length === 0) return;
    const message = JSON.parse(line);
    const waiter = message.id !== undefined ? pending.get(message.id) : undefined;
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(`MCP error ${message.error.code}: ${message.error.message}`));
    else waiter.resolve(message.result);
  });

  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      send({ jsonrpc: '2.0', id, method, params });
    });

  await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'pdfvision-playground', version: '1' },
  });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  return {
    async callTool(name, args) {
      return request('tools/call', { name, arguments: args });
    },
    async close() {
      child.removeAllListeners('exit');
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.stdin.end();
      child.kill();
      await exited;
    },
  };
}
