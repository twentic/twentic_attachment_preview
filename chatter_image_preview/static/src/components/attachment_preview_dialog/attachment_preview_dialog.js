/** @odoo-module **/

import { Component, onWillStart, useState, markup } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";

// ---------------------------------------------------------------------------
// Type detection
// ---------------------------------------------------------------------------

const CSV_MIMES = new Set([
    "text/csv",
    "application/csv",
    "text/comma-separated-values",
]);

const MARKDOWN_MIMES = new Set([
    "text/markdown",
    "text/x-markdown",
]);

const XLSX_MIMES = new Set([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/xlsx",
]);

const XLS_MIMES = new Set([
    "application/vnd.ms-excel",
    "application/xls",
]);

/** File-type icons — Bootstrap + Font Awesome classes used in Odoo. */
const TYPE_ICONS = {
    csv:      "fa-file-text-o text-success",
    markdown: "fa-file-text-o text-primary",
    xlsx:     "fa-file-excel-o text-success",
    xls:      "fa-file-excel-o text-success",
    unknown:  "fa-file-o text-muted",
};

/**
 * Detect the preview type from MIME type and file name extension.
 *
 * @param {string} mime
 * @param {string} name
 * @returns {"csv"|"markdown"|"xlsx"|"xls"|"unknown"}
 */
function detectPreviewType(mime, name) {
    const ext = (name ?? "").toLowerCase().split(".").pop();
    if (CSV_MIMES.has(mime)      || ext === "csv")                    return "csv";
    if (MARKDOWN_MIMES.has(mime) || ext === "md" || ext === "markdown") return "markdown";
    if (XLSX_MIMES.has(mime)     || ext === "xlsx")                   return "xlsx";
    if (XLS_MIMES.has(mime)      || ext === "xls")                    return "xls";
    return "unknown";
}

// ---------------------------------------------------------------------------
// CSV parser — RFC 4180 compliant
// ---------------------------------------------------------------------------

/**
 * Parse a CSV string into a 2-D array of strings.
 * Handles quoted fields, escaped double-quotes and CRLF / LF line endings.
 *
 * @param {string} raw
 * @returns {string[][]}
 */
function parseCsv(raw) {
    const rows = [];
    let row   = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0, len = raw.length; i < len; i++) {
        const ch   = raw[i];
        const next = raw[i + 1];

        if (inQuotes) {
            if (ch === '"' && next === '"') { field += '"'; i++; }
            else if (ch === '"')             { inQuotes = false; }
            else                             { field += ch; }
        } else {
            if      (ch === '"')                       { inQuotes = true; }
            else if (ch === ',')                       { row.push(field); field = ""; }
            else if (ch === '\r' && next === '\n')     { row.push(field); field = ""; rows.push(row); row = []; i++; }
            else if (ch === '\n' || ch === '\r')       { row.push(field); field = ""; rows.push(row); row = []; }
            else                                       { field += ch; }
        }
    }

    // Flush last field / row
    if (field || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    // Drop trailing empty rows
    while (rows.length && rows[rows.length - 1].every((f) => !f.trim())) {
        rows.pop();
    }

    return rows;
}

// ---------------------------------------------------------------------------
// Markdown renderer — basic subset, no external dependencies
// ---------------------------------------------------------------------------

