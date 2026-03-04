'use client';

import { Flexbox } from '@lobehub/ui';
import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import Loading from '@/components/Loading/BrandTextLoading';
import { useUserStore } from '@/store/user';
import { onboardingSelectors } from '@/store/user/selectors';

import OnboardingContainer from './_layout';
import FullNameStep from './features/FullNameStep';
import InterestsStep from './features/InterestsStep';
import TelemetryStep from './features/TelemetryStep';

const OnboardingPage = memo(() => {
  const navigate = useNavigate();
  const [isUserStateInit, currentStep, goToNextStep, goToPreviousStep, finishOnboarding] =
    useUserStore((s) => [
      s.isUserStateInit,
      onboardingSelectors.currentStep(s),
      s.goToNextStep,
      s.goToPreviousStep,
      s.finishOnboarding,
    ]);

  const finishFlow = useCallback(async () => {
    await finishOnboarding();
    navigate('/');
  }, [finishOnboarding, navigate]);

  if (!isUserStateInit) {
    return <Loading debugId="Onboarding" />;
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1: {
        return <TelemetryStep onNext={goToNextStep} />;
      }
      case 2: {
        return <FullNameStep onBack={goToPreviousStep} onNext={goToNextStep} />;
      }
      case 3: {
        return <InterestsStep onBack={goToPreviousStep} onNext={finishFlow} />;
      }
      default: {
        return null;
      }
    }
  };

  return (
    <OnboardingContainer>
      <Flexbox gap={24} style={{ maxWidth: 480, width: '100%' }}>
        {renderStep()}
      </Flexbox>
    </OnboardingContainer>
  );
});

OnboardingPage.displayName = 'OnboardingPage';

export default OnboardingPage;
