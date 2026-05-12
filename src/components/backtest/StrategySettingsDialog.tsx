"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useChartStore } from "@/lib/store/chart-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";

export function StrategySettingsDialog() {
  const {
    strategyInputs,
    strategyValues,
    strategySettingsOpen,
    setStrategySettingsOpen,
    setStrategyValue,
    resetStrategyValues,
    strategyName
  } = useChartStore();

  const [localValues, setLocalValues] = useState(strategyValues);

  useEffect(() => {
    if (strategySettingsOpen) {
      setLocalValues(strategyValues);
    }
  }, [strategySettingsOpen, strategyValues]);

  const handleApply = () => {
    Object.entries(localValues).forEach(([name, value]) => {
      setStrategyValue(name, value);
    });
    setStrategySettingsOpen(false);
    // Note: Re-execution is handled by an effect in BacktestPanel or similar
  };

  const handleReset = () => {
    resetStrategyValues();
    setStrategySettingsOpen(false);
  };

  return (
    <Dialog open={strategySettingsOpen} onOpenChange={setStrategySettingsOpen}>
      <DialogContent className="max-w-md bg-tv-panel border-tv-border text-tv-text">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            Configuración: {strategyName}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="inputs" className="mt-2">
          <TabsList className="grid w-full grid-cols-2 bg-black/20">
            <TabsTrigger value="inputs" className="text-xs">Datos de entrada</TabsTrigger>
            <TabsTrigger value="style" className="text-xs">Estilo</TabsTrigger>
          </TabsList>

          <TabsContent value="inputs" className="mt-4 space-y-4 max-h-[400px] overflow-y-auto px-1">
            {strategyInputs.map((input) => (
              <div key={input.name} className="flex items-center justify-between gap-4">
                <Label className="text-xs text-tv-text-muted">{input.label}</Label>
                
                <div className="w-1/2">
                  {input.type === "number" && (
                    <Input
                      type="number"
                      value={localValues[input.name] ?? input.default}
                      min={input.min}
                      max={input.max}
                      step={input.step}
                      className="h-8 text-xs bg-black/20 border-tv-border"
                      onChange={(e) => setLocalValues({ ...localValues, [input.name]: parseFloat(e.target.value) })}
                    />
                  )}
                  
                  {input.type === "boolean" && (
                    <Checkbox
                      checked={localValues[input.name] ?? input.default}
                      onCheckedChange={(checked) => setLocalValues({ ...localValues, [input.name]: !!checked })}
                      className="border-tv-border data-[state=checked]:bg-blue-500"
                    />
                  )}

                  {input.type === "string" && input.options && (
                    <Select
                      value={localValues[input.name] ?? input.default}
                      onValueChange={(v) => setLocalValues({ ...localValues, [input.name]: v })}
                    >
                      <SelectTrigger className="h-8 text-xs bg-black/20 border-tv-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-tv-panel border-tv-border text-tv-text">
                        {input.options.map((opt) => (
                          <SelectItem key={opt} value={opt} className="text-xs hover:bg-white/10">
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="style" className="mt-4 py-8 text-center text-xs text-tv-text-muted italic">
            Configuración visual próximamente...
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-6 gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-tv-text-muted"
            onClick={handleReset}
          >
            Restablecer valores
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="text-xs border-tv-border hover:bg-white/5"
            onClick={() => setStrategySettingsOpen(false)}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleApply}
          >
            Aceptar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
