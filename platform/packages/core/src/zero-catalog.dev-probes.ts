// Development probes derived from bundled capabilities, not an independent holdout.
// A maintainer-held fit/no-fit set is still required before NEED1 acceptance.
export const repositoryNeedDevProbes = [
  { query: "image editor", expected: ["KDE/krita"] },
  { query: "Reikia rastrinės grafikos redaktoriaus", expected: ["KDE/krita"] },
  { query: "raster image processing", expected: ["GNOME/gimp"] },
  { query: "table transformations", expected: ["pandas-dev/pandas"] },
  { query: "lentelių transformacijos", expected: ["pandas-dev/pandas"] },
  { query: "data analysis", expected: ["pola-rs/polars"] },
  { query: "browser automation", expected: ["microsoft/playwright"] },
  { query: "naršyklės automatizacija", expected: ["microsoft/playwright"] },
  { query: "editable slides", expected: ["scanny/python-pptx"] },
  { query: "redaguojamos skaidrės", expected: ["scanny/python-pptx"] },
  { query: "CSV parser", expected: [] },
  { query: "CSV lentelių transformacijos", expected: [] },
  { query: "image editor healthcare compliance", expected: [] },
  { query: "image editor browser based", expected: [] },
  { query: "image editor license approved", expected: [] },
  { query: "brain surgery planning", expected: [] },
] as const;
