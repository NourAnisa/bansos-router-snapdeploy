FROM node:22-alpine
RUN apk add --no-cache tini git
RUN npm install -g --no-audit --no-fund bansos-router@0.3.1
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY whatsapp.mjs nadia-business.mjs ./
COPY start.sh ./
RUN chmod +x /app/start.sh && mkdir -p /home/node/.bansos /home/node/.wa_auth && chown -R node:node /home/node /app
ENV NODE_ENV=production
ENV HOME=/home/node
ENV PORT=17070
ENV WA_ENABLED=false
USER node
EXPOSE 17070
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/start.sh"]
