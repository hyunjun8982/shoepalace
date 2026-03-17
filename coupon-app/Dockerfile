FROM node:18-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Build
FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Production (with Python + Chrome for selenium)
FROM node:18-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Python + Chrome + dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip xvfb wget gnupg2 unzip \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list \
    && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
    && pip3 install --break-system-packages undetected-chromedriver selenium requests \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=/usr/bin/google-chrome

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --chown=nextjs:nodejs scripts ./scripts

USER nextjs
EXPOSE 5000
ENV PORT=5000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
