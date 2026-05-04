"use client";

import { useState, type KeyboardEvent } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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

const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Oson",
  2: "Yengil",
  3: "O'rta",
  4: "Qiyin",
  5: "Juda qiyin",
};

const CLASS_NUMBERS = [5, 6, 7, 8, 9, 10, 11] as const;

export interface MetadataFormProps {
  topicsAvailable: Topic[];
  sourcesAvailable: Source[];
}

export function MetadataForm({
  topicsAvailable,
  sourcesAvailable,
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

      {/* Difficulty */}
      <div className="space-y-2 lg:col-span-2">
        <Label>Qiyinlik darajasi</Label>
        <Controller
          control={control}
          name="difficulty"
          render={({ field }) => (
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => field.onChange(d)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm transition-colors",
                    field.value === d
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  )}
                >
                  {d} · {DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
          )}
        />
        <FieldError message={errors.difficulty?.message} />
      </div>

      {/* Classes */}
      <div className="space-y-2 lg:col-span-2">
        <Label>Sinflar</Label>
        <Controller
          control={control}
          name="classes"
          render={({ field }) => {
            const value: number[] = field.value ?? [];
            return (
              <div className="flex flex-wrap gap-3">
                {CLASS_NUMBERS.map((c) => {
                  const checked = value.includes(c);
                  return (
                    <label
                      key={c}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(state) => {
                          const next =
                            state === true
                              ? Array.from(new Set([...value, c])).sort(
                                  (a, b) => a - b
                                )
                              : value.filter((x) => x !== c);
                          field.onChange(next);
                        }}
                      />
                      <span className="text-sm">{c}-sinf</span>
                    </label>
                  );
                })}
              </div>
            );
          }}
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

      {/* Tags */}
      <div className="space-y-2 lg:col-span-2">
        <Label>Teglar (Enter yoki vergul bilan ajrating)</Label>
        <Controller
          control={control}
          name="tagNames"
          render={({ field }) => (
            <TagChipInput
              value={field.value ?? []}
              onChange={field.onChange}
            />
          )}
        />
        <FieldError message={errors.tagNames?.message} />
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

function TagChipInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (value.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length) {
      // Quick removal of last chip when input is empty.
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="space-y-2">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
        placeholder="masalan: induction, vieta, am-gm"
      />
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((name) => (
            <Badge key={name} variant="outline" className="gap-1">
              #{name}
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => onChange(value.filter((n) => n !== name))}
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
