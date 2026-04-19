FROM oven/bun:alpine

WORKDIR /app
ENV NODE_ENV=production

# copy workspace root
COPY package.json ./

# copy packages
COPY packages ./packages

# install deps for entire workspace
RUN bun install --workspaces --production \
 && rm -rf /root/.bun/install/cache

# run backend
WORKDIR /app/packages/backend

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]