FROM node:26-slim AS build
# better-sqlite3 compiles its native module when no prebuilt binary matches
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Shown next to the version at the bottom of the app (.git is not part of the build context)
ARG COMMIT=
RUN npm run build && npm prune --omit=dev

FROM node:26-slim
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
# Any answer below 500 means the server and the database respond (the root redirects to the login)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/', { redirect: 'manual' }).then((r) => process.exit(r.status < 500 ? 0 : 1), () => process.exit(1))"]
CMD ["node", "build"]
