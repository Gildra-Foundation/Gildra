package catalogtaxonomy

// ItemDelay is milliseconds per swing. MaxCount is an ownership limit, not
// the stack size (Stackable). Neither requires an item-level budget formula.
const itemFactsExpression = `
 CASE WHEN entity_type='item' AND item_detail->>'item_class_id'='2'
  AND db2->>'ItemDelay' ~ '^[1-9][0-9]*$'
 THEN jsonb_build_array(jsonb_build_object('type','weapon_speed','seconds',(db2->>'ItemDelay')::numeric/1000)) ELSE '[]'::jsonb END
 || CASE WHEN entity_type='item' AND db2->>'MaxCount' ~ '^[1-9][0-9]*$'
 THEN jsonb_build_array(jsonb_build_object('type','unique','quantity',(db2->>'MaxCount')::bigint)) ELSE '[]'::jsonb END
`
