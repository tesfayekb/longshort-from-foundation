import { Component, type ErrorInfo, type ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EnvConfigError } from '@/lib/env';

interface Props {
  children: ReactNode;
  /** If true, renders a compact inline error instead of a full-page one */
  inline?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React error boundary — catches JS errors in child components
 * and renders a graceful fallback instead of a white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
    Sentry.captureException(error, {
      contexts: {
        react: { componentStack: info.componentStack },
      },
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    // EnvConfigError is unrecoverable in the running tab — Retry cannot fix a missing
    // build-time env var. Render a dedicated, branded misconfiguration screen instead
    // of the generic "Try Again" UI so operators see exactly what to fix.
    if (this.state.error instanceof EnvConfigError) {
      const err = this.state.error;
      return (
        <div className="flex min-h-screen items-center justify-center p-8 bg-background">
          <div className="max-w-lg space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <h1 className="text-lg font-semibold text-foreground">App misconfigured</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              The application cannot start because one or more required environment variables are missing or invalid. This is a deployment / build configuration issue, not a runtime bug — retrying will not help until the env is fixed and the app is rebuilt.
            </p>
            {err.missing.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs font-medium text-foreground mb-1">Missing</p>
                <ul className="text-xs text-muted-foreground font-mono space-y-0.5">
                  {err.missing.map((k) => <li key={k}>{k}</li>)}
                </ul>
              </div>
            )}
            {err.invalid.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs font-medium text-foreground mb-1">Invalid</p>
                <ul className="text-xs text-muted-foreground font-mono space-y-0.5">
                  {err.invalid.map((k) => <li key={k}>{k}</li>)}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              See <code className="font-mono">docs/07-reference/env-var-index.md</code> for the canonical list of required variables.
            </p>
          </div>
        </div>
      );
    }

    if (this.props.inline) {
      return (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Something went wrong</p>
            <p className="text-xs text-muted-foreground truncate">{this.state.error?.message}</p>
          </div>
          <Button variant="outline" size="sm" onClick={this.handleRetry}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
          </Button>
        </div>
      );
    }

    return (
      <div className="flex min-h-[50vh] items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. Please try again.
          </p>
          {this.state.error?.message && (
            <pre className="rounded-md bg-muted p-3 text-xs text-muted-foreground text-left overflow-auto max-h-32">
              {this.state.error.message}
            </pre>
          )}
          <Button onClick={this.handleRetry}>
            <RefreshCw className="h-4 w-4 mr-2" /> Try Again
          </Button>
        </div>
      </div>
    );
  }
}
