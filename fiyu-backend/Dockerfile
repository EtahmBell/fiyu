FROM python:3.12-slim

WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir .
COPY data ./data
ENV FIYU_DB_PATH=/app/data/fiyu.db
EXPOSE 8000
CMD ["uvicorn", "fiyu.api:app", "--host", "0.0.0.0", "--port", "8000"]
