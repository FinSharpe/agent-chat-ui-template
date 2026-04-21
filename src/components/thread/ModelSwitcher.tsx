import { PlannerModels } from "@/configs/models";
import { getModelDisplayName } from "@/lib/model-display-name";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { cn } from "@/lib/utils";

export interface ModelSwitcherProps {
  value: PlannerModels;
  onValueChange: (value: PlannerModels) => void;
  className?: string;
}

export function ModelSwitcher({
  value,
  onValueChange,
  className,
}: ModelSwitcherProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next as PlannerModels)}
    >
      <SelectTrigger
        aria-label="Select model"
        className={cn("h-8 w-[200px] text-sm", className)}
      >
        <SelectValue placeholder="Select a model" />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(PlannerModels).map(([key, modelValue]) => (
          <SelectItem
            key={modelValue}
            value={modelValue}
          >
            {getModelDisplayName(key)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
