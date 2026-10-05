import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/ui/cn";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] text-sm font-bold transition-[background-color,border-color,color,box-shadow] disabled:cursor-not-allowed disabled:opacity-55 active:brightness-95",
  {
    variants: {
      variant: {
        default: "border border-brand bg-brand text-white shadow-sm hover:border-brand-hover hover:bg-brand-hover",
        outline: "border border-stone-300 bg-white text-stone-800 shadow-sm hover:border-stone-400 hover:bg-stone-50",
      },
      size: { default: "min-h-11 px-4 py-2.5", lg: "min-h-14 px-6 py-3.5 text-base" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
