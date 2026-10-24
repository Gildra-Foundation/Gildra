-- +goose Up
CREATE TABLE gc_contexts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context_key TEXT NOT NULL UNIQUE,
    context JSONB NOT NULL CHECK (jsonb_typeof(context) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE gc_module_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context_id UUID NOT NULL REFERENCES gc_contexts(id),
    module_id TEXT NOT NULL CHECK (module_id ~ '^[a-z][a-z0-9-]{0,63}$'),
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (context_id, module_id, content_hash),
    UNIQUE (context_id, id, module_id)
);

CREATE TABLE gc_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context_id UUID NOT NULL REFERENCES gc_contexts(id),
    content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (context_id, content_hash),
    UNIQUE (context_id, id)
);

CREATE TABLE gc_release_modules (
    release_id UUID NOT NULL,
    context_id UUID NOT NULL,
    module_id TEXT NOT NULL,
    snapshot_id UUID NOT NULL,
    PRIMARY KEY (release_id, module_id),
    FOREIGN KEY (context_id, release_id) REFERENCES gc_releases(context_id, id),
    FOREIGN KEY (context_id, snapshot_id, module_id)
        REFERENCES gc_module_snapshots(context_id, id, module_id)
);

CREATE TABLE gc_publication_channels (
    context_id UUID PRIMARY KEY REFERENCES gc_contexts(id),
    current_release_id UUID,
    generation BIGINT NOT NULL DEFAULT 0 CHECK (generation >= 0),
    is_public BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMPTZ,
    FOREIGN KEY (context_id, current_release_id) REFERENCES gc_releases(context_id, id),
    CHECK ((generation = 0 AND current_release_id IS NULL AND published_at IS NULL)
        OR (generation > 0 AND current_release_id IS NOT NULL AND published_at IS NOT NULL))
);

CREATE TABLE gc_publication_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context_id UUID NOT NULL REFERENCES gc_contexts(id),
    generation BIGINT NOT NULL CHECK (generation > 0),
    release_id UUID NOT NULL,
    previous_release_id UUID,
    kind TEXT NOT NULL CHECK (kind IN ('publish', 'rollback')),
    actor TEXT NOT NULL CHECK (length(actor) BETWEEN 1 AND 200),
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000),
    request_key TEXT NOT NULL CHECK (length(request_key) BETWEEN 1 AND 200),
    request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    is_public BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (context_id, release_id) REFERENCES gc_releases(context_id, id),
    FOREIGN KEY (context_id, previous_release_id) REFERENCES gc_releases(context_id, id),
    UNIQUE (context_id, generation),
    UNIQUE (context_id, request_key)
);

CREATE TABLE gc_outbox (
    id UUID PRIMARY KEY REFERENCES gc_publication_events(id),
    event_type TEXT NOT NULL CHECK (event_type = 'game_content.published'),
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);
CREATE INDEX gc_outbox_pending_idx ON gc_outbox(created_at) WHERE delivered_at IS NULL;
CREATE INDEX gc_publication_history_idx ON gc_publication_events(context_id, generation DESC);

-- Immutable content and audit rows may only be inserted. The publication
-- pointer and delivery bookkeeping are the only mutable state in this stage.
-- +goose StatementBegin
CREATE FUNCTION gc_reject_content_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'game content versions are immutable' USING ERRCODE = '55000';
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER gc_snapshot_immutable BEFORE UPDATE OR DELETE ON gc_module_snapshots
    FOR EACH ROW EXECUTE FUNCTION gc_reject_content_mutation();
CREATE TRIGGER gc_release_immutable BEFORE UPDATE OR DELETE ON gc_releases
    FOR EACH ROW EXECUTE FUNCTION gc_reject_content_mutation();
CREATE TRIGGER gc_release_module_immutable BEFORE UPDATE OR DELETE ON gc_release_modules
    FOR EACH ROW EXECUTE FUNCTION gc_reject_content_mutation();
CREATE TRIGGER gc_event_immutable BEFORE UPDATE OR DELETE ON gc_publication_events
    FOR EACH ROW EXECUTE FUNCTION gc_reject_content_mutation();

-- +goose Down
DROP TABLE gc_outbox;
DROP TABLE gc_publication_events;
DROP TABLE gc_publication_channels;
DROP TABLE gc_release_modules;
DROP TABLE gc_releases;
DROP TABLE gc_module_snapshots;
DROP TABLE gc_contexts;
DROP FUNCTION gc_reject_content_mutation();
