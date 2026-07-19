import type { SelectHTMLAttributes } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
};

export function Select({
  label,
  error,
  id,
  className = "",
  children,
  ...props
}: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
      ) : null}
      <select
        id={id}
        className={`rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary ${className}`}
        {...props}
      >
        {children}
      </select>
      {error ? <span className="text-sm text-danger">{error}</span> : null}
    </div>
  );
}
