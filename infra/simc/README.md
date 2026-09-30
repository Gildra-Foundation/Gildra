# Rotation Simulation Worker

The worker runs a pinned SimulationCraft build with `SC_NO_NETWORKING=1`. It
accepts only the whitelisted Rotation Lab contract; clients cannot submit a
profile path, raw APL expression, or arbitrary command-line option.

Build from the repository root:

```sh
docker build -f infra/simc/Dockerfile -t gildra-rotation-sim-worker .
```

Run it on an internal-only network and set the Next.js server variable
`ROTATION_WORKER_URL=http://rotation-sim-worker:8080`. The public browser never
connects to this service directly.

When `DATABASE_URL` is present, the same process reads published presets and
stores attributed simulation runs in PostgreSQL. Without it, the process stays
stateless and exposes only the simulation endpoint plus health check.
