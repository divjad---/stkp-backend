FROM node:14-alpine

ARG NODE_ENV=docker
ENV NODE_ENV=${NODE_ENV}

# Privzeta mapa z aplikacijo za vse ukaze v nadaljevanju (COPY, RUN, CMD itd.)
WORKDIR /usr/src/app

RUN mkdir downloads

# Kopiraj package.json in package-lock.json ter poskrbi za namestitev knjižnic
# Docker bo poskrbel za medpomnjenje node_modules map, ki se ne bo spremenila,
# če ni prišlo do spremembe v package.json
COPY package*.json ./
RUN npm install

# Kopiraj izvorno kodo aplikacije
COPY . .
COPY ./KT.gpx downloads/KT.gpx

EXPOSE 5000

CMD [ "node", "index.js" ]
