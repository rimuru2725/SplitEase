"use client";

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-[120px] rounded-2xl" />
        ))}
      </div>
      {/* Chart area */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="skeleton h-[320px] rounded-2xl lg:col-span-3" />
        <div className="skeleton h-[320px] rounded-2xl lg:col-span-2" />
      </div>
      {/* Recent */}
      <div className="skeleton h-[200px] rounded-2xl" />
    </div>
  );
}

export function ExpensesSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="skeleton h-[72px] rounded-2xl" />
      <div className="skeleton h-[400px] rounded-2xl" />
    </div>
  );
}

export function SettlementsSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="skeleton h-[260px] rounded-2xl" />
      <div className="skeleton h-[260px] rounded-2xl" />
    </div>
  );
}
