"""Convert a bounded upload from stdin and write UTF-8 Markdown to stdout."""

import io
import sys
from contextlib import redirect_stdout
from zipfile import ZipFile

# Keep these exit codes in sync with documents.rs.
DEPENDENCIES_UNAVAILABLE = 2
ARCHIVE_TOO_LARGE = 3
DOCX_BODY_TOO_LARGE = 4
MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
MAX_DOCX_BODY_BYTES = 8 * 1024 * 1024


def main(extension):
    with redirect_stdout(sys.stderr):
        try:
            from markitdown import MissingDependencyException, StreamInfo
            from markitdown.converters import (
                DocxConverter,
                HtmlConverter,
                PdfConverter,
                XlsConverter,
                XlsxConverter,
            )
        except ImportError:
            return DEPENDENCIES_UNAVAILABLE

        stream = io.BytesIO(sys.stdin.buffer.read())
        if extension in {"docx", "xlsx", "ods"}:
            # These converters can expand archive entries in memory before rendering.
            with ZipFile(stream) as archive:
                if extension == "docx":
                    if any(
                        entry.filename.lower() == "word/document.xml"
                        and entry.file_size > MAX_DOCX_BODY_BYTES
                        for entry in archive.infolist()
                    ):
                        return DOCX_BODY_TOO_LARGE
                if sum(entry.file_size for entry in archive.infolist()) > MAX_ARCHIVE_BYTES:
                    return ARCHIVE_TOO_LARGE
            stream.seek(0)

        try:
            if extension == "ods":
                # MarkItDown has no ODS converter. Keep all rows and render each sheet as Markdown.
                from pandas import read_excel

                sheets = read_excel(
                    stream, engine="odf", sheet_name=None, header=None, keep_default_na=False
                )
                converter = HtmlConverter()
                markdown = "\n\n".join(
                    f"## {name}\n{converter.convert_string(sheet.to_html(index=False, header=False)).markdown}"
                    for name, sheet in sheets.items()
                )
            else:
                # Selecting the converter directly prevents fallback to unrelated formats.
                converters = {
                    "docx": DocxConverter,
                    "pdf": PdfConverter,
                    "xls": XlsConverter,
                    "xlsx": XlsxConverter,
                }
                converter = converters[extension]()
                markdown = converter.convert(stream, StreamInfo(extension=f".{extension}")).markdown
        except (ImportError, MissingDependencyException):
            return DEPENDENCIES_UNAVAILABLE

    sys.stdout.buffer.write(markdown.strip().encode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
