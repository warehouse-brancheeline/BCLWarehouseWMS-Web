import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="page-center">
          <section className="message-card">
            <h1>Terjadi Kesalahan</h1>

            <p style={{ color: '#6b7280', marginBottom: '16px' }}>
              Halaman gagal dimuat. Ini mungkin disebabkan oleh koneksi
              internet atau kesalahan sistem.
            </p>

            {this.state.error?.message ? (
              <p
                style={{
                  fontSize: '13px',
                  color: '#9ca3af',
                  background: '#f9fafb',
                  padding: '12px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  wordBreak: 'break-word',
                }}
              >
                {this.state.error.message}
              </p>
            ) : null}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="primary-button"
                type="button"
                onClick={this.handleRetry}
              >
                Coba Lagi
              </button>

              <button
                className="secondary-button"
                type="button"
                onClick={() => window.location.reload()}
              >
                Refresh Halaman
              </button>
            </div>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
