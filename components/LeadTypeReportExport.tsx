/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useRef, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  X,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

type Props = {
  leadTypeId: string;
  leadTypeName: string;
};

type DownloadStatus = "loading" | "success" | "error";

export default function LeadTypeReportExport({
  leadTypeId,
  leadTypeName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<DownloadStatus>("loading");
  const [progress, setProgress] = useState(0);
  const [received, setReceived] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  const [filename, setFilename] = useState("");
  const [starting, setStarting] = useState(false);

  const controllerRef = useRef<AbortController | null>(null);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024)
      return `${(bytes / 1024).toFixed(1)} KB`;

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const closeModal = () => {
    if (starting) return;

    controllerRef.current?.abort();
    controllerRef.current = null;
    setOpen(false);
  };

  const downloadReport = async () => {
    if (starting) return;

    setOpen(true);
    setStarting(true);
    setStatus("loading");
    setProgress(0);
    setReceived(0);
    setTotal(0);
    setError("");
    setFilename("");

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const response = await fetch(
        `/api/lead-types/${encodeURIComponent(leadTypeId)}/report`,
        {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        let message = "Unable to generate the Excel report.";

        try {
          const data = await response.json();
          message = data.message || message;
        } catch {
          // Keep fallback message.
        }

        throw new Error(message);
      }

      const contentType =
        response.headers.get("Content-Type") || "";

      if (!contentType.includes("spreadsheetml")) {
        throw new Error(
          "The server did not return an Excel file. Please check the report API."
        );
      }

      const contentLength = Number(
        response.headers.get("Content-Length") || 0
      );

      setTotal(contentLength);

      let blob: Blob;

      if (response.body) {
        const reader = response.body.getReader();
        const chunks: BlobPart[] = [];
        let downloaded = 0;

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          if (value) {
            chunks.push(value);
            downloaded += value.byteLength;

            setReceived(downloaded);

            if (contentLength > 0) {
              setProgress(
                Math.min(
                  100,
                  Math.round((downloaded / contentLength) * 100)
                )
              );
            }
          }
        }

        blob = new Blob(chunks, {
          type: contentType,
        });
      } else {
        blob = await response.blob();
        setReceived(blob.size);
        setProgress(100);
      }

      if (!blob.size) {
        throw new Error("The generated Excel report is empty.");
      }

      setProgress(100);

      const disposition =
        response.headers.get("Content-Disposition") || "";

      const match = disposition.match(
        /filename="?([^";]+)"?/i
      );

      const safeName = leadTypeName
        .replace(/[<>:"/\\|?*]/g, "")
        .trim()
        .replace(/\s+/g, "_");

      const finalFilename =
        match?.[1] ||
        `${safeName || "Lead-Type"}_Report.xlsx`;

      setFilename(finalFilename);

      // Start the browser download only after the entire file is received.
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = finalFilename;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      // Give the browser a moment to begin processing the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);

      setStatus("success");
    } catch (err: any) {
      if (err.name === "AbortError") {
        setOpen(false);
        return;
      }

      console.error("Lead Type Report Download Error:", err);

      setError(
        err.message || "Something went wrong while downloading."
      );

      setStatus("error");
    } finally {
      setStarting(false);
      controllerRef.current = null;
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={downloadReport}
        disabled={starting}
        title="Download Excel report"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60"
      >
        <Download size={14} />
        Export
      </button>

      {open && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl">

            {/* Popup header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <FileSpreadsheet size={21} />
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Export Lead Report
                  </h3>

                  <p className="mt-0.5 text-xs text-slate-500">
                    Excel workbook generation
                  </p>
                </div>
              </div>

              {!starting && (
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close export window"
                >
                  <X size={19} />
                </button>
              )}
            </div>

            {/* Popup body */}
            <div className="px-5 py-7 sm:px-7">

              <div className="flex flex-col items-center text-center">

                {status === "loading" && (
                  <>
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                      <Loader2
                        size={32}
                        className="animate-spin"
                      />
                    </div>

                    <h4 className="mt-5 text-base font-bold text-slate-900">
                      Preparing your report
                    </h4>

                    <p className="mt-2 max-w-xs text-xs leading-relaxed text-slate-500">
                      Please wait while we collect contacts, interaction
                      history, reminders and follow-up records.
                    </p>
                  </>
                )}

                {status === "success" && (
                  <>
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                      <CheckCircle2 size={34} />
                    </div>

                    <h4 className="mt-5 text-base font-bold text-slate-900">
                      Your report is ready!
                    </h4>

                    <p className="mt-2 max-w-xs text-xs leading-relaxed text-slate-500">
                      The Excel file has been generated and your browser
                      download has been started.
                    </p>
                  </>
                )}

                {status === "error" && (
                  <>
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                      <AlertCircle size={32} />
                    </div>

                    <h4 className="mt-5 text-base font-bold text-slate-900">
                      Download unsuccessful
                    </h4>

                    <p className="mt-2 max-w-xs text-xs leading-relaxed text-rose-600">
                      {error}
                    </p>
                  </>
                )}
              </div>

              {/* Lead Type details */}
              <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Selected Lead Type
                </p>

                <p className="mt-1 break-words text-sm font-bold text-slate-800">
                  {leadTypeName}
                </p>

                {filename && (
                  <p className="mt-2 break-all text-xs text-slate-500">
                    {filename}
                  </p>
                )}
              </div>

              {/* Progress */}
              {status === "loading" && (
                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600">
                      {total > 0 ? "Downloading Excel file" : "Generating workbook"}
                    </span>

                    <span className="text-xs font-bold tabular-nums text-emerald-700">
                      {total > 0 ? `${progress}%` : "Please wait"}
                    </span>
                  </div>

                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full bg-emerald-500 transition-all duration-200 ${
                        total === 0 ? "w-1/3 animate-pulse" : ""
                      }`}
                      style={
                        total > 0
                          ? { width: `${progress}%` }
                          : undefined
                      }
                    />
                  </div>

                  {received > 0 && (
                    <p className="mt-2 text-right text-[10px] text-slate-400">
                      {formatBytes(received)}
                      {total > 0 ? ` / ${formatBytes(total)}` : ""}
                    </p>
                  )}
                </div>
              )}

              {status === "success" && (
                <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 size={15} />
                    Download started successfully
                  </div>

                  <p className="mt-1 text-[11px] text-emerald-700/75">
                    Check your browser&apos;s downloads for the Excel file.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-6">
                {status === "loading" && (
                  <button
                    type="button"
                    onClick={closeModal}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                )}

                {status === "success" && (
                  <button
                    type="button"
                    onClick={closeModal}
                    className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700"
                  >
                    Done
                  </button>
                )}

                {status === "error" && (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Close
                    </button>

                    <button
                      type="button"
                      onClick={downloadReport}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
                    >
                      <RefreshCw size={15} />
                      Try again
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
