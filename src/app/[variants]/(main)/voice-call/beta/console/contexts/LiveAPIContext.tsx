/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { LiveConnectConfig } from '@google/genai/web';
import type { FC, ReactNode } from 'react';
import { createContext, use } from 'react';

import type { UseLiveAPIResults } from '../hooks/use-live-api';
import { useLiveAPI } from '../hooks/use-live-api';
import type { LiveClientOptions } from '../types';

const LiveAPIContext = createContext<UseLiveAPIResults | undefined>(undefined);

export type LiveAPIProviderProps = {
  children: ReactNode;
  initialConfig?: LiveConnectConfig;
  initialModel?: string;
  options: LiveClientOptions;
};

export const LiveAPIProvider: FC<LiveAPIProviderProps> = ({
  options,
  initialConfig,
  initialModel,
  children,
}) => {
  const liveAPI = useLiveAPI(options, {
    initialConfig,
    initialModel,
  });

  return <LiveAPIContext value={liveAPI}>{children}</LiveAPIContext>;
};

export const useLiveAPIContext = () => {
  const context = use(LiveAPIContext);
  if (!context) {
    throw new Error('useLiveAPIContext must be used wihin a LiveAPIProvider');
  }
  return context;
};
