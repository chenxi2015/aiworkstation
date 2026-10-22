import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { runStartupSeed } from './db/startupSeed.js';

const app = createApp();

// 官方通道上游 key 的启动回填（迁移期兼容，见 startupSeed.ts）
void runStartupSeed();

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
