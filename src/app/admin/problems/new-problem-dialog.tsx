"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ProblemForm } from "@/components/problem-form";
import type { Topic, Source, AgeCategory } from "@/db/schema";

export interface NewProblemDialogProps {
  topicsAvailable: Topic[];
  sourcesAvailable: Source[];
  ageCategoriesAvailable: AgeCategory[];
}

export function NewProblemDialog({
  topicsAvailable,
  sourcesAvailable,
  ageCategoriesAvailable,
}: NewProblemDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus data-icon="inline-start" />
            Yangi masala
          </Button>
        }
      />
      <DialogContent className="sm:max-w-5xl max-h-[90vh] grid grid-rows-[auto_1fr] gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 py-3.5 border-b space-y-0.5">
          <DialogTitle className="text-base font-semibold">
            Yangi masala
          </DialogTitle>
          <DialogDescription className="text-xs">
            Matnni Markdown va LaTeX bilan yozing. Manba va mavzularni tanlang.
          </DialogDescription>
        </DialogHeader>

        <ProblemForm
          mode="create"
          defaultValues={{
            bodyMd: "",
            solutionMd: null,
            answer: null,
            sourceId: sourcesAvailable[0]?.id ?? "",
            year: null,
            problemNumber: null,
            topicIds: [],
            classes: [],
            ageCategoryIds: [],
          }}
          topicsAvailable={topicsAvailable}
          sourcesAvailable={sourcesAvailable}
          ageCategoriesAvailable={ageCategoriesAvailable}
          uploadPrefix="problems/draft"
          compact
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
