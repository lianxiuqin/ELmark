import { describe, expect, it, vi } from 'vitest';
import { buildAppMenuTemplate } from '../../src/main/menu';
import { exportWindowToPdf } from '../../src/main/pdfExport';

describe('buildAppMenuTemplate', () => {
  it('wires required menu actions including open-folder, insert-table, toggle-source, find, and export-pdf', () => {
    const actions: string[] = [];
    const template = buildAppMenuTemplate((a) => actions.push(a));
    const flatItems = template.flatMap((top) => (Array.isArray(top.submenu) ? top.submenu : []));
    for (const item of flatItems) {
      if (item.click) (item.click as () => void)();
    }
    expect(actions).toEqual(expect.arrayContaining([
      'file:new', 'file:open', 'file:open-folder', 'file:save', 'file:save-as',
      'file:new-window', 'file:export-pdf', 'insert:table', 'insert:mermaid',
      'view:toggle-sidebar', 'view:toggle-source', 'edit:find',
    ]));
  });
});

describe('exportWindowToPdf', () => {
  it('calls printToPDF with A4 + printBackground and writes PDF buffer to chosen path', async () => {
    const pdfBuf = Buffer.from('%PDF-1.4 mock');
    const mockWin = { webContents: { printToPDF: vi.fn().mockResolvedValue(pdfBuf) } } as any;
    const mockDialog = { showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: 'E:\\out.pdf' }) };
    const mockWrite = vi.fn().mockResolvedValue(undefined);

    const saved = await exportWindowToPdf(mockWin, 'doc', mockDialog as any, mockWrite as any);
    expect(saved).toBe('E:\\out.pdf');
    expect(mockWin.webContents.printToPDF).toHaveBeenCalledWith(expect.objectContaining({ printBackground: true, pageSize: 'A4' }));
    expect(mockWrite).toHaveBeenCalledWith('E:\\out.pdf', pdfBuf);
  });

  it('returns null without calling printToPDF when user cancels save dialog', async () => {
    const mockWin = { webContents: { printToPDF: vi.fn() } } as any;
    const mockDialog = { showSaveDialog: vi.fn().mockResolvedValue({ canceled: true, filePath: undefined }) };
    const mockWrite = vi.fn();

    const saved = await exportWindowToPdf(mockWin, 'doc', mockDialog as any, mockWrite as any);
    expect(saved).toBeNull();
    expect(mockWin.webContents.printToPDF).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
