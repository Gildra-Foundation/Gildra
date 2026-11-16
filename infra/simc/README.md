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

`SIMC_CONCURRENCY` bounds concurrent native processes across both simulations and
gear metadata requests. It defaults to `1`; only `1` and `2` are accepted, and an
invalid value retains the default. Compose opts into `2` within its existing
two-CPU, 2 GiB worker budget. Each native process still uses `threads=1`, the same
iteration count and deterministic settings; parallel requests do not change an
individual measurement. At most eight additional requests may wait for capacity,
for up to five seconds or the caller's earlier cancellation. Native execution
keeps its existing timeout. Use `1` for a worker allocated only one CPU.
Native `GET /healthz` responses advertise their actual process limit in
`X-Gildra-Simulation-Concurrency`. Clients check this uncached capability before
each planner invocation and use one process if it is absent or unavailable.
Rechecking preserves compatibility with older workers and capacity reductions
during rollback, including searches already active in the web process.

When `DATABASE_URL` is present, the same process reads published presets and
stores attributed simulation runs in PostgreSQL. Without it, the process stays
stateless and exposes only the simulation endpoint plus health check.
