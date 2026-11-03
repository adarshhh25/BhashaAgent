interface FieldConfidenceIndicatorProps {
  confidence?: number | string | null;
}

export function FieldConfidenceIndicator({ confidence }: FieldConfidenceIndicatorProps) {
  if (confidence === null || confidence === undefined) {
    return null;
  }

  const numVal =
    typeof confidence === 'number'
      ? confidence
      : typeof confidence === 'string'
      ? parseFloat(confidence)
      : NaN;

  if (isNaN(numVal)) {
    return (
      <span className="text-[10px] text-text-placeholder">
        Conf: {String(confidence)}
      </span>
    );
  }

  const percentage = Math.round(numVal <= 1 ? numVal * 100 : numVal);

  const getStyle = () => {
    if (percentage >= 80) return 'text-success bg-success/10 border-success/20';
    if (percentage >= 50) return 'text-warning bg-warning/10 border-warning/20';
    return 'text-text-secondary bg-page-bg border-divider';
  };

  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${getStyle()}`}
      title={`Mapping confidence: ${percentage}%`}
    >
      {percentage}% match
    </span>
  );
}

