import { Component } from 'react';

/**
 * Catches render errors in the phase UI subtree and shows a recovery screen
 * instead of leaving the player with a blank crash. Must be a class component —
 * React does not support error boundaries as function components.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Render error caught:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p className="error-boundary__message">{this.state.error.message}</p>
          {this.props.onReset && (
            <button onClick={this.props.onReset}>Back to menu</button>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
