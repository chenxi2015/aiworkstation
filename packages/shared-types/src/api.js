/**
 * Common business error codes
 */
export var ErrorCode;
(function (ErrorCode) {
    ErrorCode[ErrorCode["SUCCESS"] = 0] = "SUCCESS";
    ErrorCode[ErrorCode["UNAUTHORIZED"] = 40101] = "UNAUTHORIZED";
    ErrorCode[ErrorCode["FORBIDDEN"] = 40301] = "FORBIDDEN";
    ErrorCode[ErrorCode["NOT_FOUND"] = 40401] = "NOT_FOUND";
    ErrorCode[ErrorCode["VALIDATION_ERROR"] = 42201] = "VALIDATION_ERROR";
    ErrorCode[ErrorCode["INTERNAL_ERROR"] = 50001] = "INTERNAL_ERROR";
    ErrorCode[ErrorCode["WECHAT_AUTH_FAILED"] = 50101] = "WECHAT_AUTH_FAILED";
    ErrorCode[ErrorCode["WECHAT_PAY_FAILED"] = 50201] = "WECHAT_PAY_FAILED";
    ErrorCode[ErrorCode["ORDER_EXPIRED"] = 50202] = "ORDER_EXPIRED";
})(ErrorCode || (ErrorCode = {}));
