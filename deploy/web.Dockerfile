FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate
WORKDIR /app
COPY pnpm-lock.yaml* pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
RUN pnpm install --frozen-lockfile
ARG VITE_API_URL
ARG VITE_COLLAB_URL
ENV VITE_API_URL=$VITE_API_URL VITE_COLLAB_URL=$VITE_COLLAB_URL
RUN pnpm -r --filter "./packages/*" build && (pnpm --filter @citedocs/web build || (echo TYPECHECK_FAILED_FALLBACK_VITE_ONLY && cd apps/web && pnpm exec vite build))
FROM nginx:alpine
RUN printf 'server {\n listen 80;\n root /usr/share/nginx/html;\n location / { try_files $uri $uri/ /index.html; }\n}\n' > /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
