/** Does the record have a Russian name of its own? Without one the Russian page shows the English record. */
export const foreverHasRussian = (record: { name: { en?: string; ru?: string } }) => Boolean(record.name.ru);
