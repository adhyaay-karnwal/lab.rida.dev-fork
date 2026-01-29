FROM mcr.microsoft.com/playwright:v1.58.0-noble

RUN npm install -g bun

WORKDIR /app

COPY packages/browser/package.json ./
RUN bun install
RUN chmod +x /app/node_modules/.bun/agent-browser@*/node_modules/agent-browser/bin/agent-browser-linux-* 2>/dev/null || \
  chmod +x /app/node_modules/agent-browser/bin/agent-browser-linux-* 2>/dev/null || true

COPY packages/browser/src ./src

ENV AGENT_BROWSER_SOCKET_DIR=/tmp/agent-browser-socket
ENV AGENT_BROWSER_STREAM_PORT=9223
ENV AGENT_BROWSER_SESSION=default

EXPOSE 9223

CMD ["bun", "run", "src/entrypoint.ts"]
