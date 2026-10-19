import Link from "next/link";
import type { Lang } from "@/lib/i18n";
import { formatQuestText } from "@/lib/gameText";
import { RichDescription, TooltipOwners, verifiedMediaURL } from "@/components/database/TooltipRelations";
import { ResilientImage } from "@/components/media/ResilientImage";
import { CatalogGlyph } from "@/components/database/CatalogGlyph";
import type { CatalogRecord } from "@/lib/api/client";
import { formatAtlasDate } from "@gildra/atlas-ui/format";
import { tooltipContentCopy } from "./tooltipContentCopy";

const PLAYABLE_CLASS_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
// Blizzard DB2 descriptions can contain value placeholders that are only
// meaningful after a build-specific lookup. Never render those tokens as if
// they were player-facing text; the API keeps the raw value for diagnostics.
const UNRESOLVED_TEMPLATE = /\$(?:@spelldesc|[0-9]*[dD]|[0-9]*s[0-9]+|[st][0-9]+|[dD]|[A-Za-z]|[<{])/;

function safeTooltipText(value: unknown, lang: Lang) {
  const text = String(value ?? "");
  if (!text || UNRESOLVED_TEMPLATE.test(text)) {
    return UNRESOLVED_TEMPLATE.test(text)
      ? tooltipContentCopy[lang].descriptionIsNotResolved
      : "";
  }
  return text;
}

/**
 * In-game tooltip markup shared by the catalog preview dialog (client,
 * DatabaseEntityTooltip) and the entity page (server). No hooks here, so the
 * entity page renders it without shipping this module to the browser.
 */
export function tooltipClassName(entity: CatalogRecord, variant: "dialog" | "page") {
	return `db-wow-tooltip quality-${entity.quality ?? 0} ${variant === "dialog" ? "is-expanded" : "is-detail-page"}`;
}

export function TooltipBody({ entity, lang, iconSymbol = "#ic-gem" }: { entity: CatalogRecord; lang: Lang; iconSymbol?: string }) {
	const tooltip = entity.tooltip;
	if (!tooltip) return null;
	const seenAcquisition = new Set<string>();
	const descriptionMentions = tooltip.blocks.find((block) => String(block.type ?? "") === "description_mentions")?.entries;
	const mentions = Array.isArray(descriptionMentions) ? descriptionMentions as Record<string, unknown>[] : [];
	const blocks = tooltip.blocks.filter((block) => {
		if (String(block.type ?? "") === "description") {
			const text = String(block.text ?? "");
			if ((entity.type === "spell" || entity.type === "talent") && !text.trim()) return false;
		}
		if (String(block.type ?? "") !== "acquisition") return true;
		const key = `${String(block.source_type ?? "")}:${String(block.name ?? "")}:${String(block.location ?? "")}`;
		if (seenAcquisition.has(key)) return false;
		seenAcquisition.add(key);
		return true;
	});
	return (
		<>
			<span className="db-tooltip-icon" aria-hidden="true">
				<ResilientImage src={entity.iconUrl} alt="" fallback={<CatalogGlyph symbol={iconSymbol} className="i" />} />
			</span>
			<div className="db-tooltip-panel">
				<div className="db-tooltip-name" id={`tooltip-name-${entity.id}`}>{entity.name || `${entity.type.replaceAll("_", " ")} #${entity.externalId}`}</div>
				{blocks.map((block, index) => (
					<TooltipBlock key={`${String(block.type)}-${index}`} block={block} entityType={entity.type} lang={lang} mentions={mentions} />
				))}
			</div>
		</>
	);
}

function TooltipBlock({ block, entityType, lang, mentions }: { block: Record<string, unknown>; entityType: string; lang: Lang; mentions: Record<string, unknown>[] }) {
  const type = String(block.type ?? "");
  if (type === "name") return null;
	if (type === "item_level") return <div className="db-tooltip-level">{tooltipContentCopy[lang].itemLevel} {String(block.value ?? "")}</div>;
  if (type === "slot") return <div>{inventoryTypeLabel(Number(block.code), lang)}</div>;
  if (type === "subclass") return <div className="db-tooltip-muted">{subclassLabel(Number(block.class_id), Number(block.subclass_id), lang)}</div>;
  if (type === "binding") return <div>{bindingLabel(Number(block.code), lang)}</div>;
  if (type === "required_level") return <div>{tooltipContentCopy[lang].requiresLevel} {String(block.value ?? "")}</div>;
  if (type === "required_skill") return <div>{requiredSkillLabel(Number(block.skill_id), Number(block.rank), lang)}</div>;
  if (type === "stack_limit") return <div>{tooltipContentCopy[lang].maximumStack}: {String(block.value ?? "")}</div>;
  if (type === "container_slots") return <div>{tooltipContentCopy[lang].bagSlots}: {String(block.value ?? "")}</div>;
  if (type === "price") return <TooltipPrice buy={Number(block.buy ?? 0)} sell={Number(block.sell ?? 0)} lang={lang} />;
	  if (type === "name_description") { const text = safeTooltipText(block.text, lang); return text ? <div className="db-tooltip-muted">{text}</div> : null; }
  if (type === "item_set") return <div className="db-tooltip-set">{tooltipContentCopy[lang].set}: {String(block.name ?? "")}</div>;
  if (type === "limit_category") return <div>{String(block.name ?? "")}{Number(block.quantity ?? 0) > 0 ? ` (${String(block.quantity)})` : ""}</div>;
  if (type === "stats" && Array.isArray(block.entries)) return <TooltipStats entries={block.entries as Record<string, unknown>[]} lang={lang} />;
	  if (type === "subtext" && typeof block.text === "string") { const text = safeTooltipText(block.text, lang); return text ? <div className="db-tooltip-subtext">{text}</div> : null; }
  if (type === "cast_time") return <div className="db-tooltip-mechanic">{formatCastTime(Number(block.milliseconds), lang)}</div>;
  if (type === "range") return <div className="db-tooltip-mechanic">{String(block.yards ?? "")} {tooltipContentCopy[lang].ydRange}</div>;
  if (type === "cooldown") return <div className="db-tooltip-mechanic">{formatDuration(Number(block.milliseconds), lang)} {tooltipContentCopy[lang].cooldown}</div>;
  if (type === "duration") return <div className="db-tooltip-mechanic">{tooltipContentCopy[lang].duration}: {formatDuration(Number(block.milliseconds), lang)}</div>;
  if (type === "power") return <div className="db-tooltip-mechanic">{formatPower(block, lang)}</div>;
  if (type === "sockets") return <div className="db-tooltip-socket">◇ {tooltipContentCopy[lang].hasSocket}</div>;
  if (type === "profession") return <div className="db-tooltip-crafted">{tooltipContentCopy[lang].craftedByAProfession}</div>;
  if (type === "acquisition") return <div className="db-tooltip-acquisition">{acquisitionLabel(block, lang)}</div>;
  if (type === "spell_owners" && Array.isArray(block.entries)) return <TooltipOwners entries={block.entries as Record<string, unknown>[]} lang={lang} />;
  if (type === "spell_talents" && Array.isArray(block.entries)) return <SpellTalents entries={block.entries as Record<string, unknown>[]} lang={lang} />;
  if (type === "talent_spells" && Array.isArray(block.entries)) return <TalentSpells entries={block.entries as Record<string, unknown>[]} lang={lang} />;
  if (type === "talent_info") return <TalentInfo block={block} lang={lang} />;
	if (type === "profession_info") return <ProfessionInfo block={block} lang={lang} />;
	if (type === "recipe_info") return <RecipeInfo block={block} lang={lang} />;
	if (type === "item_requirements") return <ItemRequirements block={block} lang={lang} />;
	if (type === "item_registry") return <ItemRegistry block={block} lang={lang} />;
	if (type === "item_effect_metadata" && Array.isArray(block.entries)) return <ItemEffectMetadata entries={block.entries as Record<string, unknown>[]} lang={lang} />;
	if (type === "item_variants" && Array.isArray(block.entries)) return <ItemVariants entries={block.entries as Record<string, unknown>[]} lang={lang} />;
	if (type === "quest_info") return <QuestInfo block={block} lang={lang} />;
	if (type === "quest_reward_package") return <QuestRewardPackage block={block} lang={lang} />;
	if (type === "creature_info") return <CreatureInfo block={block} lang={lang} />;
	if (type === "provenance") return <TooltipProvenance block={block} lang={lang} />;
	if (type === "spell_effects" && Array.isArray(block.entries)) return <SpellEffects entries={block.entries as Record<string, unknown>[]} lang={lang} />;
  if (type === "unique_equipped") return <div>{tooltipContentCopy[lang].uniqueEquipped}</div>;
	  if (type === "use" || type === "equip") { const text = safeTooltipText(block.text, lang); return text ? <div className="db-tooltip-effect">{text}</div> : null; }
	  if (type === "effect") { const text = safeTooltipText(cleanWowText(String(block.text ?? ""), lang), lang); return text ? <div className="db-tooltip-effect">{effectPrefix(Number(block.trigger), lang)}{text}</div> : null; }
	  if (type === "description" && typeof block.text === "string") {
	    const text = safeTooltipText(block.text, lang);
	    if (!text) return null;
	    return entityType === "spell" || entityType === "talent" || entityType === "pvp_talent"
			? <RichDescription text={text} mentions={mentions} lang={lang} />
			: <div className="db-tooltip-description">“{entityType === "quest" ? formatQuestText(text, lang) : text}”</div>;
  }
  return null;
}

function ItemRegistry({ block, lang }: { block: Record<string, unknown>; lang: Lang }) {
	// Class, subclass, inventory type and FileDataID are internal client codes; the
	// readable slot and armour type come from their own blocks, the raw codes stay in the JSON section.
	if (!block.registry_only) return null;
	return <div className="db-tooltip-item-context db-tooltip-muted">{tooltipContentCopy[lang].theItemExistsIn}</div>;
}

function ProfessionInfo({ block, lang }: { block: Record<string, unknown>; lang: Lang }) {
  const recipes = Number(block.recipe_count ?? 0);
  const categories = Number(block.category_count ?? 0);
	const parentID = Number(block.parent_skill_line_id ?? 0);
	const recipesList = Array.isArray(block.recipes) ? block.recipes as Record<string, unknown>[] : [];
  return <div className="db-tooltip-profession-info">
    <div><b>{tooltipContentCopy[lang].skillLine}:</b> {String(block.skill_line_id ?? "")}</div>
    {parentID > 0 ? <div>{tooltipContentCopy[lang].parentSkillLine}: {parentID}</div> : null}
    <div>{tooltipContentCopy[lang].recipesInDatabase}: {recipes.toLocaleString(tooltipContentCopy[lang].numberLocale)}</div>
    {categories > 0 ? <div>{tooltipContentCopy[lang].recipeCategories}: {categories.toLocaleString(tooltipContentCopy[lang].numberLocale)}</div> : null}
		{Boolean(block.can_link) ? <div>{tooltipContentCopy[lang].canBeLinkedIn}</div> : null}
		{recipesList.length ? <div className="db-tooltip-related"><b>{tooltipContentCopy[lang].recipeExamples}:</b>{recipesList.map((recipe) => <span key={String(recipe.id)}>{String(recipe.name || `ID ${recipe.external_id}`)}{Number(recipe.min_skill_rank ?? 0) > 0 ? ` (${tooltipContentCopy[lang].skill} ${String(recipe.min_skill_rank)})` : ""}</span>)}</div> : null}
	</div>;
}

function RecipeInfo({ block, lang }: { block: Record<string, unknown>; lang: Lang }) {
	const professions = Array.isArray(block.professions) ? block.professions as Record<string, unknown>[] : [];
	const reagents = Array.isArray(block.reagents) ? block.reagents as Record<string, unknown>[] : [];
	const currencies = Array.isArray(block.currencies) ? block.currencies as Record<string, unknown>[] : [];
	const outputs = Array.isArray(block.outputs) ? block.outputs as Record<string, unknown>[] : [];
	return <div className="db-tooltip-recipe-info">
		{professions.length ? <div><b>{tooltipContentCopy[lang].profession}:</b> {professions.map((entry) => `${String(entry.name || entry.external_id)}${Number(entry.min_skill_rank ?? 0) > 0 ? ` (${String(entry.min_skill_rank)})` : ""}`).join(", ")}</div> : null}
		{outputs.length ? <div className="db-tooltip-related"><b>{tooltipContentCopy[lang].creates}:</b>{outputs.map((entry) => <span key={String(entry.external_id)}>{String(entry.name || `Item #${entry.external_id}`)}</span>)}</div> : null}
		{reagents.length ? <div className="db-tooltip-related"><b>{tooltipContentCopy[lang].reagents}:</b>{reagents.map((entry, index) => <span key={`${String(entry.external_id)}-${index}`}>{String(entry.name || `Item #${entry.external_id}`)} ×{String(entry.quantity ?? 0)}{Number(entry.recraft_quantity ?? 0) > 0 ? ` (${tooltipContentCopy[lang].recraft}: ${String(entry.recraft_quantity)})` : ""}</span>)}</div> : null}
		{currencies.length ? <div className="db-tooltip-related"><b>{tooltipContentCopy[lang].currency}:</b>{currencies.map((entry) => <span key={String(entry.external_id)}>#{String(entry.external_id)} ×{String(entry.quantity ?? 0)}</span>)}</div> : null}
	</div>;
}

function ItemRequirements({ block, lang }: { block: Record<string, unknown>; lang: Lang }) {
	const classMask = BigInt(String(block.class_mask ?? "-1"));
	const classNames = classMask === -1n ? [] : PLAYABLE_CLASS_IDS.filter((id) => (BigInt.asUintN(32, classMask) & (1n << BigInt(id - 1))) !== 0n).map((id) => className(id, lang));
	const raceRestricted = String(block.race_mask_0 ?? "-1") !== "-1" || String(block.race_mask_1 ?? "-1") !== "-1";
	const ability = Number(block.required_ability_id ?? 0);
	const faction = Number(block.faction_id ?? 0);
	const holiday = Number(block.holiday_id ?? 0);
	if (!classNames.length && !raceRestricted && !ability && !faction && !holiday) return null;
	return <div className="db-tooltip-requirements">
		{classNames.length ? <div>{tooltipContentCopy[lang].classes}: {classNames.join(", ")}</div> : null}
		{raceRestricted ? <div>{tooltipContentCopy[lang].raceRestricted}</div> : null}
		{ability ? <div>{tooltipContentCopy[lang].requiresAbility}: {ability}</div> : null}
		{faction ? <div>{tooltipContentCopy[lang].requiresReputation}: {faction} ({String(block.reputation ?? 0)})</div> : null}
		{holiday ? <div>{tooltipContentCopy[lang].event}: {holiday}</div> : null}
	</div>;
}

function ItemEffectMetadata({ entries, lang }: { entries: Record<string, unknown>[]; lang: Lang }) {
	return <div className="db-tooltip-effect-meta">{entries.map((effect, index) => <div key={`${String(effect.spell_id)}-${index}`}>
		{Number(effect.charges ?? 0) !== 0 ? <span>{tooltipContentCopy[lang].charges}: {String(effect.charges)} </span> : null}
		{Number(effect.cooldown_ms ?? 0) > 0 ? <span>{tooltipContentCopy[lang].cooldown2}: {formatDuration(Number(effect.cooldown_ms), lang)} </span> : null}
		{Number(effect.specialization_id ?? 0) > 0 ? <span>{tooltipContentCopy[lang].specialization}: {specializationName(Number(effect.specialization_id), lang) || String(effect.specialization_id)}</span> : null}
	</div>)}</div>;
}

function ItemVariants({ entries, lang }: { entries: Record<string, unknown>[]; lang: Lang }) {
	return <div className="db-tooltip-variants">
		<b>{tooltipContentCopy[lang].itemVariants}</b>
		{entries.map((variant, variantIndex) => {
			const stats = Array.isArray(variant.stats) ? variant.stats as Record<string, unknown>[] : [];
			const effects = Array.isArray(variant.effects) ? variant.effects as Record<string, unknown>[] : [];
			return <details key={`${String(variant.key)}-${variantIndex}`} open={entries.length === 1}>
				<summary>{!variant.key || String(variant.key) === "base" ? tooltipContentCopy[lang].baseVersion : String(variant.key)}{Number(variant.item_level ?? 0) > 0 ? ` · ${tooltipContentCopy[lang].level} ${String(variant.item_level)}` : ""}</summary>
				{stats.length ? <div className="db-tooltip-related"><b>{tooltipContentCopy[lang].stats}:</b>{stats.map((stat, index) => <span key={`${String(stat.index)}-${index}`}>{String(stat.label || stat.key || `Stat ${stat.type}`)}{stat.value !== null && stat.value !== undefined ? `: ${String(stat.value)}` : ""}{Number(stat.allocation ?? 0) !== 0 ? ` · ${tooltipContentCopy[lang].allocation} ${String(stat.allocation)}` : ""}</span>)}</div> : null}
				{effects.length ? <div className="db-tooltip-related"><b>{tooltipContentCopy[lang].effects}:</b>{effects.map((effect, index) => <span key={`${String(effect.index)}-${index}`}>{tooltipContentCopy[lang].spell} #{String(effect.spell_id || "—")}{Number(effect.cooldown_ms ?? 0) > 0 ? ` · ${formatDuration(Number(effect.cooldown_ms), lang)}` : ""}</span>)}</div> : null}
							</details>;
		})}
	</div>;
}

function QuestInfo({ block, lang }: { block: Record<string, unknown>; lang: Lang }) {
	const objectives = Array.isArray(block.objectives) ? block.objectives as Record<string, unknown>[] : [];
	const lines = Array.isArray(block.quest_lines) ? block.quest_lines as Record<string, unknown>[] : [];
	const rewards = Array.isArray(block.rewards) ? block.rewards as Record<string, unknown>[] : [];
	return <div className="db-tooltip-quest-info">
		{String(block.bullet_text ?? "") ? <div>{formatQuestText(String(block.bullet_text), lang)}</div> : null}
		{objectives.length ? <div className="db-tooltip-related"><b>{tooltipContentCopy[lang].objectives}:</b>{objectives.map((objective) => <span key={String(objective.id)}>• {String(objective.description || `${tooltipContentCopy[lang].object} ${objective.object_id ?? ""}`)}{Number(objective.amount ?? 0) > 1 ? ` ×${String(objective.amount)}` : ""}</span>)}</div> : null}
		{lines.length ? <div>{tooltipContentCopy[lang].questLine}: {lines.map((line) => String(line.name || line.id)).join(", ")}</div> : null}
		{rewards.length ? <QuestRewards rewards={rewards} lang={lang} /> : null}
		{Number(block.poi_count ?? 0) > 0 ? <div>{tooltipContentCopy[lang].mapPoints}: {String(block.poi_count)}</div> : null}
	</div>;
}

function QuestRewardPackage({ block, lang }: { block: Record<string, unknown>; lang: Lang }) {
	const items = Array.isArray(block.items) ? block.items as Record<string, unknown>[] : [];
	const prefix = lang === "ru" ? "/ru" : "";
	return <div className="db-tooltip-quest-info">
		<div><b>{tooltipContentCopy[lang].package}:</b> #{String(block.package_id ?? "—")}</div>
		<div className="db-tooltip-muted">{tooltipContentCopy[lang].anItemSetFrom}</div>
		{items.length ? <div className="db-tooltip-related db-tooltip-rewards">
			<b>{tooltipContentCopy[lang].packageItems}:</b>
			<div className="db-tooltip-reward-group">{items.map((item, index) => {
				const externalID = Number(item.item_external_id ?? 0);
				const entityID = String(item.entity_id ?? "");
				const icon = verifiedMediaURL(String(item.icon_url ?? ""));
				const label = String(item.name || `Item #${externalID || "—"}`);
				const quantity = Number(item.quantity ?? 0);
				const content = <>{icon ? <img src={icon} alt="" loading="lazy" /> : <span className="db-tooltip-reward-marker" aria-hidden="true">◇</span>}<span><strong>{label}</strong><small>{quantity > 0 ? `×${quantity.toLocaleString(tooltipContentCopy[lang].numberLocale)}` : ""}</small></span></>;
				return entityID
					? <Link className="db-tooltip-reward" href={`${prefix}/database/item/${encodeURIComponent(entityID)}/${encodeURIComponent(String(externalID || "item"))}`} key={`${externalID}-${index}`}>{content}</Link>
					: <span className="db-tooltip-reward" key={`${externalID}-${index}`}>{content}</span>;
			})}</div>
		</div> : <div className="db-tooltip-muted">{tooltipContentCopy[lang].thePackageHasNo}</div>}
	</div>;
}

function QuestRewards({ rewards, lang }: { rewards: Record<string, unknown>[]; lang: Lang }) {
	const guaranteed = rewards.filter((reward) => !Boolean(reward.choice));
	const choices = rewards.filter((reward) => Boolean(reward.choice));
	const renderReward = (reward: Record<string, unknown>, index: number) => {
		const type = String(reward.type ?? "other");
		const entityType = String(reward.entity_type || questRewardEntityType(type));
		const externalID = Number(reward.external_id ?? 0);
		const entityID = String(reward.entity_id ?? "");
		const slug = String(reward.slug || externalID || "reward");
		const icon = verifiedMediaURL(String(reward.icon_url ?? ""));
		const quality = Number(reward.quality ?? 0);
		const label = String(reward.name || questRewardTypeLabel(type, lang, externalID));
		const amount = Number(reward.amount ?? 0);
		const details = [questRewardAmount(type, amount, lang), Boolean(reward.choice) ? tooltipContentCopy[lang].choice : ""].filter(Boolean).join(" · ");
		const content = <>{icon ? <img src={icon} alt="" loading="lazy" /> : <span className="db-tooltip-reward-marker" aria-hidden="true">◇</span>}<span><strong className={`quality-${quality}`}>{label}</strong>{details ? <small>{details}</small> : null}</span></>;
		return entityID
			? <Link className="db-tooltip-reward" href={`${lang === "ru" ? "/ru" : ""}/database/${encodeURIComponent(entityType)}/${encodeURIComponent(entityID)}/${encodeURIComponent(slug)}`} key={`${type}-${externalID}-${index}`}>{content}</Link>
			: <span className="db-tooltip-reward" key={`${type}-${externalID}-${index}`}>{content}</span>;
	};
	return <div className="db-tooltip-related db-tooltip-rewards">
		<b>{tooltipContentCopy[lang].rewards}:</b>
		{guaranteed.length ? <div className="db-tooltip-reward-group">{choices.length ? <em>{tooltipContentCopy[lang].guaranteed}</em> : null}{guaranteed.map(renderReward)}</div> : null}
		{choices.length ? <div className="db-tooltip-reward-group"><em>{tooltipContentCopy[lang].chooseOneReward}</em>{choices.map(renderReward)}</div> : null}
	</div>;
}

function questRewardEntityType(type: string) {
	return type === "reputation" ? "faction" : type;
}

function questRewardTypeLabel(type: string, lang: Lang, externalID: number) {
	const labels: Record<string, [string, string]> = {
		item: ["Item", "Предмет"], currency: ["Currency", "Валюта"], money: ["Money", "Деньги"],
		experience: ["Experience", "Опыт"], reputation: ["Reputation", "Репутация"], spell: ["Spell", "Заклинание"],
		title: ["Title", "Звание"], other: ["Reward", "Награда"],
	};
	const label = labels[type]?.[lang === "ru" ? 1 : 0] ?? tooltipContentCopy[lang].reward;
	return externalID > 0 ? `${label} #${externalID}` : label;
}

function questRewardAmount(type: string, amount: number, lang: Lang) {
	if (!Number.isFinite(amount) || amount <= 0) return "";
	const formatted = amount.toLocaleString(tooltipContentCopy[lang].numberLocale);
	if (type === "experience") return `${formatted} ${tooltipContentCopy[lang].unitXp}`;
	if (type === "money") return formatQuestMoney(amount, lang);
	if (type === "reputation") return `+${formatted} ${tooltipContentCopy[lang].reputation}`;
	if ((type === "spell" || type === "title") && amount === 1) return "";
	return `×${formatted}`;
}

function formatQuestMoney(copper: number, lang: Lang) {
	const whole = Math.floor(copper);
	const gold = Math.floor(whole / 10_000);
	const silver = Math.floor((whole % 10_000) / 100);
	const remainder = whole % 100;
	const parts = [];
	if (gold) parts.push(`${gold.toLocaleString(tooltipContentCopy[lang].numberLocale)} ${tooltipContentCopy[lang].unitG}`);
	if (silver) parts.push(`${silver} ${tooltipContentCopy[lang].unitS}`);
	if (remainder || !parts.length) parts.push(`${remainder} ${tooltipContentCopy[lang].unitC}`);
	return parts.join(" ");
}

function CreatureInfo({ block, lang }: { block: Record<string, unknown>; lang: Lang }) {
	const roles = Array.isArray(block.roles) ? block.roles as Record<string, unknown>[] : [];
	const locations = Array.isArray(block.locations) ? block.locations as Record<string, unknown>[] : [];
	const lootTables = Array.isArray(block.loot_tables) ? block.loot_tables as Record<string, unknown>[] : [];
	return <div className="db-tooltip-creature-info">
		{String(block.creature_type ?? "") ? <div>{tooltipContentCopy[lang].type}: {String(block.creature_type)}</div> : null}
		{String(block.creature_family ?? "") ? <div>{tooltipContentCopy[lang].family}: {String(block.creature_family)}</div> : null}
		{Number(block.difficulty_count ?? 0) > 0 ? <div>{tooltipContentCopy[lang].difficultyVariants}: {String(block.difficulty_count)}</div> : null}
		{roles.length ? <div>{tooltipContentCopy[lang].roles}: {roles.map((role) => String(role.role)).join(", ")}</div> : null}
		{locations.length ? <div className="db-tooltip-related"><b>{tooltipContentCopy[lang].location}:</b>{locations.map((location, index) => <span key={`${String(location.ui_map_id)}-${index}`}>{tooltipContentCopy[lang].map} {String(location.ui_map_id || location.map_id || "—")}: {Number(location.x).toFixed(1)}, {Number(location.y).toFixed(1)}</span>)}</div> : null}
		{lootTables.length ? <LootTables tables={lootTables} lang={lang} /> : null}
	</div>;
}

function LootTables({ tables, lang }: { tables: Record<string, unknown>[]; lang: Lang }) {
	const prefix = lang === "ru" ? "/ru" : "";
	const kindLabels: Record<string, [string, string]> = {
		creature: ["Loot", "Добыча"], pickpocket: ["Pickpocket", "Карманная кража"],
		skinning: ["Skinning", "Снятие шкур"], vendor: ["Vendor inventory", "Товары продавца"],
		container: ["Container", "Контейнер"], fishing: ["Fishing", "Рыбалка"], other: ["Other", "Другое"],
	};
	return <div className="db-tooltip-loot-tables"><b>{tooltipContentCopy[lang].loot}</b>{tables.map((table) => {
		const entries = Array.isArray(table.entries) ? table.entries as Record<string, unknown>[] : [];
		const kind = String(table.kind ?? "other");
		return <section key={String(table.id)}>
			<header><span>{kindLabels[kind]?.[lang === "ru" ? 1 : 0] ?? kind}</span>{Number(table.difficulty_id ?? 0) > 0 ? <small>{tooltipContentCopy[lang].difficulty} {String(table.difficulty_id)}</small> : null}</header>
			{entries.map((entry) => {
				const icon = verifiedMediaURL(String(entry.icon_url ?? ""));
				const chance = entry.chance_percent === null || entry.chance_percent === undefined ? "" : `${formatGameNumber(Number(entry.chance_percent))}%`;
				const hasQuantity = entry.min_quantity !== null && entry.min_quantity !== undefined && entry.max_quantity !== null && entry.max_quantity !== undefined;
				const min = hasQuantity ? Number(entry.min_quantity) : 0;
				const max = hasQuantity ? Number(entry.max_quantity) : 0;
				const quantity = !hasQuantity || (min === 1 && max === 1) ? "" : min === max ? ` ×${min}` : ` ×${min}–${max}`;
				const content = <>{icon ? <img src={icon} alt="" loading="lazy" /> : <span className="db-loot-icon-fallback" aria-hidden="true">◇</span>}<span><strong>{String(entry.name || `Item #${String(entry.item_external_id)}`)}{quantity}</strong><small>{chance || tooltipContentCopy[lang].dropChanceUnknown}</small></span></>;
				return entry.item_entity_id ? <a key={`${String(table.id)}-${String(entry.index)}`} href={`${prefix}/database/item/${encodeURIComponent(String(entry.item_entity_id))}/${encodeURIComponent(String(entry.item_external_id))}`}>{content}</a> : <span className="db-tooltip-loot-unresolved" key={`${String(table.id)}-${String(entry.index)}`}>{content}</span>;
			})}
		</section>;
	})}</div>;
}

function TooltipProvenance({ block, lang }: { block: Record<string, unknown>; lang: Lang }) {
	const sourceURL = String(block.source_url ?? "");
	const updated = block.updated_at ? new Date(String(block.updated_at)) : null;
	return <div className="db-tooltip-provenance"><span>{tooltipContentCopy[lang].build}: {String(block.build || block.build_number || "—")}</span>{updated && !Number.isNaN(updated.valueOf()) ? <span>{tooltipContentCopy[lang].updated}: {formatAtlasDate(String(block.updated_at), lang)}</span> : null}{sourceURL ? <a href={sourceURL} target="_blank" rel="noreferrer">{tooltipContentCopy[lang].dataSource} ↗</a> : null}</div>;
}

function SpellEffects({ entries, lang }: { entries: Record<string, unknown>[]; lang: Lang }) {
	const meaningful = entries.filter((effect) => Number(effect.base_points ?? 0) !== 0 || Number(effect.coefficient ?? 0) !== 0 || Number(effect.attack_power_coefficient ?? 0) !== 0 || Number(effect.amplitude_ms ?? 0) > 0 || Number(effect.chain_targets ?? 0) > 0 || Number((effect.attributes as Record<string, unknown> | undefined)?.trigger_spell_id ?? 0) > 0);
	if (!meaningful.length) return null;
	return <div className="db-tooltip-spell-effects"><b>{tooltipContentCopy[lang].effectParameters}</b>{meaningful.map((effect, index) => {
		const attributes = (effect.attributes ?? {}) as Record<string, unknown>;
		return <div key={`${String(effect.index)}-${String(effect.difficulty_id)}-${index}`}>
			<span>#{String(Number(effect.index ?? 0) + 1)}</span>
			{Number(effect.base_points ?? 0) !== 0 ? <span>{tooltipContentCopy[lang].base} {formatGameNumber(Number(effect.base_points))}</span> : null}
			{Number(effect.coefficient ?? 0) !== 0 ? <span>SP ×{formatGameNumber(Number(effect.coefficient))}</span> : null}
			{Number(effect.attack_power_coefficient ?? 0) !== 0 ? <span>AP ×{formatGameNumber(Number(effect.attack_power_coefficient))}</span> : null}
			{Number(effect.amplitude_ms ?? 0) > 0 ? <span>{tooltipContentCopy[lang].period} {formatDuration(Number(effect.amplitude_ms), lang)}</span> : null}
			{Number(effect.chain_targets ?? 0) > 0 ? <span>{tooltipContentCopy[lang].targets} {String(effect.chain_targets)}</span> : null}
			{Number(attributes.trigger_spell_id ?? 0) > 0 ? <span>{tooltipContentCopy[lang].triggersSpell} {String(attributes.trigger_spell_id)}</span> : null}
		</div>;
	})}</div>;
}

function SpellTalents({ entries, lang }: { entries: Record<string, unknown>[]; lang: Lang }) {
	const unique = Array.from(new Map(entries.filter((entry) => String(entry.name ?? "")).map((entry) => [String(entry.talent_id), entry])).values());
	if (!unique.length) return null;
	return <div className="db-tooltip-talent-link"><b>{tooltipContentCopy[lang].relatedTalents}</b><span className="db-tooltip-related-inline">{unique.map((entry) => {
		const icon = verifiedMediaURL(String(entry.icon_url ?? ""));
		const relation = String(entry.relationship ?? "grants");
		return <span className="db-tooltip-owner-badge" key={String(entry.talent_id)}>{icon ? <img src={icon} alt="" loading="lazy" /> : null}<span>{String(entry.name)}{relation !== "grants" ? ` (${relation})` : ""}</span></span>;
	})}</span></div>;
}

function TalentSpells({ entries, lang }: { entries: Record<string, unknown>[]; lang: Lang }) {
	if (!entries.length) return null;
	const relationLabels: Record<string, [string, string]> = {
		grants: ["Grants", "Даёт"],
		replaces: ["Replaces", "Заменяет"],
		modifies: ["Modifies", "Изменяет"],
	};
	const localePrefix = lang === "ru" ? "/ru" : "";
	return <div className="db-tooltip-talent-spells"><b>{tooltipContentCopy[lang].relatedSpellsAndEffects}</b>{entries.map((entry) => {
		const relation = String(entry.relationship ?? "grants");
		const icon = verifiedMediaURL(String(entry.icon_url ?? ""));
		const effects = Array.isArray(entry.effects) ? entry.effects as Record<string, unknown>[] : [];
		return <div className="db-tooltip-talent-spell" key={`${relation}-${String(entry.entity_id)}`}>
			<a className="db-tooltip-owner-badge" href={`${localePrefix}/database/spell/${encodeURIComponent(String(entry.entity_id ?? ""))}/${encodeURIComponent(String(entry.external_id ?? "spell"))}`}>
				{icon ? <img src={icon} alt="" loading="lazy" /> : null}<span>{relationLabels[relation]?.[lang === "ru" ? 1 : 0] ?? relation}: {String(entry.name || `Spell #${String(entry.external_id)}`)}</span>
			</a>
			<SpellEffects entries={effects} lang={lang} />
		</div>;
	})}</div>;
}

function TalentInfo({ block, lang }: { block: Record<string, unknown>; lang: Lang }) {
  const appearances = Array.isArray(block.appearances) ? block.appearances as Record<string, unknown>[] : [];
  const specs = Array.from(new Set(appearances.map((appearance) => specializationName(Number(appearance.spec_id ?? 0), lang)).filter(Boolean)));
  const ranks = Number(block.max_ranks ?? 1);
  const talentType = String(block.talent_type ?? "");
  const requiredLevel = Number(block.level_required ?? 0);
  const playerCondition = Number(block.player_condition_id ?? 0);
  const overridesSpell = Number(block.overrides_spell_id ?? 0);
  return <div className="db-tooltip-talent-info">
    <div>{talentType === "pvp" ? tooltipContentCopy[lang].pvpTalent : talentType === "active" ? tooltipContentCopy[lang].activeAbility : tooltipContentCopy[lang].passiveEffect}</div>
    {ranks > 1 ? <div>{tooltipContentCopy[lang].maximumRank}: {ranks}</div> : null}
    {specs.length ? <div>{tooltipContentCopy[lang].specializations}: {specs.join(", ")}</div> : null}
    {requiredLevel > 0 ? <div>{tooltipContentCopy[lang].requiresLevel2}: {requiredLevel}</div> : null}
    {overridesSpell > 0 ? <div>{tooltipContentCopy[lang].replacesSpell}: ID {overridesSpell}</div> : null}
    {playerCondition > 0 ? <div className="db-tooltip-muted">PlayerCondition ID {playerCondition}</div> : null}
  </div>;
}

function className(id: number, lang: Lang) {
  const names: Record<number, [string, string]> = {
    1: ["Warrior", "Воин"], 2: ["Paladin", "Паладин"], 3: ["Hunter", "Охотник"], 4: ["Rogue", "Разбойник"],
    5: ["Priest", "Жрец"], 6: ["Death Knight", "Рыцарь смерти"], 7: ["Shaman", "Шаман"], 8: ["Mage", "Маг"],
    9: ["Warlock", "Чернокнижник"], 10: ["Monk", "Монах"], 11: ["Druid", "Друид"],
    12: ["Demon Hunter", "Охотник на демонов"], 13: ["Evoker", "Пробудитель"],
  };
  return names[id]?.[lang === "ru" ? 1 : 0] ?? "";
}

function specializationName(id: number, lang: Lang) {
  const names: Record<number, [string, string]> = {
    62:["Arcane","Тайная магия"],63:["Fire","Огонь"],64:["Frost","Лед"],65:["Holy","Свет"],66:["Protection","Защита"],70:["Retribution","Воздаяние"],
    71:["Arms","Оружие"],72:["Fury","Неистовство"],73:["Protection","Защита"],102:["Balance","Баланс"],103:["Feral","Сила зверя"],104:["Guardian","Страж"],105:["Restoration","Исцеление"],
    250:["Blood","Кровь"],251:["Frost","Лед"],252:["Unholy","Нечестивость"],253:["Beast Mastery","Повелитель зверей"],254:["Marksmanship","Стрельба"],255:["Survival","Выживание"],
    256:["Discipline","Послушание"],257:["Holy","Свет"],258:["Shadow","Тьма"],259:["Assassination","Ликвидация"],260:["Outlaw","Головорез"],261:["Subtlety","Скрытность"],
    262:["Elemental","Стихии"],263:["Enhancement","Совершенствование"],264:["Restoration","Исцеление"],265:["Affliction","Колдовство"],266:["Demonology","Демонология"],267:["Destruction","Разрушение"],
    268:["Brewmaster","Хмелевар"],269:["Windwalker","Танцующий с ветром"],270:["Mistweaver","Ткач туманов"],577:["Havoc","Истребление"],581:["Vengeance","Месть"],
    1467:["Devastation","Опустошитель"],1468:["Preservation","Хранитель"],1473:["Augmentation","Насыщение"],1480:["Devourer","Пожиратель"],
  };
  return names[id]?.[lang === "ru" ? 1 : 0] ?? "";
}

function TooltipPrice({ buy, sell, lang }: { buy: number; sell: number; lang: Lang }) {
  return <div className="db-tooltip-price">
    {buy > 0 ? <span>{tooltipContentCopy[lang].buyPrice}: {formatQuestMoney(buy, lang)}</span> : null}
    {sell > 0 ? <span>{tooltipContentCopy[lang].sellPrice}: {formatQuestMoney(sell, lang)}</span> : null}
  </div>;
}

function TooltipStats({ entries, lang }: { entries: Record<string, unknown>[]; lang: Lang }) {
  const visible = entries.filter((entry) => Number(entry.id ?? entry.stat_type ?? -1) >= 0 && Number.isFinite(Number(entry.value)));
  if (!visible.length) return null;
  return <div className="db-tooltip-stats">{visible.map((entry, index) => {
    const statID = Number(entry.id ?? entry.stat_type);
    return <div key={`${statID}-${index}`}><span>+{String(entry.value)} {statName(statID, lang)}</span></div>;
  })}</div>;
}

function statName(id: number, lang: Lang) {
  const names: Record<number, [string, string]> = {
    0: ["Mana", "Мана"], 1: ["Health", "Здоровье"], 3: ["Agility", "Ловкость"], 4: ["Strength", "Сила"],
    5: ["Intellect", "Интеллект"], 7: ["Stamina", "Выносливость"], 12: ["Defense", "Защита"],
    13: ["Dodge", "Уклонение"], 14: ["Parry", "Парирование"], 31: ["Hit", "Меткость"],
    32: ["Critical Strike", "Критический удар"], 35: ["Resilience", "Устойчивость"], 36: ["Haste", "Скорость"],
    37: ["Expertise", "Мастерство"], 40: ["Versatility", "Универсальность"], 49: ["Mastery", "Искусность"],
    71: ["Agility / Strength / Intellect", "Ловкость / сила / интеллект"],
    72: ["Agility / Strength", "Ловкость / сила"], 73: ["Agility / Intellect", "Ловкость / интеллект"],
    74: ["Strength / Intellect", "Сила / интеллект"],
  };
  return names[id]?.[lang === "ru" ? 1 : 0] ?? `${tooltipContentCopy[lang].stat} #${id}`;
}

function acquisitionLabel(block: Record<string, unknown>, lang: Lang) {
  const sourceType = String(block.source_type ?? "");
  const name = String(block.name ?? "");
  const location = String(block.location ?? "");
  if (sourceType === "encounter") {
    const prefix = tooltipContentCopy[lang].droppedBy;
		const chance = Number(block.chance_percent ?? 0);
    return `${prefix}${name || `Encounter #${String(block.source_id ?? "")}`}${location ? ` — ${location}` : ""}${chance > 0 ? ` — ${chance}%` : ""}`;
  }
  if (sourceType === "crafting_recipe") return `${tooltipContentCopy[lang].craftedWith}${name || `Spell #${String(block.source_id ?? "")}`}`;
  return tooltipContentCopy[lang].sourceBlizzardApi;
}

function effectPrefix(trigger: number, lang: Lang) {
  const labels: Record<number, [string, string]> = {
    0: ["Use: ", "Использование: "], 1: ["Equip: ", "Если на персонаже: "], 2: ["Chance on hit: ", "Вероятность при попадании: "],
  };
  return labels[trigger]?.[lang === "ru" ? 1 : 0] ?? "";
}

function cleanWowText(value: string, lang: Lang) {
  const scaling = tooltipContentCopy[lang].aScalingAmount;
  return value
    .replace(/\|c[0-9a-f]{8}/gi, "")
    .replace(/\|r/gi, "")
    .replace(/\$@spelldesc(\d+)/gi, "Spell #$1")
    .replace(/\$z\b/g, tooltipContentCopy[lang].yourHomeLocation)
    .replace(/\$\d+s\d+/gi, scaling)
    .replace(/\$s\d+/gi, scaling)
    .replace(/\$w\d+/gi, scaling)
    .replace(/\$d\b/gi, tooltipContentCopy[lang].theListedDuration)
    .replace(/\$t\d+/gi, tooltipContentCopy[lang].theListedInterval)
    .replace(/\$x\d+/gi, tooltipContentCopy[lang].several)
    .replace(/\$\?[^[]+\[/g, "")
    .replace(/\]\[\]/g, "")
    .trim();
}

function formatCastTime(milliseconds: number, lang: Lang) {
  if (milliseconds <= 0) return tooltipContentCopy[lang].instant;
  return `${formatDuration(milliseconds, lang)} ${tooltipContentCopy[lang].cast}`;
}

function formatDuration(milliseconds: number, lang: Lang) {
  const seconds = milliseconds / 1000;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} ${tooltipContentCopy[lang].min}`;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} ${tooltipContentCopy[lang].sec}`;
}

function formatPower(block: Record<string, unknown>, lang: Lang) {
  const amount = Number(block.amount ?? 0);
  const percent = Number(block.percent ?? 0);
  const powerType = Number(block.power_type ?? 0);
  const labels: Record<number, [string, string]> = { 0: ["Mana", "маны"], 1: ["Rage", "ярости"], 2: ["Focus", "концентрации"], 3: ["Energy", "энергии"] };
  const label = labels[powerType]?.[lang === "ru" ? 1 : 0] ?? tooltipContentCopy[lang].resource;
  return `${percent > 0 ? `${formatGameNumber(percent)}%` : formatGameNumber(amount)} ${label}`;
}

function formatGameNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toFixed(4)).toLocaleString("en-US", { maximumFractionDigits: 4, useGrouping: false });
}

function bindingLabel(code: number, lang: Lang) {
  const labels: Record<number, [string, string]> = {
    1: ["Binds when picked up", "Становится персональным при получении"],
    2: ["Binds when equipped", "Становится персональным при надевании"],
    3: ["Binds when used", "Становится персональным при использовании"],
    4: ["Quest Item", "Задание"],
  };
  return labels[code]?.[lang === "ru" ? 1 : 0] ?? "";
}

function requiredSkillLabel(skillID: number, rank: number, lang: Lang) {
  const skills: Record<number, [string, string]> = {
    164: ["Blacksmithing", "Кузнечное дело"], 165: ["Leatherworking", "Кожевничество"],
    171: ["Alchemy", "Алхимия"], 197: ["Tailoring", "Портняжное дело"],
    202: ["Engineering", "Инженерное дело"], 333: ["Enchanting", "Наложение чар"],
    755: ["Jewelcrafting", "Ювелирное дело"], 773: ["Inscription", "Начертание"],
  };
  const name = skills[skillID]?.[lang === "ru" ? 1 : 0] ?? `${tooltipContentCopy[lang].skill2} ${skillID}`;
  return `${tooltipContentCopy[lang].requires} ${name}${rank > 0 ? ` (${rank})` : ""}`;
}

function inventoryTypeLabel(code: number, lang: Lang) {
  const labels: Record<number, [string, string]> = {
    1: ["Head", "Голова"], 2: ["Neck", "Шея"], 3: ["Shoulder", "Плечи"], 5: ["Chest", "Грудь"],
    6: ["Waist", "Пояс"], 7: ["Legs", "Ноги"], 8: ["Feet", "Ступни"], 9: ["Wrist", "Запястья"],
    10: ["Hands", "Кисти рук"], 11: ["Finger", "Палец"], 12: ["Trinket", "Аксессуар"],
    13: ["One-Hand", "Одноручное"], 14: ["Shield", "Щит"], 15: ["Ranged", "Дальний бой"],
    16: ["Back", "Спина"], 17: ["Two-Hand", "Двуручное"], 21: ["Main Hand", "Правая рука"],
    22: ["Off Hand", "Левая рука"], 23: ["Held In Off-hand", "Левая рука"], 26: ["Ranged", "Дальний бой"],
  };
  return labels[code]?.[lang === "ru" ? 1 : 0] ?? tooltipContentCopy[lang].equipment;
}

function subclassLabel(classID: number, subclassID: number, lang: Lang) {
  const armor: Record<number, [string, string]> = { 1: ["Cloth", "Ткань"], 2: ["Leather", "Кожа"], 3: ["Mail", "Кольчуга"], 4: ["Plate", "Латы"], 6: ["Shield", "Щит"] };
  const weapons: Record<number, [string, string]> = {
    0: ["Axe", "Топор"], 1: ["Two-Handed Axe", "Двуручный топор"], 2: ["Bow", "Лук"], 3: ["Gun", "Ружьё"],
    4: ["Mace", "Дробящее"], 5: ["Two-Handed Mace", "Двуручное дробящее"], 6: ["Polearm", "Древковое"],
    7: ["Sword", "Меч"], 8: ["Two-Handed Sword", "Двуручный меч"], 9: ["Warglaive", "Боевой клинок"],
    10: ["Staff", "Посох"], 13: ["Fist Weapon", "Кистевое"], 15: ["Dagger", "Кинжал"], 18: ["Crossbow", "Арбалет"], 19: ["Wand", "Жезл"],
  };
  const label = classID === 4 ? armor[subclassID] : classID === 2 ? weapons[subclassID] : undefined;
  return label?.[lang === "ru" ? 1 : 0] ?? "";
}
