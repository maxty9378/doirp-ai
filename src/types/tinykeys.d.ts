declare module 'tinykeys' {
  /**
   * Минимальная декларация для TypeScript.
   * В проекте используется только базовый вызов `tinykeys(window, bindings)`.
   */
  export function tinykeys(
    target: Window | HTMLElement,
    bindings: Record<string, (event: KeyboardEvent) => void>,
  ): () => void;
}
