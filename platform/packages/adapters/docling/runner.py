"""Fixed born-digital PDF profile. No network, OCR, plugin, shell or scheduler."""
import hashlib
import json
import os
from pathlib import Path
import resource
import signal
import sys
import time

MAX_INPUT = 1048576
MAX_OUTPUT = 1048576
MAX_PAGES = 5
TIMEOUT = 120

def timeout(_signal, _frame):
    raise TimeoutError("PDF_RUNTIME_TIMEOUT")

signal.signal(signal.SIGALRM, timeout)

def emit(value):
    raw = json.dumps(value, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    if len(raw) > MAX_OUTPUT:
        raw = b'{"state":"failed","code":"PDF_OUTPUT_LIMIT"}'
    sys.stdout.buffer.write(raw + b"\n")
    sys.stdout.buffer.flush()

def peak_rss():
    # Linux reports KiB; report process RSS separately from image/cache disk.
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024

def container_peak():
    try:
        return int(Path("/sys/fs/cgroup/memory.peak").read_text())
    except (OSError, ValueError):
        return None

def make_converter():
    import torch
    torch.set_num_threads(2)
    torch.set_num_interop_threads(2)
    from docling.datamodel.accelerator_options import AcceleratorDevice, AcceleratorOptions
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions, LayoutObjectDetectionOptions, TableFormerMode
    from docling.datamodel.stage_model_specs import ObjectDetectionModelSpec
    from docling.document_converter import DocumentConverter, PdfFormatOption
    options = PdfPipelineOptions(
        artifacts_path=Path("/models"),
        do_ocr=False,
        do_table_structure=True,
        do_code_enrichment=False,
        do_formula_enrichment=False,
        do_picture_classification=False,
        do_picture_description=False,
        enable_remote_services=False,
        allow_external_plugins=False,
        document_timeout=110.0,
        accelerator_options=AcceleratorOptions(device=AcceleratorDevice.CPU, num_threads=2),
        layout_options=LayoutObjectDetectionOptions(model_spec=ObjectDetectionModelSpec(
            name="PinnedHeron", repo_id="docling-project/docling-layout-heron",
            revision="8f39ad3c0b4c58e9c2d2c84a38465abf757272d8")),
    )
    options.table_structure_options.mode = TableFormerMode.ACCURATE
    return DocumentConverter(allowed_formats=[InputFormat.PDF], format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)})

def convert(converter, filename):
    started = time.monotonic()
    result = {"file": filename, "state": "failed", "inputSha256": None}
    signal.alarm(TIMEOUT)
    try:
        # Only fixed /input files; no URLs or caller-supplied paths.
        if Path(filename).name != filename or not filename.endswith(".pdf"):
            raise ValueError("PDF_INPUT_DENIED")
        path = Path("/input") / filename
        info = path.lstat()
        if path.is_symlink() or not path.is_file() or info.st_size > MAX_INPUT:
            raise ValueError("PDF_INPUT_LIMIT")
        data = path.read_bytes()
        if not data.startswith(b"%PDF-"):
            raise ValueError("PDF_INPUT_FORMAT")
        result["inputSha256"] = hashlib.sha256(data).hexdigest()
        import pypdfium2
        with pypdfium2.PdfDocument(str(path)) as pdf:
            if len(pdf) > MAX_PAGES:
                raise ValueError("PDF_PAGE_LIMIT")
        converted = converter.convert(path, max_num_pages=MAX_PAGES, max_file_size=MAX_INPUT, raises_on_error=False)
        status = converted.status.value
        result["conversionStatus"] = status
        if status != "success":
            result["code"] = "PDF_CONVERSION_FAILED"
        else:
            document = converted.document
            result.update({"state": "completed", "pages": len(document.pages), "tables": [
                {"data": table.data.model_dump(mode="json"),
                 "provenance": [p.model_dump(mode="json") for p in table.prov]}
                for table in document.tables
            ]})
            if len(json.dumps(result).encode("utf-8")) > MAX_OUTPUT:
                result = {"file": filename, "state": "failed", "code": "PDF_OUTPUT_LIMIT", "inputSha256": result["inputSha256"]}
    except TimeoutError:
        result["code"] = "PDF_RUNTIME_TIMEOUT"
    except Exception as error:
        result["code"] = str(error) if isinstance(error, ValueError) and str(error) in {"PDF_INPUT_DENIED", "PDF_INPUT_LIMIT", "PDF_INPUT_FORMAT", "PDF_PAGE_LIMIT"} else "PDF_CONVERSION_FAILED"
        result["errorType"] = type(error).__name__
    finally:
        signal.alarm(0)
        result["elapsedMs"] = round((time.monotonic() - started) * 1000)
        result["peakRssBytes"] = peak_rss()
        result["containerPeakMemoryBytes"] = container_peak()
    return result

def main():
    # Hard-coded fixture suite is a benchmark harness, not a second scheduler.
    if len(sys.argv) == 2 and sys.argv[1] == "--suite":
        manifest = json.loads(Path("/input/manifest.json").read_text())
        files = [f["id"] + ".pdf" for f in manifest["fixtures"]]
        if len(files) != 10:
            raise ValueError("PDF_FIXTURE_COUNT")
        files.append(files[0])  # warm repetition; never part of the ten-case denominator.
    elif len(sys.argv) == 2:
        files = [sys.argv[1]]
    else:
        emit({"state": "blocked", "code": "PDF_ARGUMENTS"})
        return
    signal.alarm(TIMEOUT)
    started = time.monotonic()
    emit({"event": "started", "sequence": 0})
    converter = make_converter()
    initialization_ms = round((time.monotonic() - started) * 1000)
    signal.alarm(0)
    for index, filename in enumerate(files):
        if index > 0:
            emit({"event": "started", "sequence": index})
        result = convert(converter, filename)
        result["sequence"] = index
        result["initializationMs"] = initialization_ms if index == 0 else 0
        result["warmRepeat"] = index == 10
        emit(result)

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit({"state": "failed", "code": "PDF_INITIALIZATION_FAILED", "errorType": type(error).__name__, "peakRssBytes": peak_rss()})
        sys.exit(1)
