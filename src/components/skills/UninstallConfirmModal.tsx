import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { requestUninstallSkill } from "../../services/api/skillsClient";
import type { SkillInfo } from "./types";

export interface UninstallConfirmModalProps {
	skill: SkillInfo | null;
	isOpen: boolean;
	onClose: () => void;
	onSuccess: () => void;
}

export function UninstallConfirmModal({
	skill,
	isOpen,
	onClose,
	onSuccess,
}: UninstallConfirmModalProps) {
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");

	if (!isOpen || !skill) return null;

	const handleConfirm = async () => {
		if (!skill.dirPath) return;
		setSubmitting(true);
		setError("");

		const res = await requestUninstallSkill(skill.dirPath);
		setSubmitting(false);

		if (res.success) {
			onSuccess();
			onClose();
		} else {
			setError(res.message);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
			<div className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden p-5">
				<div className="flex items-center gap-3 mb-3">
					<div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
						<AlertTriangle className="w-5 h-5" />
					</div>
					<div>
						<h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
							确认卸载技能？
						</h3>
						<p className="text-[11px] text-zinc-500 font-mono truncate max-w-[220px]">
							{skill.name}
						</p>
					</div>
				</div>

				<p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed mb-3">
					此操作将从本地磁盘安全删除以下技能目录及其所有配置文件，操作后不可恢复：
				</p>

				<div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 font-mono text-[10px] text-zinc-600 dark:text-zinc-400 break-all mb-4">
					{skill.dirPath}
				</div>

				{error && (
					<div className="p-2 mb-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs">
						{error}
					</div>
				)}

				<div className="flex items-center justify-end gap-2 text-xs">
					<button
						type="button"
						onClick={onClose}
						disabled={submitting}
						className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
					>
						取消
					</button>
					<button
						type="button"
						onClick={handleConfirm}
						disabled={submitting}
						className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 text-white font-medium hover:bg-rose-700 transition-colors disabled:opacity-50"
					>
						{submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
						确认卸载
					</button>
				</div>
			</div>
		</div>
	);
}
