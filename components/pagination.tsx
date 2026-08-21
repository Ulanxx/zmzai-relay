import Link from "next/link";

export function Pagination({
  page,
  totalPages,
  basePath,
}: {
  page: number;
  totalPages: number;
  basePath: string;
}) {
  if (totalPages <= 1) return null;
  const href = (p: number) => `${basePath}?page=${p}`;
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;
  return (
    <nav className="mt-6 flex items-center justify-center gap-3 text-sm">
      {prevDisabled ? (
        <span className="rounded-lg border border-line px-3 py-1.5 text-muted/50">上一页</span>
      ) : (
        <Link
          href={href(page - 1)}
          className="rounded-lg border border-line px-3 py-1.5 text-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          上一页
        </Link>
      )}
      <span className="font-mono text-xs text-muted">
        第 {page} / {totalPages} 页
      </span>
      {nextDisabled ? (
        <span className="rounded-lg border border-line px-3 py-1.5 text-muted/50">下一页</span>
      ) : (
        <Link
          href={href(page + 1)}
          className="rounded-lg border border-line px-3 py-1.5 text-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          下一页
        </Link>
      )}
    </nav>
  );
}
