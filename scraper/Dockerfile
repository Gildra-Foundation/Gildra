FROM python:3.13-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY requirements.txt /build/requirements.txt
RUN python -m pip wheel --no-cache-dir --wheel-dir /wheels -r /build/requirements.txt

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

COPY --from=builder /wheels /wheels
RUN python -m pip install --no-cache-dir /wheels/*.whl \
    && rm -rf /wheels \
    && useradd --create-home --uid 10001 scraper

WORKDIR /app
COPY config /app/config
COPY parsers /app/parsers
COPY profiles /app/profiles
RUN mkdir -p /app/state /app/reports && chown -R scraper:scraper /app

USER scraper
ENTRYPOINT ["ws-run"]
CMD ["/app/config/production.json", "--preflight"]
