import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback)
        return this.props.fallback(this.state.error, this.reset);
      return (
        <div className="min-h-[50vh] grid place-items-center p-8">
          <div className="flex flex-col items-center text-center gap-4 max-w-md">
            <div className="h-14 w-14 rounded-full bg-brand-rose/15 grid place-items-center text-brand-rose border border-brand-rose/30">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-ink">Something went wrong</p>
              <p className="text-sm text-muted mt-1">
                {this.state.error.message}
              </p>
            </div>
            <Button variant="secondary" onClick={this.reset}>
              Try again
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
