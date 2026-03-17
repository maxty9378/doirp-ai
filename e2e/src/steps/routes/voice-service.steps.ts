import { Given, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { CustomWorld } from '../../support/world';

Given('the voice service TTS is mocked', async function (this: CustomWorld) {
  const wavPath = resolve(__dirname, '../../../../public/tts-samples/charon-variant1.wav');
  const body = readFileSync(wavPath);

  await this.page.route('**/webapi/tts/google', async (route) => {
    if (route.request().method().toUpperCase() !== 'POST') {
      await route.fulfill({ status: 405, body: 'Method Not Allowed' });
      return;
    }

    await route.fulfill({
      body,
      contentType: 'audio/wav',
      status: 200,
    });
  });
});

When('I enter voice service text {string}', async function (this: CustomWorld, text: string) {
  const textarea = this.page.locator('textarea').first();
  await expect(textarea).toBeVisible();
  await textarea.fill(text);
});

When('I start voice playback', async function (this: CustomWorld) {
  const button = this.page.getByRole('button', { name: 'Озвучить' });
  await expect(button).toBeEnabled();
  await button.click();
  await this.page.waitForSelector('audio');
});

When(
  'I advance voice playback to {int} percent',
  async function (this: CustomWorld, percent: number) {
    await this.page.waitForSelector('audio');
    await this.page.evaluate((pct) => {
      const audio = document.querySelector('audio') as HTMLAudioElement | null;
      if (!audio) return;
      Object.defineProperty(audio, 'duration', { value: 10, configurable: true });
      Object.defineProperty(audio, 'currentTime', {
        value: (pct / 100) * 10,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(audio, 'paused', { value: false, configurable: true });
      audio.dispatchEvent(new Event('timeupdate'));
    }, percent);
  },
);

Then(
  'the voice service text should include {string}',
  async function (this: CustomWorld, text: string) {
    const locator = this.page.locator(`text="${text}"`);
    await expect(locator).toBeVisible();
  },
);

Then(
  'the voice service text should not include {string}',
  async function (this: CustomWorld, text: string) {
    const locator = this.page.locator(`text="${text}"`);
    await expect(locator).toHaveCount(0);
  },
);

Then('the word {string} should be highlighted', async function (this: CustomWorld, text: string) {
  const locator = this.page.locator(`text="${text}"`).first();
  await expect(locator).toHaveAttribute('style', /background/);
});
