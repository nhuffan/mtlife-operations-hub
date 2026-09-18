"use client";

import { useEffect, useState } from "react";
import { Moon, Settings, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { Locale } from "@/lib/i18n/translations";

type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "theme";

function applyTheme(theme: ThemeMode) {
  const isDark = theme === "dark";
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export default function SettingsMenu({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  function changeTheme(value: string) {
    if (value !== "light" && value !== "dark") return;
    setTheme(value);
    applyTheme(value);
  }

  function changeLocale(value: string) {
    if (value === "en" || value === "vi" || value === "zh-CN") setLocale(value as Locale);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={`cursor-pointer ${className}`}
          aria-label={t("Settings")}
          title={t("Settings")}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56 p-1.5">
        <label className="flex cursor-pointer items-center justify-between gap-3 px-2 py-2 text-sm font-medium">
          <span>{t("Theme")}</span>
          <button
            type="button"
            role="switch"
            aria-label={t("Dark")}
            aria-checked={theme === "dark"}
            onClick={() => changeTheme(theme === "dark" ? "light" : "dark")}
            className="inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full bg-[#cccccc] p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span
              className={`flex size-4 items-center justify-center rounded-full transition-transform duration-200 motion-reduce:transition-none ${theme === "dark" ? "translate-x-5 bg-[#202020] text-[#eeeeee]" : "translate-x-0 bg-white text-[#333333]"}`}
            >
              {theme === "dark" ? (
                <Moon aria-hidden="true" className="size-3" strokeWidth={1.75} />
              ) : (
                <Sun aria-hidden="true" className="size-3" strokeWidth={1.75} />
              )}
            </span>
          </button>
        </label>

        <DropdownMenuSeparator />

        <DropdownMenuRadioGroup aria-label={t("Language")} value={locale} onValueChange={changeLocale} className="space-y-1">
          {[
            { value: "en", label: "English" },
            { value: "vi", label: "Tiếng Việt" },
            { value: "zh-CN", label: "中文（简体）" },
          ].map(({ value, label }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              indicator="check-end"
              className="cursor-pointer rounded-md py-2 data-[state=checked]:bg-primary/10 data-[state=checked]:font-medium data-[state=checked]:text-primary data-[state=checked]:focus:bg-primary/15"
            >
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
