import revealStyles from "@/components/pick-reveal/PickReveal.module.css";

/** Shared concealed face for every revealable Fiyu Pick. */
export function PickCardBack() {
  return (
    <span className={revealStyles.backContent}>
      <span className={revealStyles.wordmark}>Fiyu</span>
      <span aria-hidden="true" className={revealStyles.makerMark}>
        <span />
        <span />
        <span />
      </span>
      <span className={revealStyles.revealAffordance}>
        Reveal <span aria-hidden="true">→</span>
      </span>
    </span>
  );
}
