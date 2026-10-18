/**
 * Compares two URI paths for the same file. On Windows the file system is
 * case-insensitive and the drive letter may be "C:" in one URI and "c:" in
 * another, so compare case-insensitively there.
 */
export function sameFilePath(a: string, b: string, platform: string = process.platform): boolean {
  const norm = (p: string) => {
    const slashes = p.replace(/\\/g, '/');
    return platform === 'win32' ? slashes.toLowerCase() : slashes;
  };
  return norm(a) === norm(b);
}
