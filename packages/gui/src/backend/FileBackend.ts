export interface FileBackend {
  listFiles(): Promise<string[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  createFile(path: string, content: string): Promise<void>;
}

declare global {
  interface Window {
    showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemHandle {
    queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  }
}

export class LocalFileBackend implements FileBackend {
  private dirHandle: FileSystemDirectoryHandle | null = null;

  async open(): Promise<void> {
    this.dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  }

  openWithHandle(handle: FileSystemDirectoryHandle): void {
    this.dirHandle = handle;
  }

  getHandle(): FileSystemDirectoryHandle | null {
    return this.dirHandle;
  }

  getName(): string | null {
    return this.dirHandle?.name ?? null;
  }

  private ensureOpen(): FileSystemDirectoryHandle {
    if (!this.dirHandle) throw new Error('フォルダが選択されていません');
    return this.dirHandle;
  }

  async listFiles(): Promise<string[]> {
    const dir = this.ensureOpen();
    const files: string[] = [];
    for await (const [name, handle] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind === 'file' && name.endsWith('.json')) {
        files.push(name);
      }
    }
    return files.sort();
  }

  async readFile(path: string): Promise<string> {
    const dir = this.ensureOpen();
    const fileHandle = await dir.getFileHandle(path);
    const file = await fileHandle.getFile();
    return file.text();
  }

  async writeFile(path: string, content: string): Promise<void> {
    const dir = this.ensureOpen();
    const fileHandle = await dir.getFileHandle(path, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async createFile(path: string, content: string): Promise<void> {
    return this.writeFile(path, content);
  }
}
