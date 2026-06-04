"use client";

export interface ProblemBodyEditorProps {
  value: string; // body_md
  onChange: (next: string) => void;
  uploadPrefix: string; // "problems/draft" | "problems/{id}"
  minHeight?: string;
}

export function ProblemBodyEditor(_props: ProblemBodyEditorProps) {
  return null;
}
