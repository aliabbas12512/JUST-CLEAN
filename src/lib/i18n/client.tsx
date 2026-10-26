"use client";
import { createContext, useContext } from "react";
import { dictFor, type Dict, type Locale } from "./shared";

const Ctx = createContext<{ locale: Locale; t: Dict }>({ locale: "ar", t: dictFor("ar") });

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={{ locale, t: dictFor(locale) }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  return useContext(Ctx);
}
