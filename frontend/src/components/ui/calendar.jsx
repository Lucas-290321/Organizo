import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { ptBR } from "date-fns/locale"

import { cn } from "../../lib/utils"
import { buttonVariants } from "../ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={ptBR}
      className={cn("w-full", className)}
      classNames={{
  months: "flex flex-col w-full",
  month: "space-y-6 w-full",

  caption:
    "flex justify-center items-center relative px-8 mb-4",

  caption_label:
    "text-lg font-bold capitalize text-slate-900",

  nav: "flex items-center gap-2",

  nav_button: cn(
    buttonVariants({ variant: "ghost" }),
    "h-9 w-9 rounded-lg border border-slate-200 hover:bg-slate-100"
  ),

  nav_button_previous: "absolute left-0",

  nav_button_next: "absolute right-0",

  table: "w-full border-separate border-spacing-y-3",

  head_row: "grid grid-cols-7 mb-3",

  head_cell:
    "w-10 h-10 text-center text-xs font-semibold uppercase text-slate-400",

  row: "grid grid-cols-7 gap-y-3",

  cell:
    "flex justify-center items-center h-12 w-12 mx-auto",

  day: cn(
  buttonVariants({ variant: "ghost" }),
  "h-12 w-12 rounded-full transition-all hover:bg-slate-100 hover:scale-105"
  ),

  day_selected:
   "rounded-full bg-blue-600 text-white hover:bg-blue-700 focus:bg-blue-700",

  day_today:
   "rounded-full border-2 border-blue-600 font-bold text-blue-600",

  day_outside:
    "text-slate-300",

  day_disabled:
    "text-slate-300 opacity-40",

  day_range_middle:
    "bg-blue-100",

  day_hidden:
    "invisible",

  ...classNames,
}}
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("h-4 w-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("h-4 w-4", className)} {...props} />
        ),
      }}
      {...props} />
  );
}
Calendar.displayName = "Calendar"

export { Calendar }
