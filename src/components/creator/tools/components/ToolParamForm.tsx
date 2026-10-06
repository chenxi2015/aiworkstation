import {
	Description,
	Input,
	Label,
	ListBox,
	Radio,
	RadioGroup,
	Select,
	Switch,
	TextField,
} from "@heroui/react";
import { Check, SlidersHorizontal } from "lucide-react";
import type { ToolParamConfig } from "../types";

export type ParamValue = string | number | boolean;

interface ToolParamFormProps {
	params: ToolParamConfig[];
	values: Record<string, ParamValue>;
	onChange: (id: string, value: ParamValue) => void;
}

/**
 * Declarative parameter form renderer powered by HeroUI components.
 * Renders select, radio, switch, and text inputs conforming to HeroUI v3 composite slot standards.
 */
export function ToolParamForm({
	params,
	values,
	onChange,
}: ToolParamFormProps) {
	if (!params || params.length === 0) {
		return null;
	}

	return (
		<div className="p-4 rounded-xl border border-border bg-surface space-y-3.5">
			<div className="flex items-center gap-2 text-xs font-semibold text-foreground border-b border-border/50 pb-2">
				<SlidersHorizontal className="w-3.5 h-3.5 text-accent" />
				<span>参数配置与导出优化</span>
			</div>

			<div className="space-y-3.5">
				{params.map((param) => {
					const val = values[param.id] ?? param.defaultValue;

					if (param.type === "radio") {
						return (
							<RadioGroup
								key={param.id}
								value={String(val ?? "")}
								onChange={(newVal) => onChange(param.id, newVal)}
								variant="secondary"
							>
								<Label className="text-xs font-medium text-foreground block">
									{param.label}
								</Label>
								{param.options?.map((opt) => (
									<Radio
										key={opt.value}
										value={opt.value}
										className="cursor-pointer"
									>
										<Radio.Content className="flex items-center gap-2 cursor-pointer text-xs">
											<Radio.Control>
												<Radio.Indicator />
											</Radio.Control>
											<Label className="text-xs text-foreground cursor-pointer font-normal select-none">
												{opt.label}
											</Label>
										</Radio.Content>
									</Radio>
								))}
								{param.description && (
									<Description className="text-[10px] text-muted block mt-1">
										{param.description}
									</Description>
								)}
							</RadioGroup>
						);
					}

					if (param.type === "select") {
						const selectedOption = param.options?.find(
							(opt) => opt.value === String(val ?? ""),
						);

						return (
							<div key={param.id} className="space-y-1">
								<Label className="text-xs font-medium text-foreground block">
									{param.label}
								</Label>
								<Select
									aria-label={param.label}
									selectedKey={String(val ?? "")}
									onSelectionChange={(key) => {
										if (key != null) onChange(param.id, String(key));
									}}
									className="w-full"
								>
									<Select.Trigger className="w-full h-8 px-2.5 py-1 rounded-lg border border-border bg-background text-xs text-foreground flex items-center justify-between gap-1.5 hover:bg-muted/10 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent">
										<Select.Value className="truncate text-xs">
											{selectedOption?.label ?? String(val ?? "")}
										</Select.Value>
										<Select.Indicator className="text-muted w-3.5 h-3.5 shrink-0" />
									</Select.Trigger>
									<Select.Popover className="min-w-[200px] max-h-60 overflow-y-auto p-1.5 rounded-xl border border-border bg-surface shadow-xl text-xs z-50">
										<ListBox className="space-y-0.5 outline-none p-0">
											{param.options?.map((opt) => {
												const isSelected = String(val) === opt.value;
												return (
													<ListBox.Item
														key={opt.value}
														id={opt.value}
														textValue={opt.label}
														className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors outline-none text-xs select-none ${
															isSelected
																? "bg-accent/15 text-accent font-medium"
																: "text-foreground hover:bg-muted/15"
														}`}
													>
														<span>{opt.label}</span>
														{isSelected && (
															<Check className="w-3.5 h-3.5 text-accent shrink-0" />
														)}
													</ListBox.Item>
												);
											})}
										</ListBox>
									</Select.Popover>
								</Select>
								{param.description && (
									<Description className="text-[10px] text-muted block mt-0.5">
										{param.description}
									</Description>
								)}
							</div>
						);
					}

					if (param.type === "switch") {
						return (
							<div
								key={param.id}
								className="p-2.5 rounded-lg bg-background/60 border border-border/60"
							>
								<Switch
									isSelected={Boolean(val)}
									onChange={(checked) => onChange(param.id, checked)}
									className="w-full cursor-pointer"
								>
									<Switch.Content className="w-full flex items-center justify-between cursor-pointer">
										<Label className="text-xs text-foreground font-medium cursor-pointer">
											{param.label}
										</Label>
										<Switch.Control>
											<Switch.Thumb />
										</Switch.Control>
									</Switch.Content>
								</Switch>
								{param.description && (
									<Description className="text-[10px] text-muted mt-1 block">
										{param.description}
									</Description>
								)}
							</div>
						);
					}

					if (param.type === "text") {
						return (
							<TextField
								key={param.id}
								value={String(val ?? "")}
								onChange={(newVal) => onChange(param.id, newVal)}
								className="space-y-1"
							>
								<Label className="text-xs font-medium text-foreground block">
									{param.label}
								</Label>
								<Input
									placeholder={param.description || ""}
									className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
								/>
								{param.description && (
									<Description className="text-[10px] text-muted block mt-0.5">
										{param.description}
									</Description>
								)}
							</TextField>
						);
					}

					return null;
				})}
			</div>
		</div>
	);
}
