<?php

namespace App\Services\Payment\PayHere;

use App\Support\Money;

/**
 * PayHere hashing, as documented at https://support.payhere.lk/api-&-mobile-sdk/checkout-api
 *
 *   checkout hash = UPPER(md5(merchant_id + order_id + amount(2dp, no separators) + currency + UPPER(md5(merchant_secret))))
 *   notify md5sig = UPPER(md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + UPPER(md5(merchant_secret))))
 */
final class PayHereSignature
{
    public static function checkoutHash(string $merchantId, string $orderId, int $amountMinor, string $currency, string $merchantSecret): string
    {
        return strtoupper(md5(
            $merchantId.$orderId.Money::toDecimal($amountMinor).$currency.strtoupper(md5($merchantSecret))
        ));
    }

    /** Values are used exactly as PayHere posted them. */
    public static function notificationSignature(
        string $merchantId,
        string $orderId,
        string $payhereAmount,
        string $payhereCurrency,
        string $statusCode,
        string $merchantSecret,
    ): string {
        return strtoupper(md5(
            $merchantId.$orderId.$payhereAmount.$payhereCurrency.$statusCode.strtoupper(md5($merchantSecret))
        ));
    }

    /**
     * @param  array<string, string>  $payload
     */
    public static function verifyNotification(array $payload, string $merchantSecret): bool
    {
        $expected = self::notificationSignature(
            $payload['merchant_id'] ?? '',
            $payload['order_id'] ?? '',
            $payload['payhere_amount'] ?? '',
            $payload['payhere_currency'] ?? '',
            $payload['status_code'] ?? '',
            $merchantSecret,
        );

        return hash_equals($expected, strtoupper($payload['md5sig'] ?? ''));
    }
}
