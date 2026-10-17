"""Separate frozen pdfplumber ruled-table candidate; no OCR, ML or fallback."""
import hashlib
import json
from pathlib import Path
import re
import resource
import signal
import sys
import time
import traceback

PROFILE = json.loads(Path("/profile/profile.json").read_text())
LIMITS = PROFILE["limits"]

def timeout(_signal, _frame):
    raise TimeoutError("PDF_RUNTIME_TIMEOUT")

signal.signal(signal.SIGALRM, timeout)

def emit(value):
    raw = json.dumps(value, separators=(",", ":"), ensure_ascii=True).encode()
    if len(raw) > LIMITS["outputBytes"]:
        raw = b'{"state":"failed","code":"PDF_OUTPUT_LIMIT"}'
    sys.stdout.buffer.write(raw + b"\n")
    sys.stdout.buffer.flush()

def memory():
    try:
        container = int(Path("/sys/fs/cgroup/memory.peak").read_text())
    except (OSError, ValueError):
        container = None
    return {"peakRssBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024, "containerPeakMemoryBytes": container}

def convert(filename):
    started = time.monotonic()
    result = {"file": filename, "state": "failed", "inputSha256": None}
    signal.alarm(LIMITS["runtimeMs"] // 1000)
    try:
        if Path(filename).name != filename or not filename.endswith(".pdf"):
            raise ValueError("PDF_INPUT_DENIED")
        path = Path("/input") / filename
        info = path.lstat()
        if path.is_symlink() or not path.is_file() or info.st_size > LIMITS["inputBytes"]:
            raise ValueError("PDF_INPUT_LIMIT")
        data = path.read_bytes()
        if not data.startswith(b"%PDF-"):
            raise ValueError("PDF_INPUT_FORMAT")
        result["inputSha256"] = hashlib.sha256(data).hexdigest()
        import pypdfium2
        with pypdfium2.PdfDocument(str(path)) as document:
            if len(document) > LIMITS["pages"]:
                raise ValueError("PDF_PAGE_LIMIT")
        import pdfplumber
        tables = []
        with pdfplumber.open(path, strict_metadata=True, unicode_norm="NFC") as document:
            if document.doc.encryption or not document.doc.is_extractable:
                raise ValueError("PDF_ENCRYPTED_OR_UNSUPPORTED")
            for page in document.pages:
                parsed = page.find_tables(table_settings=PROFILE["tableSettings"])
                if len(parsed) + len(tables) > 32:
                    raise ValueError("PDF_TABLE_LIMIT")
                for table in parsed:
                    rows = table.extract()
                    if not rows or len(rows) > 128:
                        raise ValueError("PDF_TABLE_SHAPE_UNSUPPORTED")
                    columns = len(rows[0])
                    if not columns or columns > 32 or len(rows) * columns > 512:
                        raise ValueError("PDF_TABLE_SHAPE_UNSUPPORTED")
                    cells = []
                    for y, row in enumerate(rows):
                        if len(row) != columns or len(table.rows[y].cells) != columns:
                            raise ValueError("PDF_TABLE_SHAPE_UNSUPPORTED")
                        for x, text in enumerate(row):
                            # No invented grid cells or span inference; absent geometry is unsupported.
                            box = table.rows[y].cells[x]
                            if box is None:
                                raise ValueError("PDF_MERGED_CELL_UNSUPPORTED")
                            value = text if text is not None else ""
                            if len(value) > 4096:
                                raise ValueError("PDF_CELL_LIMIT")
                            cells.append({"text": value, "start_row_offset_idx": y, "end_row_offset_idx": y+1,
                                          "start_col_offset_idx": x, "end_col_offset_idx": x+1,
                                          "bbox": {"l": box[0], "t": box[1], "r": box[2], "b": box[3], "coord_origin": "TOPLEFT"}})
                    box = table.bbox
                    tables.append({"data": {"num_rows": len(rows), "num_cols": columns, "table_cells": cells},
                                   "provenance": [{"page_no": page.page_number,
                                                   "bbox": {"l": box[0], "t": box[1], "r": box[2], "b": box[3], "coord_origin": "TOPLEFT"}}]})
                page.close()
            result.update({"state": "completed", "pages": len(document.pages), "tables": tables})
            if len(json.dumps(result).encode()) > LIMITS["outputBytes"]:
                result = {"file": filename, "state": "failed", "code": "PDF_OUTPUT_LIMIT", "inputSha256": result["inputSha256"]}
    except TimeoutError:
        result["code"] = "PDF_RUNTIME_TIMEOUT"
    except Exception as error:
        message = str(error)
        result["code"] = message if isinstance(error, ValueError) and re.fullmatch(r"PDF_[A-Z_]{1,64}", message) else "PDF_CONVERSION_FAILED"
        result["errorType"] = type(error).__name__
        module = getattr(error, "name", None)
        result["missingModule"] = module if isinstance(module, str) and re.fullmatch(r"[A-Za-z0-9_.]{1,128}", module) else None
        result["redactedFrames"] = [{"file": Path(frame.filename).name[:80], "line": frame.lineno, "function": frame.name[:80]} for frame in traceback.extract_tb(error.__traceback__, limit=6)]
    finally:
        signal.alarm(0)
        result["elapsedMs"] = round((time.monotonic()-started)*1000)
        result.update(memory())
    return result

def main():
    if len(sys.argv) == 2 and sys.argv[1] == "--suite":
        manifest = json.loads(Path("/input/manifest.json").read_text())
        files = [fixture["id"] + ".pdf" for fixture in manifest["fixtures"]]
        if len(files) != 10:
            raise ValueError("PDF_FIXTURE_COUNT")
        files.append(files[0])
    elif len(sys.argv) == 2:
        files = [sys.argv[1]]
    else:
        emit({"state": "blocked", "code": "PDF_ARGUMENTS"})
        return
    for index, filename in enumerate(files):
        emit({"event": "started", "sequence": index})
        result = convert(filename)
        result.update({"sequence": index, "initializationMs": 0, "warmRepeat": index == 10})
        emit(result)

if __name__ == "__main__":
    main()
