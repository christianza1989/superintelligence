# StockDesk

Build StockDesk, a local single-user inventory web application for two warehouses. Deliver working code, not a mock-up. The application must support product creation, stock receipts/issues, atomic transfers, CSV preview/import, an immutable movement history, search, low-stock filtering and CSV export.

## Runtime

Use Node.js 24 with node:sqlite. Serve the API and UI from one origin on 127.0.0.1; honor PORT and DB_PATH. Provide npm start and a prebuilt package that runs without npm install and declares no external npm dependencies of any kind. No paid services, external data transmission or sign-in. All initial product and movement tables are empty. The warehouse IDs are exactly main and reserve. Persist products and movements in a real SQLite database across application restarts.


`node server.mjs` is the application entrypoint used by `npm start`; it must honor `PORT`, including `0`, and `DB_PATH`. `component/app.mjs` exports synchronous `parseCsv(text)`, returning rectangular string[][] for valid comma-separated CSV and throwing for malformed quotes or nonrectangular rows. Support BOM, quoted commas, escaped quotes, multiline fields and LF/CRLF. This generic export must not enforce a business header or start a server, write files or contact a network on import. Use it in the actual application CSV path; business normalization and empty-record handling can happen around this generic boundary.

## Product and movement rules

A product has a stable string id, sku, name and minStock. Normalize sku by trimming and uppercasing; accept only 1-32 characters matching [A-Z0-9_-]. Trim name; require 1-120 characters. minStock defaults to 0 and is an integer from 0 through 1000000. Normalized SKU is unique. New products start with zero stock in both warehouses.

A stock adjustment takes reference, sku, warehouse, delta and optional note. Trim reference (1-80 characters) and note (0-500 characters). Normalize sku as above. warehouse is main or reserve. delta must be a nonzero integer between -1000000 and 1000000. Stock in each warehouse must stay between 0 and 1000000. Unknown products, invalid values and insufficient stock must never cause partial writes.

A transfer takes reference, sku, from, to, quantity and optional note. from and to are different valid warehouse IDs. quantity is an integer from 1 through 1000000. Move stock atomically and append two history entries with the same reference: a negative source entry followed by a positive destination entry. A transfer must not create or destroy total stock. Concurrent requests must not overspend stock.

Every accepted adjustment or transfer is one operation. References are globally unique across operations, including CSV imports. Reusing a reference with an identical normalized operation returns its original result without changing stock or history. Reusing it with a different normalized operation returns 409. A reference cannot turn an adjustment into a transfer. Notes are part of the normalized operation. Invalid requests are never stored. History entries have a stable string id, reference, sku, warehouse, integer delta, note and createdAt (ISO timestamp); newest entries appear last. No history editing/deletion or direct stock assignment.

## JSON API contract

All successful JSON responses have application/json content type. Error bodies have {"error":"<nonempty message>"}. Wrong field types, malformed JSON, missing required fields, invalid bounds and invalid filters return 400 without mutation. Defaults apply only when an optional field is absent. Explicit JSON null is invalid for every product, adjustment and transfer field because none of those fields is nullable. Semantic stock conflicts, duplicate SKUs and conflicting references return 409; unknown product IDs or SKUs return 404. Unknown API routes return 404.

- GET /api/health -> 200 {"ok":true}.
- POST /api/products with {sku,name,minStock?} -> 201 product.
- GET /api/products?q=&lowStock=true|false -> 200 {"products":[...]}. Each product includes id, sku, name, minStock, stock:{main,reserve}, totalStock and lowStock. lowStock means totalStock < minStock, including zero. Omitting the lowStock query parameter returns both low-stock and sufficiently stocked products. lowStock=true returns only products below their minimum; lowStock=false returns only products at or above their minimum. q matches normalized SKU or name case-insensitively. Supplied filters combine with AND. Return products sorted by SKU.
- POST /api/adjustments with {reference,sku,warehouse,delta,note?} -> 201 {"reference":"...","entries":[historyEntry]}; an identical replay -> 200 with the identical response body.
- POST /api/transfers with {reference,sku,from,to,quantity,note?} -> 201 {"reference":"...","entries":[sourceEntry,destinationEntry]}; an identical replay -> 200 with the identical response body.
- GET /api/movements?sku=&warehouse= -> 200 {"movements":[...]}. Filters are optional and combine with AND; sku is normalized. Return entries in insertion order. Unknown SKU returns an empty list; invalid warehouse returns 400.
- POST /api/import/preview with {"csv":"..."} -> 200 preview for syntactically valid CSV, including row errors. Preview performs no writes, reserves no references and is not a durable commit token.
- POST /api/import/commit with the same {"csv":"..."} -> 200 {"imported":N,"duplicates":D} when every row is acceptable against current state. Revalidate at commit time; never trust an earlier preview. Invalid rows -> 400 with the preview shape plus error. Stock conflicts or conflicting references -> 409 with the preview shape plus error. Any failed batch must leave all stock, history and references unchanged. Malformed CSV -> 400 {"error":"..."}. If one batch has both invalid-row and conflict errors, 400 takes precedence; unknown products inside CSV are invalid-row errors (400).
- GET /api/export -> 200 text/csv; charset=utf-8. Export ALL current products sorted by SKU, regardless of UI filters, using exactly the header sku,name,minStock,main,reserve,totalStock. Escape CSV fields correctly. CSV fields, including headers and numeric cells, may be quoted when optional or required; names, order and parsed cell values must remain exact.

