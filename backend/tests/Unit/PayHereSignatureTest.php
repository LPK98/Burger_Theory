<?php

namespace Tests\Unit;

use App\Services\Payment\PayHere\PayHereSignature;
use PHPUnit\Framework\TestCase;

/**
 * Expected values were computed independently (Python hashlib) from PayHere's documented formulas:
 *   hash   = UPPER(md5(merchant_id . order_id . "3450.00" . "LKR" . UPPER(md5(secret))))
 *   md5sig = UPPER(md5(merchant_id . order_id . "3450.00" . "LKR" . "2" . UPPER(md5(secret))))
 */
class PayHereSignatureTest extends TestCase
{
    private const MERCHANT = '1211149';

    private const SECRET = 'test-merchant-secret';

    private const ORDER = 'BT-261122-ABCDEF-1';

    public function test_checkout_hash_matches_the_documented_algorithm(): void
    {
        $this->assertSame(
            '1995934094C869C75E343AE2D4F294C4',
            PayHereSignature::checkoutHash(self::MERCHANT, self::ORDER, 345000, 'LKR', self::SECRET),
        );
    }

    public function test_notification_signature_matches_the_documented_algorithm(): void
    {
        $this->assertSame(
            '391EA975F4F8DB5FEA9A75BB4B59228B',
            PayHereSignature::notificationSignature(self::MERCHANT, self::ORDER, '3450.00', 'LKR', '2', self::SECRET),
        );
    }

    public function test_verification_accepts_a_genuine_notification(): void
    {
        $payload = $this->payload();

        $this->assertTrue(PayHereSignature::verifyNotification($payload, self::SECRET));
        // Case-insensitive on the received signature, like PayHere's own sample.
        $payload['md5sig'] = strtolower($payload['md5sig']);
        $this->assertTrue(PayHereSignature::verifyNotification($payload, self::SECRET));
    }

    public function test_verification_rejects_any_tampering(): void
    {
        foreach (['payhere_amount' => '1.00', 'status_code' => '0', 'order_id' => 'BT-OTHER-1', 'payhere_currency' => 'USD', 'merchant_id' => '999'] as $field => $value) {
            $payload = $this->payload();
            $payload[$field] = $value;
            $this->assertFalse(PayHereSignature::verifyNotification($payload, self::SECRET), "Tampered {$field} must fail");
        }

        $this->assertFalse(PayHereSignature::verifyNotification($this->payload(), 'wrong-secret'));
        $this->assertFalse(PayHereSignature::verifyNotification(['md5sig' => ''], self::SECRET));
    }

    private function payload(): array
    {
        return [
            'merchant_id' => self::MERCHANT,
            'order_id' => self::ORDER,
            'payhere_amount' => '3450.00',
            'payhere_currency' => 'LKR',
            'status_code' => '2',
            'md5sig' => '391EA975F4F8DB5FEA9A75BB4B59228B',
        ];
    }
}
