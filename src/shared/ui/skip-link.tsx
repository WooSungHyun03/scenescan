"use client";

import Link from "next/link";
import type { MouseEvent } from "react";

export function SkipLink({ targetId }: { targetId: string }) {
  const moveFocus = (event: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById(targetId);
    if (!target) return;

    event.preventDefault();
    target.focus();
    target.scrollIntoView({ block: "start" });
    window.history.replaceState(null, "", `#${targetId}`);
  };

  return (
    <Link href={`#${targetId}`} className="scene-skip-link" onClick={moveFocus}>
      본문으로 건너뛰기
    </Link>
  );
}
