"use client";

import { logClientEvent } from "@/lib/clientApi";

/** Opens the browser's print dialog ("Save as PDF") for the brief, styled by the print CSS. */
export default function DownloadPdfButton({ taskId, loggable }: { taskId: string | null; loggable: boolean }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (loggable) logClientEvent(taskId, "brief_download");
        window.print();
      }}
    >
      Download PDF
    </button>
  );
}
