import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

export default function ThemeToggle() {
  const isDark = useSignal(false);

  useEffect(() => {
    // Only run on client-side
    if (typeof window === "undefined") return;

    // Load theme preference from localStorage
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      isDark.value = true;
    } else if (savedTheme === "light") {
      isDark.value = false;
    } else {
      // Default to system preference
      isDark.value =
        globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ||
        false;
    }
  }, []);

  useEffect(() => {
    // Only run on client-side
    if (typeof window === "undefined") return;

    // Apply theme to document and save to localStorage
    if (isDark.value) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark.value]);

  const toggleTheme = () => {
    isDark.value = !isDark.value;
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      class="theme-toggle"
      aria-label="Toggle theme"
    >
      {isDark.value ? "☀️" : "🌙"}
    </button>
  );
}
