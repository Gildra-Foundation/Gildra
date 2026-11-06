import type { ArmorType, FrameFormatId, Pose, TransmogClass, TransmogRace, TransmogSlot } from "@/lib/wow/transmog/model";

type Copy = {
  title: string; lede: string; noJS: string;
  slots: Record<TransmogSlot, string>;
  races: Record<TransmogRace, string>;
  armor: Record<ArmorType | "all", string>;
  formats: Record<FrameFormatId, string>;
  poses: Record<Pose, string>;
  backgrounds: Record<string, string>;
  classes: Record<TransmogClass, string>;
  race: string; gender: string; male: string; female: string; cls: string; anyClass: string;
  randomize: string; variant: (index: number, total: number) => string; prevVariant: string; nextVariant: string; openPicker: string; closePicker: string;
  undo: string; reset: string; share: string; copied: string; copyFailed: string;
  openStudio: string; modelError: string; retry: string; noWebgl: string;
  tabs: { items: string; sets: string; frame: string };
  empty: string; hide: string; show: string; remove: string; hiddenTag: string;
  search: string; searchSets: string;
  worn: string; more: string; loading: string; nothing: string; clearSearch: string; error: string; allClasses: string; classFilter: string;
  pieces: (count: number) => string;
  format: string; background: string; pose: string; light: string; brightness: string; contrast: string; shadow: string;
  file: string; fileType: string; caption: string; captionTitle: string; captionSubtitle: string; mark: string; scale: string;
  download: (format: string) => string; exporting: string; exported: (size: string) => string; exportFailed: string; webpFallback: string;
  zoomIn: string; zoomOut: string; resetCamera: string; pause: string; play: string;
  stage: (name: string) => string;
  slotButton: (slot: string, item: string | null, hidden: boolean) => string;
  searchItemsIn: (slot: string) => string; armorFilter: string; trying: (name: string) => string;
  loadingPart: (percent: number) => string; weight: (mb: number) => string;
  downloadShort: string; downloadWait: string; camera: string; weapons: string;
};

