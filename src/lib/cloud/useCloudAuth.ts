import type { UserProfile } from "@aiworkstation/shared-types";
import { useCallback, useEffect, useState } from "react";
import { cloudClient } from "./cloudClient";

export function useCloudAuth() {
	const [user, setUser] = useState<UserProfile | null>(() =>
		cloudClient.getUser(),
	);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	// Initializing is only true when there is a token to verify but no cached user
	const [isInitializing, setIsInitializing] = useState<boolean>(() => {
		const token = cloudClient.getToken();
		const cachedUser = cloudClient.getUser();
		return Boolean(token && !cachedUser);
	});

	useEffect(() => {
		// Sync when storage or other tabs update
		const unsubscribe = cloudClient.subscribe((updatedUser) => {
			setUser(updatedUser);
		});

		// Refresh profile on mount if token exists
		const token = cloudClient.getToken();
		if (token) {
			setIsLoading(true);
			cloudClient
				.getMe()
				.then((freshUser) => setUser(freshUser))
				.catch(() => {
					// Token might be invalid or expired; clear session
					cloudClient.clearSession();
					setUser(null);
				})
				.finally(() => {
					setIsLoading(false);
					setIsInitializing(false);
				});
		} else {
			setIsInitializing(false);
		}

		return unsubscribe;
	}, []);

	const logout = useCallback(() => {
		cloudClient.clearSession();
	}, []);

	const refreshProfile = useCallback(async () => {
		if (!cloudClient.getToken()) return;
		try {
			const freshUser = await cloudClient.getMe();
			setUser(freshUser);
		} catch (err) {
			console.error("[useCloudAuth] Failed to refresh profile:", err);
		}
	}, []);

	// Check if membership is currently active
	// 档位：VIP / SVIP / LIFETIME（PRO 为迁移期兼容的历史档位，等价 VIP）
	const PAID_TIERS = ["VIP", "SVIP", "PRO"];
	const isLifetime = user?.memberTier === "LIFETIME";
	const isPaidTier = Boolean(user && PAID_TIERS.includes(user.memberTier));
	const isProValid = Boolean(
		isPaidTier &&
			user?.memberExpiresAt &&
			new Date(user.memberExpiresAt).getTime() > Date.now(),
	);
	const isMember = isLifetime || isProValid;

	// Distinguish whether user was a paid member whose membership has expired
	const isExpired = Boolean(
		user &&
			PAID_TIERS.includes(user.memberTier) &&
			user.memberExpiresAt &&
			new Date(user.memberExpiresAt).getTime() <= Date.now(),
	);

	// Calculate remaining membership days (or null if lifetime/not active)
	const daysRemaining =
		isProValid && user?.memberExpiresAt
			? Math.max(
					0,
					Math.ceil(
						(new Date(user.memberExpiresAt).getTime() - Date.now()) /
							(1000 * 60 * 60 * 24),
					),
				)
			: null;

	// Dev helper: extend membership by given days and tier
	const mockUpgradeToPro = useCallback(
		(days = 365, tier: "VIP" | "SVIP" | "LIFETIME" = "VIP") => {
			if (!user) return;
			const futureDate =
				tier === "LIFETIME"
					? null
					: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
			const upgradedUser: UserProfile = {
				...user,
				memberTier: tier,
				memberExpiresAt: futureDate,
			};
			const currentToken = cloudClient.getToken();
			if (currentToken) {
				cloudClient.setSession(currentToken, upgradedUser);
			}
			setUser(upgradedUser);
		},
		[user],
	);

	return {
		user,
		isLoggedIn: Boolean(user),
		isMember,
		isExpired,
		daysRemaining,
		isLoading,
		isInitializing,
		logout,
		refreshProfile,
		mockUpgradeToPro,
	};
}
