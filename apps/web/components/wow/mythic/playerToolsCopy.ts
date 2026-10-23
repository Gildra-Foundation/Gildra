export const playerToolsCopy = {
  ru: {
    classLabel: "Мой класс", specLabel: "Специализация", noClass: "Не выбран", noSpec: "Выберите специализацию", selectClass: "Сначала выберите класс",
    hint: "Специализация задаёт роль. Условия талантов и питомца указаны рядом с вашими способностями.",
    tools: "Ваши способности", talent: "Нужен талант", personal: "Если урон направлен на вас", noInterrupt: "У этой специализации нет обычного прерывания. Согласуйте кик с группой.",
    selectedTalent: "В билде", notInBuild: "В импортированном билде нет подходящей способности. Попросите помощь группы и следуйте тактике выше.",
    noStop: "Нет подтверждённого подходящего контроля — попросите союзника остановить каст.", noDispel: "У вас нет подходящего снятия этого эффекта. Попросите союзника; до снятия следуйте тактике выше.",
    noEffect: "Тип эффекта не подтверждён — конкретное снятие не назначено.",
    effects: { magic: "Магия", curse: "Проклятие", poison: "Яд", disease: "Болезнь", bleed: "Кровотечение", enrage: "Исступление" },
  },
  en: {
    classLabel: "My class", specLabel: "Specialization", noClass: "Not selected", noSpec: "Choose a specialization", selectClass: "Choose a class first",
    hint: "Specialization sets your role. Talent and pet requirements appear beside your abilities.",
    tools: "Your abilities", talent: "Requires talent", personal: "If the damage targets you", noInterrupt: "This specialization has no regular interrupt. Coordinate a kick with your party.",
    selectedTalent: "In your build", notInBuild: "Your imported build has no suitable ability. Ask your party for help and follow the tactics above.",
    noStop: "No confirmed suitable crowd control — ask an ally to stop the cast.", noDispel: "You cannot remove this effect with the listed abilities. Ask an ally and follow the tactics above until it is removed.",
    noEffect: "The effect type is unconfirmed; no specific removal is assigned.",
    effects: { magic: "Magic", curse: "Curse", poison: "Poison", disease: "Disease", bleed: "Bleed", enrage: "Enrage" },
  },
} as const;
