# Використовуємо офіційний образ Node.js 18 на базі Alpine Linux
FROM node:18-alpine

# Встановлюємо робочу директорію всередині контейнера
WORKDIR /app

COPY telegram-bot-node/ /app
# Копіюємо package.json та package-lock.json для встановлення залежностей
COPY telegram-bot-node/package.json telegram-bot-node/package-lock.json ./

# Встановлюємо залежності
RUN npm install

# Копіюємо решту коду застосунку
COPY . .

# Збираємо TypeScript-код
RUN npm run build

# Встановлюємо команду для запуску бота
CMD ["npm", "start"]
