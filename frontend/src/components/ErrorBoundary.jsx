import { Component } from 'react'

// Without this, one screen throwing takes the whole app down and leaves a
// blank page with nothing to go on. This keeps the failure on screen.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Screen failed:', error, info?.componentStack)
  }

  componentDidUpdate(prev) {
    // Moving to another screen clears the failure.
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="card" style={{ maxWidth: 720 }}>
        <div className="card-head">
          <strong>This screen hit an error</strong>
        </div>
        <div className="card-body">
          <p className="muted" style={{ marginTop: 0 }}>
            The rest of the app still works — pick another screen from the menu.
          </p>
          <pre className="error-dump">{String(error?.stack || error?.message || error)}</pre>
          <button className="btn" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      </div>
    )
  }
}
