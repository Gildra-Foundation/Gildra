import type { TalentLang } from "./talentLocale";

/** Short player-facing text for the talent simulation errors (the API answers in Russian). */
const messages: Record<string, { ru: string; en: string }> = {
  "Сессия Battle.net закончилась. Войдите ещё раз и повторите расчёт.": { ru: "Войдите в Battle.net повторно.", en: "Sign in to Battle.net again." },
  "Слишком много расчётов. Подождите минуту.": { ru: "Слишком много расчётов. Подождите минуту.", en: "Too many simulations. Wait a minute." },
  "SimulationCraft не рассчитывает PvP-бои. Для PvP покажем данные, когда подключим отдельный рейтинговый источник.": { ru: "PvP-бои не рассчитываются.", en: "PvP encounters are not simulated." },
  "Этот персонаж не найден в подключённом Battle.net-аккаунте.": { ru: "Персонаж не найден в аккаунте Battle.net.", en: "Character not found in your Battle.net account." },
  "Активная специализация персонажа изменилась. Обновите страницу.": { ru: "Специализация изменилась. Обновите страницу.", en: "Your specialization changed. Refresh the page." },
  "Battle.net не отдал активный билд персонажа.": { ru: "Battle.net не отдал активный билд.", en: "Battle.net did not return the active build." },
  "Для лекарей DPS недостаточно: нужен отдельный расчёт HPS и выживаемости группы. Фальшивую цифру показывать не будем.": { ru: "Для лекарей расчёт урона недоступен.", en: "Damage simulation is not available for healers." },
};
const fallback = { ru: "Расчёт недоступен. Попробуйте позже.", en: "Simulation unavailable. Try again later." };

export function talentSimulationMessage(message: string | undefined, lang: TalentLang): string {
  return (message && messages[message] || fallback)[lang];
}
