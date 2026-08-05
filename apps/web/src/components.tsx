type ArrowButtonProps = {
  onClick: () => void;
  className?: string;
};

export function PreviousButton({ onClick, className = "" }: ArrowButtonProps) {
  return (
    <button
      type="button"
      className={`capsule-arrow capsule-arrow--left${className ? ` ${className}` : ""}`}
      onClick={onClick}
      aria-label="Previous position"
    >
      ←
    </button>
  );
}

export function NextButton({ onClick, className = "" }: ArrowButtonProps) {
  return (
    <button
      type="button"
      className={`capsule-arrow capsule-arrow--right${className ? ` ${className}` : ""}`}
      onClick={onClick}
      aria-label="Next position"
    >
      →
    </button>
  );
}

export function ResetButton({ onClick, className = "" }: ArrowButtonProps) {
  return (
    <button
      type="button"
      className={`capsule-arrow capsule-arrow--reset${className ? ` ${className}` : ""}`}
      onClick={onClick}
      aria-label="Reset position"
    >
      ⟲
    </button>
  );
}

type ToggleButtonProps = {
  enabled: boolean;
  onToggle: () => void;
};

export function ToggleButton({ enabled, onToggle }: ToggleButtonProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      className={`toggle-switch${enabled ? " toggle-switch--on" : ""}`}
      onClick={onToggle}
    >
      <span className="toggle-switch__track">
        <span className="toggle-switch__thumb" />
      </span>
    </button>
  );
}

type TextButtonProps = {
  text: string;
  onClick: () => void;
};

export function TextButton({ text, onClick }: TextButtonProps) {
  return (
    <button type="button" className="text-button" onClick={onClick}>
      {text}
    </button>
  );
}

export function BouncingEllipsis() {
  return (
    <span className="bouncing-ellipsis" aria-hidden="true">
      <span className="bouncing-ellipsis__dot" />
      <span className="bouncing-ellipsis__dot" />
      <span className="bouncing-ellipsis__dot" />
    </span>
  );
}

