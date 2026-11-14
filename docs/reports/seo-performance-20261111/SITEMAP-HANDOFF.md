# Передача sitemap Forever-координатору — 2026-11-11 00:54 UTC

`/tmp/seo-performance-20261111/frozen-patches/sitemap-handoff.patch` содержит прежние правки этой SEO-сессии: 28 маршрутов подземелий из существующего instanceData вместо единственного Hall of Thanes и тест покрытия/наличия EN/RU route files. Патч удалён из активного source diff этой worktree; не применяйте его поверх своей более полной реализации вслепую.

Baseline static sitemap LIVE: 735 unique URLs; missing 27 dungeon guides, 54 localized URLs. Scholomance EN/RU HTTP200 с собственными canonical подтверждён в route-probe.json. До передачи профильные tests32/32PASS. После передачи соответствующий тест больше не входит в активный исходник здесь.

В вашей интеграции сохранить эквивалентное покрытие 28 подземелий вместе с новыми классами/калькуляторами/профессиями. Sitemap/global search edition boundaries принадлежат вам; эта сессия больше их не редактирует. Независимые изменения SEO здесь: homepage/schema brand, analytics host filter, metadata существующих dungeon guides и лабораторные замеры. Никаких новых страниц.
