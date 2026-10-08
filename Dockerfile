FROM node:22-alpine
RUN apk add --no-cache tini
RUN npm install -g --no-audit --no-fund bansos-router@0.3.1
ENV NODE_ENV=production \
    HOME=/home/node \
    PORT=17070
RUN mkdir -p /home/node/.bansos && chown -R node:node /home/node
USER node
EXPOSE 17070
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "exec bansos start --bind 0.0.0.0 --port ${PORT} --unsafe-allow-non-loopback"]
