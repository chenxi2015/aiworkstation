-- 会员套餐增加月费档：VIP ¥36/月、SVIP ¥99/月；年费调整为约 10 个月价（含折扣呈现）
-- 见 docs/ai-config-membership-v2-plan.md 第五节

INSERT INTO "subscription_plans" (
	"id", "name", "description", "price_cents", "original_price_cents",
	"duration_days", "tier", "recommended", "sort_order", "is_active", "benefits"
) VALUES
	(
		'plan_vip_monthly', 'VIP 月费会员',
		'官方极速通道：智能对话 + 知识库向量检索 + 联网搜索，按月订阅',
		3600, 3600, 30, 'VIP', false, 1, true,
		'["官方通道 · AI 智能对话", "官方通道 · 知识库语义检索（向量）", "官方通道 · 联网搜索", "多端云数据安全同步"]'
	),
	(
		'plan_vip_yearly', 'VIP 年费会员',
		'官方极速通道：智能对话 + 知识库向量检索 + 联网搜索，包年享约 2 个月减免',
		36000, 43200, 365, 'VIP', true, 2, true,
		'["官方通道 · AI 智能对话", "官方通道 · 知识库语义检索（向量）", "官方通道 · 联网搜索", "多端云数据安全同步"]'
	),
	(
		'plan_svip_monthly', 'SVIP 月费会员',
		'VIP 全部权益，另享视觉模型理解与封面生图/视频生成等视觉能力，按月订阅',
		9900, 9900, 30, 'SVIP', false, 3, true,
		'["VIP 全部权益", "官方通道 · 视觉模型理解", "官方通道 · 封面生图 / 视频生成", "优先体验新能力"]'
	),
	(
		'plan_svip_yearly', 'SVIP 年费会员',
		'VIP 全部权益 + 视觉能力全家桶，包年享约 2 个月减免',
		99000, 118800, 365, 'SVIP', false, 4, true,
		'["VIP 全部权益", "官方通道 · 视觉模型理解", "官方通道 · 封面生图 / 视频生成", "优先体验新能力"]'
	),
	(
		'plan_lifetime', '终身创始特权',
		'一次买断，永久享受所有当前及未来 AI 创作与工作台核心能力',
		29900, 99900, 36500, 'LIFETIME', false, 5, true,
		'["SVIP 全部能力永久解锁", "未来新能力免费更新", "一次买断 · 永久有效", "专属创始身份标识"]'
	)
ON CONFLICT ("id") DO UPDATE SET
	"name" = excluded."name",
	"description" = excluded."description",
	"price_cents" = excluded."price_cents",
	"original_price_cents" = excluded."original_price_cents",
	"duration_days" = excluded."duration_days",
	"tier" = excluded."tier",
	"recommended" = excluded."recommended",
	"sort_order" = excluded."sort_order",
	"is_active" = excluded."is_active",
	"benefits" = excluded."benefits",
	"updated_at" = now();