const _esc = (s) =>
    s.replace(/&/g, "&amp;")
     .replace(/</g, "&lt;")
     .replace(/>/g, "&gt;")
     .replace(/"/g, "&quot;");

/** Apply inline styles (bold, italic, inline-code, links) to an escaped line. */
function _inline(s) {
    return s
        .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
        .replace(/\*\*(.+?)\*\*/g,     "<strong>$1</strong>")
        .replace(/__(.+?)__/g,         "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g,         "<em>$1</em>")
        .replace(/_(.+?)_/g,           "<em>$1</em>")
        .replace(/`(.+?)`/g,           "<code>$1</code>")
        .replace(
            /\[(.+?)\]\((.+?)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
        );
}

/**
 * Convert a Markdown string to an HTML string (basic CommonMark subset).
 * The returned value is meant to be wrapped in OWL's markup() before t-out.
 *
 * Supported: headings, bold/italic/code, fenced code blocks, unordered and
 * ordered lists, blockquotes, horizontal rules, inline links.
 *
 * @param {string} raw
 * @returns {string}
 */
function renderMarkdown(raw) {
    const lines = raw.split(/\r?\n/);
    const out   = [];
    let inCodeBlock = false;
    let codeLang    = "";
    let inList      = false;
    let listTag     = "ul";

    for (const line of lines) {
        // ── Fenced code block ────────────────────────────────────────────
        const codeOpen = line.match(/^```(\w*)/);
        if (codeOpen && !inCodeBlock) {
            if (inList) { out.push(`</${listTag}>`); inList = false; }
            codeLang = codeOpen[1] || "";
            out.push(`<pre><code${codeLang ? ` class="language-${codeLang}"` : ""}>`);
            inCodeBlock = true;
            continue;
        }
        if (inCodeBlock) {
            if (line.startsWith("```")) { out.push("</code></pre>"); inCodeBlock = false; }
            else                        { out.push(_esc(line) + "\n"); }
            continue;
        }

        const e = _esc(line);

        // ── Headings ─────────────────────────────────────────────────────
        const hm = e.match(/^(#{1,6}) (.+)/);
        if (hm) {
            if (inList) { out.push(`</${listTag}>`); inList = false; }
            out.push(`<h${hm[1].length} class="mt-3">${_inline(hm[2])}</h${hm[1].length}>`);
            continue;
        }

        // ── Horizontal rule ───────────────────────────────────────────────
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
            if (inList) { out.push(`</${listTag}>`); inList = false; }
            out.push("<hr/>");
            continue;
        }

        // ── Blockquote ────────────────────────────────────────────────────
        if (e.startsWith("&gt; ")) {
            if (inList) { out.push(`</${listTag}>`); inList = false; }
            out.push(`<blockquote class="blockquote ps-3 border-start border-3">${_inline(e.slice(5))}</blockquote>`);
            continue;
        }

        // ── Unordered list ────────────────────────────────────────────────
        const um = line.match(/^[-*+] (.+)/);
        if (um) {
            if (!inList || listTag !== "ul") {
                if (inList) out.push(`</${listTag}>`);
                out.push("<ul>"); inList = true; listTag = "ul";
            }
            out.push(`<li>${_inline(_esc(um[1]))}</li>`);
            continue;
        }

        // ── Ordered list ─────────────────────────────────────────────────
        const om = line.match(/^\d+\. (.+)/);
        if (om) {
            if (!inList || listTag !== "ol") {
                if (inList) out.push(`</${listTag}>`);
                out.push("<ol>"); inList = true; listTag = "ol";
            }
            out.push(`<li>${_inline(_esc(om[1]))}</li>`);
            continue;
        }

        // Close any open list on a non-list, non-empty line
        if (inList && line.trim() !== "") {
            out.push(`</${listTag}>`);
            inList = false;
        }

        // ── Empty line ────────────────────────────────────────────────────
        if (line.trim() === "") {
            out.push('<div class="mb-2"></div>');
            continue;
        }

        // ── Normal paragraph ──────────────────────────────────────────────
        out.push(`<p class="mb-1">${_inline(e)}</p>`);
    }

    if (inList)      out.push(`</${listTag}>`);
    if (inCodeBlock) out.push("</code></pre>");

    return out.join("\n");
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function fetchText(url) {
    const resp = await fetch(url, { credentials: "include" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.text();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class AttachmentPreviewDialog extends Component {
    static template   = "chatter_image_preview.AttachmentPreviewDialog";
    static components = { Dialog };
    static props      = {
        close:      Function,
        attachment: Object,
    };

    // Expose _t so the XML template can call _t('…') directly.
    _t = _t;

    setup() {
        this.state = useState({
            loading:        true,
            error:          null,
            type:           null,
            rows:           [],   // CSV: 2-D array of strings
            html:           null, // Markdown: markup()-wrapped HTML string
            sheets:         [],   // XLSX: [{ name: string, rows: string[][] }]
            activeSheetIdx: 0,    // XLSX: index of the currently visible sheet tab
        });

        onWillStart(() => this._load());
    }

    async _load() {
        const { attachment } = this.props;
        const mime = attachment?.mimetype ?? "";
        const name = attachment?.name ?? attachment?.filename ?? "";
        const type = detectPreviewType(mime, name);

        this.state.type = type;

        try {
            if (type === "csv") {
                const text = await fetchText(attachment.downloadUrl);
                this.state.rows = parseCsv(text);
            } else if (type === "markdown") {
                const text = await fetchText(attachment.downloadUrl);
                this.state.html = markup(renderMarkdown(text));
            } else if (type === "xlsx") {
                // Ask the server-side controller to parse the binary XLSX
                // and return rows as JSON (openpyxl, already in Odoo 18).
                const resp = await fetch(
                    `/chatter_image_preview/xlsx/${attachment.id}`,
                    { credentials: "include" }
                );
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const data = await resp.json();
                if (data.error) throw new Error(data.error);
                this.state.sheets = data.sheets ?? [];
            }
            // xls / unknown: no fetch — dialog shows metadata + download button
        } catch (_err) {
            this.state.error = _t("Could not load the attachment preview.");
        } finally {
            this.state.loading = false;
        }
    }

    // ── Getters ──────────────────────────────────────────────────────────────

    get fileIcon() {
        return TYPE_ICONS[this.state.type] ?? TYPE_ICONS.unknown;
    }

    get downloadUrl() {
        // downloadUrl is defined in FileModelMixin:
        //   /web/content/<id>?access_token=...&download=true
        return this.props.attachment.downloadUrl;
    }

    get fileName() {
        // `name` is the display name; `filename` is the stored filename
        return this.props.attachment.name ?? this.props.attachment.filename ?? "";
    }

    /** Rows of the currently selected XLSX sheet. */
    get activeSheetRows() {
        const sheet = this.state.sheets[this.state.activeSheetIdx];
        return sheet ? sheet.rows : [];
    }

    // ── Handlers ─────────────────────────────────────────────────────────────

    onClickSheet(idx) {
        this.state.activeSheetIdx = idx;
    }

    onClickClose() {
        this.props.close();
    }
}
