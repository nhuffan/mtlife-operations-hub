"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function BdNameFilter({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value?: string[];
  onChange: (value: string[] | undefined) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between font-normal" aria-label="BD Name">
          <span className="truncate text-left">
            {!value?.length
              ? "All"
              : value.length === 1
                ? options.find((option) => option.id === value[0])?.label ?? "1 selected"
                : `${value.length} selected`}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2">
        <div className="max-h-64 space-y-2 overflow-y-auto">
          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
            <Checkbox checked={!value?.length} onCheckedChange={() => onChange(undefined)} />
            <span className="text-sm">All</span>
          </label>
          {options.map((option) => (
            <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
              <Checkbox
                checked={!!value?.includes(option.id)}
                onCheckedChange={() => {
                  const next = value?.includes(option.id)
                    ? value.filter((id) => id !== option.id)
                    : [...(value ?? []), option.id];
                  onChange(next.length ? next : undefined);
                }}
              />
              <span className="text-sm">{option.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
