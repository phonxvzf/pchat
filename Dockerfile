FROM node:alpine

WORKDIR /usr/src/app

COPY . .

ENV NODE_ENV=production
RUN npm install\
  && apk --no-cache add curl\
  && addgroup -S app\
  && adduser -S app -G app\
  && chown -R app /usr/src/app\
  && chmod +x ./start-app.sh

# Switch to the new user
USER app

EXPOSE 3000

# Init database and start server
CMD [ "./start-app.sh" ]
