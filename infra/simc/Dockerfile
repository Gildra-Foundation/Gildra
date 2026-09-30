# syntax=docker/dockerfile:1.7
ARG SIMC_REF=18428cd3902412abc8ee274d19567d603e674e66

FROM debian:bookworm-slim AS simc-build
ARG SIMC_REF
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates g++ git make \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src/simc
RUN git init \
    && git remote add origin https://github.com/simulationcraft/simc.git \
    && git fetch --depth 1 origin "${SIMC_REF}" \
    && git checkout --detach FETCH_HEAD \
    && make -C engine release -j"$(nproc)" SC_NO_NETWORKING=1

FROM golang:1.26.6-bookworm AS worker-build
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/rotation-sim-worker ./cmd/rotation-sim-worker

FROM debian:bookworm-slim
ARG SIMC_REF
LABEL org.opencontainers.image.source="https://github.com/simulationcraft/simc" \
      net.gildra.simc.revision="${SIMC_REF}"
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgcc-s1 libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 65532 --home-dir /nonexistent --shell /usr/sbin/nologin gildra
COPY --from=simc-build /src/simc/engine/simc /opt/simc/simc
COPY --from=simc-build /src/simc/COPYING /opt/simc/COPYING
COPY --from=simc-build /src/simc/profiles/MID2 /opt/gildra/profiles/MID2
COPY --from=worker-build /out/rotation-sim-worker /usr/local/bin/rotation-sim-worker
COPY backend/internal/rotationlab/profiles/MID2_Warrior_Fury.simc /opt/gildra/profiles/MID2_Warrior_Fury.simc
ENV SIMC_BINARY=/opt/simc/simc \
    SIMC_FURY_PROFILE=/opt/gildra/profiles/MID2_Warrior_Fury.simc \
    SIMC_PROFILE_DIR=/opt/gildra/profiles/MID2 \
    SIMC_ITERATIONS=750 \
    ROTATION_WORKER_ADDR=0.0.0.0:8080
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/rotation-sim-worker"]
