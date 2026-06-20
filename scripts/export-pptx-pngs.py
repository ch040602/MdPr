from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export PPTX slides to deterministic PNG files.")
    parser.add_argument("pptx", type=Path)
    parser.add_argument("out_dir", type=Path)
    parser.add_argument("--width", type=int, default=1600)
    parser.add_argument("--height", type=int, default=900)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    pptx = args.pptx.resolve()
    out_dir = args.out_dir.resolve()
    if not pptx.exists():
        raise FileNotFoundError(f"PPTX does not exist: {pptx}")

    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if os.name == "nt" and export_with_powerpoint(pptx, out_dir, args.width, args.height):
        print(f"Exported PPTX with PowerPoint: {out_dir}")
        return 0

    export_with_libreoffice(pptx, out_dir, args.width, args.height)
    print(f"Exported PPTX with LibreOffice/Poppler: {out_dir}")
    return 0


def export_with_powerpoint(pptx: Path, out_dir: Path, width: int, height: int) -> bool:
    try:
        import win32com.client  # type: ignore
    except Exception:
        return False

    app = None
    prs = None
    try:
        app = win32com.client.DispatchEx("PowerPoint.Application")
        app.Visible = True
        prs = app.Presentations.Open(str(pptx), WithWindow=False, ReadOnly=True)
        for index in range(1, prs.Slides.Count + 1):
            prs.Slides(index).Export(str(out_dir / f"slide-{index:02d}.png"), "PNG", width, height)
        return True
    except Exception as exc:
        print(f"PowerPoint export failed, trying LibreOffice fallback: {exc}", file=sys.stderr)
        return False
    finally:
        if prs is not None:
            try:
                prs.Close()
            except Exception:
                pass
        if app is not None:
            try:
                app.Quit()
            except Exception:
                pass


def export_with_libreoffice(pptx: Path, out_dir: Path, width: int, height: int) -> None:
    office = shutil.which("soffice") or shutil.which("libreoffice")
    pdftoppm = shutil.which("pdftoppm")
    if not office:
        raise RuntimeError("LibreOffice executable not found. Install libreoffice or run on Windows with PowerPoint.")
    if not pdftoppm:
        raise RuntimeError("pdftoppm executable not found. Install poppler-utils.")

    with tempfile.TemporaryDirectory(prefix="mdpr-pptx-export-") as temp_name:
        temp_dir = Path(temp_name)
        run([office, "--headless", "--convert-to", "pdf", "--outdir", str(temp_dir), str(pptx)])
        pdf = temp_dir / f"{pptx.stem}.pdf"
        if not pdf.exists():
            candidates = list(temp_dir.glob("*.pdf"))
            if not candidates:
                raise RuntimeError(f"LibreOffice did not create a PDF for {pptx}")
            pdf = candidates[0]

        prefix = temp_dir / "slide"
        run([
            pdftoppm,
            "-png",
            "-scale-to-x",
            str(width),
            "-scale-to-y",
            str(height),
            str(pdf),
            str(prefix),
        ])

        generated = sorted(temp_dir.glob("slide-*.png"), key=slide_number)
        if not generated:
            raise RuntimeError(f"pdftoppm did not create PNG slides for {pdf}")
        for index, source in enumerate(generated, start=1):
            shutil.copyfile(source, out_dir / f"slide-{index:02d}.png")


def slide_number(path: Path) -> int:
    digits = "".join(ch for ch in path.stem.split("-")[-1] if ch.isdigit())
    return int(digits or "0")


def run(command: list[str]) -> None:
    completed = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if completed.returncode != 0:
        raise RuntimeError(
            "Command failed:\n"
            + " ".join(command)
            + f"\nstdout:\n{completed.stdout}\nstderr:\n{completed.stderr}"
        )


if __name__ == "__main__":
    raise SystemExit(main())
