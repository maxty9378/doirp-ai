import { BrandLoading, LobeHubText } from '@lobehub/ui/brand';

import { isCustomBranding } from '@/const/version';

import CircleLoading from '../CircleLoading';
import styles from './index.module.css';

interface BrandTextLoadingProps {
  debugId: string;
  fullscreen?: boolean;
}

const BrandTextLoading = ({ debugId, fullscreen = true }: BrandTextLoadingProps) => {
  const containerClassName = `${styles.container}${fullscreen ? ` ${styles.fullscreen}` : ''}`;

  if (isCustomBranding)
    return (
      <div className={containerClassName}>
        <CircleLoading />
      </div>
    );

  const showDebug = process.env.NODE_ENV === 'development' && debugId;

  return (
    <div className={containerClassName}>
      <div aria-label="Loading" className={styles.brand} role="status">
        <BrandLoading size={40} text={LobeHubText} />
      </div>
      {showDebug && (
        <div className={styles.debug}>
          <div className={styles.debugRow}>
            <code>Debug ID:</code>
            <span className={styles.debugTag}>
              <code>{debugId}</code>
            </span>
          </div>
          <div className={styles.debugHint}>only visible in development</div>
        </div>
      )}
    </div>
  );
};

export default BrandTextLoading;
