"""
PDF text extraction helper for ingest-document skill.

Wraps pdfplumber to produce a page-numbered text dump with stable structure
that the agent can read sequentially.

Usage:

    python pdf_extract.py <input.pdf> <output.txt>

Output format:

    ===== PAGE 1 =====
    <page text>

    ===== PAGE 2 =====
    <page text>

Adds a header summary at the top with page count, char count, and metadata.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    import pdfplumber
    from pypdf import PdfReader
except ImportError:
    print(
        "Missing dependencies. Install with:\n"
        "  python -m pip install pypdf pdfplumber",
        file=sys.stderr,
    )
    raise


def extract(pdf_path: Path, txt_path: Path) -> dict[str, object]:
    reader = PdfReader(str(pdf_path))
    meta = reader.metadata
    page_count = len(reader.pages)

    parts: list[str] = []
    parts.append(f"# PDF text extraction\n")
    parts.append(f"# Source file: {pdf_path.name}")
    parts.append(f"# Pages: {page_count}")
    if meta:
        parts.append(f"# Title: {meta.title}")
        parts.append(f"# Author: {meta.author}")
        parts.append(f"# Creator: {meta.creator}")
    parts.append("")

    total_chars = 0
    pages_with_text = 0
    with pdfplumber.open(str(pdf_path)) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            if text.strip():
                pages_with_text += 1
                total_chars += len(text)
            parts.append(f"\n===== PAGE {i} =====\n{text}")

    parts.insert(4, f"# Pages with text: {pages_with_text}")
    parts.insert(5, f"# Total chars: {total_chars}")

    txt_path.write_text("\n".join(parts), encoding="utf-8")

    return {
        "page_count": page_count,
        "pages_with_text": pages_with_text,
        "total_chars": total_chars,
        "title": getattr(meta, "title", None) if meta else None,
        "author": getattr(meta, "author", None) if meta else None,
        "output": str(txt_path),
    }


def cli() -> int:
    if len(sys.argv) < 3:
        print("usage: pdf_extract.py <input.pdf> <output.txt>", file=sys.stderr)
        return 2

    pdf_path = Path(sys.argv[1])
    txt_path = Path(sys.argv[2])

    if not pdf_path.exists():
        print(f"input not found: {pdf_path}", file=sys.stderr)
        return 1

    result = extract(pdf_path, txt_path)
    # Plain ASCII to avoid Windows cp1252 encode issues with check-marks/arrows.
    print(f"OK extracted {result['page_count']} pages, {result['total_chars']} chars")
    print(f"  -> {result['output']}")
    if result.get("title"):
        print(f"  title:  {result['title']}")
    if result.get("author"):
        print(f"  author: {result['author']}")
    return 0


if __name__ == "__main__":
    sys.exit(cli())
