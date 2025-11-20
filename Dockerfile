FROM node:22-slim

# Рабочая директория внутри контейнера
WORKDIR /usr/src/app

# Сначала только package.json — для кэша зависимостей
COPY package.json ./

RUN npm install --omit=dev

# Теперь весь остальной код
COPY . .

ENV NODE_ENV=production

# Cloud Run сам пробросит PORT, мы его читаем в index.js
CMD ["npm", "start"]
