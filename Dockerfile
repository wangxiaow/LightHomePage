FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
WORKDIR /app
COPY --chown=node:node package.json server.mjs client-address.mjs ./
COPY --chown=node:node public/ ./public/
USER node
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=3s --start-period=5s CMD node -e "const r=require('node:http').get('http://127.0.0.1:8080/',s=>{s.resume();process.exitCode=s.statusCode===200?0:1});r.setTimeout(2000,()=>r.destroy());r.on('error',()=>process.exitCode=1)"
CMD ["node", "--max-old-space-size=96", "server.mjs"]
