import { Component, type ReactNode } from 'react';
import { LogoMark } from './brand/Logo';

export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
        <LogoMark className="h-10 w-10" />
        <h1 className="mt-6 text-heading text-foreground">Something went wrong</h1>
        <p className="mt-2 max-w-md text-body text-muted-foreground">
          Proba Insights hit an unexpected problem displaying this page. Nothing in your workspace was changed.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex h-10 items-center rounded-md bg-primary px-5 text-body font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Reload
        </button>
      </main>
    );
  }
}
