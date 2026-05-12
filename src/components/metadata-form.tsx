"use client";

import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Topic, Source } from "@/db/schema";

const CLASS_NUMBERS = [5, 6, 7, 8, 9, 10, 11] as const;

export interface MetadataFormProps {
  topicsAvailable: Topic[];
  sourcesAvailable: Source[];
  /** Compact mode hides "Yil", "Masala raqami" and "Javob" — used by the
   *  modal create flow. The hidden fields stay at their default values
   *  (year/problemNumber/answer = null). */
  compact?: boolean;
}

export function MetadataForm({
  topicsAvailable,
  sourcesAvailable,
  compact = false,
}: MetadataFormProps) {
  const { control, register, formState } = useFormContext();
  const errors = formState.errors;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Source */}
      <div className="space-y-2">
        <Label htmlFor="sourceId">Manba (source)</Label>
        <Controller
          control={control}
          name="sourceId"
          render={({ field }) => (
            <Select
              value={field.value ?? ""}
              onValueChange={(v) => field.onChange(v)}
            >
              <SelectTrigger id="sourceId" className="w-full">
                <SelectValue placeholder="Manbani tanlang" />
              </SelectTrigger>
              <SelectContent>
                {sourcesAvailable.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError message={errors.sourceId?.message} />
      </div>

      {/* Year */}
      {!compact && (
        <div className="space-y-2">
          <Label htmlFor="year">Yil (ixtiyoriy)</Label>
          <Input
            id="year"
            type="number"
            inputMode="numeric"
            min={1900}
            max={2100}
            placeholder="2024"
            {...register("year", {
              setValueAs: (v) =>
                v === "" || v === null || v === undefined ? null : Number(v),
            })}
          />
          <FieldError message={errors.year?.message} />
        </div>
      )}

      {!compact && (
        <>
          {/* Problem number */}
          <div className="space-y-2">
            <Label htmlFor="problemNumber">Masala raqami (ixtiyoriy)</Label>
            <Input
              id="problemNumber"
              placeholder="P3 / Day 2 / 3 / A1"
              {...register("problemNumber", {
                setValueAs: (v) => (v === "" ? null : v),
              })}
            />
            <FieldError message={errors.problemNumber?.message} />
          </div>

          {/* Answer (free-form short answer, optional) */}
          <div className="space-y-2">
            <Label htmlFor="answer">Javob (ixtiyoriy)</Label>
            <Input
              id="answer"
              placeholder="Masalan: 42 yoki x = 1, 2, 3"
              {...register("answer", {
                setValueAs: (v) => (v === "" ? null : v),
              })}
            />
            <FieldError message={errors.answer?.message} />
          </div>
        </>
      )}

      {/* Classes */}
      <div className="space-y-2 lg:col-span-2">
        <Label>Sinflar</Label>
        <Controller
          control={control}
          name="classes"
          render={({ field }) => (
            <ClassMultiSelect
              value={field.value ?? []}
              onChange={field.onChange}
            />
          )}
        />
        <FieldError message={errors.classes?.message} />
      </div>

      {/* Topics */}
      <div className="space-y-2 lg:col-span-2">
        <Label>Mavzular (kamida bittasi)</Label>
        <Controller
          control={control}
          name="topicIds"
          render={({ field }) => (
            <TopicMultiSelect
              available={topicsAvailable}
              value={field.value ?? []}
              onChange={field.onChange}
            />
          )}
        />
        <FieldError message={errors.topicIds?.message} />
      </div>

    </div>
  );
}

function FieldError({ message }: { message?: unknown }) {
  if (typeof message !== "string" || !message) return null;
  return <p className="text-destructive text-xs">{message}</p>;
}

function TopicMultiSelect({
  available,
  value,
  onChange,
}: {
  available: Topic[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = available.filter((t) => value.includes(t.id));

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between"
            >
              <span className="text-muted-foreground text-sm">
                {selected.length === 0
                  ? "Mavzularni tanlang…"
                  : `${selected.length} ta tanlangan`}
              </span>
              <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
            </Button>
          }
        />
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Mavzu qidirish…" />
            <CommandList>
              <CommandEmpty>Topilmadi.</CommandEmpty>
              <CommandGroup>
                {available.map((t) => {
                  const isSelected = value.includes(t.id);
                  return (
                    <CommandItem
                      key={t.id}
                      value={t.name}
                      onSelect={() => toggle(t.id)}
                    >
                      <Check
                        className={cn(
                          "mr-2 size-4",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {t.name}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((t) => (
            <Badge key={t.id} variant="secondary" className="gap-1">
              {t.name}
              <button
                type="button"
                aria-label={`Remove ${t.name}`}
                onClick={() => toggle(t.id)}
                className="hover:opacity-70"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function ClassMultiSelect({
  value,
  onChange,
}: {
  value: number[];
  onChange: (v: number[]) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(n: number) {
    if (value.includes(n)) {
      onChange(value.filter((v) => v !== n));
    } else {
      onChange([...value, n].sort((a, b) => a - b));
    }
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between"
            >
              <span className="text-muted-foreground text-sm">
                {value.length === 0
                  ? "Sinflarni tanlang…"
                  : `${value.length} ta tanlangan`}
              </span>
              <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
            </Button>
          }
        />
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command>
            <CommandList>
              <CommandGroup>
                {CLASS_NUMBERS.map((n) => {
                  const isSelected = value.includes(n);
                  return (
                    <CommandItem
                      key={n}
                      value={`${n}-sinf`}
                      onSelect={() => toggle(n)}
                    >
                      <Check
                        className={cn(
                          "mr-2 size-4",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {n}-sinf
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((n) => (
            <Badge key={n} variant="secondary" className="gap-1">
              {n}-sinf
              <button
                type="button"
                aria-label={`Remove ${n}-sinf`}
                onClick={() => toggle(n)}
                className="hover:opacity-70"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

