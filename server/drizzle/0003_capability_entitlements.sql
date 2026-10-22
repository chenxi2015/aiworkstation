-- 能力化会员权益（docs/ai-config-membership-v2-plan.md）
-- 1) 档位 → 能力映射表（权益数据驱动，调权益 = 改数据）
CREATE TABLE IF NOT EXISTS "tier_entitlements" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"tier" varchar(32) NOT NULL,
	"capability" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tier_entitlement_unique" ON "tier_entitlements" ("tier", "capability");
--> statement-breakpoint
-- 2) 官方通道上游配置表（替代写死的 OFFICIAL_UPSTREAM_URL 与 env key）
CREATE TABLE IF NOT EXISTS "official_channels" (
	"capability" varchar(32) PRIMARY KEY NOT NULL,
	"provider" varchar(64) NOT NULL,
	"upstream_url" text NOT NULL,
	"api_key" text NOT NULL DEFAULT '',
	"default_model" varchar(128),
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- 3) 权益矩阵种子：VIP=对话+向量+联网；SVIP=+视觉/生图/视频；LIFETIME=全部
INSERT INTO "tier_entitlements" ("id", "tier", "capability") VALUES
	('te_vip_chat', 'VIP', 'chat'),
	('te_vip_embedding', 'VIP', 'embedding'),
	('te_vip_web_search', 'VIP', 'web_search'),
	('te_svip_chat', 'SVIP', 'chat'),
	('te_svip_embedding', 'SVIP', 'embedding'),
	('te_svip_web_search', 'SVIP', 'web_search'),
	('te_svip_vision', 'SVIP', 'vision'),
	('te_svip_image_gen', 'SVIP', 'image_gen'),
	('te_svip_video_gen', 'SVIP', 'video_gen'),
	('te_lifetime_chat', 'LIFETIME', 'chat'),
	('te_lifetime_embedding', 'LIFETIME', 'embedding'),
	('te_lifetime_web_search', 'LIFETIME', 'web_search'),
	('te_lifetime_vision', 'LIFETIME', 'vision'),
	('te_lifetime_image_gen', 'LIFETIME', 'image_gen'),
	('te_lifetime_video_gen', 'LIFETIME', 'video_gen')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
-- 4) 官方通道上游种子（api_key 留空，由服务启动时从 env 回填或直接改库；
--    回填逻辑见 server/src/db/startupSeed.ts）
INSERT INTO "official_channels" ("capability", "provider", "upstream_url", "api_key", "default_model") VALUES
	('chat', 'deepseek', 'https://api.deepseek.com/chat/completions', '', 'deepseek-chat'),
	('vision', 'deepseek', 'https://api.deepseek.com/chat/completions', '', 'deepseek-chat'),
	('embedding', 'siliconflow', 'https://api.siliconflow.cn/v1/embeddings', '', 'BAAI/bge-m3'),
	('image_gen', 'doubao', 'https://ark.cn-beijing.volces.com/api/v3/images/generations', '', 'doubao-seedream-5-0-flash-260915'),
	('web_search', 'tavily', 'https://api.tavily.com/search', '', NULL)
ON CONFLICT ("capability") DO NOTHING;
--> statement-breakpoint
-- 5) 历史 PRO 档位迁移为 VIP（normalizeTier 仍兼容旧数据，双保险）
UPDATE "users" SET "member_tier" = 'VIP' WHERE "member_tier" = 'PRO';
--> statement-breakpoint
UPDATE "memberships" SET "tier" = 'VIP' WHERE "tier" = 'PRO';
--> statement-breakpoint
UPDATE "subscription_plans" SET "tier" = 'VIP' WHERE "tier" = 'PRO';
