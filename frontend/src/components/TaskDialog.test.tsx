import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { List } from '../api/types';
import { TaskDialog } from './TaskDialog';

const lists: List[] = [{ id: 'l1', name: 'Work', createdAt: '', taskCount: 0 }];

function setup(onSubmit = vi.fn()) {
  render(<TaskDialog open onOpenChange={() => {}} lists={lists} onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup() };
}

describe('TaskDialog validation', () => {
  it('requires a title', async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole('button', { name: 'Create task' }));
    expect(await screen.findByText('Title is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only titles', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Title'), '   ');
    await user.click(screen.getByRole('button', { name: 'Create task' }));
    expect(await screen.findByText('Title is required')).toBeInTheDocument();
  });

  it('enforces max lengths', async () => {
    const { user, onSubmit } = setup();
    const title = screen.getByLabelText('Title');
    await user.click(title);
    await user.paste('x'.repeat(201));
    await user.click(screen.getByLabelText('Description'));
    await user.paste('y'.repeat(5001));
    await user.click(screen.getByRole('button', { name: 'Create task' }));
    expect(await screen.findByText('Title must be at most 200 characters')).toBeInTheDocument();
    expect(screen.getByText('Description must be at most 5000 characters')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits valid values with a null due date when empty', async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByLabelText('Title'), '  Buy milk ');
    await user.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Buy milk',
      description: '',
      listId: 'l1',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
    });
  });
});
