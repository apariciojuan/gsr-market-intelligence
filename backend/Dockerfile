FROM python:3.12-slim AS base
COPY --from=ghcr.io/astral-sh/uv:0.11.13 /uv /uvx /bin/

WORKDIR /home/src

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/home/src
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    netcat-traditional curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock /home/
COPY . /home/src/

RUN uv venv --clear

# entrypoint.sh
RUN chmod 777 /home/src/scripts/entrypoint.sh
RUN sed -i 's/\r$//g' /home/src/scripts/entrypoint.sh

RUN groupadd -r app && useradd -g app app \
    && chown -R app:app /home/

# ---- Development ----
FROM base AS dev
USER app
EXPOSE 8000
CMD ["/bin/sh", "-c", "/home/src/scripts/entrypoint.sh && uv run uvicorn app.api.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir /home/src/app"]

# ---- Production ----
FROM base AS production
USER app
EXPOSE 8000
CMD ["uv", "run", "gunicorn", "-k", "uvicorn.workers.UvicornWorker", "app.api.main:app", "--bind", "0.0.0.0:8000", "--workers", "3", "--threads", "10"]