## CSV contract

CSV strings are limited to 16,384 UTF-8 bytes and 128 nonempty data records after the header. Reject larger input with HTTP 400 and a nonempty error, without changing products, stock, history or completed references.

Use this exact case-sensitive header order: reference,sku,warehouse,delta,note. Require five fields per record. Support LF and CRLF, commas/newlines inside double-quoted fields, escaped double quotes (two adjacent quotes) and an optional UTF-8 BOM. Ignore entirely empty records. An unterminated quoted field, a quote in an unquoted field, text after a closing quote, a wrong header or wrong field count is malformed CSV. Reject empty input. Accept header-only CSV as an empty batch.

After CSV parsing, validate and normalize each row like an adjustment. Trim the delta cell and accept only a base-10 integer string with optional leading minus, no plus/decimal/exponent; apply the same nonzero bounds. row numbers count nonempty data records starting at 1. A preview is {"valid":boolean,"rows":[{"row":1,"status":"ready|duplicate|error","message":"..."}],"totals":{"ready":N,"duplicates":D,"errors":E}}. message is a string and must be nonempty for error rows. Include every data record in order.

Walk records in input order against a virtual copy of CURRENT stock and known references. A ready row changes only that virtual state. An identical already stored operation or earlier ready row is duplicate and has no effect. A conflicting reference, unknown product, invalid cell or stock underflow/overflow is error and has no effect. Later rows still validate against the state produced by earlier ready rows. valid is true exactly when errors is zero. Preview always leaves the real database untouched. Commit inserts only ready rows in one SQLite transaction; duplicates never add history. Reimporting the identical successful file changes nothing. A failed commit reserves no new references. Concurrent commits must preserve these same rules.

## Interface

Create a clear responsive interface at desktop 1440x900 and mobile 390x844. Use accessible labels, useful empty states, visible success/error feedback and keyboard-operable native controls. No horizontal page overflow, JavaScript/console errors or external browser requests. Render product names and notes as text, including strings containing HTML.

Use these exact English accessible names so the same external checks can operate both applications:

- Exactly one Products heading and one Movements heading.
- Product form: textboxes SKU and Product name, spinbutton Minimum stock, button Add product.
- A product table named Inventory with columns SKU, Name, Main, Reserve, Total and Minimum. Values must refresh after successful operations.
- Adjustment form: textbox Adjustment reference, combobox Adjustment SKU, combobox Warehouse, spinbutton Quantity change, textbox Adjustment note, button Apply adjustment.
- Transfer form: textbox Transfer reference, combobox Transfer SKU, combobox From warehouse, combobox To warehouse, spinbutton Quantity, textbox Transfer note, button Transfer stock.
- Both warehouse selectors use option labels Main and Reserve with values main and reserve. Product selectors display SKU values. A single native select has a single accessible name.
- CSV import: textarea CSV input, buttons Preview import and Commit import. Show every preview row and its status, plus ready/duplicate/error totals. Disable Commit import until a valid preview exists; changing CSV invalidates that preview. The server must still revalidate every commit.
- Search textbox Search products, checkbox Low stock only, button Export CSV. Export is independent of the filters. Include a readable movement history showing references, SKU, warehouse and signed quantity.

All creation, adjustment, transfer and CSV flows must use the same API and survive a reload. A transfer must work entirely by keyboard. Show errors next to the relevant form without clearing the user's input. Provide a brief README with startup, environment options, design decisions, checks actually run and known limitations. Implement and run meaningful checks, especially quoted CSV, idempotency, failed-batch rollback and concurrent overspending. Finish within 20 minutes; prioritize correctness and working flows.
