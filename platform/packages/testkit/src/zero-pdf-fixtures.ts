/** Frozen synthetic corpus, created before running Docling. No user documents or OCR claims. */
import { createHash } from "node:crypto";
export const ZERO_PDF_FIXTURE_VERSION = "born-digital-tables-v1";
export interface ZeroPdfFixtureTable {
  top: number;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
  /** Frozen numeric truth: row excludes the header; column is zero-based. */
  numbers: readonly { row: number; column: number; decimal: string }[];
}
export interface ZeroPdfFixture {
  id: string;
  title: string;
  pages: readonly { tables: readonly ZeroPdfFixtureTable[]; note?: string }[];
}
const standard = (
  rows: readonly (readonly string[])[],
  numbers: ZeroPdfFixtureTable["numbers"],
  top = 650,
): ZeroPdfFixtureTable => ({
  top,
  headers: ["Item", "Quantity", "Amount USD"],
  rows,
  numbers,
});
export const ZERO_PDF_FIXTURES: readonly ZeroPdfFixture[] = [
  {
    id: "01-integer-sales",
    title: "Quarterly sales",
    pages: [
      {
        tables: [
          standard(
            [
              ["Alpha", "2", "20"],
              ["Beta", "3", "60"],
              ["Gamma", "4", "120"],
            ],
            [
              { row: 0, column: 1, decimal: "2" },
              { row: 0, column: 2, decimal: "20" },
              { row: 1, column: 1, decimal: "3" },
              { row: 1, column: 2, decimal: "60" },
              { row: 2, column: 1, decimal: "4" },
              { row: 2, column: 2, decimal: "120" },
            ],
          ),
        ],
      },
    ],
  },
  {
    id: "02-decimal-prices",
    title: "Unit prices",
    pages: [
      {
        tables: [
          standard(
            [
              ["Paper", "5", "12.50"],
              ["Pens", "8", "7.25"],
              ["Folders", "2", "0.75"],
            ],
            [
              { row: 0, column: 1, decimal: "5" },
              { row: 0, column: 2, decimal: "12.50" },
              { row: 1, column: 1, decimal: "8" },
              { row: 1, column: 2, decimal: "7.25" },
              { row: 2, column: 1, decimal: "2" },
              { row: 2, column: 2, decimal: "0.75" },
            ],
          ),
        ],
      },
    ],
  },
  {
    id: "03-negative-adjustments",
    title: "Inventory adjustments",
    pages: [
      {
        tables: [
          standard(
            [
              ["Return", "-2", "-24.50"],
              ["Correction", "1", "0.00"],
              ["Credit", "0", "-3.75"],
            ],
            [
              { row: 0, column: 1, decimal: "-2" },
              { row: 0, column: 2, decimal: "-24.50" },
              { row: 1, column: 1, decimal: "1" },
              { row: 1, column: 2, decimal: "0.00" },
              { row: 2, column: 1, decimal: "0" },
              { row: 2, column: 2, decimal: "-3.75" },
            ],
          ),
        ],
      },
    ],
  },
  {
    id: "04-thousands",
    title: "Annual account totals",
    pages: [
      {
        tables: [
          standard(
            [
              ["North", "1200", "1,250.25"],
              ["South", "2500", "12,345.67"],
              ["West", "0", "0.50"],
            ],
            [
              { row: 0, column: 1, decimal: "1200" },
              { row: 0, column: 2, decimal: "1250.25" },
              { row: 1, column: 1, decimal: "2500" },
              { row: 1, column: 2, decimal: "12345.67" },
              { row: 2, column: 1, decimal: "0" },
              { row: 2, column: 2, decimal: "0.50" },
            ],
          ),
        ],
      },
    ],
  },
  {
    id: "05-parenthesized-debits",
    title: "Account statement",
    pages: [
      {
        tables: [
          standard(
            [
              ["Debit", "1", "(125.00)"],
              ["Deposit", "2", "250.00"],
              ["Fee", "1", "(2.50)"],
            ],
            [
              { row: 0, column: 1, decimal: "1" },
              { row: 0, column: 2, decimal: "-125.00" },
              { row: 1, column: 1, decimal: "2" },
              { row: 1, column: 2, decimal: "250.00" },
              { row: 2, column: 1, decimal: "1" },
              { row: 2, column: 2, decimal: "-2.50" },
            ],
          ),
        ],
      },
    ],
  },
  {
    id: "06-two-tables",
    title: "Two reporting periods",
    pages: [
      {
        tables: [
          standard(
            [
              ["January", "10", "100.00"],
              ["February", "20", "200.00"],
            ],
            [
              { row: 0, column: 1, decimal: "10" },
              { row: 0, column: 2, decimal: "100.00" },
              { row: 1, column: 1, decimal: "20" },
              { row: 1, column: 2, decimal: "200.00" },
            ],
            650,
          ),
          standard(
            [
              ["March", "30", "300.00"],
              ["April", "40", "400.00"],
            ],
            [
              { row: 0, column: 1, decimal: "30" },
              { row: 0, column: 2, decimal: "300.00" },
              { row: 1, column: 1, decimal: "40" },
              { row: 1, column: 2, decimal: "400.00" },
            ],
            400,
          ),
        ],
      },
    ],
  },
  {
    id: "07-two-pages",
    title: "Regional report",
    pages: [
      {
        tables: [
          standard(
            [
              ["East", "11", "110.25"],
              ["West", "12", "120.50"],
            ],
            [
              { row: 0, column: 1, decimal: "11" },
              { row: 0, column: 2, decimal: "110.25" },
              { row: 1, column: 1, decimal: "12" },
              { row: 1, column: 2, decimal: "120.50" },
            ],
          ),
        ],
      },
      {
        tables: [
          standard(
            [
              ["North", "13", "130.75"],
              ["South", "14", "140.00"],
            ],
            [
              { row: 0, column: 1, decimal: "13" },
              { row: 0, column: 2, decimal: "130.75" },
              { row: 1, column: 1, decimal: "14" },
              { row: 1, column: 2, decimal: "140.00" },
            ],
          ),
        ],
      },
    ],
  },
  {
    id: "08-empty-cells",
    title: "Partially reported amounts",
    pages: [
      {
        tables: [
          standard(
            [
              ["Known", "2", "25.00"],
              ["Unreported", "", ""],
              ["Zero", "0", "0.00"],
            ],
            [
              { row: 0, column: 1, decimal: "2" },
              { row: 0, column: 2, decimal: "25.00" },
              { row: 2, column: 1, decimal: "0" },
              { row: 2, column: 2, decimal: "0.00" },
            ],
          ),
        ],
      },
    ],
  },
  {
    id: "09-identifiers-and-totals",
    title: "Item identifiers are text",
    pages: [
      {
        tables: [
          standard(
            [
              ["SKU-00123", "5", "15.00"],
              ["SKU-00456", "7", "35.00"],
              ["Total", "12", "50.00"],
            ],
            [
              { row: 0, column: 1, decimal: "5" },
              { row: 0, column: 2, decimal: "15.00" },
              { row: 1, column: 1, decimal: "7" },
              { row: 1, column: 2, decimal: "35.00" },
              { row: 2, column: 1, decimal: "12" },
              { row: 2, column: 2, decimal: "50.00" },
            ],
          ),
        ],
      },
    ],
  },
  {
    id: "10-no-table-control",
    title: "Narrative control",
    pages: [
      {
        tables: [],
        note: "This synthetic page deliberately contains no table. Report reference 2026 is prose, not a numeric table cell.",
      },
    ],
  },
];
const escapePdf = (text: string) =>
  text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
