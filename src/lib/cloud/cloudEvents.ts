/**
 * Browser CustomEvent names shared between the agent session layer and the
 * app shell, e.g. auto-opening the checkout modal when the cloud gateway
 * rejects a non-member request on the official AI channel.
 */
export const OPEN_CHECKOUT_MODAL_EVENT = "open-checkout-modal";

/** Stream error codes emitted when the cloud gateway rejects a request */
export const MEMBERSHIP_REQUIRED_CODE = "MEMBERSHIP_REQUIRED";
export const MEMBERSHIP_EXPIRED_CODE = "MEMBERSHIP_EXPIRED";
export const CAPABILITY_NOT_ENTITLED_CODE = "CAPABILITY_NOT_ENTITLED";

/** 所有「会员/权益类」错误码，UI 统一映射到开通/续费弹窗 */
export const MEMBERSHIP_ERROR_CODES: readonly string[] = [
	MEMBERSHIP_REQUIRED_CODE,
	MEMBERSHIP_EXPIRED_CODE,
	CAPABILITY_NOT_ENTITLED_CODE,
] as const;

/** 按错误码渲染用户文案（UI 层职责，接口层只透传 code） */
export function membershipErrorMessage(code: string): string {
	switch (code) {
		case MEMBERSHIP_EXPIRED_CODE:
			return "您的会员已到期，续费后即可继续使用「官方极速通道」；也可以在设置中切换为自备 API Key 通道。";
		case CAPABILITY_NOT_ENTITLED_CODE:
			return "当前能力超出您的会员权益范围，升级会员档位即可解锁；也可以在设置中切换为自备 API Key 通道。";
		default:
			return "当前「官方极速通道」为会员专属服务，请开通会员以畅享体验；也可以在设置中切换为自备 API Key 通道。";
	}
}

export function dispatchOpenCheckoutModal(): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent(OPEN_CHECKOUT_MODAL_EVENT));
}
