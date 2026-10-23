"use client";

import clsx from "clsx";
import { TierList, type TierListLabels, type TierListProps } from "./valyro-ui/gaming/TierList";
import bridge from "./valyroAtlasBridge.module.css";
import styles from "./AtlasTierBoard.module.css";

const ru: Partial<TierListLabels> = {
  title: "Тир-лист",
  mode: "Режим",
  view: "Просмотр",
  edit: "Свой порядок",
  roleFilter: "Роль",
  allRoles: "Все",
  pool: "Без тира",
  emptyTier: "Перетащите сюда",
  emptyView: "Пусто",
  hint: "Перетаскивайте мышью, долгим нажатием или пробелом и стрелками",
  instructions: "Стрелки переходят между элементами. Пробел поднимает элемент, стрелки двигают его, пробел ставит на место, Escape отменяет.",
  position: (tier, position, total) => `${tier}, ${position} из ${total}`,
  pickedUp: (item, position) => `${item} поднят. ${position}.`,
  dropped: (item, position) => `${item} поставлен. ${position}.`,
  cancelled: (item, position) => `Перемещение отменено. ${item} снова в ${position}.`,
  copyText: "Скопировать текстом",
  copied: "Скопировано",
  copyFailed: "Не удалось скопировать",
  download: "Скачать JSON",
  count: (count) => `${count} шт.`,
};

const en: Partial<TierListLabels> = { edit: "Your order" };

/** Tier board on Valyro's Pro TierList: read the tiers, or drag your own order and export it. */
export function AtlasTierBoard({ locale, className, labels, ...props }: TierListProps & { locale: "en" | "ru" }) {
  return <TierList {...props} labels={{ ...(locale === "ru" ? ru : en), ...labels }} className={clsx(bridge.scope, styles.board, className)} />;
}
