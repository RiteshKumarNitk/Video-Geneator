FROM node:20-alpine AS builder

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install packages
RUN npm ci

# Copy project files
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Build the Next.js app
RUN npm run build

# --- RUNNER STAGE ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Copy output from builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/instrumentation.ts ./src/instrumentation.ts

# Expose port
EXPOSE 3000

# Start Next.js application
CMD ["node_modules/.bin/next", "start"]
