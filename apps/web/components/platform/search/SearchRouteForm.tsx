"use client";

import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";

export function SearchRouteForm({
  action,
  className,
  role,
  children,
}: {
  action: string;
  className?: string;
  role?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => {
      if (typeof value === "string" && value) params.append(key, value);
    });
    const query = params.toString();
    router.push(query ? `${action}?${query}` : action);
  };

  return <form action={action} className={className} role={role} onSubmit={submit}>{children}</form>;
}
