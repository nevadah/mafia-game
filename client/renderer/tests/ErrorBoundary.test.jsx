import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from '../src/components/ErrorBoundary';

// Suppress the expected console.error output from React's error boundary reporting
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

function Bomb({ shouldThrow }) {
  if (shouldThrow) throw new Error('Test render error');
  return <div>All good</div>;
}

describe('ErrorBoundary', () => {
  it('renders children normally when there is no error', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('shows the error message when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test render error')).toBeInTheDocument();
  });

  it('renders a Back to menu button when onReset is provided', () => {
    render(
      <ErrorBoundary onReset={() => {}}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByRole('button', { name: 'Back to menu' })).toBeInTheDocument();
  });

  it('omits the Back to menu button when onReset is not provided', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.queryByRole('button', { name: 'Back to menu' })).not.toBeInTheDocument();
  });

  it('calls onReset when Back to menu is clicked', async () => {
    const user = userEvent.setup();
    const onReset = jest.fn();
    render(
      <ErrorBoundary onReset={onReset}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    await user.click(screen.getByRole('button', { name: 'Back to menu' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
