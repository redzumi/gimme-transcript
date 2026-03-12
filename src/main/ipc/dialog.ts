import { ipcMain, dialog, BrowserWindow } from 'electron'

export function registerDialogHandlers(): void {
  ipcMain.handle('dialog:open-audio', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      title: 'Select audio file(s)',
      filters: [{ name: 'Audio', extensions: ['mp3', 'm4a', 'wav', 'ogg', 'qta', 'flac', 'aac', 'opus', 'wma', 'aiff', 'aif', 'webm', 'mkv'] }],
      properties: ['openFile', 'multiSelections']
    })
    return result.canceled ? null : result.filePaths
  })

  ipcMain.handle('dialog:save', async (event, defaultName: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      defaultPath: defaultName,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] }
      ]
    })
    return result.canceled ? null : result.filePath
  })

  ipcMain.handle('export:write', async (_e, filePath: string, content: string) => {
    const { writeFile } = await import('fs/promises')
    await writeFile(filePath, content, 'utf8')
  })
}
