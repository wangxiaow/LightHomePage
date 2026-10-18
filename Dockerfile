FROM nginx:stable-alpine
COPY public/ /usr/share/nginx/html/
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY deploy/proxy.conf /etc/nginx/baiye-proxy.conf
EXPOSE 80
HEALTHCHECK --interval=60s --timeout=3s --start-period=5s CMD wget -q --spider http://127.0.0.1/ || exit 1
