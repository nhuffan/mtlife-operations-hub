"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  value?: string; // "YYYY-MM-DD"
  onChange: (iso?: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

export function DatePickerDMY({ value, onChange, placeholder = "Select a date", className, id, disabled, "aria-label": ariaLabel }: Props) {
  const selected = value ? new Date(value + "T00:00:00") : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          disabled={disabled}
          aria-label={ariaLabel}
          variant="outline"
          className={cn("w-full cursor-pointer justify-start text-left font-normal", !value && "text-muted-foreground", className)}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(selected!, "dd/MM/yyyy") : placeholder}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          disabled={disabled}
          defaultMonth={selected}
          selected={selected}
          onSelect={(d) => {
            if (!d) return onChange(undefined);
            const iso = format(d, "yyyy-MM-dd");
            onChange(iso);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
