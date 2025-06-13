/* globals process */
// src/components/ErrorBoundary.jsx
import React from 'react';

/**
 * A React class component that implements an Error Boundary.
 * It catches JavaScript errors anywhere in its child component tree,
 * logs those errors, and displays a fallback UI instead of the crashed component tree.
 *
 * This component is used to gracefully handle runtime errors in parts of the UI,
 * preventing the entire application from crashing.
 *
 * @component
 * @param {Object} props - The component's props.
 * @param {React.ReactNode} props.children - The child components that this error boundary will wrap.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError() { // error parameter removed
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    // Store error and errorInfo in state to potentially display them
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '8px' }}>
          <h2>Something went wrong.</h2>
          <p>We're sorry for the inconvenience. Please try refreshing the page, or contact support if the issue persists.</p>
          {/* Optionally, display error details during development */}
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details style={{ marginTop: '10px', whiteSpace: 'pre-wrap', textAlign: 'left', backgroundColor: '#fff', padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}>
              <summary>Error Details (Development Only)</summary>
              {this.state.error.toString()}
              <br />
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </details>
          )}
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
