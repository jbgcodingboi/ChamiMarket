import { Component } from 'react'
import { AlertIcon } from './Icons.jsx'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center" role="alert">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-no-soft text-no">
          <AlertIcon className="size-6" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">
          This page hit an unexpected error. Your paper portfolio is saved and is not affected.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" className="btn btn-ghost" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload app
          </button>
        </div>
      </div>
    )
  }
}
