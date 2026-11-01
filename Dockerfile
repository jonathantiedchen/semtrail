FROM node:22-slim AS ui
WORKDIR /build/ui
COPY ui/package*.json ./
RUN npm ci
COPY ui/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY . .
COPY --from=ui /build/src/semtrail/static ./src/semtrail/static
RUN pip install --no-cache-dir '.[server,mcp,postgres,openai,anthropic]' \
    && useradd --create-home --uid 10001 semtrail \
    && mkdir -p /home/semtrail/.semtrail \
    && chown 10001:10001 /home/semtrail/.semtrail
USER semtrail
WORKDIR /home/semtrail
ENTRYPOINT ["semtrail"]
CMD ["serve", "--demo", "--host", "0.0.0.0"]
