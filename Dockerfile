# ---------- 构建阶段 ----------
FROM node:22-alpine AS builder

# 替换 Alpine 镜像源为阿里源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# better-sqlite3 在 Alpine (musl) 下编译原生绑定需要 python3 make g++
RUN apk add --no-cache python3 make g++

WORKDIR /app

ENV PNPM_HOME="/pnpm" \
	PATH="/pnpm:$PATH" \
	NODE_OPTIONS="--max-old-space-size=4096" \
	COREPACK_NPM_REGISTRY="https://registry.npmmirror.com"

RUN corepack enable && corepack prepare pnpm@11.24.0 --activate \
	&& pnpm config set registry https://registry.npmmirror.com

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN DEPLOY_TARGET=node pnpm build

# ---------- 运行阶段 ----------
FROM node:22-alpine AS runner

# 替换 Alpine 镜像源为阿里源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装 ffmpeg (视频转码/下载)、curl (健康检查)、libstdc++ (better-sqlite3 原生绑定动态库)
RUN apk add --no-cache ffmpeg curl libstdc++

WORKDIR /app

ENV NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=3888 \
	NODE_OPTIONS="--max-old-space-size=4096"

# Nitro 产物
COPY --from=builder /app/.output ./.output

EXPOSE 3888

# SQLite 数据持久化
VOLUME ["/app/.aiworkstation"]

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
	CMD curl -fsS http://localhost:3888/ > /dev/null || exit 1

CMD ["node", ".output/server/index.mjs"]
