-- +goose Up
CREATE TABLE rotation_lab_presets (
    slug TEXT NOT NULL,
    locale TEXT NOT NULL CHECK (locale IN ('en_US', 'ru_RU')),
    data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (slug, locale)
);

CREATE TABLE rotation_lab_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    preset_slug TEXT NOT NULL,
    scenario TEXT NOT NULL CHECK (scenario IN ('single-target', 'aoe', 'execute')),
    fight_length_seconds INTEGER NOT NULL CHECK (fight_length_seconds BETWEEN 30 AND 300),
    target_count INTEGER NOT NULL CHECK (target_count BETWEEN 1 AND 8),
    input JSONB NOT NULL CHECK (jsonb_typeof(input) = 'object'),
    result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
    engine_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX rotation_lab_runs_preset_created_idx ON rotation_lab_runs (preset_slug, created_at DESC);

WITH preset(locale, engine_label, hints) AS (VALUES
    ('en_US', 'SimulationCraft ready', '{"rampage":"Use at 80+ Rage","bloodthirst":"Maintain Enrage","raging-blow":"Spend charges","execute":"Target below 20%","odyns-fury":"Use on cooldown","whirlwind":"Before cleave window"}'::jsonb),
    ('ru_RU', 'SimulationCraft готов', '{"rampage":"При Rage ≥ 80","bloodthirst":"Поддерживать Enrage","raging-blow":"Использовать заряды","execute":"При здоровье цели < 20%","odyns-fury":"По готовности","whirlwind":"Перед cleave-окном"}'::jsonb)
)
INSERT INTO rotation_lab_presets (slug, locale, data, published_at)
SELECT 'fury-warrior', locale, jsonb_build_object(
    'slug', 'fury-warrior',
    'className', 'Warrior',
    'specialization', 'Fury Warrior',
    'patch', '12.1.0',
    'engineLabel', engine_label,
    'locale', CASE WHEN locale = 'ru_RU' THEN 'ru' ELSE 'en' END,
    'character', jsonb_build_object('name', 'MID2 Reference', 'level', 90, 'itemLevel', 339, 'iconUrl', '/assets/specs/fury-warrior.jpg'),
    'abilities', jsonb_build_array(
        jsonb_build_object('id','rampage','name','Rampage','hint',hints->>'rampage','iconUrl','/assets/abilities/rampage.jpg'),
        jsonb_build_object('id','bloodthirst','name','Bloodthirst','hint',hints->>'bloodthirst','iconUrl','/assets/abilities/bloodthirst.jpg'),
        jsonb_build_object('id','raging-blow','name','Raging Blow','hint',hints->>'raging-blow','iconUrl','/assets/abilities/raging-blow.jpg'),
        jsonb_build_object('id','execute','name','Execute','hint',hints->>'execute','iconUrl','/assets/abilities/execute.jpg'),
        jsonb_build_object('id','odyns-fury','name','Odyn''s Fury','hint',hints->>'odyns-fury','iconUrl','/assets/abilities/odyns-fury.jpg'),
        jsonb_build_object('id','whirlwind','name','Whirlwind','hint',hints->>'whirlwind','iconUrl','/assets/abilities/whirlwind.jpg'),
        jsonb_build_object('id','recklessness','name','Recklessness','hint','Primary burst window','iconUrl','/assets/abilities/recklessness.jpg'),
        jsonb_build_object('id','avatar','name','Avatar','hint','Align with burst','iconUrl','/assets/abilities/avatar.jpg'),
        jsonb_build_object('id','bladestorm','name','Bladestorm','hint','Major AoE cooldown','iconUrl','/assets/abilities/bladestorm.jpg'),
        jsonb_build_object('id','bloodlust','name','Bloodlust','hint','Group burst window','iconUrl','/assets/abilities/bloodlust.jpg')
    ),
    'defaultRules', jsonb_build_array('rampage','bloodthirst','raging-blow','execute','odyns-fury','whirlwind')
), now() FROM preset;

COMMENT ON TABLE rotation_lab_presets IS 'Published Rotation Lab input contracts for deterministic fallback and isolated SimulationCraft execution.';
COMMENT ON TABLE rotation_lab_runs IS 'Reproducible Rotation Lab requests and engine-attributed simulation results.';

-- +goose Down
DROP TABLE IF EXISTS rotation_lab_runs;
DROP TABLE IF EXISTS rotation_lab_presets;
