'use client';

import { memo } from 'react';

import AutoSaveHintBase from '@/components/Editor/AutoSaveHint';
import { useGroupProfileStore } from '@/store/groupProfile';
import { selectors } from '@/store/groupProfile/selectors';

const AutoSaveHint = memo(() => {
  const activeTabId = useGroupProfileStore((s) => s.activeTabId);
  const saveState = useGroupProfileStore(selectors.getSaveState(activeTabId));
  const flushSave = useGroupProfileStore((s) => s.flushSave);

  return (
    <AutoSaveHintBase
      lastUpdatedTime={saveState.lastUpdatedTime}
      onRetry={flushSave}
      saveStatus={saveState.saveStatus}
    />
  );
});

export default AutoSaveHint;
