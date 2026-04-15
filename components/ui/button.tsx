import * as React from "react";

type ButtonVariant = "default" | "outline";
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ className = "", variant = "default", ...props }: ButtonProps) {
  const variantClass = variant === "outline" ? "btn-option" : "btn-primary";
  return <button className={`${variantClass} ${className}`.trim()} {...props} />;
}
