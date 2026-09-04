// src/components/shot-display/shot-display.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RatioFigure } from './RatioFigure';
import { PullTimeFigure } from './PullTimeFigure';
import { RatingDots } from './RatingDots';
import { BagTag } from './BagTag';

describe('RatioFigure', () => {
  it('renders the ratio with the 1: prefix and two decimals', () => {
    render(<RatioFigure value={2.056} />);
    expect(screen.getByText('1:')).toBeInTheDocument();
    expect(screen.getByText(/2\.06/)).toBeInTheDocument();
  });
});

describe('PullTimeFigure', () => {
  it('renders whole seconds with a tight s suffix', () => {
    render(<PullTimeFigure seconds={28.4} />);
    expect(screen.getByText('28')).toBeInTheDocument();
    expect(screen.getByText('s')).toBeInTheDocument();
  });
});

describe('RatingDots', () => {
  it('exposes the rating as an accessible label', () => {
    render(<RatingDots rating={4} />);
    expect(screen.getByLabelText('Rating 4 of 5')).toBeInTheDocument();
  });
});

describe('BagTag', () => {
  it('renders nothing for a null state', () => {
    const { container } = render(<BagTag state={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the label for each non-null state', () => {
    render(<BagTag state="dialed" />);
    expect(screen.getByText('Dialed')).toBeInTheDocument();
  });
});
