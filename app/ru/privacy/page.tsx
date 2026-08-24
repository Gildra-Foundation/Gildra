import type { Metadata } from "next";
import Link from "next/link";
import { Icons } from "@/components/Icons";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Политика конфиденциальности — Gildra",
  description:
    "Что Gildra хранит в вашем браузере и какие данные собирает сайт.",
  alternates: { languages: { en: "/privacy", ru: "/ru/privacy" } },
};

export default function PrivacyPageRu() {
  return (
    <>
      <Icons />
      <TopNav />
      <div className="app">
        <main className="main">
          <div className="section route-section legal">
            <h1>Политика конфиденциальности</h1>
            <p className="legal-upd">Обновлено: 20 августа 2026</p>

            <h2>Что мы храним в вашем браузере</h2>
            <p>
              Gildra хранит небольшой объём данных в локальном хранилище
              браузера: настройки интерфейса и сам выбор по cookies. Эти данные
              не покидают ваше устройство и никому не передаются.
            </p>

            <h2>Что мы собираем</h2>
            <p>
              Сайт размещён на Vercel, который ведёт стандартные анонимные логи
              запросов (IP-адрес, тип браузера, запрошенная страница) для
              работы и защиты сайта. Gildra также может собирать анонимную
              агрегированную статистику использования — просмотры страниц и
              общие метрики производительности. Ничто из этого не
              идентифицирует вас лично.
            </p>

            <h2>Чего мы не делаем</h2>
            <p>
              Gildra не использует рекламные трекеры, не продаёт и не передаёт
              данные третьим лицам и не требует аккаунта. Если вы отклонили
              cookies, используется только технически необходимое хранилище,
              описанное выше.
            </p>

            <h2>Контакты</h2>
            <p>
              Вопросы по этой политике — откройте issue в репозитории проекта
              или свяжитесь с командой.
            </p>

            <p className="legal-back">
              <Link className="btn-line" href="/ru">
                ← Назад на Gildra
              </Link>
            </p>
          </div>
        </main>
        <Footer lang="ru" />
      </div>
    </>
  );
}
