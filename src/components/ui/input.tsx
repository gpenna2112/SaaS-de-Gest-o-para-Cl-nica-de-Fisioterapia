import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({
  label,
  error,
  id,
  className = "",
  ...props
}: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
      ) : null}
      <input
        id={id}
        className={`rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary ${className}`}
        {...props}
      />
      {error ? <span className="text-sm text-danger">{error}</span> : null}
    </div>
  );
}
