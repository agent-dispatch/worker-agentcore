FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev || npm install
COPY dist ./dist
ENV PORT=8080
CMD ["node", "dist/server.js"]
