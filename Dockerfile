FROM node:22-slim AS build
# better-sqlite3 compiles its native module when no prebuilt binary matches
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
# BODY_SIZE_LIMIT leaves room for large JSON exports on restore (default 512K)
ENV NODE_ENV=production \
	PORT=3000 \
	TZ=Europe/Zurich \
	DATABASE_PATH=/data/batzen.db \
	MIGRATIONS_PATH=/app/drizzle \
	BACKUP_DIR=/backups \
	BODY_SIZE_LIMIT=10M
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
RUN mkdir /data /backups && chown node:node /data /backups
USER node
VOLUME ["/data", "/backups"]
EXPOSE 3000
CMD ["node", "build"]
