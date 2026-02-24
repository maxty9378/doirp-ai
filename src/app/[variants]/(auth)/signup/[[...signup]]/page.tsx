import { redirect } from 'next/navigation';

import { metadataModule } from '@/server/metadata';
import { translation } from '@/server/translation';
import { type DynamicLayoutProps } from '@/types/next';
import { RouteVariants } from '@/utils/server/routeVariants';

export const generateMetadata = async (props: DynamicLayoutProps) => {
  const locale = await RouteVariants.getLocale(props);
  const { t } = await translation('auth', locale);

  return metadataModule.generate({
    description: t('betterAuth.signup.subtitle'),
    title: t('betterAuth.signup.title'),
    url: '/signup',
  });
};

const Page = () => {
  // Self-registration disabled: accounts are created by admin (access codes only).
  redirect('/signin');
};

export default Page;
