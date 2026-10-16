/** Fixed public transport/service messages; upstream error text is never displayed. */
export function auctionGearServiceMessage(error: string, ru: boolean): string | undefined {
  const messages: Record<string, [string, string]> = {
    market_busy: ["Сервис аукциона занят. Подождите немного и повторите поиск.", "The auction market service is busy. Wait briefly and try again."],
    market_rate_limited: ["Сервис аукциона ограничил запросы. Подождите минуту и повторите поиск.", "The auction market service is rate limited. Wait a minute and try again."],
    market_unavailable: ["Не удалось загрузить рынок аукциона. Повторите позже.", "The auction market could not be loaded. Try again later."],
    invalid_market_response: ["Сервис аукциона вернул неполные данные. Повторите поиск после обновления рынка.", "The auction market returned incomplete data. Retry after its next update."],
    market_response_too_large: ["Снимок рынка аукциона слишком велик для обработки. Повторите позже.", "The auction market snapshot is too large to process. Try again later."],
    market_region_unsupported: ["Рынок аукциона этого региона пока недоступен.", "The auction market for this region is unavailable."],
    connected_realm_unresolved: ["Не удалось определить аукцион связанного сервера персонажа. Повторите позже.", "Your character's connected-realm auction market could not be identified. Try again later."],
    plan_reconnecting: ["Связь с расчётом прервалась. Подключаемся к той же задаче повторно…", "The calculation connection was interrupted. Reconnecting to the same job…"],
    plan_connection_interrupted: ["Не удалось восстановить связь с расчётом. Повторите подключение; новая задача не создаётся.", "The calculation connection could not be restored. Reconnect to the existing job; this does not create a new calculation."],
    recovery_expired: ["Предыдущий поиск устарел или больше недоступен. Запустите новый поиск.", "The previous search has expired or is no longer available. Start a new search."],
  };
  return messages[error]?.[ru ? 0 : 1];
}
