-- 会员套餐三档化（VIP / SVIP / LIFETIME），权益清单数据驱动
-- 见 docs/ai-config-membership-v2-plan.md 第五节

-- 1) 套餐表增加权益清单列（JSON 数组，结算页按选中套餐渲染）
ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "benefits" text NOT NULL DEFAULT '[]';
--> statement-breakpoint
-- 2) 下架旧 PRO 套餐（保留历史订单可追溯）
UPDATE "subscription_plans" SET "is_active" = false, "updated_at" = now()
WHERE "id" IN ('plan_pro_yearly');
--> statement-breakpoint
-- 3) 上架三档套餐
INSERT INTO "subscription_plans" (
	"id", "name", "description", "price_cents", "original_price_cents",
	"duration_days", "tier", "recommended", "sort_order", "is_active", "benefits"
) VALUES
	(
		'plan_vip_yearly', 'VIP 年费会员',
		'官方极速通道：智能对话 + 知识库向量检索 + 联网搜索，365 天无限畅享',
		3600, 19900, 365, 'VIP', true, 1, true,
		'["官方通道 · AI 智能对话", "官方通道 · 知识库语义检索（向量）", "官方通道 · 联网搜索", "多端云数据安全同步"]'
	),
	(
		'plan_svip_yearly', 'SVIP 年费会员',
		'VIP 全部权益，另享视觉模型理解与封面生图/视频生成等视觉能力',
		9900, 39900, 365, 'SVIP', false, 2, true,
		'["VIP 全部权益", "官方通道 · 视觉模型理解", "官方通道 · 封面生图 / 视频生成", "优先体验新能力"]'
	),
	(
		'plan_lifetime', '终身创始特权',
		'一次买断，永久享受所有当前及未来 AI 创作与工作台核心能力',
		29900, 99900, 36500, 'LIFETIME', false, 3, true,
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
