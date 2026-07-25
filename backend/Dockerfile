FROM node:18-alpine

# Install g++ and make for C++ compilation support
RUN apk add --no-cache g++ gcc build-base

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