export const transmogCopy: Record<"ru" | "en", Copy> = {
  ru: {
    title: "Трансмогрификация",
    lede: "Оденьте манекен в любые облики и наборы и сохраните кадр.",
    noJS: "Студии нужен JavaScript.",
    slots: { head: "Голова", shoulder: "Плечи", back: "Спина", chest: "Грудь", shirt: "Рубашка", tabard: "Гербовая накидка", wrist: "Запястья", hands: "Кисти рук", waist: "Пояс", legs: "Ноги", feet: "Ступни", "main-hand": "Правая рука", "off-hand": "Левая рука" },
    races: {
      human: "Человек", dwarf: "Дворф", "night-elf": "Ночной эльф", gnome: "Гном", draenei: "Дреней", worgen: "Ворген", "void-elf": "Эльф Бездны",
      "lightforged-draenei": "Озарённый дреней", "dark-iron-dwarf": "Дворф из клана Черного Железа", "kul-tiran": "Култирасец", mechagnome: "Механогном",
      orc: "Орк", undead: "Нежить", tauren: "Таурен", troll: "Тролль", "blood-elf": "Эльф крови", goblin: "Гоблин", nightborne: "Ночнорожденный",
      "highmountain-tauren": "Таурен Крутогорья", "maghar-orc": "Маг'хар", "zandalari-troll": "Зандалар", vulpera: "Вульпера",
      pandaren: "Пандарен", dracthyr: "Драктир", earthen: "Земельник", haranir: "Харанир",
    },
    armor: { all: "Все", plate: "Латы", mail: "Кольчуга", leather: "Кожа", cloth: "Ткань", cosmetic: "Косметика" },
    formats: { "1x1": "1:1", "4x5": "4:5", "9x16": "9:16", og: "1,91:1", "16x9": "16:9" },
    poses: { Stand: "Стойка", Ready1H: "Боевая стойка", Ready2H: "Двуручная стойка", EmoteSalute: "Салют", EmoteFlex: "Мускулы", EmoteRoar: "Рык", EmoteCheer: "Ликование", EmoteKneel: "На колене", EmoteSitGround: "Сидя", EmoteDance: "Танец" },
    backgrounds: { transparent: "Прозрачный", night: "Ночь", parchment: "Пергамент", white: "Светлый", void: "Бездна", dawn: "Рассвет", frost: "Иней", fel: "Скверна", vault: "Хранилище", sanctuary: "Ruby Life Pools", voidscar: "Voidscar Arena", nalorakk: "Den of Nalorakk", kings: "Kings' Rest", blinding: "The Blinding Vale", city: "Город", archive: "Архив", tools: "Мастерская" },
    classes: { warrior: "Воин", paladin: "Паладин", hunter: "Охотник", rogue: "Разбойник", priest: "Жрец", "death-knight": "Рыцарь смерти", shaman: "Шаман", mage: "Маг", warlock: "Чернокнижник", monk: "Монах", druid: "Друид", "demon-hunter": "Охотник на демонов", evoker: "Пробудитель" },
    race: "Раса", gender: "Пол", male: "Мужской", female: "Женский", cls: "Класс", anyClass: "Класс",
    randomize: "Случайный образ", variant: (index, total) => `Вариант ${index} из ${total}`, prevVariant: "Предыдущий вариант", nextVariant: "Следующий вариант", openPicker: "Открыть выбор", closePicker: "Свернуть",
    undo: "Отменить", reset: "Сбросить", share: "Ссылка", copied: "Ссылка на образ скопирована", copyFailed: "Не удалось скопировать — ссылка в адресной строке",
    openStudio: "Открыть 3D-манекен", modelError: "Модель не загрузилась.", retry: "Повторить", noWebgl: "Браузер не поддерживает WebGL — 3D-манекен недоступен. Выбор предметов и ссылка работают.",
    tabs: { items: "Предметы", sets: "Наборы", frame: "Кадр" },
    empty: "Пусто", hide: "Скрыть слот", show: "Показать слот", remove: "Снять", hiddenTag: "скрыт",
    search: "Поиск", searchSets: "Название набора",
    worn: "надето", more: "Показать ещё", loading: "Загружаем…", nothing: "Ничего не нашлось", clearSearch: "Очистить поиск", error: "Не удалось загрузить облики. Попробуйте ещё раз.",
    allClasses: "Все классы", classFilter: "Класс",
    pieces: (count) => `${count} ${plural(count, "часть", "части", "частей")}`,
    format: "Формат", background: "Фон", pose: "Поза", light: "Свет", brightness: "Яркость", contrast: "Контраст", shadow: "Тень под ногами",
    file: "Файл", fileType: "Тип файла", caption: "Подпись", captionTitle: "Название образа", captionSubtitle: "Ник или сервер", mark: "Метка gildra.net", scale: "Размер",
    download: (format) => `Скачать ${format}`, exporting: "Готовим картинку…", exported: (size) => `Сохранено: ${size}`, exportFailed: "Не удалось сохранить картинку. Попробуйте меньший размер.",
    webpFallback: "Браузер не умеет сохранять WebP — сохранили PNG.",
    zoomIn: "Приблизить", zoomOut: "Отдалить", resetCamera: "Вернуть ракурс", pause: "Остановить анимацию", play: "Продолжить анимацию",
    stage: (name) => `Образ на 3D-манекене: ${name}`,
    slotButton: (slot, item, hidden) => `${slot}: ${item ?? "пусто"}${hidden ? ", скрыт" : ""}`,
    searchItemsIn: (slot) => `${slot}: название облика`, armorFilter: "Тип брони",
    trying: (name) => `Примерка: ${name}`,
    loadingPart: (percent) => `Загружаем 3D${percent > 0 && percent < 100 ? ` · ${percent} %` : ""}`,
    weight: (mb) => `≈ ${mb} МБ`,
    downloadShort: "Скачать", downloadWait: "Скачать можно после загрузки 3D",
    camera: "Камера", weapons: "Оружие",
  },
  en: {
    title: "Transmog Studio",
    lede: "Dress the mannequin in any appearance or set and save the picture.",
    noJS: "The studio needs JavaScript.",
    slots: { head: "Head", shoulder: "Shoulders", back: "Back", chest: "Chest", shirt: "Shirt", tabard: "Tabard", wrist: "Wrists", hands: "Hands", waist: "Waist", legs: "Legs", feet: "Feet", "main-hand": "Main hand", "off-hand": "Off hand" },
    races: {
      human: "Human", dwarf: "Dwarf", "night-elf": "Night Elf", gnome: "Gnome", draenei: "Draenei", worgen: "Worgen", "void-elf": "Void Elf",
      "lightforged-draenei": "Lightforged Draenei", "dark-iron-dwarf": "Dark Iron Dwarf", "kul-tiran": "Kul Tiran", mechagnome: "Mechagnome",
      orc: "Orc", undead: "Undead", tauren: "Tauren", troll: "Troll", "blood-elf": "Blood Elf", goblin: "Goblin", nightborne: "Nightborne",
      "highmountain-tauren": "Highmountain Tauren", "maghar-orc": "Mag'har Orc", "zandalari-troll": "Zandalari Troll", vulpera: "Vulpera",
      pandaren: "Pandaren", dracthyr: "Dracthyr", earthen: "Earthen", haranir: "Haranir",
    },
    armor: { all: "All", plate: "Plate", mail: "Mail", leather: "Leather", cloth: "Cloth", cosmetic: "Cosmetic" },
    formats: { "1x1": "1:1", "4x5": "4:5", "9x16": "9:16", og: "1.91:1", "16x9": "16:9" },
    poses: { Stand: "Stand", Ready1H: "Ready", Ready2H: "Two-hand ready", EmoteSalute: "Salute", EmoteFlex: "Flex", EmoteRoar: "Roar", EmoteCheer: "Cheer", EmoteKneel: "Kneel", EmoteSitGround: "Sit", EmoteDance: "Dance" },
    backgrounds: { transparent: "Transparent", night: "Night", parchment: "Parchment", white: "Light", void: "Void", dawn: "Dawn", frost: "Frost", fel: "Fel", vault: "Vault", sanctuary: "Ruby Life Pools", voidscar: "Voidscar Arena", nalorakk: "Den of Nalorakk", kings: "Kings' Rest", blinding: "The Blinding Vale", city: "City", archive: "Archive", tools: "Workshop" },
    classes: { warrior: "Warrior", paladin: "Paladin", hunter: "Hunter", rogue: "Rogue", priest: "Priest", "death-knight": "Death Knight", shaman: "Shaman", mage: "Mage", warlock: "Warlock", monk: "Monk", druid: "Druid", "demon-hunter": "Demon Hunter", evoker: "Evoker" },
    race: "Race", gender: "Body", male: "Male", female: "Female", cls: "Class", anyClass: "Class",
    randomize: "Random outfit", variant: (index, total) => `Variant ${index} of ${total}`, prevVariant: "Previous variant", nextVariant: "Next variant", openPicker: "Open picker", closePicker: "Collapse",
    undo: "Undo", reset: "Reset", share: "Link", copied: "Outfit link copied", copyFailed: "Could not copy — the link is in the address bar",
    openStudio: "Open the 3D mannequin", modelError: "The model did not load.", retry: "Try again", noWebgl: "This browser has no WebGL, so the 3D mannequin is unavailable. Picking items and sharing still work.",
    tabs: { items: "Items", sets: "Sets", frame: "Frame" },
    empty: "Empty", hide: "Hide slot", show: "Show slot", remove: "Remove", hiddenTag: "hidden",
    search: "Search", searchSets: "Set name",
    worn: "worn", more: "Show more", loading: "Loading…", nothing: "Nothing found", clearSearch: "Clear search", error: "Appearances could not be loaded. Please try again.",
    allClasses: "All classes", classFilter: "Class",
    pieces: (count) => `${count} ${count === 1 ? "piece" : "pieces"}`,
    format: "Format", background: "Background", pose: "Pose", light: "Light", brightness: "Brightness", contrast: "Contrast", shadow: "Floor shadow",
    file: "File", fileType: "File type", caption: "Caption", captionTitle: "Outfit name", captionSubtitle: "Name or realm", mark: "gildra.net mark", scale: "Size",
    download: (format) => `Download ${format}`, exporting: "Preparing the picture…", exported: (size) => `Saved: ${size}`, exportFailed: "The picture could not be saved. Try a smaller size.",
    webpFallback: "This browser cannot save WebP, so a PNG was saved.",
    zoomIn: "Zoom in", zoomOut: "Zoom out", resetCamera: "Reset view", pause: "Pause animation", play: "Resume animation",
    stage: (name) => `Outfit on a 3D mannequin: ${name}`,
    slotButton: (slot, item, hidden) => `${slot}: ${item ?? "empty"}${hidden ? ", hidden" : ""}`,
    searchItemsIn: (slot) => `${slot}: appearance name`, armorFilter: "Armor type",
    trying: (name) => `Trying on: ${name}`,
    loadingPart: (percent) => `Loading 3D${percent > 0 && percent < 100 ? ` · ${percent}%` : ""}`,
    weight: (mb) => `≈ ${mb} MB`,
    downloadShort: "Download", downloadWait: "Download is available once 3D has loaded",
    camera: "Camera", weapons: "Weapons",
  },
};

function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10, mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
