# Auction resume ownership cache audit — 2026-11-13

Статус: proposal для root, продуктовый патч НЕ применён. Исследован рабочий checkout на HEAD `e3cc7e82f4d2171b8a5cf3fc775640236c49c769`, содержащий параллельные незакоммиченные изменения. Единственный записанный файл этой задачи — этот отчёт. Build/browser, сервисы и старые задачи не перезапускались.

## Причина и путь исполнения

- `apps/web/lib/wow/battleNetCharacters.ts:64`: `getBattleNetCharacters` возвращает копию массива из module-level Map до вызова транспорта. TTL — 60 000 мс, ключ — SHA-256 токена + locale + регион. Копируется массив, но свежесть владения не проверяется.
- `getBattleNetCharacterBySlug` (:133) определяет регион из slug и вызывает этот кэширующий getter. Флага принудительного чтения upstream нет.
- `apps/web/lib/wow/auctionGearRunner.ts:362`: `verifyAuctionGearSearch` при `verifyOwnership=true` вызывает getter, затем сравнивает id, realm.slug и region. Старый roster удовлетворяет всем сравнениям даже после исчезновения персонажа из аккаунта. Последующие snapshot/market запросы не доказывают текущее владение.
- `cache: "no-store"` уже присутствует у fetch `/profile/user/wow`, но не обходится предшествующий ему Map. Это разные уровни кэширования.
- Проверка вызывается из `app/api/wow/auction-gear-plans/route.ts:209` и из `lib/wow/auctionGearWork.ts:27` при восстановлении работы. Исправление общего verifier покрывает оба пути, включая сборку существующего поиска. Маршрут и Work менять не требуется.

## Подтверждение ошибки

Исходный сохранённый прогон `.artifacts/logs/auction-api-head-baseline-20261113-191832.log` содержит `Missing expected rejection: ownership disappeared`, `test-auction-gear-api.mjs:230`, expected `/character_not_found/`.

Тест (:164–230) использует реальный verifier и roster getter с синтетическим HTTP. Два успешных verify прогревают один ключ tokenA/ru/eu, затем `ownedCharacter = null`. Третий verify обязан отклониться, но получает предыдущий объект из Map. Следующий кейс `ownership identity changed` подвержен той же ошибке. Это корректная регрессия; нельзя лечить её ожиданием TTL, новым токеном, очисткой Map в тесте, выключением verifyOwnership или ослаблением assert.rejects.

Дополнительно выполнен лёгкий изолированный эксперимент Node 22.23.2 без записи файлов: исходный `battleNetCharacters.ts` прочитан, удалён только `import "server-only"`, TypeScript преобразован через `node:module.stripTypeScriptTypes({mode:"transform"})`, модуль загружен через data URL. Только глобальный fetch заменён синтетическим roster. Два одинаковых lookup дали один HTTP-вызов; после удаления персонажа следующий lookup вернул старый id. Для второго, отдельного module instance применены нижеописанные изменения исключительно к строке исходника в памяти. Результат:

```text
CURRENT source: stale ownership reproduced (1 upstream call)
PROPOSED in-memory patch: fresh absence, default cache preserved, upstream error and abort PASS
```

Проверено: свежий lookup после удаления вернул undefined и сделал второй HTTP-вызов; обычный lookup продолжил использовать прежний Map без дополнительного HTTP; ответ 503 свежей проверки отклонился без stale fallback; заранее отменённый signal отклонился AbortError без HTTP. Это проверка механизма roster, НЕ полный прогон API-suite или доказательство успешной интеграции Runner. Первоначальная попытка эксперимента через локальный TypeScript package не запустилась (модуль отсутствует); успешный прогон использовал встроенный Node transformer.

## Минимальный предлагаемый патч

Предпочтение: явный `cache: "no-store"` только для проверки владения resume. Он не читает и не записывает shared roster cache. Благодаря отсутствию записи свежая проверка не меняет поведение остальных потребителей и не требует решения гонок между параллельными cache-fill и refresh. Сам результат свежего запроса используется непосредственно для авторизации, без повторного чтения Map.

