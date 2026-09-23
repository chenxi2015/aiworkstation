import {
	getPlansFromDb,
	seedPlansIfEmpty,
} from "../modules/plans/plans.data.js";

async function main() {
	console.log("--- Starting Database Seeding ---");
	await seedPlansIfEmpty();
	const plans = await getPlansFromDb();
	console.log("Seeded Subscription Plans in Database:");
	console.table(
		plans.map((p) => ({
			ID: p.id,
			Name: p.name,
			"Price(RMB)": `¥${(p.priceCents / 100).toFixed(2)}`,
			"Duration(Days)": p.durationDays,
			Tier: p.tier,
			Recommended: p.recommended ? "YES" : "NO",
		})),
	);
	console.log("--- Seeding Completed Successfully ---");
	process.exit(0);
}

main().catch((err) => {
	console.error("Seeding failed:", err);
	process.exit(1);
});
