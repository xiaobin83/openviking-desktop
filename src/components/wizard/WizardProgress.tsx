interface WizardProgressProps {
  totalSteps: number;
  currentStep: number;
}

export default function WizardProgress({ totalSteps, currentStep }: WizardProgressProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: totalSteps }, (_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all duration-300 ${
            i <= currentStep
              ? 'w-6 bg-aurora-400 shadow-glow shadow-aurora-500/30'
              : 'w-2 bg-surface-hover'
          }`}
        />
      ))}
    </div>
  );
}
