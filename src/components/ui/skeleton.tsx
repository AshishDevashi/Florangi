export function Skeleton({ className }: { className: string }) {
  return <span aria-hidden="true" className={`block rounded-md bg-border motion-safe:animate-pulse ${className}`} />;
}
