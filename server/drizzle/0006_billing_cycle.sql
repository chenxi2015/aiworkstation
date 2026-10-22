-- 套餐计费周期（monthly / yearly / lifetime），年费折扣通过 original_price_cents 划线价表达
ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "billing_cycle" varchar(16) NOT NULL DEFAULT 'yearly';
--> statement-breakpoint
UPDATE "subscription_plans" SET "billing_cycle" = 'monthly' WHERE "id" IN ('plan_vip_monthly', 'plan_svip_monthly');
--> statement-breakpoint
UPDATE "subscription_plans" SET "billing_cycle" = 'lifetime' WHERE "id" = 'plan_lifetime';
