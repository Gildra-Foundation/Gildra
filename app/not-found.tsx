import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Icons } from "@/components/Icons";
import { TopNav } from "@/components/TopNav";

export const metadata: Metadata = {
  title: "Page not found — Gildra",
};

export default function NotFound() {
  return (
    <>
      <Icons />
      <TopNav />
      <main className="nf">
      <Image
        className="nf-helm"
        src="/brand/helmet.png"
        alt=""
        width={132}
        height={132}
        priority
      />
      <div className="nf-code">404</div>
      <h1 className="nf-title">This page fell in battle</h1>
      <p className="nf-sub">
        The page you are looking for was moved, renamed or never existed.
      </p>
      <div className="nf-actions">
        <Link className="btn btn-primary" href="/">
          Back to overview
        </Link>
        <Link className="btn-line" href="/tier-lists">
          Mythic+ Tier List →
        </Link>
      </div>
      </main>
    </>
  );
}
