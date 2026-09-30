"use client";

import type { Lang } from "@/lib/i18n";
import type { GameEntity, CatalogRecord } from "@/lib/api/client";
import { EntityTooltip } from "@/components/database/DatabaseEntityTooltip";

export function DatabaseEntityDetail({ entity, lang, iconSymbol }: { entity: GameEntity; lang: Lang; iconSymbol?: string }) {
	const record: CatalogRecord = {
		id: entity.id, product: entity.product, type: entity.type, externalId: entity.externalId,
		slug: entity.slug, locale: entity.locale, name: entity.name, description: entity.description,
		iconName: entity.iconName, iconUrl: entity.iconUrl, quality: entity.quality,
		buildId: entity.buildId, updatedAt: entity.updatedAt, tooltip: entity.tooltip,
	};
	return <div className="db-entity-detail-tooltip"><EntityTooltip entity={record} lang={lang} expanded={false} detailPage iconSymbol={iconSymbol} onClose={() => undefined} /></div>;
}
