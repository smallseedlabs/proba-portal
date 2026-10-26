# Stage 1: build
FROM node:20-alpine AS builder

WORKDIR /app

# git is needed to resolve the protocol package (types only) from GitHub.
RUN apk add --no-cache git

COPY package.json package-lock.json ./
RUN npm ci

# The production image always reads from the audit API: no in-memory data source is compiled in,
# and check:bundle fails the build if one is.
ENV VITE_API_ADAPTER=http

COPY . .
RUN npm run build && npm run check:bundle

# Stage 2: serve
FROM nginx:1.25-alpine

RUN addgroup -g 1001 -S probauser && \
    adduser -u 1001 -S probauser -G probauser

COPY --from=builder /app/dist /usr/share/nginx/html

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
# Writes /usr/share/nginx/html/env-config.js from the container's environment at start.
COPY docker/env.sh /docker-entrypoint.d/40-proba-env.sh
RUN chmod +x /docker-entrypoint.d/40-proba-env.sh

RUN chown -R probauser:probauser /usr/share/nginx/html && \
    chown -R probauser:probauser /var/cache/nginx && \
    chown -R probauser:probauser /var/log/nginx && \
    chown -R probauser:probauser /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R probauser:probauser /var/run/nginx.pid

USER probauser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
