"use client";

import { useRef } from "react";
import { logClientEvent } from "@/lib/clientApi";
import BriefContent from "./BriefContent";

/**
 * Focus mode (features.focusMode): the Frame Marketing Brief in an in-page panel instead of a new
 * tab, so reading it never leaves the page or triggers the "Please return" overlay. Logs
 * brief_panel_open (the /brief page logs brief_open). No "Download PDF" here: the print dialog
 * would take focus, and a downloaded file opens outside the page.
 */
export default function BriefPanel({ taskId, from }: { taskId: string | null; from: "task" | "welcome" }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  function open() {
    logClientEvent(taskId, "brief_panel_open", { from });
    dialogRef.current?.showModal();
  }
  return (
    <>
      <button type="button" className="link-button" onClick={open}>
        Frame Marketing Brief
      </button>
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
    </>
  );
}
