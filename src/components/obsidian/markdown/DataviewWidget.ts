import { WidgetType } from "@codemirror/view";
import type { DataviewResult } from "../../../server/services/obsidian/dataview";
import { queryDataviewRpc } from "../../../services/api/obsidianClient";

/**
 * Dataview 代码块 widget：```dataview  fence 在光标离开时整体替换为查询结果。
 * 结果按查询语句缓存（30s），装饰层重建不重复请求。
 */

interface CacheEntry {
	at: number;
	result: DataviewResult;
}
const resultCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<DataviewResult>>();
const CACHE_MS = 30_000;

function runQuery(query: string): Promise<DataviewResult> {
	const cached = resultCache.get(query);
	if (cached && Date.now() - cached.at < CACHE_MS) {
		return Promise.resolve(cached.result);
	}
	const pending = inflight.get(query);
	if (pending) return pending;
	const task = queryDataviewRpc(query)
		.then((result) => {
			resultCache.set(query, { at: Date.now(), result });
			return result;
		})
		.finally(() => {
			inflight.delete(query);
		});
	inflight.set(query, task);
	return task;
}

/** 从 fence 原文中提取查询语句（去掉首尾 ``` 行） */
export function extractDataviewQuery(fenceSource: string): string {
	const lines = fenceSource.split("\n");
	if (lines.length <= 2) return "";
	return lines.slice(1, -1).join("\n").trim();
}

export class DataviewWidget extends WidgetType {
	constructor(
		readonly query: string,
		readonly onNavigateNote?: (relPath: string) => void,
	) {
		super();
	}
	override eq(other: DataviewWidget) {
		return other.query === this.query;
	}
	toDOM() {
		const container = document.createElement("div");
		container.className = "cm-live-dataview";
		const status = document.createElement("div");
		status.className = "cm-live-dataview-status";
		status.textContent = "Dataview 查询中…";
		container.appendChild(status);

		void runQuery(this.query)
			.then((result) => this.render(container, result))
			.catch(() => {
				container.textContent = "";
				const err = document.createElement("div");
				err.className = "cm-live-dataview-error";
				err.textContent = "Dataview 查询失败";
				container.appendChild(err);
			});
		return container;
	}

	private render(container: HTMLElement, result: DataviewResult) {
		container.textContent = "";
		if (result.error) {
			const err = document.createElement("div");
			err.className = "cm-live-dataview-error";
			err.textContent = `Dataview: ${result.error}`;
			container.appendChild(err);
			return;
		}
		if (result.type === "task") {
			this.renderTasks(container, result);
			return;
		}
		if (result.type === "list") {
			this.renderList(container, result);
			return;
		}
		this.renderTable(container, result);
	}

	private fileLink(name: string, relPath: string): HTMLElement {
		const link = document.createElement("span");
		link.className = "cm-live-dataview-link";
		link.textContent = name;
		link.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.onNavigateNote?.(relPath);
		});
		return link;
	}

	private renderTable(container: HTMLElement, result: DataviewResult) {
		if (!result.rows.length) {
			const empty = document.createElement("div");
			empty.className = "cm-live-dataview-status";
			empty.textContent = "Dataview: 无结果";
			container.appendChild(empty);
			return;
		}
		const table = document.createElement("table");
		const thead = document.createElement("thead");
		const headRow = document.createElement("tr");
		for (const col of result.columns) {
			const th = document.createElement("th");
			th.textContent = col;
			headRow.appendChild(th);
		}
		thead.appendChild(headRow);
		table.appendChild(thead);
		const tbody = document.createElement("tbody");
		for (const row of result.rows) {
			const tr = document.createElement("tr");
			row.values.forEach((value, i) => {
				const td = document.createElement("td");
				// 首列 File 渲染为可点击笔记链接
				if (i === 0 && result.columns[0] === "File") {
					td.appendChild(this.fileLink(row.name, row.relPath));
				} else {
					td.textContent = value == null ? "—" : String(value);
				}
				tr.appendChild(td);
			});
			tbody.appendChild(tr);
		}
		table.appendChild(tbody);
		container.appendChild(table);
	}

	private renderList(container: HTMLElement, result: DataviewResult) {
		if (!result.rows.length) {
			const empty = document.createElement("div");
			empty.className = "cm-live-dataview-status";
			empty.textContent = "Dataview: 无结果";
			container.appendChild(empty);
			return;
		}
		const ul = document.createElement("ul");
		for (const row of result.rows) {
			const li = document.createElement("li");
			li.appendChild(this.fileLink(row.name, row.relPath));
			ul.appendChild(li);
		}
		container.appendChild(ul);
	}

	private renderTasks(container: HTMLElement, result: DataviewResult) {
		if (!result.tasks.length) {
			const empty = document.createElement("div");
			empty.className = "cm-live-dataview-status";
			empty.textContent = "Dataview: 无任务";
			container.appendChild(empty);
			return;
		}
		let lastFile = "";
		for (const task of result.tasks) {
			if (task.relPath !== lastFile) {
				lastFile = task.relPath;
				const header = document.createElement("div");
				header.className = "cm-live-dataview-file";
				header.appendChild(this.fileLink(task.name, task.relPath));
				container.appendChild(header);
			}
			const item = document.createElement("div");
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = task.completed;
			checkbox.disabled = true;
			checkbox.className = "cm-live-checkbox";
			item.appendChild(checkbox);
			const text = document.createElement("span");
			text.textContent = task.text;
			if (task.completed) text.className = "cm-live-task-done";
			item.appendChild(text);
			container.appendChild(item);
		}
	}

	override ignoreEvent() {
		return true;
	}
}
