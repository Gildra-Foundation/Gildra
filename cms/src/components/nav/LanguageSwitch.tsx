"use client";

import { useTranslation } from "@payloadcms/ui";
import React, { useState, useTransition } from "react";

import { AdminSurface } from "../AdminSurface";
import { SegmentedControl } from "../valyro-ui/navigation/SegmentedControl";

type Lang = "ru" | "en";

const OPTIONS = [
  { value: "ru", label: "RU" },
  { value: "en", label: "EN" },
];

/**
 * RU / EN switch of the interface language in the header (Payload's own
 * language preference, the same one the account page sets). The content
 * language of a document stays with Payload's locale selector and the
 * editor's language bar.
 */
export function LanguageSwitch() {
  const { i18n, switchLanguage } = useTranslation();
  const current: Lang = i18n.language === "en" ? "en" : "ru";
  const [chosen, setChosen] = useState<Lang | null>(null);
  const [, startTransition] = useTransition();
  const value = chosen ?? current;

  return (
    <AdminSurface lang={current}>
      <SegmentedControl
        className="gd-lang-switch"
        size="sm"
        aria-label={current === "ru" ? "Язык интерфейса" : "Interface language"}
        options={OPTIONS}
        value={value}
        onValueChange={(next) => {
          if (next === current || !switchLanguage) return;
          setChosen(next as Lang);
          startTransition(async () => {
            await switchLanguage(next as Lang);
            setChosen(null);
          });
        }}
      />
    </AdminSurface>
  );
}
