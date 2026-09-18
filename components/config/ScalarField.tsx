"use client";

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  help,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  help?: string;
}) {
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-0.5 text-[12px]">
      <span className="text-neutral-600 dark:text-neutral-300">
        {label} {unit && <span className="text-neutral-400">({unit})</span>}
      </span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28 rounded border border-black/15 dark:border-white/15 bg-transparent px-1.5 py-0.5 text-right text-[12px]"
      />
      {min !== undefined && max !== undefined && (
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="col-span-2 h-1 accent-[#6d67e4]"
        />
      )}
      {help && <span className="col-span-2 text-[10px] text-neutral-400">{help}</span>}
    </label>
  );
}

export function ToggleField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="text-[12px]">
      <div className="mb-1 text-neutral-600 dark:text-neutral-300">{label}</div>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`rounded px-2 py-0.5 text-[11px] ${
              value === opt.value ? "bg-[#6d67e4] text-white" : "border border-black/15 dark:border-white/15 text-neutral-600 dark:text-neutral-300"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CheckboxField({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  help?: string;
}) {
  return (
    <label className="flex items-start gap-2 text-[12px]">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-[#6d67e4]" />
      <span>
        <span className="text-neutral-600 dark:text-neutral-300">{label}</span>
        {help && <div className="text-[10px] text-neutral-400">{help}</div>}
      </span>
    </label>
  );
}

export function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group border-b border-black/10 dark:border-white/10 py-2.5">
      <summary className="cursor-pointer select-none text-[13px] font-semibold text-neutral-800 dark:text-neutral-100 marker:content-none flex items-center gap-1.5">
        <span className="inline-block transition-transform group-open:rotate-90 text-neutral-400">▸</span>
        {title}
      </summary>
      <div className="mt-2 grid grid-cols-1 gap-2 pl-4">{children}</div>
    </details>
  );
}
