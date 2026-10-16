FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate
WORKDIR /app
COPY pnpm-lock.yaml* pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/server/ ./apps/server/
RUN pnpm install --frozen-lockfile
RUN pnpm -r --filter "./packages/*" build && pnpm --filter @citedocs/server build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate
COPY --from=builder /app ./
EXPOSE 3000 1234
CMD ["node", "apps/server/dist/index.js"]
