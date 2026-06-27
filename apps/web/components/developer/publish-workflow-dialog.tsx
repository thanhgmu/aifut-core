"use client";

import { FormEvent, useEffect, useState } from "react";

type PublishWorkflowDialogProps = {
  templateId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function PublishWorkflowDialog({
  templateId,
  isOpen,
  onClose,
  onSuccess,
}: PublishWorkflowDialogProps) {
  const [developerNotes, setDeveloperNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setDeveloperNotes("");
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!templateId || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/v1/marketplace/templates/${encodeURIComponent(templateId)}/publish`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            isPublic: true,
            developerNotes: developerNotes.trim(),
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Không thể phát hành tác vụ lúc này.");
      }

      onClose();
      onSuccess();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Đã xảy ra lỗi khi phát hành tác vụ.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-md"
      role="dialog"
    >
      <button
        aria-label="Đóng hộp thoại phát hành"
        className="absolute inset-0 cursor-default"
        disabled={isSubmitting}
        onClick={handleClose}
        type="button"
      />

      <form
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/85 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl"
        onSubmit={handleSubmit}
      >
        <div className="border-b border-white/10 bg-white/[0.03] px-6 py-5">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300/80">
            Marketplace
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Phát hành tác vụ
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Thêm ghi chú dành cho lập trình viên trước khi đưa workflow template
            lên cộng đồng.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <label className="block" htmlFor="developer-notes">
            <span className="text-sm font-medium text-zinc-200">
              Ghi chú lập trình viên
            </span>
            <textarea
              className="mt-3 min-h-36 w-full resize-y rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              id="developer-notes"
              onChange={(event) => setDeveloperNotes(event.target.value)}
              placeholder="Mô tả thay đổi, lưu ý tích hợp, hoặc điều kiện cần biết khi tái sử dụng template này..."
              value={developerNotes}
            />
          </label>

          {errorMessage ? (
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {errorMessage}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-white/10 bg-white/[0.02] px-6 py-5 sm:flex-row sm:justify-end">
          <button
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSubmitting}
            onClick={handleClose}
            type="button"
          >
            Hủy
          </button>
          <button
            className="rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-cyan-300/50"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Đang phát hành..." : "Xác nhận phát hành"}
          </button>
        </div>
      </form>
    </div>
  );
}
