export type StrategyInputType = "number" | "boolean" | "string";

export interface StrategyInput {
  name: string;
  label: string;
  type: StrategyInputType;
  default: any;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
}

export type StrategyInputValue = any;
export type StrategyInputValues = Record<string, StrategyInputValue>;

/**
 * Parses the user code to find input() calls.
 * Format: input(defaultValue, "Label", options)
 * Examples:
 * const length = input(20, "Longitud", { min: 1, max: 100 });
 * const source = input("close", "Fuente", { options: ["open", "high", "low", "close"] });
 * const useEMA = input(true, "Usar EMA");
 */
export function parseStrategyInputs(code: string): StrategyInput[] {
  const inputs: StrategyInput[] = [];
  
  // Regex to match: input(value, "label", { ...options })
  // This is a simplified parser. In a real scenario, we might use a proper JS parser like acorn.
  const regex = /input\s*\(\s*([^,]+)\s*,\s*["']([^"']+)["'](?:\s*,\s*({[^}]+}))?\s*\)/g;
  
  let match;
  while ((match = regex.exec(code)) !== null) {
    const defaultValueStr = match[1].trim();
    const label = match[2];
    const optionsStr = match[3];
    
    let defaultValue: any;
    let type: StrategyInputType = "number";
    
    // Determine type and value
    if (defaultValueStr === "true" || defaultValueStr === "false") {
      defaultValue = defaultValueStr === "true";
      type = "boolean";
    } else if (defaultValueStr.startsWith('"') || defaultValueStr.startsWith("'")) {
      defaultValue = defaultValueStr.slice(1, -1);
      type = "string";
    } else {
      defaultValue = parseFloat(defaultValueStr);
      type = "number";
    }
    
    let options: any = {};
    if (optionsStr) {
      try {
        // Basic object parser (handles simple objects like { min: 1, max: 100 })
        const cleanOptions = optionsStr.replace(/([a-zA-Z0-9]+):/g, '"$1":').replace(/'/g, '"');
        options = JSON.parse(cleanOptions);
      } catch (e) {
        console.warn("Failed to parse input options:", optionsStr);
      }
    }
    
    inputs.push({
      name: label.toLowerCase().replace(/\s+/g, "_"), // Generate a unique name if label is repeated?
      label,
      type,
      default: defaultValue,
      ...options
    });
  }
  
  return inputs;
}

/**
 * Creates the input() function to be injected into the strategy context.
 */
export function createInputContext(values: StrategyInputValues) {
  return function input(defaultValue: any, label: string) {
    const key = label.toLowerCase().replace(/\s+/g, "_");
    // If the user has changed the value in UI, use that. Otherwise use default.
    return values[key] !== undefined ? values[key] : defaultValue;
  };
}
