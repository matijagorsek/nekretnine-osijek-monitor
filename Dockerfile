FROM node:20-slim

# better-sqlite3 needs build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . .

# Create data directory for SQLite
RUN mkdir -p /app/data

# Default: start with cron scheduler
CMD ["npm", "start"]
