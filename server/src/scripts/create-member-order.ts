import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { generateRandomId, signJwtToken } from '../utils/crypto.js';
import { PaymentService } from '../modules/payment/payment.service.js';
import { getPlansFromDb } from '../modules/plans/plans.data.js';
import { syncToLocalWorkbenchSqlite } from './local-sync.js';

interface CliArgs {
  planId: string;
  nickname: string;
  openid: string;
}

/**
 * Parse CLI arguments with sensible defaults
 */
function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const planArg = args.find((a) => a.startsWith('--plan='))?.split('=')[1] || args[0];
  const nameArg = args.find((a) => a.startsWith('--nickname='))?.split('=')[1] || args[1];
  const openidArg = args.find((a) => a.startsWith('--openid='))?.split('=')[1] || args[2];

  return {
    planId: planArg || 'plan_svip_yearly',
    nickname: nameArg || '正式会员用户',
    openid: openidArg || `wx_member_${Date.now()}`,
  };
}


async function main() {
  const { planId, nickname, openid } = parseArgs();

  console.log('================================================================');
  console.log('  线上会员订单生成与登录凭证初始化工具');
  console.log('================================================================');
  console.log(`- 目标套餐 ID: ${planId}`);
  console.log(`- 用户昵称:    ${nickname}`);
  console.log(`- OpenID:      ${openid}`);
  console.log('----------------------------------------------------------------');

  const db = getDb();

  // 1. Fetch available plans from production database
  const plans = await getPlansFromDb();
  if (plans.length === 0) {
    throw new Error('未在数据库中找到任何可用的会员套餐 (subscription_plans 表为空)');
  }

  const selectedPlan = plans.find((p) => p.id === planId) || plans[0];
  console.log(`[1/4] 选中套餐: ${selectedPlan.name} (${selectedPlan.tier}) - 有效期: ${selectedPlan.durationDays} 天`);

  // 2. Find or create user in users table
  let user = await db.query.users.findFirst({
    where: eq(schema.users.openid, openid),
  });

  if (!user) {
    const userId = generateRandomId('usr', 16);
    await db.insert(schema.users).values({
      id: userId,
      openid,
      nickname,
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`,
      memberTier: 'FREE',
    });
    user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
  }

  if (!user) {
    throw new Error('创建或获取用户失败');
  }
  console.log(`[2/4] 用户确认: ID=${user.id}, 当前档位=${user.memberTier}`);

  // 3. Create real order through PaymentService
  const paymentService = new PaymentService();
  const order = await paymentService.createOrder(user.id, selectedPlan.id);
  console.log(`[3/4] 真实订单已创建: ${order.orderNo} (金额: ${order.amountCents / 100} 元)`);

  // 4. Fulfill order via standard online fulfillment workflow
  const transactionId = `tx_official_${Date.now()}_${generateRandomId('', 6)}`;
  await paymentService.fulfillOrder(order.orderNo, transactionId);
  console.log(`[4/4] 真实订单履约完成: 状态已变更为 PAID，会员权益已写入数据库`);

  // Re-fetch updated user and membership status
  const updatedUser = await db.query.users.findFirst({
    where: eq(schema.users.id, user.id),
  });

  if (!updatedUser) {
    throw new Error('无法重新加载用户信息');
  }

  // 5. Sign official standard JWT token
  const token = signJwtToken({ userId: updatedUser.id, openid: updatedUser.openid });

  // 6. Optional: Sync to local SQLite database directly
  await syncToLocalWorkbenchSqlite(token);

  const userProfile = {
    id: updatedUser.id,
    nickname: updatedUser.nickname,
    avatarUrl: updatedUser.avatarUrl,
    memberTier: updatedUser.memberTier,
    memberExpiresAt: updatedUser.memberExpiresAt ? updatedUser.memberExpiresAt.toISOString() : null,
    createdAt: updatedUser.createdAt.toISOString(),
  };

  console.log('================================================================');
  console.log('  线上会员订单流程已全部成功跑通！');
  console.log('================================================================');
  console.log(`- 用户 ID:        ${userProfile.id}`);
  console.log(`- 昵称:           ${userProfile.nickname}`);
  console.log(`- 会员档位:       ${userProfile.memberTier}`);
  console.log(`- 会员到期时间:   ${userProfile.memberExpiresAt}`);
  console.log(`- 关联订单号:     ${order.orderNo}`);
  console.log(`- 生产 JWT Token:`);
  console.log(token);
  console.log('----------------------------------------------------------------');
  console.log('【前端快速登录】：如果前端尚未自动刷新生效，可在浏览器开发者控制台(F12)直接粘贴以下命令回车：');
  console.log(`localStorage.setItem('aiworkstation_cloud_token', ${JSON.stringify(token)});`);
  console.log(`localStorage.setItem('aiworkstation_cloud_user', ${JSON.stringify(JSON.stringify(userProfile))});`);
  console.log(`location.reload();`);
  console.log('================================================================');

  process.exit(0);
}

main().catch((err) => {
  console.error('[Error] 执行失败:', err);
  process.exit(1);
});
