FROM node:18-alpine
WORKDIR /app
COPY ../bot/ ./
COPY ../dashboard/ ./public/
RUN npm init -y && npm install ws axios moment
EXPOSE 3008 8001
CMD ["node", "run-trading-bot-v14FINAL.js"]
