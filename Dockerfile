FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY server/ ./server/
COPY public/ ./public/
COPY scripts/ ./scripts/
COPY players-fc26.json ./
ENV PORT=3000 NODE_ENV=production DB_PATH=/app/data/liga.db
RUN mkdir -p data
EXPOSE 3000
CMD ["sh", "-c", "npm run seed && npm start"]
