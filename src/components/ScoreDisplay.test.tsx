/**
 * Tests for ScoreDisplay — label shows custom scoreDisplayLabel or default.
 * Run: bunx vitest run --silent='passed-only' 'src/components/ScoreDisplay.test.tsx'
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ScoreDisplay } from './ScoreDisplay';

describe('ScoreDisplay', () => {
  it('renders "Градус провокации" when scoreDisplayLabel is passed', () => {
    render(<ScoreDisplay score={0} scoreDisplayLabel="Градус провокации" />);
    expect(screen.getByText('Градус провокации')).toBeInTheDocument();
  });

  it('renders default "Уровень стресса" when scoreDisplayLabel is null', () => {
    render(<ScoreDisplay score={5} scoreDisplayLabel={null} />);
    expect(screen.getByText('Уровень стресса')).toBeInTheDocument();
  });

  it('renders default "Уровень стресса" when scoreDisplayLabel is undefined', () => {
    render(<ScoreDisplay score={-3} />);
    expect(screen.getByText('Уровень стресса')).toBeInTheDocument();
  });
});
