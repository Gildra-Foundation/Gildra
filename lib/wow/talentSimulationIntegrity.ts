export type TalentSimulationIntegrityInput = {
  editDistance: number;
  addedRanks: number;
  removedRanks: number;
  singleTargetDelta: number;
  aoeDelta: number;
};

export function talentSimulationIntegrityError(input: TalentSimulationIntegrityInput) {
  const deltas = [input.singleTargetDelta, input.aoeDelta];
  if (deltas.some((value) => !Number.isFinite(value))) {
    return "Симулятор вернул повреждённый результат. Ложные проценты показывать не будем.";
  }
  if (input.editDistance <= 1 && Math.max(...deltas.map(Math.abs)) > 25) {
    return "Расчёт остановлен: одна точечная правка дала невозможный скачок урона. Обновите профиль — ложный процент показывать не будем.";
  }
  if (input.removedRanks > 0 && input.addedRanks === 0 && Math.max(...deltas) > .25) {
    return "Результат не принят: снятие очка без замены неожиданно увеличило урон. Это противоречие модели, а не улучшение билда.";
  }
  return null;
}
