"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { logClientEvent } from "@/lib/clientApi";
import BriefContent from "./BriefContent";

/**
 * Focus mode (features.focusMode): the Frame Marketing Brief in an in-page panel instead of a new
 * tab, so reading it never leaves the page or triggers the "Please return" overlay. Logs
 * brief_panel_open (the /brief page logs brief_open). No "Download PDF" here: the print dialog
 * would take focus, and a downloaded file opens outside the page.
 *
 * The dialog is portaled to document.body: both call sites wrap this component in a <p>, and
 * <dialog> isn't allowed inside <p> (it's not phrasing content) — that nesting caused a
 * hydration error. Portaling, gated on mount, keeps the initial client render matching the
 * server's (no dialog in the tree yet) and only attaches it to the body afterwards.
 */
export default function BriefPanel({ taskId, from }: { taskId: string | null; from: "task" | "welcome" }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function open() {
    logClientEvent(taskId, "brief_panel_open", { from });
    dialogRef.current?.showModal();
  }

  const dialog = (
    <dialog ref={dialogRef} className="brief-dialog" aria-label="Frame Marketing Brief">
      <div className="brief-dialog-bar">
        <button type="button" onClick={() => dialogRef.current?.close()}>
          Close
        </button>
      </div>
      <div className="brief">
        <BriefContent headingLevel={2} />
      </div>
    </dialog>
  );

  return (
    <>
      <button type="button" className="link-button" onClick={open}>
        Frame Marketing Brief
      </button>
      {mounted && createPortal(dialog, document.body)}
    </>
  );
}
