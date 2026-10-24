# MVP на staging — 19 октября 2026

Развёрнуто по явному запросу владельца. Стенд остаётся работающим:
https://staging.gildra.net/ru · https://staging.gildra.net/

[Все 76 опубликованных страниц RU/EN](PAGES.md). Сценарий настоящего входа Battle.net пока не пройден; см. [что нужно от владельца](../staging-auth.md).

## Что работает и проверено

- 76/76 опубликованных страниц через публичный HTTPS: 200, корректный TLS, noindex и private/no-store. DNS подтверждён Cloudflare и Google. Первоначальный отрицательный кеш DNS исчез; обычный curl также возвращает 200.
- 48 браузерных проверок RU/EN × 320/390/768/1440: ошибок JavaScript, горизонтального переполнения и сломанных изображений нет. Скриншоты в этом каталоге; они сняты с публичного домена без подмены DNS или отключения TLS.
- 12 реальных browser refresh для шести рейтингов RU/EN: 27 DPS, 6 танков, 7 лекарей в каждой активности. Проверенный снимок Midnight Season 2, 80 записей, получен 19 октября около 11:02 UTC. Исходные даты сохранены. Снимок не обновляется планировщиком на staging; после 36 часов интерфейс показывает устаревание.
- Проверены переход между подземельями, независимые личные заметки, «Назад», регион и честное состояние неподтверждённого босса недели.
- 8 внешних проверок границ: анонимная сессия не выдаёт токен; workspace требует вход; cross-site запись запрещена; неразрешённые записи через /v1 и служебные GET не уходят в production; robots запрещает обход.
- Новый staging gateway test PASS: private headers/cookies отбрасываются, только GET/HEAD разрешённых каталоговых путей достигают upstream. Пакеты characterworkspace/gamemeta PASS; их прежние SQL/браузерные проверки описаны в основном отчёте.
- Четыре staging-контейнера healthy, 0 рестартов за 10+ минут. Staging backup успешно восстановлен во временную БД: 80 tier entries, 0 workspace documents; временная БД удалена.

## Развёрнутые артефакты

- Web `sha256:18090d52455e0ef6b661d78f20700e537d9ac5b2f0040be2f67319b34712480b`, ранее проверенный MVP. Аналитика/Sentry отключены в сборке; для production нужен отдельный release pipeline.
- Staging API `sha256:1b58a5053d6b24283a09071e73dd0ece6aa8cb2495f462422318cd2c21ba73e1`: реальные release handlers gamemeta/characterworkspace и Battle.net verifier; отдельная команда без production workers/ClickHouse/Redis. Каталог читает публичный API через GET/HEAD allowlist, без авторизации и cookies.
- PostgreSQL использует отдельный volume `gildra-staging_mvp-postgres`; исходные migration DDL 00004/5/6/10/14/170/171. Полный каталог и прочие backend-подсистемы не клонировались. Ведомость миграций и исходников сохранена.
- Управление: `/opt/gildra-staging/compose.mvp.yml` + `mvp.env`; canonical `compose.yml/current.env` также описывают MVP. Старый web-only deploy helper не применять: ему не хватает нового API image reference. Не удалять volume при обновлении/откате.
- Web/API/PG находятся только в staging network. Отдельный relay связан с existing edge network. Host-порт 3200 только loopback, у API/PG host-портов нет.
- Добавлены только два staging virtual hosts в live `/opt/gildra/infra/nginx/prod.conf`; прежняя конфигурация, включая выпущенные CMS routes, сохранена побайтно. После освобождения claims владельцем CMS: isolated nginx -t, live nginx -t, graceful reload. Сам nginx и production приложения этой задачей не пересоздавались.
- DNS: proxied A `staging.gildra.net` → 51.68.180.93, TTL auto; record ID `31e5d7e53e1a556a28090c44af32f1fa`, zone `7ee0e648c515cfbdffbcae252c22a67b`. SSL Full (strict), существующий wildcard certificate. Новый HTTPS host принимает только 22 официальных Cloudflare ranges; прямой origin 403, через Cloudflare 200.

## Battle.net: действие владельца

Ключи основного сайта уже присутствуют на сервере; проверено только наличие. На staging они пока не скопированы. Отдельный AUTH_SECRET уже создан; `/opt/gildra-staging/auth.env` принадлежит root, права 0600.

1. В существующем приложении Gildra на Battle.net Developer Portal добавить **дополнительный** Redirect URI `https://staging.gildra.net/api/auth/callback/battlenet`. Сохранить callback основного сайта.
2. Подтвердить «callback добавлен» и регион (EU/US/KR/TW). После этого подключить имеющиеся ключи на сервере без пересылки в чат и пересоздать только web-staging. Либо владелец может создать отдельный OAuth client и безопасно внести его ключи через sudoedit в auth.env.
3. Владелец сам проходит вход/2FA и разрешение `openid wow.profile`, выбирает персонажа. Проверить профиль, экипировку, таланты, создание/переименование/сохранение/удаление билда, выход и повторный вход.
4. Второй браузер/устройство того же аккаунта: сохранение, конфликт двух правок и удаление. Публичную ссылку открыть без входа. Для живой проверки изоляции нужен второй Battle.net аккаунт; сейчас эта часть подтверждена только контрактными тестами.

Пароль Battle.net, одноразовые коды и секрет приложения в чат не присылать. Окончательная готовность production релиза остаётся открытой до настоящего OAuth/двух устройств и отдельного production preflight/команды владельца.

## Откат

Резервные файлы: `/opt/gildra-staging/backups/pre-mvp-20261019/` (root-only). Там прежние compose/current.env, конфигурация nginx до добавления staging и проверенная начальная staging DB копия. Новые пользовательские данные не восстанавливать поверх старой копией.

После новых claims и проверки drift:

1. Остановить только staging web/relay/API при необходимости; PostgreSQL volume сохранить. Вернуть прежние compose/current.env и image `gildra-web:motion-design-20261019-7357c61`, поднять только прежний web-staging.
2. Из текущего live nginx удалить **точно добавленный** блок `infra/staging/public-server.conf`, сохраняя любые последующие чужие изменения. `nginx -t`, затем graceful reload; не подменять весь файл старым backup при drift.
3. Удалить только новый DNS record ID выше, если публичный staging больше не нужен. Основные DNS records не менять.

Устаревший web-only стенд не предоставляет независимый workspace. Для возвращения MVP использовать сохранённые текущие compose/env/images. Не выполнять `down -v` и не запускать entrypoint полного production API на staging.

## Следы проверки

`operation.json` / `plan.json` — gate ALLOWED в пределах текущего запроса;
`runtime.json`, `nginx-change.json`, `dns-change.json`, `migrations.json`;
`public-pages.json`, `responsive-matrix.json`, `public-browser-tiers.json`,
`browser-navigation.json`, `public-boundaries.json`, скриншоты и source manifest.

Commit/push и production выпуск MVP не выполнялись. CMS одновременно выпущена её отдельным владельцем; её новые конфигурация и образы сохранены.
