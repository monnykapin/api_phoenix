# Multi-stage Dockerfile for production and development

# Development stage
FROM node:lts-alpine AS development

ARG BUILD_NUMBER=dev

WORKDIR /app

ENV BUILD_NUMBER=${BUILD_NUMBER}

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm install

# Copy source code
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]

# Production stage
FROM node:lts-alpine AS production

ARG BUILD_NUMBER=dev

WORKDIR /app

ENV BUILD_NUMBER=${BUILD_NUMBER}

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

CMD ["node", "server.js"]