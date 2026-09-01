import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ShotForm, emptyShotFormValues } from './ShotForm';

describe('ShotForm', () => {
  it('submits with only the required fields filled in', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ShotForm initialValues={emptyShotFormValues} submitLabel="Save shot" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/grind setting/i), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText(/dose/i), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText(/yield/i), { target: { value: '36' } });
    fireEvent.change(screen.getByLabelText(/pull time/i), { target: { value: '28' } });
    fireEvent.click(screen.getByRole('button', { name: /save shot/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        ...emptyShotFormValues,
        grind_setting: '18',
        dose_g: '18',
        yield_g: '36',
        pull_time_s: '28',
      })
    );
  });

  it('includes optional fields when filled in', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ShotForm initialValues={emptyShotFormValues} submitLabel="Save shot" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/grind setting/i), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText(/dose/i), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText(/yield/i), { target: { value: '36' } });
    fireEvent.change(screen.getByLabelText(/pull time/i), { target: { value: '28' } });
    fireEvent.change(screen.getByLabelText(/bean/i), { target: { value: 'Colombia Huila' } });
    fireEvent.change(screen.getByLabelText(/rating/i), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /save shot/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ bean_name: 'Colombia Huila', rating: '4' })
      )
    );
  });
});
