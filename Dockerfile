FROM node:lts-alpine

# Thiết lập thư mục làm việc trong container
WORKDIR /usr/src/app

# Copy package.json và package-lock.json (hoặc yarn.lock) vào thư mục làm việc
COPY package*.json ./

RUN npm install

# Copy tất cả các mã nguồn từ thư mục dự án vào thư mục làm việc trong container
COPY . .

EXPOSE 3000

CMD ["node", "index.js"]