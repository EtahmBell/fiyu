FROM python:3.12-slim

WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir .
ENV FIYU_ENVIRONMENT=production \
    FIYU_ALLOW_LEGACY_CLIENT_ID=false \
    FIYU_DB_PATH=/data/fiyu.db
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn fiyu.api:app --host 0.0.0.0 --port ${PORT:-8000}"]
