FROM ubuntu/nginx

ENV PORT 80

COPY build /var/www/html

EXPOSE 80

CMD ["nginx","-g","daemon off;"]