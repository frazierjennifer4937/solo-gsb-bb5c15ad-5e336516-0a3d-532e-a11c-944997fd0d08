# syntax=docker/dockerfile:1

# ---------- 构建阶段：安装依赖并编译 shared / server / client ----------
FROM node:20-alpine AS build
WORKDIR /app

# 先拷贝依赖清单，充分利用镜像层缓存
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json

# 安装全部工作区依赖（含 devDependencies，构建需要）
RUN npm ci

# 拷贝源码并构建（shared → server → client），随后裁剪掉开发依赖
COPY shared ./shared
COPY server ./server
COPY client ./client
RUN npm run build && npm prune --omit=dev

# ---------- 运行阶段：仅保留生产所需产物 ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# 非 root 运行
RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

USER app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1

CMD ["node", "server/dist/index.js"]
