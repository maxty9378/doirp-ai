import { type EditorContentState } from '@/store/document/slices/editor/initialState';

const DRAFT_PREFIX = 'lobe-chat-doc-draft-';

export interface DocDraft {
  content: string;
  editorData: any;
  updatedAt: number;
}

class DraftService {
  getDraft(documentId: string): DocDraft | null {
    if (typeof window === 'undefined') return null;
    const data = localStorage.getItem(DRAFT_PREFIX + documentId);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  saveDraft(documentId: string, draft: DocDraft): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(DRAFT_PREFIX + documentId, JSON.stringify(draft));
  }

  removeDraft(documentId: string): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(DRAFT_PREFIX + documentId);
  }

  hasNewerDraft(documentId: string, lastSavedTime: Date | number | null): boolean {
    const draft = this.getDraft(documentId);
    if (!draft) return false;
    if (!lastSavedTime) return true;
    const lastSaved = typeof lastSavedTime === 'number' ? lastSavedTime : lastSavedTime.getTime();
    return draft.updatedAt > lastSaved;
  }
}

export const draftService = new DraftService();
