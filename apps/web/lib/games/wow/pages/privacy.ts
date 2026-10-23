import { definePage } from "@/lib/pages/definePage";
import type { LegalProps } from "@/components/blocks/shared/legal";

const EN: LegalProps = {
  title: "Privacy Policy",
  updated: "Last updated: October 23, 2026",
  sections: [
    {
      heading: "What we store in your browser",
      text: "Gildra keeps a small amount of data in your browser’s local storage: interface preferences and your cookie choice itself. Local interface preferences stay on your device. If you sign in and save talent builds to your account, their names and talent export strings are stored on Gildra servers so you can access them on other devices. Local builds are transferred only when you choose to move them to your account. You can delete saved builds from the list.",
    },
    {
      heading: "What we collect",
      text: "The site runs on Gildra servers at OVHcloud behind Cloudflare; they record standard request logs (IP address, browser type, requested page) to serve and protect the site. Gildra may also collect anonymous, aggregated usage statistics — page views and general performance metrics. None of this identifies you personally.",
    },
    {
      heading: "What we do not do",
      text: "Gildra does not run advertising trackers and does not sell or share data with third parties. An account is not required. If you choose to sign in with Battle.net, a session cookie keeps you signed in and Gildra requests your World of Warcraft profile from Blizzard to show your characters; your password is entered only on Blizzard's site. If you decline cookies, only the technically necessary storage described above is used.",
    },
    {
      heading: "Contact",
      text: "Questions about this policy — open an issue in the project repository or reach out to the team.",
    },
  ],
  backLabel: "← Back to Gildra",
};

const RU: LegalProps = {
  title: "Политика конфиденциальности",
  updated: "Обновлено: 23 октября 2026",
  sections: [
    {
      heading: "Что мы храним в вашем браузере",
      text: "Gildra хранит небольшой объём данных в локальном хранилище браузера: настройки интерфейса и ваш выбор в отношении файлов cookie. Локальные настройки интерфейса остаются на вашем устройстве. Если вы вошли и сохраняете билды талантов в аккаунт, их названия и строки экспорта хранятся на серверах Gildra, чтобы быть доступными с других устройств. Локальные билды переносятся только по вашей команде. Сохранённые билды можно удалить из списка.",
    },
    {
      heading: "Что мы собираем",
      text: "Сайт работает на серверах Gildra в OVHcloud за Cloudflare; они ведут стандартные логи запросов (IP-адрес, тип браузера, запрошенная страница) для работы и защиты сайта. Gildra также может собирать анонимную агрегированную статистику использования — просмотры страниц и общие метрики производительности. Ничто из этого не идентифицирует вас лично.",
    },
    {
      heading: "Чего мы не делаем",
      text: "Gildra не использует рекламные трекеры, не продаёт и не передаёт данные третьим лицам. Аккаунт не обязателен. Если вы входите через Battle.net, сессионный cookie сохраняет вход, а Gildra запрашивает у Blizzard профиль World of Warcraft, чтобы показать ваших персонажей; пароль вводится только на сайте Blizzard. Если вы отклонили файлы cookie, используется только технически необходимое хранилище, описанное выше.",
    },
    {
      heading: "Контакты",
      text: "Вопросы по этой политике — откройте обращение в репозитории проекта или свяжитесь с командой.",
    },
  ],
  backLabel: "← Назад на Gildra",
};

/** Site-wide policy page; rendered with the WoW chrome. */
export const privacyPage = definePage({
  game: "wow",
  path: () => "/privacy",
  meta: ({ lang }) =>
    lang === "ru"
      ? {
          title: "Политика конфиденциальности — Gildra",
          description: "Что Gildra хранит в вашем браузере и какие данные собирает сайт.",
        }
      : {
          title: "Privacy Policy — Gildra",
          description: "What Gildra stores in your browser and which data the site collects.",
        },
  page: ({ lang }) => ({
    id: "wow/privacy",
    game: "wow",
    path: "/privacy",
    layout: "default",
    blocks: [{ type: "legal", props: lang === "ru" ? RU : EN }],
  }),
});
