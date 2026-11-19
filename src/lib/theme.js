// Light/dark theme. The choice is stored as "light" | "dark" in localStorage
// (it is a display preference, not sensitive data). With no stored choice the
// operating system preference is used.
export const THEME_KEY = "theme";

export function readStoredTheme() {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function systemPrefersDark() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}

/** Resolves the theme to apply from the stored choice and the system preference. */
export function resolveTheme(stored, prefersDark) {
  if (stored === "light" || stored === "dark") return stored;
  return prefersDark ? "dark" : "light";
}

export function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#1c1713" : "#faf6ef");
}

export function saveTheme(theme) {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage blocked: the theme still applies for this visit */
  }
}

export function initTheme() {
  applyTheme(resolveTheme(readStoredTheme(), systemPrefersDark()));
}
