import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

console.log(`Starting AI Workstation Cloud Server on http://${env.HOST}:${env.PORT} ...`);

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
    hostname: env.HOST,
  },
  (info) => {
    console.log(`🚀 Cloud Server is listening on http://${info.address}:${info.port}`);
    console.log(`   Health check:    http://localhost:${info.port}/health`);
    console.log(`   WeChat QR auth:  http://localhost:${info.port}/api/auth/wx/qrcode`);
    console.log(`   Plans list:      http://localhost:${info.port}/api/pay/plans`);
  },
);
