FROM nginx:alpine

# Remove default nginx static content
RUN rm -rf /usr/share/nginx/html/*

# Copy site files
COPY index.html  /usr/share/nginx/html/
COPY style.css   /usr/share/nginx/html/
COPY app.js      /usr/share/nginx/html/
COPY data/       /usr/share/nginx/html/data/
COPY images/     /usr/share/nginx/html/images/

# Custom nginx config for correct MIME types and SPA serving
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
