import { getPlansFromDb } from '../modules/plans/plans.data.js';

async function main() {
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
