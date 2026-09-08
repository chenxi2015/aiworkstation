# syntax=docker/dockerfile:1

# ---------- 构建阶段 ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate
# better-sqlite3 优先使用预编译二进制；装工具链仅作兜底
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN DEPLOY_TARGET=node pnpm build

# ---------- 运行阶段 ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
# ffmpeg 供视频下载/转码；curl 供 HEALTHCHECK
RUN apt-get update \
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
