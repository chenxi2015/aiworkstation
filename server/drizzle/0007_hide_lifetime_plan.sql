-- 下架终身创始特权套餐（保留数据可回溯，随时可改回 is_active = true 重新上架）
UPDATE "subscription_plans" SET "is_active" = false, "updated_at" = now()
WHERE "id" = 'plan_lifetime';
