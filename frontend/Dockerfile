FROM node:22.18.0-slim

WORKDIR /home/app

COPY app/ /home/app/

RUN npm install

EXPOSE 3000
CMD ["npm", "run", "dev"]