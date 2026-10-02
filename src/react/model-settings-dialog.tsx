import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef } from "react";
import { ModelSettingsPanel } from "./model-settings-panel";
import styles from "./model-settings.module.css";
import { zhCNText } from "./text";
import type { ModelSettingsDialogProps } from "./types";

export function ModelSettingsDialog({
  open,
  onOpenChange,
  onSave,
  onCancel,
  text,
  ...panelProps
}: ModelSettingsDialogProps) {
  const title = text?.title ?? zhCNText.title;
  const close = text?.close ?? zhCNText.close;
  const previousFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    generation.current++;
    return () => { generation.current++; };
  }, [open]);

  useEffect(() => {
    if (open && !wasOpen.current) {
      previousFocus.current = document.activeElement as HTMLElement | null;
    } else if (!open && wasOpen.current) {
      const target = previousFocus.current;
      queueMicrotask(() => target?.focus());
    }
    wasOpen.current = open;
  }, [open]);

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogOverlay} />
        <Dialog.Content className={styles.dialogContent}>
          <Dialog.Title className={styles.visuallyHidden}>{title}</Dialog.Title>
          <Dialog.Description className={styles.visuallyHidden}>
            {text?.description ?? zhCNText.description}
          </Dialog.Description>
          <Dialog.Close aria-label={close} className={styles.dialogClose}>
            <span aria-hidden="true">×</span>
          </Dialog.Close>
          <ModelSettingsPanel
            {...panelProps}
            onCancel={() => {
              onCancel?.();
              onOpenChange(false);
            }}
            onSave={async (selection) => {
              const savedGeneration = generation.current;
              await onSave(selection);
              if (generation.current === savedGeneration && wasOpen.current) onOpenChange(false);
            }}
            text={text}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
