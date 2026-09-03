import * as React from "react";
import { cn } from "../../lib/utils";
import { Eye, EyeOff } from "lucide-react";

const Input = React.forwardRef(({ className, type = "text", ...props }, ref) => {
  const [showPassword, setShowPassword] = React.useState(false);

  // Alterna entre "text" e "password" apenas se for senha
  const inputType = type === "Password" ? (showPassword ? "text" : "Password") : type;

  return (
    <div className="relative w-full">
      <input
        ref={ref}
        type={inputType} 
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          type === "Password" ? "pr-10" : "", // espaço pro botão do olho
          className
        )}
        {...props}
      />
      {type === "Password" && (
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-800"
          tabIndex={-1} // não interfere no foco
        >
          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      )}
    </div>
  );
});

Input.displayName = "Input";

export { Input };
