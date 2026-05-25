"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type SettingsCanonicalUrlProps = {
  href: string;
  replace: boolean;
};

export function SettingsCanonicalUrl({ href, replace }: SettingsCanonicalUrlProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!replace) {
      return;
    }

    const current = `${pathname}?${searchParams.toString()}`;
    if (current !== href) {
      router.replace(href, { scroll: false });
    }
  }, [href, pathname, replace, router, searchParams]);

  return null;
}
