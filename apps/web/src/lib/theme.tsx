import { useLocale } from "@/i18n";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark" | "system";
const ThemeContext = createContext<{
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
}>({ theme: "system", resolved: "light", setTheme() {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  useLocale();
  const [theme, setThemeState] = useState<Theme>(() => {
    const value = localStorage.getItem("huayu:theme");
    return value === "dark" || value === "light" ? value : "system";
  });
  const [systemDark, setSystemDark] = useState(
    () => matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const changed = () => setSystemDark(media.matches);
    media.addEventListener("change", changed);
    const storage = (event: StorageEvent) => {
      if (event.key === "huayu:theme")
        setThemeState(
          event.newValue === "dark" || event.newValue === "light"
            ? event.newValue
            : "system",
        );
    };
    window.addEventListener("storage", storage);
    return () => {
      media.removeEventListener("change", changed);
      window.removeEventListener("storage", storage);
    };
  }, []);
  function setTheme(value: Theme) {
    localStorage.setItem("huayu:theme", value);
    setThemeState(value);
  }
  return (
    <ThemeContext value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext>
  );
}
export const useTheme = () => useContext(ThemeContext);
