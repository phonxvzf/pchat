FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY ./start-nginx.sh .

RUN chmod +x ./start-nginx.sh\
  && apk --no-cache add curl

EXPOSE 8080

CMD [ "./start-nginx.sh" ]
