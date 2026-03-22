import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function tg(method, params = {}) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

function createServer() {
  const server = new McpServer({ name: 'telegram', version: '1.0.0' });

  server.tool(
    'send_message',
    'Send a Telegram message to a user or group by chat_id',
    {
      chat_id: z.union([z.string(), z.number()]).describe('Telegram chat_id of recipient'),
      text: z.string().describe('Message text to send'),
    },
    async ({ chat_id, text }) => {
      const result = await tg('sendMessage', { chat_id, text });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'get_updates',
    'Fetch new messages sent to the bot. Use offset=last_update_id+1 to get only new messages.',
    {
      offset: z.number().optional().describe('Fetch updates after this update_id (use last_update_id + 1)'),
      limit: z.number().optional().describe('Max number of updates to return (default 20)'),
    },
    async ({ offset, limit = 20 }) => {
      const result = await tg('getUpdates', {
        offset,
        limit,
        allowed_updates: ['message'],
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'delete_webhook',
    'Delete the Telegram webhook so get_updates polling works. Call this once before using get_updates.',
    {},
    async () => {
      const result = await tg('deleteWebhook');
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'get_bot_info',
    'Get info about the Telegram bot (id, username)',
    {},
    async () => {
      const result = await tg('getMe');
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'get_chat_info',
    'Get info about a Telegram chat or user by chat_id',
    {
      chat_id: z.union([z.string(), z.number()]).describe('Telegram chat_id'),
    },
    async ({ chat_id }) => {
      const result = await tg('getChat', { chat_id });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  return server;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).send('Telegram MCP Server is running');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — works with Vercel serverless
  });

  res.on('close', () => transport.close());

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
}
