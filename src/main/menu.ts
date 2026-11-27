import type { MenuItemConstructorOptions } from 'electron';
import type { MenuAction } from '../shared/ipc';

/**
 * Builds the application and popup menu template wired to typed MenuAction callbacks.
 */
export function buildAppMenuTemplate(
  onAction: (action: MenuAction) => void,
): MenuItemConstructorOptions[] {
  return [
    {
      label: '文件',
      submenu: [
        {
          label: '新建',
          accelerator: 'CmdOrCtrl+N',
          click: () => onAction('file:new'),
        },
        {
          label: '新建窗口',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => onAction('file:new-window'),
        },
        { type: 'separator' },
        {
          label: '打开文件...',
          accelerator: 'CmdOrCtrl+O',
          click: () => onAction('file:open'),
        },
        {
          label: '打开文件夹...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => onAction('file:open-folder'),
        },
        { type: 'separator' },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => onAction('file:save'),
        },
        {
          label: '另存为...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => onAction('file:save-as'),
        },
        { type: 'separator' },
        {
          label: '导出 PDF...',
          accelerator: 'CmdOrCtrl+E',
          click: () => onAction('file:export-pdf'),
        },
        { type: 'separator' },
        { role: 'close', label: '关闭窗口' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
        { type: 'separator' },
        {
          label: '查找...',
          accelerator: 'CmdOrCtrl+F',
          click: () => onAction('edit:find'),
        },
      ],
    },
    {
      label: '插入',
      submenu: [
        {
          label: '表格',
          click: () => onAction('insert:table'),
        },
        {
          label: 'Mermaid 图表',
          click: () => onAction('insert:mermaid'),
        },
      ],
    },
    {
      label: '视图',
      submenu: [
        {
          label: '切换侧边栏',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => onAction('view:toggle-sidebar'),
        },
        {
          label: '切换源码模式',
          accelerator: 'CmdOrCtrl+/',
          click: () => onAction('view:toggle-source'),
        },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
  ];
}
