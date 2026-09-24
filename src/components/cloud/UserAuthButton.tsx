import { Button, Card, Chip } from "@heroui/react";
import { Crown, LogIn, LogOut, Sparkles, User } from "lucide-react";
import { useState } from "react";
import { useCloudAuth } from "../../lib/cloud/useCloudAuth";
import { CheckoutModal } from "./CheckoutModal";
import { LoginModal } from "./LoginModal";

export function UserAuthButton() {
	const { user, isLoggedIn, isMember, logout } = useCloudAuth();
	const [showLoginModal, setShowLoginModal] = useState(false);
	const [showCheckoutModal, setShowCheckoutModal] = useState(false);
	const [showDropdown, setShowDropdown] = useState(false);

	// Format expiration date
	const formatExpiresAt = (isoStr: string | null) => {
		if (!isoStr) return "永久有效";
		const d = new Date(isoStr);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	};

	return (
		<>
			<div className="relative">
				{!isLoggedIn ? (
					<Button
						size="sm"
						variant="secondary"
						className="h-8 rounded-full flex items-center gap-1.5 px-3 cursor-pointer text-xs font-medium border border-emerald-500/25 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 shadow-2xs transition"
						onPress={() => setShowLoginModal(true)}
					>
						<LogIn className="w-3.5 h-3.5" />
						<span>微信登录</span>
					</Button>
				) : (
					<button
						type="button"
						onClick={() => setShowDropdown((prev) => !prev)}
						className="h-8 pl-1.5 pr-2.5 rounded-full border border-border/80 bg-surface/80 hover:bg-surface flex items-center gap-1.5 text-xs cursor-pointer transition shadow-2xs hover:shadow-xs"
					>
						{user?.avatarUrl ? (
							<img
								src={user.avatarUrl}
								alt="Avatar"
								className="w-5 h-5 rounded-full object-cover ring-1 ring-border/80"
							/>
						) : (
							<div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center text-accent">
								<User className="w-3 h-3" />
							</div>
						)}
						<span className="font-semibold text-foreground max-w-[80px] truncate">
							{user?.nickname}
						</span>
						{isMember ? (
							<Chip
								size="sm"
								variant="primary"
								className="text-[9px] h-4.5 px-1.5 font-bold bg-gradient-to-r from-amber-500 to-amber-600 text-white border-0 shadow-2xs"
							>
								<Crown className="w-2.5 h-2.5 mr-0.5 inline" />
								{user?.memberTier || "PRO"}
							</Chip>
						) : (
							<Chip
								size="sm"
								variant="secondary"
								className="text-[9px] h-4.5 px-1.5 text-muted bg-surface-secondary border-border/60"
							>
								免费版
							</Chip>
						)}
					</button>
				)}

				{/* Dropdown Menu using HeroUI Card */}
				{isLoggedIn && showDropdown && (
					<>
						<button
							type="button"
							aria-label="关闭菜单"
							tabIndex={-1}
							className="fixed inset-0 z-40 cursor-default bg-transparent border-0"
							onClick={() => setShowDropdown(false)}
						/>
						<Card className="absolute right-0 top-full mt-2 z-50 w-60 rounded-xl border border-border/80 bg-surface/95 p-3 shadow-md backdrop-blur-xl animate-in fade-in slide-in-from-top-1 duration-150">
							<div className="flex items-center gap-2.5 pb-3 border-b border-border/60">
								{user?.avatarUrl ? (
									<img
										src={user.avatarUrl}
										alt="Avatar"
										className="w-9 h-9 rounded-full object-cover ring-1 ring-border"
									/>
								) : (
									<div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-accent">
										<User className="w-4 h-4" />
									</div>
								)}
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-1.5">
										<span className="text-xs font-bold text-foreground truncate">
											{user?.nickname}
										</span>
										{isMember && (
											<span className="text-[10px] text-amber-500 font-bold">
												PRO
											</span>
										)}
									</div>
									<div className="text-[10px] text-muted truncate mt-0.5">
										{isMember
											? `有效至：${formatExpiresAt(user?.memberExpiresAt || null)}`
											: "尚未激活会员特权"}
									</div>
								</div>
							</div>

							{/* Action Buttons */}
							<div className="py-2.5">
								<Button
									size="sm"
									variant="primary"
									className="w-full text-xs font-semibold flex items-center justify-center gap-1.5 rounded-xl py-2 cursor-pointer bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white shadow-xs hover:opacity-95 transition"
									onPress={() => {
										setShowDropdown(false);
										setShowCheckoutModal(true);
									}}
								>
									<Sparkles className="w-3.5 h-3.5" />
									<span>{isMember ? "立即续费会员" : "开通 Pro 尊享特权"}</span>
								</Button>
							</div>

							<div className="pt-1.5 border-t border-border/60">
								<button
									type="button"
									onClick={() => {
										setShowDropdown(false);
										logout();
									}}
									className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted hover:text-danger rounded-lg hover:bg-danger/10 transition cursor-pointer"
								>
									<LogOut className="w-3.5 h-3.5" />
									<span>退出登录</span>
								</button>
							</div>
						</Card>
					</>
				)}
			</div>

			{/* Modals */}
			<LoginModal
				isOpen={showLoginModal}
				onClose={() => setShowLoginModal(false)}
			/>

			<CheckoutModal
				isOpen={showCheckoutModal}
				onClose={() => setShowCheckoutModal(false)}
			/>
		</>
	);
}
