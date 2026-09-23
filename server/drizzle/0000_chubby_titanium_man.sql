CREATE TABLE "auth_tickets" (
	"ticket" varchar(64) PRIMARY KEY NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"user_id" varchar(64),
	"token" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"order_no" varchar(64) NOT NULL,
	"tier" varchar(32) NOT NULL,
	"duration_days" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"order_no" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"plan_id" varchar(64) NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"wechat_prepay_id" varchar(128),
	"wechat_transaction_id" varchar(128),
	"code_url" text,
	"paid_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"openid" varchar(128) NOT NULL,
	"unionid" varchar(128),
	"nickname" varchar(128) DEFAULT 'WeChat User' NOT NULL,
	"avatar_url" text DEFAULT '' NOT NULL,
	"member_tier" varchar(32) DEFAULT 'FREE' NOT NULL,
	"member_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_openid_unique" UNIQUE("openid")
);
--> statement-breakpoint
ALTER TABLE "auth_tickets" ADD CONSTRAINT "auth_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_order_no_orders_order_no_fk" FOREIGN KEY ("order_no") REFERENCES "public"."orders"("order_no") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;