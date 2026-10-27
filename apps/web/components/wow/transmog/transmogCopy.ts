import type { ArmorType, FrameFormatId, Pose, TransmogRace, TransmogSlot } from "@/lib/wow/transmog/model";

type Copy = {
  title: string; eyebrow: string; lede: string; noJS: string;
  slots: Record<TransmogSlot, string>;
  /** Labels short enough for an empty 52 px slot. */
  slotShort: Partial<Record<TransmogSlot, string>>;
  races: Record<TransmogRace, string>;
  armor: Record<ArmorType | "all", string>;
  formats: Record<FrameFormatId, { label: string; note: string }>;
  poses: Record<Pose, string>;
  backgrounds: Record<string, string>;
  classes: Record<string, string>;
  qualities: string[];
  race: string; gender: string; male: string; female: string;
  undo: string; reset: string; share: string; copied: string; copyFailed: string;
  openStudio: string; openHint: (mb: number) => string; loadingModel: string; modelError: string; retry: string; noWebgl: string;
  tabs: { items: string; sets: string; frame: string };
  slotPanel: (slot: string) => string; current: string; empty: string; hide: string; show: string; remove: string; hiddenTag: string;
  search: string; searchItems: string; searchSets: string; results: (count: number) => string; shared: (count: number) => string;
  worn: string; more: string; loading: string; nothing: string; error: string; wear: string; wearHint: string; allClasses: string; classFilter: string;
  pieces: (count: number) => string; setResults: (count: number) => string;
  format: string; background: string; pose: string; light: string; brightness: string; contrast: string; shadow: string;
  fileType: string; caption: string; captionTitle: string; captionSubtitle: string; mark: string; scale: string;
  download: (format: string) => string; exporting: string; exported: (size: string, kb: number) => string; exportFailed: string; webpFallback: string;
  exportNote: string;
  rotateLeft: string; rotateRight: string; zoomIn: string; zoomOut: string; resetCamera: string; pause: string; play: string;
  stage: (name: string) => string; frameLabel: (label: string, size: string) => string; transparent: string; sources: string; sourcesBody: string;
  slotButton: (slot: string, item: string | null, hidden: boolean) => string;
  searchItemsIn: (slot: string) => string; armorFilter: string; hoverTip: string; trying: (name: string) => string;
  loadingPart: (percent: number, mb: number) => string; slowNetwork: (mb: number) => string; previewNote: string;
  downloadShort: string; downloadWait: string; keys: string; camera: string; weapons: string;
};

