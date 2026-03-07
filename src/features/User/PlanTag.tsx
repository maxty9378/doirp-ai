import { Plans } from '@lobechat/types';
import { Tag } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import urlJoin from 'url-join';

import { OFFICIAL_URL } from '@/const/url';
import { isDesktop } from '@/const/version';
import PlanIcon from '@/features/PlanIcon';

const TOKEN_LIMITS_UNLIMITED = 100_000_000;

export enum PlanType {
  Preview = 'preview',
}

export interface PlanTagProps {
  type?: PlanType | Plans;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const PlanTag = memo<PlanTagProps>(({ type = PlanType.Preview }) => {
  const { t } = useTranslation('common');
  const isFree = type === Plans.Free;
  const { data: tokenData } = useSWR<{ tokenQuota?: number }>(
    isFree ? '/api/user/token-limits' : null,
    fetcher,
    { revalidateOnFocus: true },
  );

  if (type === PlanType.Preview) {
    return (
      <Tag
        style={{ background: cssVar.colorFill, borderRadius: 12, cursor: 'pointer' }}
        variant={'filled'}
      >
        {t('userPanel.community')}
      </Tag>
    );
  }

  if (isFree) {
    const isUnlimited = (tokenData?.tokenQuota ?? 0) >= TOKEN_LIMITS_UNLIMITED;
    const label = isUnlimited ? 'Безлимит' : 'Партнер';
    return (
      <Link style={{ cursor: 'pointer' }} to="/settings/usage">
        <Tag
          style={{
            background: isUnlimited
              ? 'linear-gradient(135deg, #1890ff 0%, #722ed1 100%)'
              : cssVar.colorFillSecondary,
            borderRadius: 12,
            color: isUnlimited ? '#fff' : undefined,
            margin: 0,
          }}
          variant="filled"
        >
          {label}
        </Tag>
      </Link>
    );
  }

  return (
    <Link
      style={{ cursor: 'pointer' }}
      target={isDesktop ? '_blank' : undefined}
      to={urlJoin(isDesktop ? OFFICIAL_URL : '/', '/settings/usage')}
    >
      <PlanIcon plan={type} size={22} type={'tag'} />
    </Link>
  );
});

export default PlanTag;
