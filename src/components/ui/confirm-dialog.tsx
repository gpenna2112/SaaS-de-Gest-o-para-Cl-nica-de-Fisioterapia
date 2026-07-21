"use client";

import { useRef } from "react";
import { Button, buttonClassName } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  title: string;
  description?: string;

  confirmLabel?: string;
  cancelLabel?: string;
  /** Mapeia para `Button variant="danger"` (default) ou `"primary"`. */
  destructive?: boolean;

  /** Se rejeitar, o diálogo permanece aberto — quem chama continua responsável por reportar o erro (estado local já existente). Se resolver, o diálogo fecha sozinho. */
  onConfirm: () => void | Promise<void>;
  isConfirming?: boolean;
}

/**
 * Confirmação reutilizável para ações destrutivas (cancelar sessão,
 * desativar paciente/profissional/sala) — primeiro uso real do `Dialog`
 * (ADR-0018 §"Quando revisitar"). Nunca é quem chama que fecha o diálogo:
 * `onConfirm` decide, pelo resultado da própria promise.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = true,
  onConfirm,
  isConfirming = false,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  async function handleConfirm() {
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Mantém aberto de propósito — quem chama já reporta o erro no próprio estado local (mesmo padrão de formError/error já usado no app).
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent initialFocus={cancelButtonRef}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          {/* `Button` não repassa ref (button.tsx não usa forwardRef) — usa
              `buttonClassName` num <button> nativo, mesma técnica que
              `LinkButton` já usa para ter a cara de `Button` sem ser um. */}
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={isConfirming}
            onClick={() => onOpenChange(false)}
            className={buttonClassName("secondary")}
          >
            {cancelLabel}
          </button>
          <Button type="button" variant={destructive ? "danger" : "primary"} disabled={isConfirming} onClick={handleConfirm}>
            {isConfirming ? "Aguarde…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
