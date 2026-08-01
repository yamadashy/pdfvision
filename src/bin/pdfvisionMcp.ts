#!/usr/bin/env node
import { serveMcpStdio } from '../mcp/serve.js';

// Equivalent to `pdfvision mcp`; kept as its own binary because MCP host
// configs conventionally point at a dedicated command.
serveMcpStdio();
