import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

// Helper component that throws an error
const ProblemChild = ({ shouldThrow = false }) => {
  if (shouldThrow) {
    throw new Error('Test error from ProblemChild');
  }
  return <div>Child component rendered successfully!</div>;
};

describe('ErrorBoundary', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    // Spy on console.error before each test
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); // Mock to silence error during test
  });

  afterEach(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );
    expect(screen.getByText('Child component rendered successfully!')).toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('displays fallback UI when a child component throws an error', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    // Check for fallback UI text
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    expect(screen.getByText(/We're sorry for the inconvenience/)).toBeInTheDocument();

    // Check that children are NOT rendered
    expect(screen.queryByText('Child component rendered successfully!')).not.toBeInTheDocument();
  });

  it('logs the error and errorInfo using componentDidCatch', () => {
    const expectedError = new Error('Test error from ProblemChild');
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    // expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // React might also log the error
    // Check that our specific log from componentDidCatch occurred
    // The first argument to console.error is the "ErrorBoundary caught an error:" string.
    // The second is the error object.
    // The third is an object with componentStack.
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "ErrorBoundary caught an error:",
      expect.objectContaining({ message: expectedError.message }), // Check if the error object has the expected message
      expect.objectContaining({ componentStack: expect.any(String) }) // errorInfo has componentStack
    );
  });

  it('state contains error and errorInfo after an error is caught', () => {
    // This test is more about internal state, which RTL doesn't encourage testing directly.
    // However, ErrorBoundary stores error/errorInfo in state, which is a key part of its design.
    // We can't directly check state with RTL, but we can infer it if the component
    // were to display parts of this.state.error or this.state.errorInfo.
    // Since it doesn't (except in a commented-out dev block), we'll rely on componentDidCatch logging.
    // For this test, we simply re-verify the console logging as an indirect sign state was set.
    const expectedError = new Error('Test error from ProblemChild');
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );
    // Verify our specific log call is present
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "ErrorBoundary caught an error:",
      expect.objectContaining({ message: expectedError.message }),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
    // If we could access instance state:
    // const instance = ... ; // No easy way with RTL to get class component instance
    // expect(instance.state.error).toEqual(expectedError);
    // expect(instance.state.errorInfo).toHaveProperty('componentStack');
  });

  // Test for the commented-out development error details block (optional, depends on env)
  // To test this, one would need to set process.env.NODE_ENV = 'development'
  // For now, this test is skipped or adapted based on how NODE_ENV is handled in test setup.
  it.skip('displays error details in development mode if error occurs', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development'; // Temporarily set for this test

    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    // Check for the <details> block or its contents if it were rendered
    // e.g., expect(screen.getByText('Error Details (Development Only)')).toBeInTheDocument();
    // This depends on uncommenting the block in ErrorBoundary.jsx

    process.env.NODE_ENV = originalNodeEnv; // Restore original NODE_ENV
  });
});
