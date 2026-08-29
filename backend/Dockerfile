FROM golang:1.26.6-alpine AS builder
WORKDIR /src
RUN apk add --no-cache ca-certificates git
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/catalog-import ./cmd/catalog-import \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/att-import ./cmd/att-import \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/att-resolve ./cmd/att-resolve \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/raidbots-import ./cmd/raidbots-import \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/catalog-index ./cmd/catalog-index \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/catalog-audit ./cmd/catalog-audit \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/db2-import ./cmd/db2-import \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/listfile-import ./cmd/listfile-import \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/catalog-pipeline ./cmd/catalog-pipeline \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/catalog-build-check ./cmd/catalog-build-check \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/catalog-completeness ./cmd/catalog-completeness \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/catalog-backup ./cmd/catalog-backup \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/catalog-media-cache ./cmd/catalog-media-cache \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/catalog-source-approval ./cmd/catalog-source-approval \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/catalog-load-check ./cmd/catalog-load-check \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/goose github.com/pressly/goose/v3/cmd/goose \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/river github.com/riverqueue/river/cmd/river

FROM alpine:3.23
RUN apk add --no-cache ca-certificates tzdata postgresql17-client
WORKDIR /app
COPY --from=builder /out/server /out/catalog-import /out/att-import /out/att-resolve /out/raidbots-import /out/catalog-index /out/catalog-audit /out/db2-import /out/listfile-import /out/catalog-pipeline /out/catalog-build-check /out/catalog-completeness /out/catalog-backup /out/catalog-media-cache /out/catalog-source-approval /out/catalog-load-check /out/goose /out/river /usr/local/bin/
COPY migrations /app/migrations
COPY THIRD_PARTY_NOTICES.txt /app/THIRD_PARTY_NOTICES.txt
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh \
 && install -d -o 65532 -g 65532 -m 0750 /var/lib/gildra/catalog-media \
 && install -d -o 65532 -g 65532 -m 0700 /var/lib/gildra/catalog-backups
EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
