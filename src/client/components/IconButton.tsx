import type { ReactNode } from "react";

interface IconButtonProps {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  active?: boolean;
}

export function IconButton({ label, children, onClick, type = "button", disabled, active }: IconButtonProps) {
  return (
    <button
      type={type}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={[
        "grid h-10 w-10 place-items-center rounded-md border transition",
        active ? "border-pine bg-pine text-white" : "border-slate-200 bg-white text-ink hover:border-pine",
        disabled ? "cursor-not-allowed opacity-50" : ""
      ].join(" ")}
    >
      {children}
    </button>
  );
}
