# Chatter Image Preview

**Version:** 18.0.1.3.0
**Author:** TwenTIC
**License:** LGPL-3
**Dependencies:** `mail`, `web`

---

## What this module does

By default, Odoo 18 only previews images and PDFs inline; all other attachment types trigger a browser download. This module extends that behaviour to cover additional file types:

| File type | Without this module | With this module |
|---|---|---|
| **Image** (`image/*`) | Expands or opens a new tab | Opens in Odoo's native **FileViewer** popup |
| **PDF** (`application/pdf`) | Triggers a browser download | Opens in Odoo's native **FileViewer** popup |
| **CSV** (`.csv`) | Triggers a browser download | Opens in a **spreadsheet-style table** dialog |
| **Markdown** (`.md`, `.markdown`) | Triggers a browser download | Opens as **rendered HTML** in a dialog |
| **Excel / XLSX** (`.xlsx`) | Triggers a browser download | Opens with **sheet data** in a table dialog, with tab navigation for multi-sheet files |
| **Excel / XLS** (`.xls`) | Triggers a browser download | Shows file metadata and a Download button in a dialog |

### How it works internally

The module patches two OWL 2 components and adds a Python HTTP controller.

#### Front-end patches (`attachment_card_patch.js`)

**Patch 1 — `Attachment.prototype.isViewable`**

The `Attachment` model (from `@mail/core/common/attachment_model`) exposes an `isViewable` getter that controls whether the attachment card shows the magnifier cursor and hover effect. By default it only returns `true` for images, PDFs, videos, and text/HTML files.

This patch extends `isViewable` to also return `true` for CSV, Markdown, XLSX, and XLS files, so those cards get the correct visual treatment.

**Patch 2 — `AttachmentList.prototype.setup`**

The `AttachmentList` component (from `@mail/core/common/attachment_list`) manages the attachment grid in the Chatter. Its template calls `this.fileViewer.open(attachment, props.attachments)` on every card click.

`fileViewer.open` (from `@web/core/file_viewer/file_viewer_hook`) has a built-in guard — `if (!file.isViewable) { return; }` — and only knows how to render natively viewable types.

The patch wraps `this.fileViewer.open` in `setup()` (after `super.setup()`) so that, when a custom-preview type is clicked, the custom `AttachmentPreviewDialog` is opened instead of the native viewer.

#### Custom dialog (`AttachmentPreviewDialog`)

An OWL `Dialog` component (`attachment_preview_dialog.js` + `.xml`) that handles all three non-native preview types:

- **CSV** — fetched as text from `attachment.downloadUrl` and parsed with a built-in RFC 4180 parser (no external dependencies). Rendered as a Bootstrap striped table.
- **Markdown** — fetched as text and converted to HTML by a built-in Markdown-to-HTML renderer covering headings, bold/italic/code, fenced code blocks, ordered/unordered lists, blockquotes, horizontal rules, and inline links. Output is sanitised and passed through OWL's `markup()`.
- **XLSX** — the binary ZIP+XML format cannot be parsed safely in pure JavaScript without a large library. Instead, the dialog calls a server-side route that parses the file and returns rows as JSON.
- **XLS / unknown** — shows a file icon, the MIME type, and a Download button.

#### Python controller (`controllers/main.py`)

Route: `GET /chatter_image_preview/xlsx/<int:attachment_id>`
Auth: `user` (requires a logged-in session)

Reads the attachment bytes via `attachment.raw`, parses them with `openpyxl` (bundled in every Odoo 18 installation), and returns:

```json
{
  "sheets": [
    { "name": "Sheet1", "rows": [["A1", "B1"], ["A2", "B2"]] }
  ]
}
```

Safety limits: max **2 000 rows** and **20 sheets** per file.

---

## File structure

```
chatter_image_preview/
├── __init__.py
├── __manifest__.py
├── controllers/
│   ├── __init__.py
│   └── main.py                          # XLSX HTTP controller
├── i18n/
│   ├── chatter_image_preview.pot
│   ├── ca.po
│   ├── de.po
│   ├── es.po
│   ├── fr.po
│   ├── it.po
│   └── pt.po
└── static/src/
    ├── attachment_card_patch/
    │   └── attachment_card_patch.js     # Patches AttachmentList + Attachment
    └── components/
        └── attachment_preview_dialog/
            ├── attachment_preview_dialog.js
            └── attachment_preview_dialog.xml
```

---

## Installation

1. Copy the `chatter_image_preview` folder into your Odoo addons path.
2. Restart the Odoo server.
3. Go to **Settings → Activate developer mode**.
4. Navigate to **Apps**, click **Update Apps List**, search for `Chatter Image Preview` and click **Install**.
5. A hard browser refresh (`Ctrl+Shift+R`) may be needed on first load to pick up the new JS bundle.

---

## User manual

### Opening a file preview

1. Open any record that has a Chatter (Tasks, Projects, CRM Leads, Sale Orders, etc.).
2. Scroll down to the **Chatter** section.
3. In the **Files / Attachments** area you will see thumbnail cards for uploaded files.
4. Hover over a card — supported file types will show a magnifier icon.
5. Click the card to open the preview.

### Image and PDF previews

Images and PDFs open in Odoo's native **FileViewer** overlay, which provides:

- A full-screen dark-backdrop overlay.
- **Left / right arrow navigation** to browse all images and PDFs in the same thread.
- A zoom / download / print toolbar.
- Keyboard navigation (`←` `→` arrows, `Escape` to close).

### CSV previews

The file is displayed as a **scrollable table** with the first row treated as the header (dark background, sticky). The full dialog is scrollable up to 70 % of the viewport height.

### Markdown previews

The `.md` file is rendered as formatted HTML: headings, bold, italic, inline code, fenced code blocks, lists, blockquotes, horizontal rules, and links are all supported.

### XLSX previews

The spreadsheet data is shown as a Bootstrap table. When the file contains **multiple sheets**, a row of tabs appears at the top of the dialog — click a tab to switch to that sheet.

### Closing a custom preview dialog

- Click the **Close** button in the dialog footer.
- Or click the **✕** button in the dialog header.

### Downloading a file from a custom preview dialog

All custom-type dialogs include a **Download** button in the footer (and in the header area for error states).

### Files that still download directly

File types not listed in the supported-types table above continue to behave exactly as Odoo does by default — clicking them triggers the browser's native download or opens a new tab.

---

## Supported languages

The module ships translations for:

| Code | Language |
|---|---|
| `es` | Spanish / Español |
| `ca` | Catalan / Català |
| `de` | German / Deutsch |
| `fr` | French / Français |
| `pt` | Portuguese / Português |
| `it` | Italian / Italiano |

---

## Compatibility notes

- Tested against **Odoo 18.0**.
- Requires **`openpyxl`**, which ships with every Odoo 18 installation; no additional Python packages are needed.
- The module creates no database tables and defines no new views; it is safe to install and uninstall at any time.
- To add support for an additional MIME type or extension, update the `CUSTOM_PREVIEW_MIMES` / `CUSTOM_PREVIEW_EXTENSIONS` sets at the top of `attachment_card_patch.js` and add the corresponding handling branch in `AttachmentPreviewDialog._load()`.
