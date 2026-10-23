import { desc, eq } from 'drizzle-orm';
import { getDb, schema } from '../db/index.js';
import { signJwtToken } from '../utils/crypto.js';
import { syncToLocalWorkbenchSqlite } from './local-sync.js';

interface CliArgs {
  userId?: string;
  openid?: string;
}

/**
 * Parse CLI arguments for existing user token generation
 */
function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const userArg = args.find((a) => a.startsWith('--userId='))?.split('=')[1] ||
    args.find((a) => a.startsWith('--user='))?.split('=')[1];
  const openidArg = args.find((a) => a.startsWith('--openid='))?.split('=')[1];

  // If first positional argument exists and doesn't start with --
  const firstPositional = args[0] && !args[0].startsWith('--') ? args[0] : undefined;

  let targetUserId = userArg;
  let targetOpenid = openidArg;

  if (firstPositional) {
    if (firstPositional.startsWith('wx_')) {
      targetOpenid = targetOpenid || firstPositional;
    } else {
      targetUserId = targetUserId || firstPositional;
    }
  }

  return {
    userId: targetUserId,
    openid: targetOpenid,
  };
}

async function main() {
  const { userId, openid } = parseArgs();
  const db = getDb();

  console.log('================================================================');
  console.log('  基于已有账号快速生成/刷新登录 Token 工具');
  console.log('================================================================');

  // Fetch recent users from database
  const recentUsers = await db.query.users.findMany({
    orderBy: [desc(schema.users.createdAt)],
    limit: 15,
  });

  if (recentUsers.length === 0) {
    console.error('[Error] 数据库中暂无任何用户，请先运行 `pnpm run member:create` 创建初始账号');
    process.exit(1);
  }

  let selectedUser: typeof recentUsers[0] | undefined;

  if (userId) {
    selectedUser = recentUsers.find((u) => u.id === userId) ||
      (await db.query.users.findFirst({ where: eq(schema.users.id, userId) })) || undefined;

    if (!selectedUser) {
      console.error(`[Error] 未找到 ID 为 "${userId}" 的用户`);
      console.log('\n可选的已有用户列表如下：');
      printUserTable(recentUsers);
      process.exit(1);
    }
  } else if (openid) {
    selectedUser = recentUsers.find((u) => u.openid === openid) ||
      (await db.query.users.findFirst({ where: eq(schema.users.openid, openid) })) || undefined;

    if (!selectedUser) {
      console.error(`[Error] 未找到 OpenID 为 "${openid}" 的用户`);
      console.log('\n可选的已有用户列表如下：');
      printUserTable(recentUsers);
      process.exit(1);
    }
  } else {
    // Default to the first (most recently created) user
    selectedUser = recentUsers[0];
    console.log('💡 未指定 --userId 或 --openid，自动选择最近创建/活跃的用户：');
    console.log('\n当前数据库中的已有用户列表 (Top 15)：');
    printUserTable(recentUsers, selectedUser.id);
  }

  // Sign standard valid JWT token
  const token = signJwtToken({ userId: selectedUser.id, openid: selectedUser.openid });

  // Sync to local SQLite database workbench.db
  await syncToLocalWorkbenchSqlite(token);

  const userProfile = {
    id: selectedUser.id,
    nickname: selectedUser.nickname,
    avatarUrl: selectedUser.avatarUrl,
    memberTier: selectedUser.memberTier,
    memberExpiresAt: selectedUser.memberExpiresAt ? selectedUser.memberExpiresAt.toISOString() : null,
    createdAt: selectedUser.createdAt.toISOString(),
  };

  console.log('\n================================================================');
  console.log(`✅ 已成功为已有用户生成合法 Token！`);
  console.log('================================================================');
  console.log(`- 用户 ID (userId): ${userProfile.id}`);
  console.log(`- 微信 OpenID:      ${selectedUser.openid}`);
  console.log(`- 昵称:             ${userProfile.nickname}`);
  console.log(`- 会员档位:         ${userProfile.memberTier}`);
  console.log(`- 会员到期时间:     ${userProfile.memberExpiresAt || '永久有效 / 无'}`);
  console.log(`- 生产 JWT Token:`);
  console.log(token);
  console.log('----------------------------------------------------------------');
  console.log('【切换其他用户】：如需为列表中的其他账号生成 Token，可执行：');
  console.log(`pnpm run token:generate --userId=<目标用户ID>`);
  console.log('----------------------------------------------------------------');
  console.log('【前端控制台注入登录】：在浏览器开发者控制台(F12)直接粘贴以下命令即可：');
  console.log(`localStorage.setItem('aiworkstation_cloud_token', ${JSON.stringify(token)});`);
  console.log(`localStorage.setItem('aiworkstation_cloud_user', ${JSON.stringify(JSON.stringify(userProfile))});`);
  console.log(`location.reload();`);
  console.log('================================================================\n');

  process.exit(0);
}

/**
 * Format and print user list in a clean table view
 */
function printUserTable(users: Array<{ id: string; openid: string; nickname: string; memberTier: string; memberExpiresAt: Date | null }>, activeId?: string) {
  console.log('---------------------------------------------------------------------------------------------------------');
  console.log('| 标记 | 用户 ID (userId)                | 微信昵称         | 档位     | 会员到期日             |');
  console.log('---------------------------------------------------------------------------------------------------------');
  for (const u of users) {
    const isSelected = u.id === activeId ? '👉 ' : '   ';
    const idPad = u.id.padEnd(30, ' ');
    const nickPad = u.nickname.slice(0, 8).padEnd(14, ' ');
    const tierPad = u.memberTier.padEnd(8, ' ');
    const expiresPad = (u.memberExpiresAt ? u.memberExpiresAt.toLocaleDateString() : '无/永久').padEnd(20, ' ');
    console.log(`| ${isSelected} | ${idPad} | ${nickPad} | ${tierPad} | ${expiresPad} |`);
  }
  console.log('---------------------------------------------------------------------------------------------------------');
}

main().catch((err) => {
  console.error('[Error] 执行失败:', err);
  process.exit(1);
});

