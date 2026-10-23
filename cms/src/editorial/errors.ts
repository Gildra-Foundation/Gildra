import { APIError, ValidationError, type PayloadRequest } from "payload";

/**
 * Editorial refusals in the editor's own words.
 *
 * In the production bundle the hook and the REST error handler end up with
 * two copies of Payload's error classes, so `formatErrors` does not recognise
 * a `ValidationError` and drops its `data.errors`. What always survives is
 * `name` and `message`, so the readable text is placed in `message` itself.
 */
const TEXT = {
  ru: {
    publishDenied: "Публиковать и менять опубликованные материалы могут только редакторы и администраторы сайта. Сохраните черновик — его опубликует редактор.",
    notOwn: "Автор может менять только собственные материалы.",
    moveSite: "Материал нельзя перенести на другой сайт.",
    noRole: "У вас нет прав редактировать материалы этого сайта.",
    siteRequired: "Выберите сайт для материала.",
    richTextTarget: (target: string) => `В тексте нельзя ссылаться на «${target}».`,
    missing: (target: string, id: unknown) => `Связанный материал (${target} №${id}) не найден.`,
    noEditorRole: "У автора нет роли на этом сайте.",
    otherSite: (target: string, id: unknown) => `Связанный материал (${target} №${id}) относится к другому сайту.`,
  },
  en: {
    publishDenied: "Only site editors and admins can publish or change published content. Save a draft — an editor will publish it.",
    notOwn: "Authors can only change their own content.",
    moveSite: "Content cannot be moved to another site.",
    noRole: "You have no permission to edit content on this site.",
    siteRequired: "Choose a site for this content.",
    richTextTarget: (target: string) => `The text may not reference "${target}".`,
    missing: (target: string, id: unknown) => `Referenced ${target} #${id} does not exist.`,
    noEditorRole: "The author has no editorial role on this site.",
    otherSite: (target: string, id: unknown) => `Referenced ${target} #${id} belongs to another site.`,
  },
};

type Copy = typeof TEXT.ru;
export type PolicyText = { [K in keyof Copy]: Copy[K] extends string ? string : Copy[K] };

export function policyText(req: Pick<PayloadRequest, "i18n"> | undefined): PolicyText {
  return req?.i18n?.language === "en" ? TEXT.en : TEXT.ru;
}

/** 403 with a message the editor can act on. */
export function denied(req: PayloadRequest, message: (text: PolicyText) => string): APIError {
  return new APIError(message(policyText(req)), 403, null, true);
}

/** 400 for one field: the text is both the field error and the error message. */
export function invalidField(req: PayloadRequest, collection: string, path: string, message: (text: PolicyText) => string): ValidationError {
  const text = message(policyText(req));
  const error = new ValidationError({ collection, errors: [{ message: text, path }] });
  error.message = text;
  return error;
}
