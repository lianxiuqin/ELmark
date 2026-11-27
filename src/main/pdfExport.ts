import fs from 'node:fs/promises';
import path from 'node:path';
import type { BrowserWindow, Dialog } from 'electron';

/**
 * Prompts the user for a target PDF path and exports the given BrowserWindow as A4 PDF.
 */
export async function exportWindowToPdf(
  win: BrowserWindow,
  suggestedBaseName: string,
  dialogApi?: Pick<Dialog, 'showSaveDialog'>,
  writeFileFn: typeof fs.writeFile = fs.writeFile,
): Promise<string | null> {
  const activeDialog = dialogApi ?? (await import('electron')).dialog;
  const trimmed = suggestedBaseName.trim();
  const parsedName = trimmed ? path.parse(trimmed).name : '';
  const safeBaseName = parsedName || 'document';

  const result = await activeDialog.showSaveDialog(win, {
    title: '导出 PDF',
    defaultPath: `${safeBaseName}.pdf`,
    filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  const pdfBuffer = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
  });

  await writeFileFn(result.filePath, pdfBuffer);
  return result.filePath;
}
