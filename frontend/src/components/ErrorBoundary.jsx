import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary] ${this.props.name || 'Panel'} crashed:`, error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center p-8">
          <div className="text-center max-w-sm">
            <div className="w-10 h-10 rounded-lg bg-[var(--ff-danger-soft)] border border-[var(--ff-danger)]/20 flex items-center justify-center mx-auto mb-3">
              <span className="text-[var(--ff-danger)] text-sm font-bold">!</span>
            </div>
            <p className="text-sm font-semibold text-[var(--ff-text)]">
              {this.props.name || 'This panel'} encountered an error
            </p>
            <p className="text-xs text-[var(--ff-muted)] mt-1.5 leading-relaxed">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={this.handleReset}
              className="mt-4 px-4 py-2 rounded-lg text-sm font-medium ff-btn-secondary"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
