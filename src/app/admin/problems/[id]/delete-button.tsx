"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteProblemAction } from "@/app/admin/problems/_actions";

export function DeleteProblemButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onDelete() {
    startTransition(async () => {
      // Server action calls redirect() on success — execution stops here.
      await deleteProblemAction(id);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive">{"O'chirish"}</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{"Bu masalani o'chirasizmi?"}</DialogTitle>
          <DialogDescription>
            {"Bu amal qaytarib bo'lmaydi. Masala yozuvi va uning mavzu/sinf aloqalari o'chiriladi. R2'dagi rasmlar saqlanadi (alohida tozalash ishi keyinroq qo'shiladi)."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Bekor qilish
          </Button>
          <Button variant="destructive" onClick={onDelete} disabled={isPending}>
            {isPending ? "O'chirilmoqda…" : "O'chirish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
