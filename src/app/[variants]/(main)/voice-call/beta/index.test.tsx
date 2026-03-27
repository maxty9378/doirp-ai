import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import VoiceCallBetaPage from './index';

const liveApiProviderSpy = vi.fn();

vi.mock('./console/contexts/LiveAPIContext', () => ({
  LiveAPIProvider: ({
    children,
    initialConfig,
    initialModel,
    options,
  }: {
    children: React.ReactNode;
    initialConfig?: unknown;
    initialModel?: string;
    options: unknown;
  }) => {
    liveApiProviderSpy({ initialConfig, initialModel, options });
    return <div data-testid="live-api-provider">{children}</div>;
  },
}));

vi.mock('./console/components/side-panel/SidePanel', () => ({
  default: () => <div data-testid="beta-side-panel" />,
}));

vi.mock('./console/components/control-tray/ControlTray', () => ({
  default: () => <div data-testid="beta-control-tray" />,
}));

vi.mock('./console/components/altair/Altair', () => ({
  Altair: () => <div data-testid="beta-altair" />,
}));

describe('VoiceCallBetaPage', () => {
  beforeEach(() => {
    liveApiProviderSpy.mockClear();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          apiKey: 'test-key',
          defaultConfig: {
            responseModalities: ['AUDIO'],
          },
          defaultModel: 'models/gemini-2.0-flash-exp',
          proxyBaseUrl: 'https://voice-proxy.example.com/voice-call-ws',
        }),
        ok: true,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches config and initializes the beta console provider', async () => {
    render(<VoiceCallBetaPage />);

    await waitFor(() => {
      expect(screen.getByTestId('live-api-provider')).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/voice-call/beta/config', {
      credentials: 'include',
    });

    expect(liveApiProviderSpy).toHaveBeenCalledWith({
      initialConfig: {
        responseModalities: ['AUDIO'],
      },
      initialModel: 'models/gemini-2.0-flash-exp',
      options: {
        apiKey: 'test-key',
        httpOptions: {
          apiVersion: 'v1beta',
          baseUrl: 'https://voice-proxy.example.com/voice-call-ws',
        },
      },
    });

    expect(screen.getByTestId('beta-side-panel')).toBeInTheDocument();
    expect(screen.getByTestId('beta-control-tray')).toBeInTheDocument();
    expect(screen.getByTestId('beta-altair')).toBeInTheDocument();
  });
});