const textAt = (text: string, x: number, y: number, size = 11) =>
  `BT /F1 ${size} Tf ${x} ${y} Td (${escapePdf(text)}) Tj ET`;
/** Minimal deterministic PDF 1.4 using built-in Helvetica. ASCII fixtures require no font download. */
export function renderZeroPdfFixture(fixture: ZeroPdfFixture): Buffer {
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const pageIds: number[] = [];
  for (const [index, page] of fixture.pages.entries()) {
    const pageId = objects.length + 1,
      streamId = pageId + 1;
    pageIds.push(pageId);
    const ops = [
      textAt(fixture.title, 48, 744, 18),
      textAt(`Synthetic fixture ${fixture.id} - page ${index + 1}`, 48, 716, 10),
    ];
    for (const table of page.tables) {
      const rows = [table.headers, ...table.rows],
        rowHeight = 28,
        left = 48,
        width = 500;
      const bottom = table.top - rows.length * rowHeight;
      for (let row = 0; row <= rows.length; row++)
        ops.push(
          `${left} ${table.top - row * rowHeight} m ${left + width} ${table.top - row * rowHeight} l S`,
        );
      for (let col = 0; col <= table.headers.length; col++) {
        const x = left + (col * width) / table.headers.length;
        ops.push(`${x.toFixed(3)} ${table.top} m ${x.toFixed(3)} ${bottom} l S`);
      }
      for (const [r, cells] of rows.entries())
        for (const [c, cell] of cells.entries())
          ops.push(
            textAt(
              cell,
              left + (c * width) / table.headers.length + 8,
              table.top - r * rowHeight - 18,
            ),
          );
    }
    if (page.note) {
      const words = page.note.split(" ");
      for (let i = 0; i < words.length; i += 10)
        ops.push(textAt(words.slice(i, i + 10).join(" "), 48, 650 - Math.floor(i / 10) * 20));
    }
    ops.push(
      textAt("RepositoryZero synthetic document - no real account or personal data", 48, 48, 9),
    );
    const stream = `${ops.join("\n")}\n`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`,
    );
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`);
  }
  objects[1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  let pdf = "%PDF-1.4\n% Synthetic corpus\n";
  const offsets = [0];
  for (const [index, body] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}
export function zeroPdfFixtureManifest() {
  return {
    version: ZERO_PDF_FIXTURE_VERSION,
    origin: "Generated synthetic data; no external PDFs",
    scope: "born-digital ASCII tables; OCR disabled",
    fixtures: ZERO_PDF_FIXTURES.map((fixture) => {
      const bytes = renderZeroPdfFixture(fixture);
      return {
        ...fixture,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.byteLength,
        provenance: fixture.pages.flatMap((page, index) =>
          page.tables.map((table, tableIndex) => ({
            page: index + 1,
            table: tableIndex,
            bbox: {
              left: 48,
              bottom: table.top - (table.rows.length + 1) * 28,
              right: 548,
              top: table.top,
            },
            coordinateOrigin: "bottom-left",
          })),
        ),
      };
    }),
  };
}
