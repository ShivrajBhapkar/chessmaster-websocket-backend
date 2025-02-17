FROM node:18-alpine AS builder  

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install --include=dev
# Generate Prisma client
RUN npx prisma generate

COPY . .

RUN npm run build 

# Production stage
FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/package*.json ./     
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

RUN npm prune --production

EXPOSE 8081

CMD sh -c "npx prisma migrate deploy && node dist/index.js"