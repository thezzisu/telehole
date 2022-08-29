FROM node:gallium-alpine as builder
WORKDIR /app
COPY . .
RUN yarn install
RUN yarn build

FROM node:gallium-alpine
WORKDIR /app
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/package.json ./
COPY --from=builder /app/yarn.lock ./
RUN yarn install --production
CMD [ "yarn", "start" ]
