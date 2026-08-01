import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.js';

/**
 * Start the MCP server on stdio, behind the `pdfvision mcp` subcommand.
 */
export function serveMcpStdio(): void {
  // stdout is the JSON-RPC channel. pdfjs-dist writes raw "Warning: ..."
  // lines through console.warn, and anything that reaches stdout corrupts
  // the protocol stream, so every console channel is pinned to stderr.
  // console.error already writes there.
  for (const level of ['log', 'info', 'warn', 'debug'] as const) {
    console[level] = (...args: unknown[]) => {
      process.stderr.write(`${args.map((arg) => String(arg)).join(' ')}\n`);
    };
  }

  serveStdio(() => createServer(), {
    onerror: (error) => {
      process.stderr.write(`pdfvision mcp: ${error.message}\n`);
    },
  });
}
