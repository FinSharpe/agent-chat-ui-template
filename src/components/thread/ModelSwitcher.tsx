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
  return (
    <Select
      disabled={disabled}
      value={value}
      onValueChange={onValueChange}
    >
      <SelectTrigger
        aria-label="Select model"
        className={cn(
          "h-8 w-[200px] rounded-full text-xs shadow-none",
          className,
        )}
      >
        <SelectValue placeholder="Select a model" />
      </SelectTrigger>
      <SelectContent>
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
