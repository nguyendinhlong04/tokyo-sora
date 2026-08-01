# Build @sora/api từ monorepo — multi-stage, runtime chỉ chứa prod deps
FROM node:20-alpine AS build
RUN npm install -g pnpm@10
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --filter @sora/api...
RUN pnpm --filter @sora/api build
# pnpm deploy = bản cài đặt độc lập chỉ prod-deps của riêng api
RUN pnpm --filter @sora/api --prod deploy /out && cp -r apps/api/dist /out/dist

FROM node:20-alpine
ENV NODE_ENV=production
RUN addgroup -S sora && adduser -S sora -G sora
USER sora
WORKDIR /app
COPY --from=build --chown=sora:sora /out /app
EXPOSE 3000
CMD ["node", "dist/main.js"]
