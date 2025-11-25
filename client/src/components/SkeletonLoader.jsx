import "./SkeletonLoader.css";

export function SkeletonCard({ width = "100%", height = "200px" }) {
  return (
    <div className="skeleton-card" style={{ width, height }}>
      <div className="skeleton-shimmer"></div>
    </div>
  );
}

export function SkeletonText({ width = "60%", height = "16px" }) {
  return (
    <div className="skeleton-text" style={{ width, height }}>
      <div className="skeleton-shimmer"></div>
    </div>
  );
}

export function SkeletonCircle({ size = "48px" }) {
  return (
    <div className="skeleton-circle" style={{ width: size, height: size }}>
      <div className="skeleton-shimmer"></div>
    </div>
  );
}

export function SkeletonWidget() {
  return (
    <div className="skeleton-widget">
      <div className="skeleton-shimmer"></div>
      <div className="skeleton-widget-header">
        <SkeletonCircle size="24px" />
        <SkeletonText width="40%" height="14px" />
      </div>
      <SkeletonText width="80%" height="48px" />
      <SkeletonText width="60%" height="12px" />
    </div>
  );
}

export function SkeletonGraph({ height = "200px" }) {
  return (
    <div className="skeleton-graph" style={{ height }}>
      <div className="skeleton-shimmer"></div>
      <div className="skeleton-graph-bars">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="skeleton-graph-bar" style={{ height: `${Math.random() * 60 + 40}%` }}>
            <div className="skeleton-shimmer"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// No default export needed - using named exports

