export const talentImportCopy = {
  ru: {
    label: "Импорт билда талантов", placeholder: "Вставьте строку экспорта из игры", help: "Скопируйте строку вашего билда из игрового окна талантов. Класс, специализация и роль определятся автоматически.",
    apply: "Импортировать", clear: "Удалить импорт", none: "Без импорта показаны варианты способностей спека с условиями талантов.",
    applied: "Билд применён", active: "Показаны только взятые таланты и базовые способности. Условия питомца и формы остаются в подсказках.",
    hashless: "Для этого кода нельзя проверить версию дерева талантов. Используйте свежий экспорт из игры.",
    savedInvalid: "Сохранённый билд нельзя применить к текущему дереву. Пока доступны только базовые способности; импортируйте свежую строку.",
    unchanged: "Текущий выбор не изменён.",
    errors: { invalid: "Строка повреждена или обрезана. Вставьте полный код экспорта.", version: "Этот формат экспорта не поддерживается. Скопируйте код из актуальной версии игры.", spec: "Специализация этой строки не поддерживается.", tree: "Дерево талантов в коде отличается от текущего. Скопируйте свежий экспорт из игры." },
  },
  en: {
    label: "Import talent build", placeholder: "Paste your in-game export string", help: "Copy your build string from the in-game talent window. Class, specialization and role are detected automatically.",
    apply: "Import build", clear: "Remove import", none: "Without an import, specialization options are shown with their talent requirements.",
    applied: "Build applied", active: "Only selected talents and baseline abilities are shown. Pet and form requirements remain in the tooltips.",
    hashless: "This code does not identify its talent tree version. Use a fresh in-game export.",
    savedInvalid: "The saved build cannot be applied to the current tree. Only baseline abilities are available until you import a fresh string.",
    unchanged: "Your current selection has not changed.",
    errors: { invalid: "This string is damaged or truncated. Paste the complete export code.", version: "This export format is not supported. Copy a code from the current game version.", spec: "The specialization in this string is not supported.", tree: "The code uses a different talent tree. Copy a fresh in-game export." },
  },
} as const;
