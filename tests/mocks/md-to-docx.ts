/**
 * Mock for @mohtasham/md-to-docx in tests (Vitest resolves the package to this file via alias).
 */
export async function convertMarkdownToDocx(markdown: string): Promise<Blob> {
  return new Blob([markdown], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export function downloadDocx(_blob: Blob, _fileName: string): void {
  // noop in test; test can spy on this
}
