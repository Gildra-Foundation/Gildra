import { adminLang } from "../../admin/text";
import { emailMode } from "../../email";
import { AdminSurface } from "../AdminSurface";

/** Native Payload login/reset forms retain the authentication and cookie handling. */
export function AuthIntro({ i18n }: { i18n?: { language?: string } }) {
  const lang = adminLang(i18n?.language);
  const ru = lang === "ru";
  return <AdminSurface lang={lang}><section className="gd-auth-intro">
    <h1>{ru ? "Вход в редакцию" : "Editorial sign-in"}</h1>
    <p>{ru ? "Используйте аккаунт сотрудника. Доступ к сайтам и материалам определяется вашей ролью." : "Use your staff account. Your role determines access to sites and content."}</p>
    {emailMode() === "disabled" ? <p role="status">{ru ? "Восстановление пароля по email сейчас недоступно. Если забыли пароль, обратитесь к владельцу платформы." : "Email password recovery is currently unavailable. Contact a platform owner if you forgot your password."}</p> : null}
  </section></AdminSurface>;
}
