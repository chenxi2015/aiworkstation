import { getDb, schema } from './index.js';
import { runStartupSeed } from './startupSeed.js';
import { getPlansFromDb } from '../modules/plans/plans.data.js';

async function main() {
  console.log('--- Backfilling Official Channels into Database ---');
  await runStartupSeed();
  const channels = await getDb().select().from(schema.officialChannels);
  console.table(
    channels.map((c) => ({
      Capability: c.capability,
      Provider: c.provider,
      DefaultModel: c.defaultModel ?? '-',
      Enabled: c.enabled,
      Configured: Boolean(c.apiKey && c.apiKey.trim()),
    })),
  );

  console.log('--- Checking Subscription Plans from Database ---');
  const plans = await getPlansFromDb();
  console.log(`Found ${plans.length} active subscription plans in database:`);
  console.table(
    plans.map((p) => ({
      ID: p.id,
      Name: p.name,
      'Price(RMB)': `¥${(p.priceCents / 100).toFixed(2)}`,
      'Duration(Days)': p.durationDays,
      Tier: p.tier,
      Recommended: p.recommended ? 'YES' : 'NO',
    })),
  );
  console.log('--- Check Completed Successfully ---');
  process.exit(0);
}

main().catch((err) => {
  console.error('Query failed:', err);
  process.exit(1);
});
