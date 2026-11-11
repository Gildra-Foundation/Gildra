"use client";

import { AtlasPagination } from "@/components/atlas";

// Construct the asChild anchor inside the same client boundary as Valyro Button.
// Passing a server-created lazy React child can fail its isValidElement check in SSR.
export function LibraryPagination(props: {
  label: string;
  prev?: { href: string; label: string };
  next?: { href: string; label: string };
  status: string;
}) {
  return <AtlasPagination {...props} />;
}
