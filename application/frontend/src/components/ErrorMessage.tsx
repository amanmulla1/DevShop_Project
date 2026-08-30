interface Props {
  message?: string
  onRetry: () => void
}

export default function ErrorMessage({ message, onRetry }: Props) {
  return (
    <div className="error-message" role="alert">
      <span className="error-message__icon">⚠️</span>
      <p className="error-message__title">Unable to load products.</p>
      <p className="error-message__text">
        {message ?? 'Please check that the backend is running and try again.'}
      </p>
      <button className="btn btn--primary" style={{ width: 'auto' }} onClick={onRetry}>
        Try Again
      </button>
    </div>
  )
}
