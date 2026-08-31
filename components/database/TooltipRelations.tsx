import type { ReactNode } from "react";
import type { Lang } from "@/lib/i18n";

export function TooltipOwners({ entries, lang }: { entries: Record<string, unknown>[]; lang: Lang }) {
	const specs = entries.filter((entry) => String(entry.owner_type ?? "") === "specialization" && String(entry.name ?? ""));
	const grouped = new Map<number, { name: string; iconURL: string; specs: Record<string, unknown>[] }>();
	for (const spec of specs) {
		const classID = Number(spec.class_id ?? 0);
		const group = grouped.get(classID) ?? {
			name: String(spec.class_name ?? "") || fallbackClassName(classID, lang),
			iconURL: verifiedMediaURL(String(spec.class_icon_url ?? "")), specs: [],
		};
		if (!group.specs.some((entry) => Number(entry.owner_id) === Number(spec.owner_id))) group.specs.push(spec);
		grouped.set(classID, group);
	}
	const coveredClasses = new Set(grouped.keys());
	const standalone = entries.filter((entry) => {
		const type = String(entry.owner_type ?? "");
		return type !== "specialization" && !(type === "class" && coveredClasses.has(Number(entry.owner_id)));
	});
	if (!grouped.size && !standalone.length) return null;
	return <div className="db-tooltip-ownership">
		<b>{lang === "ru" ? "Класс и специализация" : "Class and specialization"}</b>
		<div className="db-tooltip-owner-paths">
			{Array.from(grouped.entries()).map(([classID, group]) => <div className="db-tooltip-owner-path" key={classID}>
				<OwnerBadge name={group.name || String(classID)} mediaURL={group.iconURL} />
				<span className="db-tooltip-owner-arrow" aria-hidden="true">→</span>
				<div className="db-tooltip-owner-specs">{group.specs.map((spec) => <OwnerBadge key={String(spec.owner_id)} name={String(spec.name)} mediaURL={verifiedMediaURL(String(spec.icon_url ?? ""))} />)}</div>
			</div>)}
			{standalone.map((entry) => <OwnerBadge key={`${String(entry.owner_type)}-${String(entry.owner_id)}`} name={String(entry.name || fallbackClassName(Number(entry.owner_id), lang) || entry.owner_id)} mediaURL={verifiedMediaURL(String(entry.icon_url ?? ""))} />)}
		</div>
	</div>;
}

export function RichDescription({ text, mentions, lang }: { text: string; mentions: Record<string, unknown>[]; lang: Lang }) {
	const normalized = text.toLocaleLowerCase();
	const references = mentions.filter((mention) => String(mention.text ?? "") && normalized.includes(String(mention.text).toLocaleLowerCase()));
	if (!references.length) return <div className="db-tooltip-spell-description">{text}</div>;
	const parts: ReactNode[] = [];
	let offset = 0;
	while (offset < text.length) {
		let selected: Record<string, unknown> | undefined;
		let selectedIndex = text.length;
		for (const reference of references) {
			const index = normalized.indexOf(String(reference.text).toLocaleLowerCase(), offset);
			if (index >= 0 && index < selectedIndex) { selected = reference; selectedIndex = index; }
		}
		if (!selected) { parts.push(text.slice(offset)); break; }
		if (selectedIndex > offset) parts.push(text.slice(offset, selectedIndex));
		const label = text.slice(selectedIndex, selectedIndex + String(selected.text).length);
		const icon = verifiedMediaURL(String(selected.icon_url ?? ""));
		const localePrefix = lang === "ru" ? "/ru" : "";
		parts.push(<a className="db-tooltip-inline-ability" href={`${localePrefix}/database/${encodeURIComponent(String(selected.entity_type ?? "spell"))}/${encodeURIComponent(String(selected.entity_id ?? ""))}/${encodeURIComponent(String(selected.external_id ?? "record"))}`} key={`${String(selected.entity_id)}-${selectedIndex}`}>
			{icon ? <img src={icon} alt="" loading="lazy" /> : null}<span>{label}</span>
		</a>);
		offset = selectedIndex + label.length;
	}
	return <div className="db-tooltip-spell-description">{parts}</div>;
}

function OwnerBadge({ name, mediaURL }: { name: string; mediaURL: string }) {
	return <span className="db-tooltip-owner-badge">{mediaURL ? <img src={mediaURL} alt="" loading="lazy" /> : null}<span>{name}</span></span>;
}

export function verifiedMediaURL(value: string) {
	const candidate = value.trim();
	if (!candidate) return "";
	try {
		const parsed = candidate.startsWith("/") ? new URL(candidate, "https://api.gildra.net") : new URL(candidate);
		const trustedHost = parsed.hostname === "api.gildra.net"
			|| parsed.hostname === "render.worldofwarcraft.com"
			|| parsed.hostname === "wago.tools";
		return parsed.protocol === "https:" && trustedHost
			&& (parsed.hostname !== "api.gildra.net" || /^\/v1\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.pathname))
			&& !parsed.search && !parsed.hash ? candidate : "";
	} catch {
		return "";
	}
}

function fallbackClassName(id: number, lang: Lang) {
	const names: Record<number, [string, string]> = {
		1: ["Warrior", "Воин"], 2: ["Paladin", "Паладин"], 3: ["Hunter", "Охотник"], 4: ["Rogue", "Разбойник"],
		5: ["Priest", "Жрец"], 6: ["Death Knight", "Рыцарь смерти"], 7: ["Shaman", "Шаман"], 8: ["Mage", "Маг"],
		9: ["Warlock", "Чернокнижник"], 10: ["Monk", "Монах"], 11: ["Druid", "Друид"],
		12: ["Demon Hunter", "Охотник на демонов"], 13: ["Evoker", "Пробудитель"],
	};
	return names[id]?.[lang === "ru" ? 1 : 0] ?? "";
}
