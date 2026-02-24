import {
  DropdownMenuPopup,
  DropdownMenuPortal,
  DropdownMenuPositioner,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  TooltipGroup,
} from '@lobehub/ui';
import { memo, useCallback, useState } from 'react';

import { PanelContent } from './components/PanelContent';
import { styles } from './styles';
import { type ModelSwitchPanelProps } from './types';

const ModelSwitchPanel = memo<ModelSwitchPanelProps>(
  ({
    children,
    extraControls,
    model: modelProp,
    onModelChange,
    onOpenChange,
    open,
    placement = 'topLeft',
    provider: providerProp,
    openOnHover = true,
  }) => {
    const [internalOpen, setInternalOpen] = useState(false);
    const [rootClosing, setRootClosing] = useState(false);
    const isOpen = open ?? internalOpen;

    const handleOpenChange = useCallback(
      (nextOpen: boolean) => {
        if (nextOpen === false) {
          // Close submenus first so base-ui does not call setOpen from useEffect (flushSync).
          setRootClosing(true);
          queueMicrotask(() => {
            setRootClosing(false);
            setInternalOpen(false);
            onOpenChange?.(false);
          });
        } else {
          setInternalOpen(nextOpen);
          onOpenChange?.(nextOpen);
        }
      },
      [onOpenChange],
    );

    return (
      <TooltipGroup>
        <DropdownMenuRoot open={isOpen} onOpenChange={handleOpenChange}>
          <DropdownMenuTrigger openOnHover={openOnHover}>{children}</DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuPositioner hoverTrigger={openOnHover} placement={placement}>
              <DropdownMenuPopup className={styles.container}>
                <PanelContent
                  extraControls={extraControls}
                  model={modelProp}
                  provider={providerProp}
                  onModelChange={onModelChange}
                  onOpenChange={handleOpenChange}
                  rootClosing={rootClosing}
                />
              </DropdownMenuPopup>
            </DropdownMenuPositioner>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </TooltipGroup>
    );
  },
);

ModelSwitchPanel.displayName = 'ModelSwitchPanel';

export default ModelSwitchPanel;

export { type ModelSwitchPanelProps } from './types';
