import { useCloudAuth } from "../../lib/cloud/useCloudAuth";
import { MemberCheckoutCard } from "./MemberCheckoutCard";

export interface ModulePaywallProps {
	/** Module or feature name displayed on title, e.g. "笔记" */
	moduleName: string;
	/** Specific description for this module's paid capabilities */
	description?: string;
	/** Optional container class name */
	className?: string;
	/** Optional callback when payment succeeds */
	onSuccess?: () => void;
}

/**
 * Module-level paywall barrier component.
 * Rendered within paid functional sections (e.g. Notes/Obsidian) when the user is not a paid member,
 * while keeping global navigation headers and free modules accessible.
 */
export function ModulePaywall({
	moduleName,
	description,
	className = "",
	onSuccess,
}: ModulePaywallProps) {
	const { isExpired } = useCloudAuth();

	return (
		<div
			className={`flex-1 overflow-y-auto flex flex-col items-center justify-center p-4 sm:p-6 relative select-none bg-surface/30 ${className}`}
		>
			{/* Center Paywall Card */}
			<div className="w-full max-w-[900px] max-h-[88vh] relative z-10 flex flex-col items-center">
				<MemberCheckoutCard
					title={`开通会员解锁「${moduleName}」特权`}
					description={
						description ||
						"当前板块为尊享会员特权功能，开通会员后即可畅享完整能力"
					}
					expiredNotice={isExpired}
					showUserInfo={true}
					onSuccess={onSuccess}
				/>
			</div>
		</div>
	);
}
