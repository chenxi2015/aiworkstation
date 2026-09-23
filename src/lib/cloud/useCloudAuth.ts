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
			if (token.startsWith("dev_local_token_")) {
				// Dev mock session: keep local mock user without remote check
				setIsInitializing(false);
				return unsubscribe;
			}

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
	const isLifetime = user?.memberTier === "LIFETIME";
	const isProValid = Boolean(
		user?.memberTier === "PRO" &&
			user?.memberExpiresAt &&
			new Date(user.memberExpiresAt).getTime() > Date.now(),
	);
	const isMember = isLifetime || isProValid;

	// Distinguish whether user was a PRO member whose membership has expired
	const isExpired = Boolean(
		user &&
			user.memberTier === "PRO" &&
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
		(days = 365, tier: "PRO" | "LIFETIME" = "PRO") => {
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
			cloudClient.setSession(
				cloudClient.getToken() || "dev_local_token_mock",
				upgradedUser,
			);
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
