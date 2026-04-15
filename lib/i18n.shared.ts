export type Locale = "en" | "fr";

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "fr";
}

export function resolveLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : "en";
}