export const transmogCopy: Record<"ru" | "en", Copy> = {
  ru: {
    title: "Трансмогрификация", eyebrow: "World of Warcraft · Инструменты",
    lede: "Соберите образ из любых обликов и наборов, примерьте на нужную расу и скачайте кадр для соцсетей — на прозрачном фоне, цвете или сцене.",
    noJS: "Для студии трансмогрификации включите JavaScript.",
    slots: { head: "Голова", shoulder: "Плечи", back: "Спина", chest: "Грудь", shirt: "Рубашка", tabard: "Гербовая накидка", wrist: "Запястья", hands: "Кисти рук", waist: "Пояс", legs: "Ноги", feet: "Ступни", "main-hand": "Правая рука", "off-hand": "Левая рука" },
    slotShort: { tabard: "Накидка", "main-hand": "Пр. рука", "off-hand": "Лев. рука", hands: "Руки" },
    races: { human: "Человек", orc: "Орк", dwarf: "Дворф", "night-elf": "Ночной эльф", undead: "Нежить", tauren: "Таурен", gnome: "Гном", troll: "Тролль", goblin: "Гоблин", "blood-elf": "Эльф крови", draenei: "Дреней" },
    armor: { all: "Все", plate: "Латы", mail: "Кольчуга", leather: "Кожа", cloth: "Ткань", cosmetic: "Косметика" },
    formats: { "1x1": { label: "1:1", note: "пост" }, "4x5": { label: "4:5", note: "лента" }, "9x16": { label: "9:16", note: "сторис" }, og: { label: "1,91:1", note: "превью ссылки" }, "16x9": { label: "16:9", note: "экран" } },
    poses: { Stand: "Стойка", Ready1H: "Боевая стойка", Ready2H: "Двуручная стойка", EmoteSalute: "Салют", EmoteFlex: "Мускулы", EmoteRoar: "Рык", EmoteCheer: "Ликование", EmoteKneel: "На колене", EmoteSitGround: "Сидя", EmoteDance: "Танец" },
    backgrounds: { transparent: "Прозрачный", night: "Ночь", parchment: "Пергамент", white: "Светлый", void: "Бездна", dawn: "Рассвет", frost: "Иней", fel: "Скверна", vault: "Хранилище", sanctuary: "Ruby Life Pools", voidscar: "Voidscar Arena", nalorakk: "Den of Nalorakk", kings: "Kings' Rest", blinding: "The Blinding Vale", city: "Город", archive: "Архив", tools: "Мастерская" },
    classes: { warrior: "Воин", paladin: "Паладин", hunter: "Охотник", rogue: "Разбойник", priest: "Жрец", "death-knight": "Рыцарь смерти", shaman: "Шаман", mage: "Маг", warlock: "Чернокнижник", monk: "Монах", druid: "Друид", "demon-hunter": "Охотник на демонов", evoker: "Пробудитель" },
    qualities: ["Низкое", "Обычное", "Необычное", "Редкое", "Эпическое", "Легендарное", "Артефакт", "Наследуемое"],
    race: "Раса", gender: "Пол", male: "Мужской", female: "Женский",
    undo: "Отменить", reset: "Сбросить", share: "Ссылка", copied: "Ссылка на образ скопирована", copyFailed: "Не удалось скопировать — ссылка в адресной строке",
    openStudio: "Открыть 3D-манекен", openHint: (mb) => `Первая загрузка — около ${mb} МБ, потом смена предметов быстрая`,
    loadingModel: "Загружаем манекен", modelError: "Модель не загрузилась.", retry: "Повторить", noWebgl: "Браузер не поддерживает WebGL — 3D-манекен недоступен. Выбор предметов и ссылка работают.",
    tabs: { items: "Предметы", sets: "Наборы", frame: "Кадр" },
    slotPanel: (slot) => `Облики: ${slot}`, current: "Сейчас", empty: "Пусто", hide: "Скрыть слот", show: "Показать слот", remove: "Снять", hiddenTag: "скрыт",
    search: "Поиск", searchItems: "Название предмета", searchSets: "Название набора", results: (count) => `${count.toLocaleString("ru-RU")} ${plural(count, "облик", "облика", "обликов")}`,
    shared: (count) => `${count} ${plural(count, "предмет", "предмета", "предметов")} с этим обликом`,
    worn: "надето", more: "Показать ещё", loading: "Загружаем…", nothing: "Ничего не нашлось. Попробуйте другое слово.", error: "Не удалось загрузить облики. Попробуйте ещё раз.",
    wear: "Надеть набор", wearHint: "Набор заменит только свои слоты.", allClasses: "Все классы", classFilter: "Класс",
    pieces: (count) => `${count} ${plural(count, "часть", "части", "частей")}`,
    setResults: (count) => `${count.toLocaleString("ru-RU")} ${plural(count, "набор", "набора", "наборов")}`,
    format: "Формат", background: "Фон", pose: "Поза", light: "Свет", brightness: "Яркость", contrast: "Контраст", shadow: "Тень под ногами",
    fileType: "Формат файла", caption: "Подпись", captionTitle: "Название образа", captionSubtitle: "Ник или сервер", mark: "Метка gildra.net", scale: "Размер",
    download: (format) => `Скачать ${format}`, exporting: "Готовим картинку…", exported: (size, kb) => `Готово: ${size}, ${kb} КБ`, exportFailed: "Не удалось сохранить картинку. Попробуйте меньший размер.",
    webpFallback: "Браузер не умеет сохранять WebP — сохранили PNG.",
    exportNote: "Картинка собирается в браузере: текстуры идут через gildra.net, сторонних водяных знаков нет.",
    rotateLeft: "Повернуть влево", rotateRight: "Повернуть вправо", zoomIn: "Приблизить", zoomOut: "Отдалить", resetCamera: "Вернуть ракурс", pause: "Остановить анимацию", play: "Продолжить анимацию",
    stage: (name) => `Образ на 3D-манекене: ${name}`, frameLabel: (label, size) => `${label} · ${size}`, transparent: "прозрачный фон",
    sources: "Откуда данные", sourcesBody: "Облики и наборы — из таблиц игры (ItemModifiedAppearance, ItemAppearance, TransmogSet) опубликованной сборки каталога Gildra. 3D — просмотрщик моделей Wowhead, файлы идут через gildra.net. Модели и текстуры — собственность Blizzard Entertainment.",
    slotButton: (slot, item, hidden) => `${slot}: ${item ?? "пусто"}${hidden ? ", скрыт" : ""}`,
    searchItemsIn: (slot) => `${slot}: название облика`, armorFilter: "Тип брони",
    hoverTip: "Наведите — примерка, клик — надеть", trying: (name) => `Примерка: ${name}`,
    loadingPart: (percent, mb) => `Загружаем 3D-манекен · ${percent > 0 && percent < 100 ? `${percent} % из ~${mb} МБ` : `~${mb} МБ`}`,
    slowNetwork: (mb) => `Включена экономия трафика: 3D-манекен (~${mb} МБ) загрузится по кнопке`,
    previewNote: "Превью образа", downloadShort: "Скачать", downloadWait: "Скачать можно после загрузки 3D",
    keys: "Клавиши: / — поиск, [ ] — слот, Z — отменить, H — скрыть слот, ← → — поворот",
    camera: "Камера", weapons: "Оружие",
  },
  en: {
    title: "Transmog Studio", eyebrow: "World of Warcraft · Tools",
    lede: "Build an outfit from any appearance or set, try it on the race you want and make a picture for social media — on a transparent background, a color or a scene.",
    noJS: "Enable JavaScript to use the transmog studio.",
    slots: { head: "Head", shoulder: "Shoulders", back: "Back", chest: "Chest", shirt: "Shirt", tabard: "Tabard", wrist: "Wrists", hands: "Hands", waist: "Waist", legs: "Legs", feet: "Feet", "main-hand": "Main hand", "off-hand": "Off hand" },
    slotShort: { "main-hand": "Main", "off-hand": "Off" },
    races: { human: "Human", orc: "Orc", dwarf: "Dwarf", "night-elf": "Night Elf", undead: "Undead", tauren: "Tauren", gnome: "Gnome", troll: "Troll", goblin: "Goblin", "blood-elf": "Blood Elf", draenei: "Draenei" },
    armor: { all: "All", plate: "Plate", mail: "Mail", leather: "Leather", cloth: "Cloth", cosmetic: "Cosmetic" },
    formats: { "1x1": { label: "1:1", note: "post" }, "4x5": { label: "4:5", note: "feed" }, "9x16": { label: "9:16", note: "story" }, og: { label: "1.91:1", note: "link preview" }, "16x9": { label: "16:9", note: "screen" } },
    poses: { Stand: "Stand", Ready1H: "Ready", Ready2H: "Two-hand ready", EmoteSalute: "Salute", EmoteFlex: "Flex", EmoteRoar: "Roar", EmoteCheer: "Cheer", EmoteKneel: "Kneel", EmoteSitGround: "Sit", EmoteDance: "Dance" },
    backgrounds: { transparent: "Transparent", night: "Night", parchment: "Parchment", white: "Light", void: "Void", dawn: "Dawn", frost: "Frost", fel: "Fel", vault: "Vault", sanctuary: "Ruby Life Pools", voidscar: "Voidscar Arena", nalorakk: "Den of Nalorakk", kings: "Kings' Rest", blinding: "The Blinding Vale", city: "City", archive: "Archive", tools: "Workshop" },
    classes: { warrior: "Warrior", paladin: "Paladin", hunter: "Hunter", rogue: "Rogue", priest: "Priest", "death-knight": "Death Knight", shaman: "Shaman", mage: "Mage", warlock: "Warlock", monk: "Monk", druid: "Druid", "demon-hunter": "Demon Hunter", evoker: "Evoker" },
    qualities: ["Poor", "Common", "Uncommon", "Rare", "Epic", "Legendary", "Artifact", "Heirloom"],
    race: "Race", gender: "Body", male: "Male", female: "Female",
    undo: "Undo", reset: "Reset", share: "Link", copied: "Outfit link copied", copyFailed: "Could not copy — the link is in the address bar",
    openStudio: "Open the 3D mannequin", openHint: (mb) => `First load is about ${mb} MB; swapping items is fast afterwards`,
    loadingModel: "Loading the mannequin", modelError: "The model did not load.", retry: "Try again", noWebgl: "This browser has no WebGL, so the 3D mannequin is unavailable. Picking items and sharing still work.",
    tabs: { items: "Items", sets: "Sets", frame: "Frame" },
    slotPanel: (slot) => `Appearances: ${slot}`, current: "Now", empty: "Empty", hide: "Hide slot", show: "Show slot", remove: "Remove", hiddenTag: "hidden",
    search: "Search", searchItems: "Item name", searchSets: "Set name", results: (count) => `${count.toLocaleString("en-US")} ${count === 1 ? "appearance" : "appearances"}`,
    shared: (count) => `${count} ${count === 1 ? "item" : "items"} share this look`,
    worn: "worn", more: "Show more", loading: "Loading…", nothing: "Nothing found. Try another word.", error: "Appearances could not be loaded. Please try again.",
    wear: "Wear set", wearHint: "A set only replaces its own slots.", allClasses: "All classes", classFilter: "Class",
    pieces: (count) => `${count} ${count === 1 ? "piece" : "pieces"}`,
    setResults: (count) => `${count.toLocaleString("en-US")} ${count === 1 ? "set" : "sets"}`,
    format: "Format", background: "Background", pose: "Pose", light: "Light", brightness: "Brightness", contrast: "Contrast", shadow: "Floor shadow",
    fileType: "File type", caption: "Caption", captionTitle: "Outfit name", captionSubtitle: "Name or realm", mark: "gildra.net mark", scale: "Size",
    download: (format) => `Download ${format}`, exporting: "Preparing the picture…", exported: (size, kb) => `Saved: ${size}, ${kb} KB`, exportFailed: "The picture could not be saved. Try a smaller size.",
    webpFallback: "This browser cannot save WebP, so a PNG was saved.",
    exportNote: "The picture is made in your browser: textures come through gildra.net and carry no third-party watermark.",
    rotateLeft: "Rotate left", rotateRight: "Rotate right", zoomIn: "Zoom in", zoomOut: "Zoom out", resetCamera: "Reset view", pause: "Pause animation", play: "Resume animation",
    stage: (name) => `Outfit on a 3D mannequin: ${name}`, frameLabel: (label, size) => `${label} · ${size}`, transparent: "transparent background",
    sources: "Where the data comes from", sourcesBody: "Appearances and sets come from the game tables (ItemModifiedAppearance, ItemAppearance, TransmogSet) of Gildra's published catalog build. 3D uses the Wowhead model viewer; files are served through gildra.net. Models and textures belong to Blizzard Entertainment.",
    slotButton: (slot, item, hidden) => `${slot}: ${item ?? "empty"}${hidden ? ", hidden" : ""}`,
    searchItemsIn: (slot) => `${slot}: appearance name`, armorFilter: "Armor type",
    hoverTip: "Hover to try on, click to wear", trying: (name) => `Trying on: ${name}`,
    loadingPart: (percent, mb) => `Loading the 3D mannequin · ${percent > 0 && percent < 100 ? `${percent}% of ~${mb} MB` : `~${mb} MB`}`,
    slowNetwork: (mb) => `Data saver is on: the 3D mannequin (~${mb} MB) loads on request`,
    previewNote: "Outfit preview", downloadShort: "Download", downloadWait: "Download is available once 3D has loaded",
    keys: "Keys: / search, [ ] slot, Z undo, H hide slot, ← → rotate",
    camera: "Camera", weapons: "Weapons",
  },
};

function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10, mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
