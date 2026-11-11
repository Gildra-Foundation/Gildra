import type { ClassSlug, Localized } from './model';
/** Original gameplay explanations tied to exact talent names in the captured client snapshot. */
export const classHighlights: Record<ClassSlug, Array<{ talent: string; text: Localized }>> = {
  druid: [
    { talent: 'Predatory Discipline', text: { en: 'Ferocious Bite can benefit from excess Energy without spending that reserve. You can keep Energy for the following attack.', ru: 'Свирепый укус получает пользу от лишней энергии, не расходуя этот запас. Энергия остаётся для следующей атаки.' } },
    { talent: 'Bloom', text: { en: 'Letting Rejuvenation or Regrowth finish triggers an extra heal. Refreshing them early gives up that natural expiration.', ru: 'После завершения Омоложения или Восстановления срабатывает дополнительное исцеление. Раннее обновление не даёт эффекту завершиться естественным образом.' } },
  ],
  hunter: [
    { talent: 'Summon Hawk', text: { en: 'The hawk shares a cooldown with Arcane Shot, so the two attacks compete for the same opportunity rather than adding independent cooldowns.', ru: 'Ястреб делит время восстановления с Чародейским выстрелом: приходится выбирать между двумя атаками, а не применять их независимо.' } },
    { talent: 'Lone Wolf', text: { en: 'This damage bonus requires no active pet. Summoning a pet trades that bonus for the companion’s attacks and utility.', ru: 'Бонус к урону действует без активного питомца. Призыв меняет этот бонус на атаки и полезные способности спутника.' } },
  ],
  mage: [
    { talent: 'Heating Up', text: { en: 'Fire critical strikes shorten the next Pyroblast cast. Fire Blast also adds a stack whenever it deals damage, letting you build toward a faster cast deliberately.', ru: 'Критические попадания огнём ускоряют следующую Огненную глыбу. Огненный взрыв добавляет заряд при каждом нанесении урона, помогая подготовить быстрый удар.' } },
    { talent: 'Fingers of Frost', text: { en: 'A proc lets the next spell treat its target as frozen. That opens a damage window without needing a fresh root.', ru: 'Срабатывание позволяет следующему заклинанию считать цель замороженной. Для этого окна урона не нужно заново обездвиживать противника.' } },
  ],
  paladin: [
    { talent: 'Swift Judgement', text: { en: 'This judgement keeps the seal active and has a separate cooldown from Judgement, creating another opportunity to unleash a seal’s effect.', ru: 'Это правосудие сохраняет активную печать и восстанавливается отдельно от Правосудия, позволяя ещё раз применить эффект печати.' } },
    { talent: 'Sacred Arbiter', text: { en: 'Holy Strike refreshes judgement effects on the target. Staying in melee helps maintain those effects while dealing damage.', ru: 'Святой удар обновляет эффекты правосудия на цели. Бой вблизи помогает поддерживать их одновременно с нанесением урона.' } },
  ],
  priest: [
    { talent: 'Litany of Light', text: { en: 'Alternating healing spells returns mana; repeating the same heal does not meet that condition.', ru: 'Чередование исцеляющих заклинаний возвращает ману. Повтор одного и того же заклинания не выполняет это условие.' } },
    { talent: 'Devouring Contagion', text: { en: 'When an infected target dies, the plague can jump to nearby enemies for its remaining duration. Its value depends on both positioning and how much time remains.', ru: 'После гибели заражённой цели чума переходит на ближайших врагов на оставшееся время. Важны и расположение противников, и остаток длительности.' } },
  ],
  rogue: [
    { talent: 'Mutilate', text: { en: 'The attack uses both weapons and benefits from a poisoned target. Applying poison first helps set up the strike.', ru: 'Приём использует оба оружия и получает бонус против отравленной цели. Яд помогает подготовить усиленный удар.' } },
    { talent: 'Quick Getaway', text: { en: 'Sap can control an additional target, and using it grants a short movement burst for repositioning.', ru: 'Ошеломление позволяет контролировать ещё одну цель, а его применение ненадолго ускоряет передвижение для смены позиции.' } },
  ],
  shaman: [
    { talent: 'Riptide', text: { en: 'Chain Heal gains extra effectiveness when cast directly on the target of Riptide. Your initial target matters as well as the later jumps.', ru: 'Цепное исцеление усиливается при прямом применении к цели Быстрины. Важен выбор первой цели, а не только последующие переходы.' } },
    { talent: 'Earthbound', text: { en: 'Earthbind Totem roots nearby enemies when placed, giving its first moment a control effect beyond the continuing slow.', ru: 'При установке Тотем оков земли обездвиживает ближайших врагов. Его начальный эффект дополняет последующее замедление.' } },
  ],
  warlock: [
    { talent: 'Demonic Energies', text: { en: 'Dealing spell damage heals your demon, while Life Tap also restores its mana. Your own spell use helps sustain the companion.', ru: 'Урон заклинаниями исцеляет демона, а Жизнеотвод также восполняет ему ману. Применение ваших заклинаний помогает поддерживать спутника.' } },
    { talent: 'Bane of Havoc', text: { en: 'Mark one enemy, then damage another to send part of that damage to the marked target. The effect rewards keeping a second target available.', ru: 'Отметьте одного врага и атакуйте другого: часть урона перейдёт отмеченной цели. Эффект полезен, пока есть второй противник.' } },
  ],
  warrior: [
    { talent: 'Vanguard', text: { en: 'Charge becomes available in Defensive Stance, so engaging a target no longer requires leaving that stance.', ru: 'Рывок становится доступен в Оборонительной стойке: для сближения больше не нужно выходить из неё.' } },
    { talent: 'Bloodthrill', text: { en: 'Main-hand attacks can enable Overpower against a target with Rend. Keeping Rend active creates another way to open that attack.', ru: 'Атаки основной рукой могут открыть Превосходство против цели с Кровопусканием. Поддержание кровотечения даёт ещё один способ подготовить этот удар.' } },
  ],
};
