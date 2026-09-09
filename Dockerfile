# ---------- 构建阶段 ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV PNPM_HOME=/pnpm \
	PATH=/pnpm:$PATH \
	COREPACK_NPM_REGISTRY=https://registry.npmmirror.com \
	npm_config_registry=https://registry.npmmirror.com

# 替换 Debian 阿里源并安装编译工具链（better-sqlite3 优先使用预编译二进制，工具链仅作兜底）
RUN if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
		sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources && \
		sed -i 's/security.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources; \
	fi; \
	if [ -f /etc/apt/sources.list ]; then \
		sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list && \
		sed -i 's/security.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list; \
	fi \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.24.0 --activate \
	&& pnpm config set registry https://registry.npmmirror.com

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN DEPLOY_TARGET=node pnpm build

# ---------- 运行阶段 ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# 替换 Debian 阿里源并安装 ffmpeg 与 curl
RUN if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
		sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources && \
		sed -i 's/security.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources; \
	fi; \
	if [ -f /etc/apt/sources.list ]; then \
		sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list && \
		sed -i 's/security.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list; \
	fi \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg curl \
	&& rm -rf /var/lib/apt/lists/*

# Nitro 产物已内联全部 JS 依赖与 better-sqlite3 原生 prebuilds
COPY --from=build /app/.output ./.output
ENV NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=3888
EXPOSE 3888
# SQLite 数据目录（workbench.db / pages / backups），务必挂卷持久化
VOLUME ["/app/.aiworkstation"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
	CMD curl -fsS http://localhost:3888/ > /dev/null || exit 1
CMD ["node", ".output/server/index.mjs"]
