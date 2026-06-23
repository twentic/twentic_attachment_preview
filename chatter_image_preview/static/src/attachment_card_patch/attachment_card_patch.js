/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { AttachmentList } from "@mail/core/common/attachment_list";
import { Attachment } from "@mail/core/common/attachment_model";
import { useService } from "@web/core/utils/hooks";
import { AttachmentPreviewDialog } from "@chatter_image_preview/components/attachment_preview_dialog/attachment_preview_dialog";

// ---------------------------------------------------------------------------
// MIME / extension detection
// ---------------------------------------------------------------------------

/**
 * MIME types for which we show the custom AttachmentPreviewDialog.
 * These are NOT natively supported by Odoo's FileViewer.
 */
const CUSTOM_PREVIEW_MIMES = new Set([
    // CSV
    "text/csv",
    "application/csv",
    "text/comma-separated-values",
    // Excel
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/xlsx",
    "application/vnd.ms-excel",
    // Markdown
    "text/markdown",
    "text/x-markdown",
    // Word documents
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
]);

/**
 * File extensions used as fallback when the server returns a generic
 * MIME type (e.g. application/octet-stream).
 */
const CUSTOM_PREVIEW_EXTENSIONS = new Set([
    ".csv",
    ".md",
    ".markdown",
    ".xlsx",
    ".xls",
    ".docx",
    ".doc",
]);

/**
 * Returns true when the attachment should be handled by our custom
 * AttachmentPreviewDialog instead of the native Odoo FileViewer.
 *
 * Both MIME type and filename extension are checked so the detection
 * works even when the server sends a generic Content-Type.
 *
 * @param {import("@web/core/file_viewer/file_model").FileModelMixin} attachment
 * @returns {boolean}
 */
function isCustomPreviewable(attachment) {
    const mime = attachment?.mimetype ?? "";
    // `name` is the display name, `filename` is the stored filename
    const name = (attachment?.name ?? attachment?.filename ?? "").toLowerCase();
    const ext  = name.match(/\.[^.]+$/)?.[0] ?? "";
    return CUSTOM_PREVIEW_MIMES.has(mime) || CUSTOM_PREVIEW_EXTENSIONS.has(ext);
}

// ---------------------------------------------------------------------------
// Patch 1 — Attachment model
//
// Extends `isViewable` to include our custom types so the template adds the
// `o-viewable` CSS class (pointer cursor + hover magnifying-glass effect)
// to CSV, Markdown and Excel attachment cards, matching the visual behaviour
// of images and PDFs.
//
// Source of truth: @web/core/file_viewer/file_model → FileModelMixin.isViewable
// ---------------------------------------------------------------------------

patch(Attachment.prototype, {
    _name: "chatter_image_preview.Attachment",

    get isViewable() {
        return super.isViewable || isCustomPreviewable(this);
    },
});

// ---------------------------------------------------------------------------
// Patch 2 — AttachmentList component
//
// The template calls fileViewer.open() for EVERY attachment click:
//
//   t-on-click="() => this.fileViewer.open(attachment, props.attachments)"
//
// The native fileViewer.open() has an early return for non-viewable files:
//
//   if (!file.isViewable) { return; }
//
// Even though Patch 1 makes our types viewable, the native FileViewer cannot
// render CSV / Markdown / Excel files.  We wrap fileViewer.open() in setup()
// so clicks on our custom types open AttachmentPreviewDialog instead.
//
// Source of truth: @mail/core/common/attachment_list → AttachmentList
// ---------------------------------------------------------------------------

patch(AttachmentList.prototype, {
    _name: "chatter_image_preview.AttachmentList",

    setup() {
        super.setup();

        // Inject the dialog service under a scoped name to avoid collisions
        // with any future property that AttachmentList might add.
        this._cipDialog = useService("dialog");

        // Wrap open() right after super.setup() has initialised
        // this.fileViewer via useFileViewer().
        const _originalOpen = this.fileViewer.open;

        this.fileViewer.open = (file, files) => {
            if (isCustomPreviewable(file)) {
                this._cipDialog.add(AttachmentPreviewDialog, { attachment: file });
                return;
            }
            _originalOpen(file, files);
        };
    },
});
