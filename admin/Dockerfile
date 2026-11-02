# Build from this folder: docker build -t zuch-admin .
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "server/main.ts"]
