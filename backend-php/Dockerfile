FROM php:8.3-fpm-alpine

WORKDIR /var/www/html

RUN docker-php-ext-install pdo pdo_mysql

COPY . /var/www/html

RUN mkdir -p /var/www/html/storage/logs /var/www/html/storage/cache/ratelimits /var/www/html/storage/uploads /var/www/html/storage/reports \
    && chown -R www-data:www-data /var/www/html/storage

EXPOSE 9000

CMD ["php-fpm"]
