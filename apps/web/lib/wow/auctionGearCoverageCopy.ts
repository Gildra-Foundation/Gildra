export const auctionGearCoverageCopy = {
  ru: {
    reasons: {
      unsupportedModifierLots: "Лоты с неподдерживаемыми модификаторами: их точные свойства пока нельзя проверить.",
      variantsRejected: "Варианты, свойства которых не прошли проверку движком расчёта.",
      referenceItemsRejected: "Предметы, для которых не удалось подтвердить контрольные данные Blizzard.",
      catalogItemsMissing: "Предметы с неполными карточками каталога: данных для сравнения пока недостаточно.",
      catalogUnmatchedItemIds: "Предметы с неизвестным типом в каталоге. Неизвестно, могут ли они быть экипировкой.",
      eligibilityUnverifiedItems: "Предметы с неподтверждёнными требованиями или совместимостью. Они не участвуют в подборе.",
    },
    dataIncomplete: "Для части вариантов пока не хватает подтверждённых данных. Они не включены в сравнение; список может не содержать все улучшения с аукциона.",
  },
  en: {
    reasons: {
      unsupportedModifierLots: "Lots with unsupported modifiers: their exact properties cannot be verified yet.",
      variantsRejected: "Variants whose properties could not be verified by the simulation engine.",
      referenceItemsRejected: "Items whose Blizzard reference data could not be verified.",
      catalogItemsMissing: "Items with incomplete catalog records: there is not enough data to compare them yet.",
      catalogUnmatchedItemIds: "Market items with no catalog item type. Whether they can be equipment is unknown.",
      eligibilityUnverifiedItems: "Items with unverified requirements or compatibility. They are excluded from selection.",
    },
    dataIncomplete: "Some variants still lack verified data. They are excluded from comparison, so this list may not include every auction upgrade.",
  },
} as const;
