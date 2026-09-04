import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ShotForm, emptyShotFormValues, type ShotFormValues } from './ShotForm';

const reference: ShotFormValues = {
  ...emptyShotFormValues,
  grind_setting: '18.0',
  dose_g: '18.0',
  yield_g: '36.0',
  pull_time_s: '28',
  bean_name: 'Kenya Nyeri AA',
  roast_date: '2026-08-23',
};

describe('ShotForm', () => {
  it('starts each nudge row at the reference value with no delta shown', () => {
    render(
      <ShotForm
        referenceValues={reference}
        initialValues={reference}
        submitLabel="Save shot"
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Dose')).toHaveValue('18.0');
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
  });

  it('shows a signed delta and accent colour once a value is nudged away from the reference', () => {
    render(
      <ShotForm
        referenceValues={reference}
        initialValues={reference}
        submitLabel="Save shot"
        onSubmit={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Increase dose' }));

    expect(screen.getByText('+0.1')).toBeInTheDocument();
  });

  it('clears the delta when a nudge returns the value to the reference', () => {
    render(
      <ShotForm
        referenceValues={reference}
        initialValues={reference}
        submitLabel="Save shot"
        onSubmit={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Increase dose' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decrease dose' }));

    expect(screen.queryByText('+0.1')).not.toBeInTheDocument();
    expect(screen.queryByText('−0.1')).not.toBeInTheDocument();
  });

  it('reset returns every field to the reference values', () => {
    render(
      <ShotForm
        referenceValues={reference}
        initialValues={reference}
        submitLabel="Save shot"
        onSubmit={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Increase dose' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.getByLabelText('Dose')).toHaveValue('18.0');
    expect(screen.queryByText('+0.1')).not.toBeInTheDocument();
  });

  it('submits the current working values, not the reference values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ShotForm
        referenceValues={reference}
        initialValues={reference}
        submitLabel="Save shot"
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Increase dose' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save shot' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ dose_g: '18.1' }))
    );
  });

  it('renders rating dots that set the rating on click', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ShotForm
        referenceValues={reference}
        initialValues={reference}
        submitLabel="Save shot"
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rate 4' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save shot' }));

    return waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ rating: '4' }))
    );
  });

  it('expands a tasting note field from the ghost link', () => {
    render(
      <ShotForm
        referenceValues={reference}
        initialValues={reference}
        submitLabel="Save shot"
        onSubmit={vi.fn()}
      />
    );

    expect(screen.queryByLabelText(/tasting note/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add tasting note' }));
    expect(screen.getByLabelText(/tasting note/i)).toBeInTheDocument();
  });
});
