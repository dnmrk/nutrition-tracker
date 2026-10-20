"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TZ_COOKIE } from "@/lib/dates";

function readCookie(): string | undefined {
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${TZ_COOKIE}=`))
    ?.slice(TZ_COOKIE.length + 1);
  try {
    return raw === undefined ? undefined : decodeURIComponent(raw);
  } catch {
    return undefined; // malformed cookie: treat as unset and overwrite it
  }
}

export function TimeZoneSync() {
  const router = useRouter();

  useEffect(() => {
    const sync = () => {
      if (document.visibilityState !== "visible") return;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz || tz === readCookie()) return;
      document.cookie = `${TZ_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [router]);

  return null;
}
