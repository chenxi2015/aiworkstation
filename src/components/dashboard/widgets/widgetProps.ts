import type { WorkbenchItem } from "../../workbench/types";
import type { WorkbenchSummary } from "../types";

/** 所有仪表盘 widget 的统一入参 */
export interface DashboardWidgetProps {
	summary: WorkbenchSummary;
	unclassified: WorkbenchItem[];
}
