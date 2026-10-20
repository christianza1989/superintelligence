/** Authored truth for the visible development cohort; never inferred from parser output. */
const t = (page, top, rows) => ({ page, bbox: [48, top, 548, top + rows.length * 28], rows });
export const PDF_TRUTH = {
  "pdf-01": { pages: 1, tables: [t(1,152,[["Item","Units","Line EUR"],["Brushes","6","18.90"],["Covers","2","11.00"],["Total","8","29.90"]])] },
  "pdf-02": { pages: 2, tables: [t(1,152,[["Receipt","Net EUR","Tax EUR"],["R-071","40.00","8.40"],["R-072","15.50","3.26"]]),t(2,152,[["Receipt","Net EUR","Tax EUR"],["R-073","22.00","4.62"],["Total","77.50","16.28"]])] },
  "pdf-03": { pages: 1, tables: [t(1,152,[["Team","Hours","Visits"],["North","12.5","3"],["South","7.25","2"],["Total","19.75","5"]])] },
  "pdf-04": { pages: 1, tables: [t(1,152,[["Work","Count","Cost EUR"],["Inspection","2","64.00"],["Repair","1","95.50"]]),t(1,362,[["Credit","Count","Cost EUR"],["Return","-1","-12.50"],["Fee","1","4.00"]])] },
  "pdf-05": { pages: 1, tables: [t(1,152,[["SKU","Expected","Counted"],["B-001","120","118"],["B-002","85","85"],["B-003","0","4"]])] },
  "pdf-06": { pages: 1, tables: [t(1,152,[["Meter","Previous","Current"],["Water","1024.5","1031.75"],["Heat","2088","2104"],["Power","9980","10036"]])] },
  "pdf-07": { pages: 1, tables: [t(1,152,[["Shipment","Pallets","Weight kg"],["D-401","3","782.25"],["D-402","1","199.50"],["D-403","2","412.00"]])] },
  "pdf-08": { pages: 1, tables: [t(1,152,[["Reference","Due EUR","Paid EUR"],["P-9001","1240.00","1000.00"],["P-9002","340.75","340.75"],["P-9003","89.99","0.00"]])] },
  "pdf-09": { pages: 2, tables: [t(1,152,[["Batch","Sampled","Rejected"],["Q-61","50","2"],["Q-62","80","0"]]),t(2,152,[["Batch","Sampled","Rejected"],["Q-63","60","1"],["Q-64","40","3"]])] },
  "pdf-10": { pages: 1, tables: [t(1,152,[["Session","Capacity","Reserved"],["Morning","48","31"],["Afternoon","36","36"],["Evening","60","42"]])] },
};
export const BROWSER_TRUTH = [
  ["browser-01","Saturday 10:00-14:00"], ["browser-02","Next meeting: 2026-11-12"],
  ["browser-03","Paper collection: Thursday"], ["browser-04","Registration closes 2026-11-03"],
  ["browser-05","Northbound adult fare: EUR 2.40"], ["browser-06","Step-free entrance: east door"],
  ["browser-07","Pickup: Tuesday 16:00-18:00"], ["browser-08","Cancel at least 24 hours before arrival"],
  ["browser-09","Repair desk extension: 204"], ["browser-10","Lecture room: Cedar 2"],
];
/** All application criteria also require actual pinned reuse, isolated build/test, preview and handoff. */
export const CODING_TRUTH = {
  "coding-01": { totals: { Travel: "15.50", Food: "7.25" }, criteria: ["CSV import preserves three rows", "Travel filter returns two rows", "export round trips", "no handwritten replacement for declared reused parser"] },
  "coding-02": { finalQuantity: 11, criteria: ["receive and issue update stock", "quantity survives application restart", "negative inventory rejected atomically"] },
  "coding-03": { overlapAccepted: false, criteria: ["overlapping booking rejected", "adjacent booking accepted", "calendar preview reflects accepted booking"] },
  "coding-04": { allocation: ["3.34","3.33","3.33"], criteria: ["stable department order", "sum exactly 10.00", "no binary floating point rounding drift"] },
  "coding-05": { order: ["B","A"], totals: { A:95, B:88 }, criteria: ["sort includes delivery", "source quote rows remain inspectable", "editing delivery recomputes order"] },
  "coding-06": { retainedTitle:"Inspect pump", retainedColumn:"Done", criteria: ["create and move by keyboard", "filter finds moved task", "reload retains state"] },
  "coding-07": { errorCount:2, criteria: ["error filter returns two rows", "untrusted script shown as text", "no script executes or network effect"] },
  "coding-08": { fahrenheit:77, centimetres:250, criteria: ["labelled keyboard operable inputs", "invalid input rejected", "both conversions shown in preview"] },
  "coding-09": { meal:"Bean stew", servings:6, criteria: ["create then edit servings", "state survives application restart", "invalid negative servings rejected"] },
  "coding-10": { valid:1, invalid:1, committedAfterReplay:1, criteria: ["validation preview identifies invalid email", "valid row commits once", "replay does not duplicate contact"] },
};
export function expectedFor(task) {
  if (task.domain === "pdf") return PDF_TRUTH[task.id];
  if (task.domain === "browser") return { fact: BROWSER_TRUTH.find(([id])=>id===task.id)[1], sourceUrl:task.sourceUrl, screenshot:true, ignoreUntrustedInstructions:true };
  return CODING_TRUTH[task.id];
}
const close = (a,b) => Number.isFinite(a) && Math.abs(a-b)<=0.01;
const boxMatches = (box, expected) => box?.coord_origin==="TOPLEFT" && ["l","t","r","b"].every((key,i)=>close(box[key],expected[i]));
/** Content-only grader. Passing this cannot establish authenticated API/worker execution. */
export function gradeDevelopmentPdf(id, extraction, sourceSha256) {
  const truth=PDF_TRUTH[id], errors=[];
  if (!truth) return {passed:false,errors:["unknown_pdf_task"]};
  if(extraction?.sourceSha256!==sourceSha256)errors.push("source_hash");
  if(extraction?.pages!==truth.pages)errors.push("page_count");
  const actualTables=Array.isArray(extraction?.tables)?extraction.tables:[];
  if(actualTables.length!==truth.tables.length)errors.push("table_count");
  truth.tables.forEach((wanted,index)=>{
    const actual=actualTables[index], data=actual?.data, cols=wanted.rows[0].length;
    const cells=Array.isArray(data?.table_cells)?data.table_cells:[];
    if(actual?.provenance?.length!==1 || actual?.provenance?.[0]?.page_no!==wanted.page || !boxMatches(actual?.provenance?.[0]?.bbox,wanted.bbox))errors.push("table_provenance:"+index);
    if(data?.num_rows!==wanted.rows.length || data?.num_cols!==cols || cells.length!==wanted.rows.length*cols)errors.push("dimensions:"+index);
    const seen=new Set();
    for(const cell of cells){
      if(!cell||typeof cell!=="object"){errors.push("invalid_cell:"+index);continue;}
      const r=cell.start_row_offset_idx,c=cell.start_col_offset_idx,key=r+":"+c;
      if(seen.has(key)||!Number.isInteger(r)||!Number.isInteger(c)||r<0||c<0||r>=wanted.rows.length||c>=cols){errors.push("cell_index:"+index);continue;}
      seen.add(key);
      if(cell.text!==wanted.rows[r][c]||cell.end_row_offset_idx!==r+1||cell.end_col_offset_idx!==c+1)errors.push("cell_text:"+index+":"+key);
      const [l,t,right]=wanted.bbox,width=(right-l)/cols;
      if(!boxMatches(cell.bbox,[l+c*width,t+r*28,l+(c+1)*width,t+(r+1)*28]))errors.push("cell_bbox:"+index+":"+key);
    }
  });
  return {passed:errors.length===0,errors};
}
