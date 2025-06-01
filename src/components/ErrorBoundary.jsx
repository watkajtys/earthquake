// src/components/ErrorBoundary.jsx
import React, { Component } from 'react';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // You can also log the error to an error reporting service
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
        // Example: logErrorToMyService(error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            // You can render any custom fallback UI
            return (
                <div className="p-4 m-4 bg-red-100 border border-red-400 text-red-700 rounded text-center">
                    <h2 className="text-lg font-bold mb-2">Oops! Something went wrong.</h2>
                    <p>We're sorry for the inconvenience. Please try refreshing the page or contact support if the problem persists.</p>
                    {process.env.NODE_ENV === 'development' && (
                        <details className="mt-2 text-left text-xs whitespace-pre-wrap">
                            <summary>Error Details (Development Mode)</summary>
                            {this.state.error && this.state.error.toString()}
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
