import type { TalentLang } from "./talentLocale";
const english: Record<string, string> = {
  "Запрос с другого сайта заблокирован.": "Requests from another site are blocked.",
  "Запрос слишком большой.": "The request is too large.",
  "Некорректный запрос.": "Invalid request.",
  "Сессия Battle.net закончилась. Войдите ещё раз и повторите расчёт.": "Your Battle.net session expired. Sign in again and retry the simulation.",
  "Слишком много расчётов. Подождите минуту.": "Too many simulations. Wait one minute.",
  "Не удалось прочитать персонажа или его билд.": "Unable to read the character or talent build.",
  "SimulationCraft не рассчитывает PvP-бои. Для PvP покажем данные, когда подключим отдельный рейтинговый источник.": "SimulationCraft does not simulate PvP encounters. PvP results require a separate data source.",
  "Тестовый профиль не соответствует выбранной специализации.": "The test profile does not match the selected specialization.",
  "Этот персонаж не найден в подключённом Battle.net-аккаунте.": "This character was not found in the connected Battle.net account.",
  "Активная специализация персонажа изменилась. Обновите страницу.": "Your active specialization changed. Refresh the page.",
  "Battle.net не отдал активный билд персонажа.": "Battle.net did not return the character’s active build.",
  "Для лекарей DPS недостаточно: нужен отдельный расчёт HPS и выживаемости группы. Фальшивую цифру показывать не будем.": "Healers require a separate HPS and group survival simulation; a DPS result is not available.",
  "SimulationCraft сейчас недоступен. Подождите немного и попробуйте снова.": "SimulationCraft is currently unavailable. Wait a moment and try again.",
  "Симулятор вернул повреждённый результат. Ложные проценты показывать не будем.": "The simulator returned an invalid result. No damage percentages are available.",
  "Расчёт остановлен: одна точечная правка дала невозможный скачок урона. Обновите профиль — ложный процент показывать не будем.": "Simulation stopped because a single edit produced an implausible damage change. Refresh your profile and retry.",
  "Результат не принят: снятие очка без замены неожиданно увеличило урон. Это противоречие модели, а не улучшение билда.": "The result was rejected because removing a point unexpectedly increased damage. This indicates a model inconsistency."
};
export function talentSimulationMessage(message: string | undefined, lang: TalentLang): string {
  if (lang === "ru") return message && /[А-Яа-яЁё]/.test(message) ? message : "Расчёт недоступен. Подождите немного и попробуйте снова.";
  return message && english[message] || "Simulation unavailable. Wait a moment and try again.";
}

