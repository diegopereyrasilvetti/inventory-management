import { useCallback, useState } from "react";
import { applyTheme, currentTheme, saveTheme } from "../lib/theme.js";

export default function useTheme() {
  const [theme, setTheme] = useState(currentTheme);
  const toggle = useCallback(() => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    saveTheme(next);
    setTheme(next);
  }, []);
  return { theme, toggle };
}
