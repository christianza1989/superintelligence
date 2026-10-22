# Local inventory import

Build a small local web application with a CSV upload, validation preview, and an atomic SQLite import. This is a functional prototype; clear accessible native controls are sufficient. Node 24 and its built-in SQLite support are available in WSL Debian. Ordinary libraries may be used; avoid downloading runtimes or browsers.

## Entry points and storage

- `node server.mjs` starts HTTP on `127.0.0.1`. Read `PORT` from the environment, supporting `0`, and print `READY <actual-port>` after listening. The default port is 3000.
- Store SQLite data under the `DATA_DIR` environment directory, creating it if necessary. Do not store application data elsewhere. Data and completed import keys must survive server restart.
- `component/app.mjs` exports synchronous `parseCsv(text)`, returning string[][] for valid CSV and throwing for malformed quoting or nonrectangular rows. Use this exported function in the application's actual CSV import path. Importing this module must not start a server, write files or contact a network. Additional application files are allowed.
- `GET /api/health` returns HTTP 200 with `{ "ok": true }`.

## CSV contract

The complete UTF-8 CSV is limited to **16,384 bytes** and **128 data rows** after one header row. Support one initial UTF-8 BOM, LF or CRLF record separators, quoted commas, escaped quotes (`""`), and quoted multiline names. Preserve quoted field contents, including their newlines. Ignore one final record separator, but do not silently discard additional empty records. Reject malformed quoting, text after a closing quote, and invalid UTF-8. A quote may start a quoted field only at the beginning of a field. A bare CR outside a quoted field is invalid.

The header must be exactly `sku,name,quantity` in that order. At least one data row is required, with exactly three fields per row:

- `sku`: one to 32 ASCII letters, digits, `_` or `-`. Preserve leading zeros. Match and deduplicate case-sensitively. Whitespace is invalid, not silently trimmed.
- `name`: preserve the original string; it must contain non-whitespace content and be at most 1,000 JavaScript string code units long. Treat it as text in the UI, never HTML.
- `quantity`: one or more ASCII decimal digits representing an integer from 0 to 1,000,000. Leading zeros are permitted. Signs, fractions, exponents and surrounding whitespace are invalid.

Reject duplicate SKUs within one upload. Invalid preview or commit must leave the entire inventory and import-key ledger unchanged.

## HTTP interface

`POST /api/preview` accepts raw CSV bytes with `Content-Type: text/csv`:

- Valid input: HTTP 200, `{ "valid": true, "rows": [{ "sku": "001", "name": "Widget", "quantity": 2 }], "errors": [] }`.
- Invalid CSV or field values, including too many rows: HTTP 200, `{ "valid": false, "rows": [], "errors": [...] }`.
- Oversize input: HTTP 413 with a nonempty `errors` array.
- Every error has `row` (a positive integer; header is row 1), `field` (`csv`, `sku`, `name` or `quantity`) and a nonempty human-readable `message`. Equivalent additional response fields are allowed.
- Preview never writes inventory data or import keys.

`POST /api/commit` accepts the same raw CSV and requires an `Idempotency-Key` header containing one to 64 ASCII letters, digits, `_` or `-`:

- Missing or invalid key: HTTP 400; no mutation.
- Invalid CSV or values: HTTP 422 with a nonempty `errors` array; no mutation.
- Oversize input: HTTP 413; no mutation.
- A valid new key atomically inserts or updates all rows by exact SKU and persists the key and raw-input SHA-256 in the same transaction. Return HTTP 200, `{ "applied": true, "rowCount": <number-of-data-rows> }`.
- Repeating a completed key with identical raw bytes returns HTTP 200, `{ "applied": false, "rowCount": <original-row-count> }`, without applying the import again.
- Reusing a completed key with different raw bytes returns HTTP 409, without changing data or the key.

`GET /api/items` returns HTTP 200, `{ "items": [{ "sku": "001", "name": "Widget", "quantity": 2 }] }`, sorted by ascending SKU using SQLite's binary ordering.

## Web interface

`GET /` provides a labelled file input named **CSV file**, **Preview** and **Commit** buttons, visible preview rows, row/field errors and the committed inventory. Commit starts disabled and remains disabled after an invalid preview. Changing the selected file invalidates the previous preview and disables Commit until a fresh valid preview. Preview alone must not change saved inventory. A valid commit updates the displayed inventory. Refresh and server restart must preserve the inventory. The flow must work on a narrow mobile viewport and with keyboard navigation.

Provide a short README with the run command, storage behavior, tests actually run and any known limitations. Never report success for checks that were not run.
