# Example Dockerfile
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy all source files
COPY . .

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
