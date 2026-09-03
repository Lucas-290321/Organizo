import { useCallback } from "react";
import { toast } from "react-hot-toast";

export function useToast() {
  return useCallback(({ title, description }) => {
    toast.custom(() => (
      <div
        style={{
          background: "white",
          padding: "10px",
          borderRadius: "8px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
        }}
      >
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    ));
  }, []);
}
