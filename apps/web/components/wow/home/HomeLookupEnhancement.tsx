"use client";
import { homeLookupCopy } from "./homeLookupCopy";
import { useEffect } from "react";
import { useFormStatus } from "react-dom";

/** Keep the native server-action form; load suggestions only after interaction. */
export function HomeLookupEnhancement({ locale }: { locale: "en" | "ru" }) {
  const { pending } = useFormStatus();
  useEffect(() => {
    const form = document.getElementById("character-lookup") as HTMLFormElement;
    let dispose: (() => void) | undefined, cancelled = false;
    const start = () => {
      form.removeEventListener("focusin", start);
      void import("./homeRealmPicker").then(({ enhanceRealmPicker }) => { if (!cancelled) dispose = enhanceRealmPicker(form, locale); });
    };
    form.addEventListener("focusin", start);
    const region = form.elements.namedItem("region") as HTMLSelectElement;
    const realm = form.elements.namedItem("realm") as HTMLInputElement;
    // This must work before the deferred picker module has arrived.
    const resetRealm = () => {
      realm.value = "";
      try { localStorage.setItem("gildra:hero-lookup", JSON.stringify({ region: region.value, realm: "" })); } catch { /* Private mode */ }
    };
    region.addEventListener("change", resetRealm);
    // The field shows the realm's name; the lookup receives its slug.
    const send = (event: FormDataEvent) => {
      const slug = realm.dataset.slug && realm.value === realm.dataset.label ? realm.dataset.slug : "";
      if (slug) event.formData.set("realm", slug);
      try { localStorage.setItem("gildra:hero-lookup", JSON.stringify({ region: region.value, realm: slug || realm.value.trim(), label: realm.value.trim() })); } catch { /* Private mode */ }
    };
    form.addEventListener("formdata", send);
    const interacting = form.contains(document.activeElement);
    if (interacting) start();
    // Restore plain field values immediately without loading the realm data or picker.
    try {
      const saved = JSON.parse(localStorage.getItem("gildra:hero-lookup") ?? "{}");
      const pristine = !realm.value && (region.value === "eu" || region.value === saved.region);
      if ((!interacting || pristine) && ["eu", "us", "kr", "tw"].includes(saved.region)) {
        region.value = saved.region;
        const slug = typeof saved.realm === "string" ? saved.realm : "", label = typeof saved.label === "string" && saved.label ? saved.label : slug;
        realm.value = label; realm.dataset.slug = slug; realm.dataset.label = label;
      }
    } catch { /* Storage may be unavailable. */ }
    return () => { cancelled = true; form.removeEventListener("focusin", start); region.removeEventListener("change", resetRealm); form.removeEventListener("formdata", send); dispose?.(); };
  }, [locale]);
  useEffect(() => {
    const form = document.getElementById("character-lookup") as HTMLFormElement;
    form.setAttribute("aria-busy", String(pending));
    for (const control of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input:not([type=hidden]),select,button")) control.disabled = pending;
    const button = form.querySelector("button[type=submit]");
    const label = button?.querySelector("[data-lookup-label]");
    if (label) label.textContent = pending ? homeLookupCopy[locale].pending : homeLookupCopy[locale].submit;
  }, [pending, locale]);
  return null;
}
