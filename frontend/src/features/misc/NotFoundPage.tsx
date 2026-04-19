import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";

export function NotFoundPage() {
  return (
    <div className="min-h-[70vh] grid place-items-center px-4 text-ink">
      <div className="text-center max-w-md">
        <p className="font-display text-7xl md:text-8xl font-bold gradient-text">
          404
        </p>
        <h1 className="font-display text-2xl font-semibold mt-4">
          Page not found
        </h1>
        <p className="text-muted mt-2">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <div className="mt-8">
          <Link to="/" aria-label="Back to home">
            <Button>Back to home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
