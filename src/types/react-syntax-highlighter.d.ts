declare module 'react-syntax-highlighter' {
  import type { ComponentType, ReactNode } from 'react';

  export interface SyntaxHighlighterProps {
    children?: ReactNode;
    language?: string;
    style?: unknown;
  }

  const SyntaxHighlighter: ComponentType<SyntaxHighlighterProps>;
  export default SyntaxHighlighter;
}

declare module 'react-syntax-highlighter/dist/esm/styles/hljs' {
  export const vs2015: unknown;
}
