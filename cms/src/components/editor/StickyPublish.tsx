"use client";

import { PublishButton } from "@payloadcms/ui";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const PHONE = "(max-width: 768px)";

/**
 * Payload's own publish button (same labels, locale menu, permissions), in
 * the amber of the atlas. On phones it leaves the scrolled-away top bar for a
 * bar fixed to the bottom of the screen: Payload's controls bar is a
 * transformed box there, so the button is portalled to <body> while keeping
 * the form context. Until hydration the phone bar is empty and the top copy is
 * hidden by CSS, so nothing jumps.
 */
export function StickyPublish(props: React.ComponentProps<typeof PublishButton>) {
  const [phone, setPhone] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(PHONE);
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  if (phone) {
    return createPortal(
      <div className="gd-publish gd-publish--bar">
        <PublishButton {...props} />
      </div>,
      document.body,
    );
  }
  return (
    <div className="gd-publish gd-publish--inline">
      <PublishButton {...props} />
    </div>
  );
}
