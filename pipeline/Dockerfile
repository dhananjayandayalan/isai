# syntax=docker/dockerfile:1
# The analysis worker (P9, ADR 0016). Build from the repo root, since it needs schema/ too:
#   docker build -f pipeline/Dockerfile -t isai-worker:$(git rev-parse --short HEAD) .
# torch's CUDA wheels bring their own CUDA runtime, so a slim Python base is enough; the
# GPU driver comes from the host (Docker Desktop + WSL2, or the NVIDIA container toolkit).
# Models are not baked in: they are fetched and checksummed into the /models volume on first
# start (ops/worker/entrypoint.sh).

FROM python:3.15-slim-bookworm AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    ISAI_SCHEMA_DIR=/app/schema \
    ISAI_MODEL_DIR=/models
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.13.0 /uv /usr/local/bin/uv

WORKDIR /app/pipeline
# Dependencies first, so code changes don't reinstall torch.
COPY pipeline/pyproject.toml pipeline/uv.lock ./
# The uv cache lives in a BuildKit cache mount, not in the image (it would double its size).
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --extra cuda --no-install-project
COPY schema /app/schema
COPY pipeline/src ./src
COPY pipeline/README.md ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --extra cuda

COPY ops/worker/entrypoint.sh /usr/local/bin/isai-worker
RUN chmod 0755 /usr/local/bin/isai-worker \
 && useradd --create-home --uid 10001 isai \
 && mkdir -p /models /tmp/isai \
 && chown isai:isai /models /tmp/isai
USER isai
ENV PATH=/opt/venv/bin:$PATH TMPDIR=/tmp/isai

ARG PIPELINE_VERSION=unknown
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="isai-worker" \
      org.opencontainers.image.version="${PIPELINE_VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}"

ENTRYPOINT ["isai-worker"]
