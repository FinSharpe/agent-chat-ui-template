import {
  AUTO_MODEL,
  legacyModels,
  type ChatModelOption,
} from "@/lib/chat-models";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { cn } from "@/lib/utils";
import { Layers, ShieldAlert } from "lucide-react";

export interface ModelSwitcherProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  options?: ChatModelOption[];
  disabled?: boolean;
}

export function ModelSwitcher({
  value,
  onValueChange,
  className,
  options = legacyModels,
  disabled,
}: ModelSwitcherProps) {
  const selected = options.find((model) => model.id === value);
  const unavailable = value !== AUTO_MODEL && !selected?.available;
  const label =
    value === AUTO_MODEL ? "Auto" : (selected?.label ?? value.split(":").pop());
  const shortLabel = selected?.shortLabel || label;
  const Icon = unavailable ? ShieldAlert : Layers;
  return (
    <Select
      disabled={disabled}
      value={value}
      onValueChange={onValueChange}
    >
      <SelectTrigger
        aria-label="Select model"
        title={`${label}${unavailable ? " · Unavailable" : ""}`}
        className={cn(
          "text-secondary-foreground relative h-12 w-auto shrink-0 rounded-full border-0 bg-transparent p-0 text-[11px] font-semibold shadow-none [&>span]:flex! [&>svg:last-child]:absolute [&>svg:last-child]:right-1.5 [&>svg:last-child]:size-3 [&>svg:last-child]:opacity-100",
          unavailable && "text-destructive",
          className,
        )}
      >
        <span
          className={cn(
            "bg-secondary flex h-8 items-center gap-1 rounded-full pr-6 pl-2",
            unavailable && "bg-[var(--negative-container)]",
          )}
        >
          <Icon
            className="size-[13px] shrink-0"
            aria-hidden="true"
          />
          <SelectValue placeholder="Select a model">
            <span className="block max-w-16 truncate sm:max-w-[104px]">
              {shortLabel}
            </span>
          </SelectValue>
        </span>
      </SelectTrigger>
      <SelectContent
        side="top"
        sideOffset={8}
        className="w-52"
      >
        <SelectItem value={AUTO_MODEL}>Auto</SelectItem>
        {value !== AUTO_MODEL && !options.some((m) => m.id === value) && (
          <SelectItem
            value={value}
            disabled
          >
            {value.split(":").pop()} · Unavailable
          </SelectItem>
        )}
        {options.map((model) => (
          <SelectItem
            key={model.id}
            value={model.id}
            disabled={!model.available}
          >
            {model.label}
            {!model.available ? " · Unavailable" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
