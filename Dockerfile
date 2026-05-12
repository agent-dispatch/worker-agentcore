FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev || npm install
COPY dist ./dist
ENV AGENTDISPATCH_WORKER_PROTOCOL=a2a
EXPOSE 9000
CMD ["node", "dist/server.js"]
