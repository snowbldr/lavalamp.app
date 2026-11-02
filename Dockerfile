FROM nginx
COPY index.html /usr/share/nginx/html/
COPY src /usr/share/nginx/html/src
COPY versions /usr/share/nginx/html/versions
