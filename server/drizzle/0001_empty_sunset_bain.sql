CREATE TABLE "subscription_plans" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text NOT NULL,
	"price_cents" integer NOT NULL,
	"original_price_cents" integer NOT NULL,
	"duration_days" integer NOT NULL,
	"tier" varchar(32) DEFAULT 'PRO' NOT NULL,
	"recommended" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
