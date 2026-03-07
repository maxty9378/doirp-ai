import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as mdToDocx from '@mohtasham/md-to-docx';

import { createStore, Provider } from '../../store';
import { useMenu } from '../useMenu';

vi.mock('@lobechat/const', () => ({
  isDesktop: false,
}));

vi.mock('antd-style', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd-style')>();
  return {
    ...actual,
    useResponsive: () => ({ lg: true }),
  };
});

vi.mock('@/store/document', () => ({
  useDocumentStore: (selector: (s: any) => any) =>
    selector({
      documents: { 'test-doc-id': {} },
      getState: () => ({}),
      toggleHistoryPanel: vi.fn(),
    }),
}));

vi.mock('@/store/file', () => ({
  useFileStore: (selector: (s: any) => any) =>
    selector({
      duplicateDocument: vi.fn(),
    }),
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (s: any) => any) =>
    selector({
      status: { noWideScreen: false },
      toggleWideScreen: vi.fn(),
    }),
}));

const messageSuccess = vi.fn();
const messageError = vi.fn();

vi.mock('antd', async (orig) => {
  const M = await orig();
  return {
    ...M,
    App: {
      ...(M as any).App,
      useApp: () => ({
        message: { success: messageSuccess, error: messageError },
        modal: {},
      }),
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockEditor = {
  getDocument: (type: string) => (type === 'markdown' ? '# Заголовок\n\nТекст для Word.' : ''),
};

function createWrapper() {
  const store = createStore({
    documentId: 'test-doc-id',
    editor: mockEditor as any,
    title: 'Тест документа',
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <Provider createStore={() => store}>{children}</Provider>;
  };
}

describe('PageEditor useMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(mdToDocx, 'convertMarkdownToDocx').mockResolvedValue(
      new Blob(['docx'], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    );
    vi.spyOn(mdToDocx, 'downloadDocx').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleExportWord', () => {
    it('вызывает convertMarkdownToDocx с markdown из редактора и сохраняет в Word', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useMenu(), { wrapper: wrapper as any });

      const exportItem = result.current.menuItems.find((i: any) => i.key === 'export');
      expect(exportItem?.onClick).toBeDefined();

      await act(async () => {
        exportItem.onClick!();
      });

      expect(mdToDocx.convertMarkdownToDocx).toHaveBeenCalledWith(
        '# Тест документа\n\n# Заголовок\n\nТекст для Word.',
      );
      expect(mdToDocx.downloadDocx).toHaveBeenCalledWith(
        expect.any(Blob),
        'Тест документа.docx',
      );
      expect(messageSuccess).toHaveBeenCalled();
    });

    it('при пустом документе передаёт в конвертер непустую строку (пробел)', async () => {
      const emptyEditor = {
        getDocument: (type: string) => (type === 'markdown' ? '' : ''),
      };
      const store = createStore({
        documentId: 'test-doc-id',
        editor: emptyEditor as any,
        title: 'Пустой',
      });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Provider createStore={() => store}>{children}</Provider>
      );
      const { result } = renderHook(() => useMenu(), { wrapper: wrapper as any });

      const exportItem = result.current.menuItems.find((i: any) => i.key === 'export');

      await act(async () => {
        exportItem.onClick!();
      });

      expect(mdToDocx.convertMarkdownToDocx).toHaveBeenCalledWith('# Пустой\n\n ');
      expect(messageSuccess).toHaveBeenCalled();
    });

    it('при ошибке конвертации показывает сообщение об ошибке', async () => {
      vi.mocked(mdToDocx.convertMarkdownToDocx).mockRejectedValue(
        new Error('Конвертация не удалась'),
      );
      const wrapper = createWrapper();
      const { result } = renderHook(() => useMenu(), { wrapper: wrapper as any });

      const exportItem = result.current.menuItems.find((i: any) => i.key === 'export');

      await act(async () => {
        exportItem.onClick!();
      });

      expect(messageError).toHaveBeenCalledWith(
        expect.stringContaining('Конвертация не удалась'),
      );
    });
  });
});
