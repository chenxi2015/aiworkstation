INSERT INTO "subscription_plans" (
	"id",
	"name",
	"description",
	"price_cents",
	"original_price_cents",
	"duration_days",
	"tier",
	"recommended",
	"sort_order",
	"is_active"
) VALUES
	('plan_pro_yearly', '工作台年度会员', '解锁本地优先 AI 创作、无限知识库问答与云端同步（365天无限畅享）', 3600, 19900, 365, 'PRO', true, 1, true),
	('plan_lifetime', '终身创始特权', '一次买断，永久享受所有当前及未来 AI 创作与工作台核心能力', 29900, 99900, 36500, 'LIFETIME', false, 2, true)
ON CONFLICT ("id") DO NOTHING;
