package catalogtaxonomy

// GemProperties describes the effect of inserting a gem, not the gem's use
// spell (which can instead be the Earthen food effect). All joins are pinned
// to the item's build. Scaling coefficients are not final rating values.
const gemTooltipJoins = `
 LEFT JOIN catalog_db2_rows gem_properties ON e.entity_type='item'
  AND gem_properties.build_id=v.build_id AND gem_properties.table_name='GemProperties'
  AND gem_properties.locale='en_US'
  AND gem_properties.row_id=COALESCE(NULLIF(item_sparse_local.payload->>'Gem_properties','')::bigint,
   NULLIF(item_sparse_fallback.payload->>'Gem_properties','')::bigint,0)
 LEFT JOIN catalog_db2_rows gem_enchant ON gem_enchant.build_id=v.build_id
  AND gem_enchant.table_name='SpellItemEnchantment' AND gem_enchant.locale='en_US'
  AND gem_enchant.row_id=NULLIF(gem_properties.payload->>'Enchant_ID','')::bigint
 LEFT JOIN catalog_db2_rows gem_enchant_local ON gem_enchant_local.build_id=v.build_id
  AND gem_enchant_local.table_name='SpellItemEnchantment' AND gem_enchant_local.locale=l.locale
  AND gem_enchant_local.row_id=gem_enchant.row_id
`

const gemTooltipExpression = `CASE WHEN gem_properties.row_id IS NOT NULL THEN
 jsonb_build_array(jsonb_build_object(
  'type','effect','effect_kind','socket_bonus',
  'gem_properties_id',gem_properties.row_id,'enchantment_id',NULLIF(gem_properties.payload->>'Enchant_ID','')::bigint,
  'source','db2','source_build_id',v.build_id,
  'text',COALESCE(NULLIF(gem_enchant_local.payload->>'Name_lang',''),gem_enchant.payload->>'Name_lang',''),
  'raw_text',COALESCE(NULLIF(gem_enchant_local.payload->>'Name_lang',''),gem_enchant.payload->>'Name_lang',''),
  'value_status',CASE WHEN gem_enchant.row_id IS NULL THEN 'missing_enchantment'
   WHEN COALESCE(NULLIF(gem_enchant.payload->>'ScalingClass','')::int,0)<>0 THEN 'requires_scaling' ELSE 'source_values' END,
  'scaling_class',gem_enchant.payload->'ScalingClass',
  'min_level',gem_enchant.payload->'MinLevel','max_level',gem_enchant.payload->'MaxLevel',
  'stats',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'index',slot,
   'stat_type',(gem_enchant.payload->>('EffectArg_'||slot))::int,
   'unit',CASE WHEN (gem_enchant.payload->>('EffectArg_'||slot))::int IN (32,36,40,49) THEN 'rating' ELSE 'points' END,
   'value',CASE WHEN COALESCE(NULLIF(gem_enchant.payload->>('EffectScalingPoints_'||slot),'')::numeric,0)=0
     AND COALESCE(NULLIF(gem_enchant.payload->>'ScalingClass','')::int,0)=0
    THEN NULLIF(gem_enchant.payload->>('EffectPointsMin_'||slot),'')::numeric END,
   'scaling_coefficient',NULLIF(gem_enchant.payload->>('EffectScalingPoints_'||slot),'')::numeric
  ) ORDER BY slot) FROM generate_series(0,2) slot
   WHERE gem_enchant.payload->>('Effect_'||slot)='5'),'[]'::jsonb)
 )) ELSE '[]'::jsonb END`
