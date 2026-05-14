# Dockerfile for UNI-POM REST API Server

FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm install -g tsx

# Copy application files
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Start application
CMD ["npm", "start"]