```diff
--- a/apps/web/lib/wow/battleNetCharacters.ts
+++ b/apps/web/lib/wow/battleNetCharacters.ts
@@
-export async function getBattleNetCharacters(accessToken: string, locale: "en" | "ru", onlyRegion?: BattleNetRegion, signal?: AbortSignal): Promise<BattleNetCharacter[]> {
+export async function getBattleNetCharacters(accessToken: string, locale: "en" | "ru", onlyRegion?: BattleNetRegion, signal?: AbortSignal, options?: { cache?: "default" | "no-store" }): Promise<BattleNetCharacter[]> {
   signal?.throwIfAborted();
+  if (options?.cache === "no-store") return fetchBattleNetCharacters(accessToken, locale, onlyRegion, signal);
   const key = rosterKey(accessToken, locale, onlyRegion);
@@
-export async function getBattleNetCharacterBySlug(accessToken: string, locale: "en" | "ru", slug: string, signal?: AbortSignal): Promise<BattleNetCharacter | undefined> {
+export async function getBattleNetCharacterBySlug(accessToken: string, locale: "en" | "ru", slug: string, signal?: AbortSignal, options?: { cache?: "default" | "no-store" }): Promise<BattleNetCharacter | undefined> {
@@
     isBattleNetRegion(requestedRegion) ? requestedRegion : undefined,
     signal,
+    options,
   );
--- a/apps/web/lib/wow/auctionGearRunner.ts
+++ b/apps/web/lib/wow/auctionGearRunner.ts
@@
   if (verifyOwnership) {
-    const owned = await getBattleNetCharacterBySlug(token, context.input.locale, context.input.characterSlug, signal);
+    const owned = await getBattleNetCharacterBySlug(token, context.input.locale, context.input.characterSlug, signal, { cache: "no-store" });
```

Это targeted diff: root должен применять его к актуальному Runner с сохранением параллельных изменений. Не заменять все вызовы getter в Runner: initial search (:59, :287 на момент исследования) вне ограниченной задачи. `verifyOwnership=false` остаётся внутренним прежним контрактом; HTTP-пути используют default true. Не добавлять управление этим флагом из тела клиентского запроса.

Область продуктовых изменений: только `battleNetCharacters.ts` и одна строка `auctionGearRunner.ts`. TTL, лимит Map, ключ, обработка ошибок/регионов, signal и остальные callers сохраняются. Дополнительная стоимость — один реальный региональный roster fetch на verify (существующий timeout 15 секунд при переданном signal). Нет stale fallback при 401/403/429/503, и успешный пустой roster даёт undefined → character_not_found. Свежесть ограничена ответом upstream на момент проверки; это не гарантия против изменения владения после ответа.

## Проверки для интеграции root

1. Сохранить существующий `ownership disappeared` и `ownership identity changed` без изменений. Из `apps/web` выполнить:
   `node --experimental-strip-types --no-warnings --import ./tests/auction/resolve.mjs scripts/test-auction-gear-api.mjs`.
2. В том же тесте добавить счётчик roster HTTP-вызовов и проверить, что каждый verify с default ownership вызывает `/profile/user/wow`, в том числе сразу после прогрева обычным getter. При отказе ownership snapshot/market не должны запрашиваться. Проверить отсутствие и замену id отдельно.
3. Добавить небольшой тест getter с тем же token/locale/region: два обычных lookup → один HTTP; no-store → ещё один HTTP и свежий результат; следующий обычный lookup → без HTTP (старый Map оставлен намеренно). Проверить обе локали и региональное разделение, не вводя реальные сетевые запросы.
4. На прогретом Map свежий 503/401 должен отклоняться; AbortError должен распространяться, без fallback. Существующий API-тест (:248+) блокирует `/profile/user/wow` и equipment и проверяет DELETE cancellation/освобождение очереди — сохранить его: обход кэша позволяет ownership-ветке действительно дойти до транспорта.
5. Прогнать существующий discovery тест, использующий verifyOwnership=false, и штатную проверку типов после интеграции. Полный API-suite здесь намеренно не запускался во время финальных build/browser; его успех после патча ещё не заявлен.

Не включать в этот фикс глобальное отключение кэша, изменение TTL, исправления других endpoints или обновление cache после свежей авторизации. Обычные roster/character UI и simulation/candidates/optimizer потребители продолжают прежнюю политику; отдельный аудит их требований к свежести выходит за границы задачи.
