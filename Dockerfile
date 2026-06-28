FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm i
COPY . .
RUN npm run build
EXPOSE 8080
CMD ["npm","start"]
