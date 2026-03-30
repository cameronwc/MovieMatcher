# Stage 1: Build client
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json client/.npmrc* ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Build server
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# Stage 3: Production
FROM node:20-alpine
WORKDIR /app

# Install production server dependencies
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Copy built server
COPY --from=server-build /app/server/dist ./server/dist

# Copy built client
COPY --from=client-build /app/client/dist ./client/dist

# Create data directory for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
ENV PORT=3000
ENV DB_PATH=/app/data/moviematcher.db

EXPOSE 3000

VOLUME ["/app/data"]

# I10: Run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

# I11: Health check
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server/dist/index.js"]
