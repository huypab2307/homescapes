import { useStudio } from "../lib/studio.tsx";
import { useToast } from "../components/ui.tsx";

/**
 * Shared Save / Push action row for every AM-style section.
 *
 * - Save validates and persists what is actually staged (never pretends).
 * - Push applies pending edits first, then writes the save to the connected
 *   device — or says honestly that no device is connected. It never
 *   simulates a live-game update.
 */
export function AmActions({
  onSave,
  saveDisabled,
  saveLabel = "Save",
}: {
  /** Custom save (sections that persist beyond staged field edits). */
  onSave?: () => Promise<boolean>;
  saveDisabled?: boolean;
  saveLabel?: string;
}) {
  const { pending, applyPending, applying, push, pushing } = useStudio();
  const toast = useToast();

  const handleSave = async () => {
    if (applying) return;
    if (onSave) {
      await onSave();
      return;
    }
    if (pending.size === 0) {
      toast.info("Nothing to save", "No edits are staged — change a value first.");
      return;
    }
    await applyPending();
  };

  const handlePush = async () => {
    if (pushing || applying) return;
    await push();
  };

  return (
    <div className="am-actions">
      <button
        type="button"
        className="am-btn am-btn-save"
        onClick={() => void handleSave()}
        disabled={applying || saveDisabled}
        title={saveDisabled ? "Load a save first" : "Validate and persist staged edits"}
      >
        <img src="assets/ui/save-glyph.png" alt="" />
        <span>{saveLabel}</span>
      </button>
      <button
        type="button"
        className="am-btn am-btn-push"
        onClick={() => void handlePush()}
        disabled={pushing || applying}
        title="Apply staged edits and write the save to the connected device"
      >
        <img src="assets/ui/push-glyph.png" alt="" />
        <span>{pushing ? "Pushing…" : "Push"}</span>
      </button>
    </div>
  );
}
