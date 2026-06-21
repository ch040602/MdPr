import { execFile } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { promisify } from "node:util";

export type RenderPdfOptions = {
  pptxPath: string;
  outPath: string;
};

const execFileAsync = promisify(execFile);

export async function renderPdf(options: RenderPdfOptions): Promise<void> {
  await exportPptxToPdf(options.pptxPath, options.outPath);
}

export async function exportPptxToPdf(pptxPath: string, outPath: string): Promise<void> {
  if (!existsSync(pptxPath)) {
    throw new Error(`PDF export source PPTX does not exist: ${pptxPath}`);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  const injected = process.env.MDPRESENT_PDF_EXPORT_COMMAND;
  if (injected) {
    const command = parseInjectedCommand(injected, pptxPath, outPath);
    await run(command.executable, command.args);
    assertPdfWritten(outPath);
    return;
  }

  const errors: string[] = [];
  for (const command of defaultExportCommands(pptxPath, outPath)) {
    try {
      await run(command.executable, command.args);
      if (command.after) command.after();
      assertPdfWritten(outPath);
      return;
    } catch (error) {
      errors.push(`${command.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`PDF export failed. Install PowerPoint on Windows or LibreOffice on CI/Linux. ${errors.join(" | ")}`);
}

type PdfCommand = {
  label: string;
  executable: string;
  args: string[];
  after?: () => void;
};

function parseInjectedCommand(raw: string, pptxPath: string, outPath: string): { executable: string; args: string[] } {
  const parts = JSON.parse(raw) as unknown;
  if (!Array.isArray(parts) || !parts.every((part) => typeof part === "string") || parts.length === 0) {
    throw new Error("MDPRESENT_PDF_EXPORT_COMMAND must be a JSON string array.");
  }
  const [executable, ...args] = parts;
  return {
    executable,
    args: args.map((arg) => arg.replaceAll("{pptx}", pptxPath).replaceAll("{pdf}", outPath)),
  };
}

function defaultExportCommands(pptxPath: string, outPath: string): PdfCommand[] {
  const commands: PdfCommand[] = [];
  if (process.platform === "win32") {
    const scriptPath = join(dirname(outPath), ".mdpresent-export-pdf.ps1");
    writeFileSync(scriptPath, [
      "param([string]$pptx,[string]$pdf)",
      "$ErrorActionPreference='Stop'",
      "$app=New-Object -ComObject PowerPoint.Application",
      "$app.Visible=1",
      "$presentation=$null",
      "try {",
      "  $presentation=$app.Presentations.Open($pptx,$false,$false,$false)",
      "  $presentation.SaveAs($pdf,32)",
      "  for ($i=0; $i -lt 50 -and -not (Test-Path -LiteralPath $pdf); $i++) { Start-Sleep -Milliseconds 100 }",
      "  if (-not (Test-Path -LiteralPath $pdf)) { throw \"PowerPoint did not create PDF: $pdf\" }",
      "} finally {",
      "  if ($presentation -ne $null) { $presentation.Close() }",
      "  if ($app -ne $null) { $app.Quit() }",
      "}",
    ].join("\n"), "utf-8");
    commands.push({
      label: "PowerPoint COM",
      executable: "powershell",
      args: [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        pptxPath,
        outPath,
      ],
      after: () => rmSync(scriptPath, { force: true }),
    });
  }

  for (const executable of ["soffice", "libreoffice"]) {
    commands.push({
      label: executable,
      executable,
      args: ["--headless", "--convert-to", "pdf", "--outdir", dirname(outPath), pptxPath],
      after: () => {
        const produced = join(dirname(outPath), `${parse(pptxPath).name}.pdf`);
        if (produced !== outPath && existsSync(produced)) renameSync(produced, outPath);
      },
    });
  }
  return commands;
}

async function run(executable: string, args: string[]): Promise<void> {
  await execFileAsync(executable, args, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
}

function assertPdfWritten(outPath: string): void {
  if (!existsSync(outPath)) {
    throw new Error(`PDF exporter completed without writing ${outPath}`);
  }
}
