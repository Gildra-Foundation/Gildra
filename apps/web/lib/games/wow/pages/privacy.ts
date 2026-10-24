import { definePage } from "@/lib/pages/definePage";
import type { LegalProps } from "@/components/blocks/shared/legal";

const EN: LegalProps = {
  title: "Privacy Policy",
  updated: "Last updated: October 19, 2026",
  sections: [
    {
      heading: "What we store in your browser",
      text: "Gildra keeps a small amount of data in your browser’s local storage: interface preferences, your cookie choice, dungeon progress and personal route notes. Route notes stay on this device and are not included in shared links. Talent builds are also cached locally; when you sign in and save them to your character library, they are synchronized with Gildra’s server.",
    },
    {
      heading: "What we collect",
      text: "The site runs on Gildra servers at OVHcloud behind Cloudflare; they record standard request logs (IP address, browser type, requested page) to serve and protect the site. Gildra may also collect anonymous, aggregated usage statistics — page views and general performance metrics. Request logs can contain your IP address.",
    },
    {
      heading: "What we do not do",
      text: "Gildra does not run advertising trackers and does not sell your data. Hosting and protection providers process the request data needed to operate the site. An account is not required. If you choose to sign in with Battle.net, a session cookie keeps you signed in and Gildra requests your World of Warcraft profile from Blizzard to show your characters; your password is entered only on Blizzard's site. If you decline cookies, only the technically necessary storage described above is used.",
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
  updated: "Обновлено: 19 октября 2026",
  sections: [
    {
      heading: "Что мы храним в вашем браузере",
      text: "Gildra хранит небольшой объём данных в локальном хранилище браузера: настройки интерфейса, выбор файлов cookie, отметки прохождения и личные заметки к маршрутам. Заметки остаются на устройстве и не включаются в ссылки. Билды талантов также сохраняются локально; после входа и сохранения в библиотеку персонажа они синхронизируются с сервером Gildra.",
    },
    {
      heading: "Что мы собираем",
      text: "Сайт работает на серверах Gildra в OVHcloud за Cloudflare; они ведут стандартные логи запросов (IP-адрес, тип браузера, запрошенная страница) для работы и защиты сайта. Gildra также может собирать анонимную агрегированную статистику использования — просмотры страниц и общие метрики производительности. Журналы запросов могут содержать ваш IP-адрес.",
    },
    {
      heading: "Чего мы не делаем",
      text: "Gildra не использует рекламные трекеры, не продаёт ваши данные. Провайдеры хостинга и защиты обрабатывают сведения о запросах, необходимые для работы сайта. Аккаунт не обязателен. Если вы входите через Battle.net, сессионный cookie сохраняет вход, а Gildra запрашивает у Blizzard профиль World of Warcraft, чтобы показать ваших персонажей; пароль вводится только на сайте Blizzard. Если вы отклонили файлы cookie, используется только технически необходимое хранилище, описанное выше.",
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
